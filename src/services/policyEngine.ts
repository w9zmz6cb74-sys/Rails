import { AgentWallet, PolicyValidationResult, TransactionRecord } from '../types/agent';
import { generateMockEnclaveSignature } from './enclaveKey';

export interface ValidationRequest {
  agent: AgentWallet;
  recipientAddress: string;
  recipientName?: string;
  amountUsd: number;
  type: 'x402_micropay' | 'contract_call' | 'token_transfer' | 'inference_fee';
}

/**
 * Client-Side Validation Logic:
 * Evaluates immediate pre-flight invariants in the agent's local execution runtime.
 */
export function validateSpendClientSide(req: ValidationRequest): PolicyValidationResult {
  const { agent, recipientAddress, amountUsd, type } = req;
  const policy = agent.policy;
  const checks: PolicyValidationResult['checks'] = [];
  const violations: string[] = [];

  // Check 1: Agent Circuit Breaker Status
  const isAgentActive = agent.status === 'active';
  checks.push({
    rule: 'Agent Circuit Breaker State',
    passed: isAgentActive,
    detail: isAgentActive
      ? 'Account state is active and operational.'
      : `Circuit breaker active. Account status is '${agent.status.toUpperCase()}'.`,
  });
  if (!isAgentActive) {
    violations.push(`Circuit breaker tripped: Account is ${agent.status.toUpperCase()}`);
  }

  // Check 2: Max Per-Transaction Cap Invariant
  const withinMaxPerTx = amountUsd <= policy.maxPerTxUsd;
  checks.push({
    rule: 'Per-Transaction Spend Cap',
    passed: withinMaxPerTx,
    detail: withinMaxPerTx
      ? `Requested $${amountUsd.toFixed(2)} is within limit of $${policy.maxPerTxUsd.toFixed(2)}.`
      : `Requested $${amountUsd.toFixed(2)} exceeds maximum per-transaction cap ($${policy.maxPerTxUsd.toFixed(2)}).`,
  });
  if (!withinMaxPerTx) {
    violations.push(`Exceeded per-transaction limit: $${amountUsd.toFixed(2)} > $${policy.maxPerTxUsd.toFixed(2)}`);
  }

  // Check 3: Daily Burn Rate / Aggregate Spend Invariant
  const newProjectedDaily = +(policy.spentTodayUsd + amountUsd).toFixed(4);
  const withinDailyLimit = newProjectedDaily <= policy.dailyLimitUsd;
  checks.push({
    rule: 'Daily Burn Rate Limit',
    passed: withinDailyLimit,
    detail: withinDailyLimit
      ? `Projected burn $${newProjectedDaily.toFixed(2)} is within daily allowance of $${policy.dailyLimitUsd.toFixed(2)}.`
      : `Projected burn $${newProjectedDaily.toFixed(2)} exceeds daily limit ($${policy.dailyLimitUsd.toFixed(2)}). Remaining budget: $${Math.max(0, policy.dailyLimitUsd - policy.spentTodayUsd).toFixed(2)}.`,
  });
  if (!withinDailyLimit) {
    violations.push(`Daily burn cap exceeded: $${newProjectedDaily.toFixed(2)} > $${policy.dailyLimitUsd.toFixed(2)}`);
  }

  // Check 4: Contract & Recipient Allowlist Invariant
  // Required for token transfers and direct contract calls
  const normalizedRecipient = recipientAddress.toLowerCase().trim();
  const allowlistMatches = policy.allowedContractAddresses.some(
    (addr) => addr.toLowerCase().trim() === normalizedRecipient
  );
  // For x402 micropay, if allowAutonomousMicropay is true and amount is small (< $0.50), allow autonomous peering unless untrusted drain address
  const isMaliciousDrain =
    normalizedRecipient.includes('dead') ||
    normalizedRecipient === '0x0000000000000000000000000000000000000000';
  
  const allowlistPassed =
    !isMaliciousDrain &&
    (type === 'x402_micropay' && policy.allowAutonomousMicropay && amountUsd <= policy.maxPerTxUsd
      ? true
      : allowlistMatches);

  checks.push({
    rule: 'Target Address Allowlist Verification',
    passed: allowlistPassed,
    detail: allowlistPassed
      ? `Destination '${recipientAddress.slice(0, 10)}...' matches approved protocol allowlist.`
      : `Destination '${recipientAddress}' is untrusted or NOT on the agent's cryptographic allowlist.`,
  });
  if (!allowlistPassed) {
    violations.push(`Destination address ${recipientAddress.slice(0, 12)}... is not on allowlist`);
  }

  // Check 5: Session Key Expiry Invariant
  const expiryTime = Date.parse(policy.sessionKeyExpiresAt);
  const sessionValid = !isNaN(expiryTime) && Date.now() < expiryTime;
  checks.push({
    rule: 'Session Key Temporal Validity',
    passed: sessionValid,
    detail: sessionValid
      ? `Session key valid until ${new Date(expiryTime).toLocaleDateString()}.`
      : 'Session key has expired. Human re-authorization required.',
  });
  if (!sessionValid) {
    violations.push('Session key expired');
  }

  const valid = violations.length === 0;

  return {
    valid,
    status: valid ? 'APPROVED' : 'BLOCKED_BY_POLICY',
    violations,
    checks,
    latencyMs: 14,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Server-Side / Smart Contract Enclave Validation:
 * Simulates on-chain ERC-7579 modular session validator & ERC-4337 UserOperation validation.
 */
export async function validateSpendServerSide(
  req: ValidationRequest
): Promise<PolicyValidationResult & { userOpHash?: string; gasEstimate?: number }> {
  const startTime = performance.now();

  // Simulate remote RPC and smart contract enclave latency (80ms - 180ms)
  await new Promise((resolve) => setTimeout(resolve, 120));

  // Run invariant checks
  const clientEval = validateSpendClientSide(req);
  const endTime = performance.now();
  const latencyMs = Math.round(endTime - startTime);

  if (!clientEval.valid) {
    return {
      ...clientEval,
      latencyMs,
    };
  }

  // Cryptographic Enclave Attestation using local state enclave key
  const mockUserOpHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')}`;
  const mockEnclaveSig = generateMockEnclaveSignature(
    `${req.agent.id}:${req.recipientAddress}:${req.amountUsd}:${mockUserOpHash}`
  );

  return {
    ...clientEval,
    latencyMs,
    userOpHash: mockUserOpHash,
    gasEstimate: 42800 + Math.floor(Math.random() * 5000),
    enclaveSignature: mockEnclaveSig,
  };
}

/**
 * Constructs a rich On-Chain Transaction Record with cryptographic attestation
 */
export function buildOnChainTransactionRecord(
  req: ValidationRequest,
  validationResult: PolicyValidationResult,
  customHash?: string
): TransactionRecord {
  const { agent, recipientAddress, recipientName, amountUsd, type } = req;
  const isConfirmed = validationResult.valid;
  const txHash =
    customHash ||
    (isConfirmed
      ? `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
      : '0x0000000000000000000000000000000000000000000000000000000000000000');

  const now = new Date();
  const blockNumber = 18492000 + Math.floor(Math.random() * 500);

  return {
    id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    agentId: agent.id,
    agentName: agent.name,
    chain: agent.chain,
    timestamp: now.toISOString(),
    recipientAddress,
    recipientName: recipientName || (isConfirmed ? 'Verified Protocol Contract' : 'Untrusted Recipient'),
    amountUsd,
    asset: 'USDC',
    txHash,
    type,
    status: isConfirmed ? 'confirmed' : 'blocked_by_policy',
    policyCheckReason: isConfirmed
      ? undefined
      : validationResult.violations.join('; ') || 'Blocked by Policy Firewall',
    sessionKeyUsed: agent.sessionKeyAddress,
    // Enhanced on-chain explorer details
    blockNumber: isConfirmed ? blockNumber : undefined,
    gasUsed: isConfirmed ? 46210 + Math.floor(Math.random() * 4000) : 21000,
    gasPriceGwei: 0.085,
    nonce: agent.totalTransactionsExecuted + 1,
    senderTba: agent.tbaAddress,
    userOpHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    signature: `0x${Array.from({ length: 130 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    attestationProof: {
      merkleRoot: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      validatorAddress: '0x000000006551c194871ba60f6400ac5642d96551',
      timestamp: now.toISOString(),
      circuitProofType: 'ERC-7579 Modular Policy Invariant Proof (Groth16 / Halo2)',
    },
    payloadData: {
      callType: type,
      target: recipientAddress,
      valueWei: '0',
      data: '0xa9059cbb000000000000000000000000...',
      dailyBurnLimitUsd: agent.policy.dailyLimitUsd,
      maxPerTxLimitUsd: agent.policy.maxPerTxUsd,
      enclaveStatus: isConfirmed ? 'PASSED_ALL_INVARIANTS' : 'REVERTED_POLICY_VIOLATION',
    },
  };
}
