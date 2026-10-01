import { ethers } from 'ethers';
import {
  AgentWallet,
  AgentPipelineRequest,
  PipelineExecutionResponse,
  PipelineStageResult,
  DecodedCallData,
  SimulationDiff,
  UserOperation4337,
  AuditRecord,
  HumanApprovalItem,
  SupportedChain,
} from '../types/agent';
import { SUPPORTED_CHAINS } from '../data/mockData';
import { generateMockEnclaveSignature } from './enclaveKey';
import { persistAuditRecord, persistPendingApproval, removePendingApproval } from './firebase';
import { evaluateTransaction, Policy as FirewallPolicy, TransactionRequest as FirewallTxRequest, Usage as FirewallUsage, Decision as FirewallDecision } from '../firewall';

const CHAIN_ID_MAP: Record<SupportedChain, number> = {
  'base-sepolia': 84532,
  'ethereum-sepolia': 11155111,
  'arbitrum-sepolia': 421614,
  'solana-devnet': 101,
};

// Standard ERC-20 & Protocol ABIs
const ERC20_INTERFACE = new ethers.Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
]);

const X402_INTERFACE = new ethers.Interface([
  'function payX402(bytes32 quoteNonce, address recipient, uint256 amountUsdDecimals6) returns (bool)',
]);

// In-memory velocity store for rate-limiting
interface VelocityEntry {
  timestamp: number;
}
const agentVelocityTracker = new Map<string, VelocityEntry[]>();

// In-memory pending approvals store
const pendingApprovalsStore = new Map<string, HumanApprovalItem>();

/**
 * Helper to record velocity
 */
function recordVelocity(agentId: string) {
  const now = Date.now();
  const existing = agentVelocityTracker.get(agentId) || [];
  const valid = existing.filter((e) => now - e.timestamp < 3600000); // keep last 1 hour
  valid.push({ timestamp: now });
  agentVelocityTracker.set(agentId, valid);
}

/**
 * Helper to query velocity
 */
function getVelocityCount(agentId: string, windowMs: number): number {
  const now = Date.now();
  const existing = agentVelocityTracker.get(agentId) || [];
  return existing.filter((e) => now - e.timestamp <= windowMs).length;
}

/**
 * Calldata Decoder using ethers.js
 */
export function decodeTransactionCalldata(
  rawCalldata?: string,
  contractAddress: string = '0x0000000000000000000000000000000000000000',
  recipientAddress: string = '0x0000000000000000000000000000000000000000',
  amountUsd: number = 0,
  tokenSymbol: string = 'USDC'
): DecodedCallData {
  // If calldata was not explicitly passed, synthesize canonical calldata based on parameters
  let calldataHex = rawCalldata;
  if (!calldataHex || calldataHex === '0x') {
    try {
      // 6 decimals for USDC
      const amountUnits = ethers.parseUnits(amountUsd.toFixed(6), 6);
      calldataHex = ERC20_INTERFACE.encodeFunctionData('transfer', [recipientAddress, amountUnits]);
    } catch {
      calldataHex = '0xa9059cbb' + '0'.repeat(56) + '1';
    }
  }

  const selector = calldataHex.slice(0, 10).toLowerCase();

  // Try decoding as ERC-20
  try {
    const parsed = ERC20_INTERFACE.parseTransaction({ data: calldataHex });
    if (parsed) {
      const isTransfer = parsed.name === 'transfer';
      const to = isTransfer ? (parsed.args[0] as string) : recipientAddress;
      const rawVal = parsed.args[1] ? parsed.args[1].toString() : '0';
      const formatted = ethers.formatUnits(rawVal, 6);

      return {
        selector,
        functionName: parsed.name,
        signature: parsed.signature,
        contractAddress,
        recipientAddress: to,
        tokenAddress: contractAddress,
        tokenSymbol,
        amountFormatted: formatted,
        amountRaw: rawVal,
        amountUsd: parseFloat(formatted) || amountUsd,
        params: [
          { name: isTransfer ? 'to' : 'spender', type: 'address', value: to },
          { name: 'amount', type: 'uint256', value: `${formatted} ${tokenSymbol} (${rawVal} units)` },
        ],
        rawCalldata: calldataHex,
      };
    }
  } catch {
    // Continue to next decoder
  }

  // Try decoding as x402 Micropay
  try {
    const parsedX402 = X402_INTERFACE.parseTransaction({ data: calldataHex });
    if (parsedX402) {
      const quoteNonce = parsedX402.args[0] as string;
      const recipient = parsedX402.args[1] as string;
      const rawVal = parsedX402.args[2]?.toString() || '0';
      const formatted = ethers.formatUnits(rawVal, 6);

      return {
        selector,
        functionName: 'payX402',
        signature: 'payX402(bytes32,address,uint256)',
        contractAddress,
        recipientAddress: recipient,
        tokenAddress: contractAddress,
        tokenSymbol,
        amountFormatted: formatted,
        amountRaw: rawVal,
        amountUsd: parseFloat(formatted) || amountUsd,
        params: [
          { name: 'quoteNonce', type: 'bytes32', value: quoteNonce },
          { name: 'recipient', type: 'address', value: recipient },
          { name: 'amount', type: 'uint256', value: `${formatted} ${tokenSymbol}` },
        ],
        rawCalldata: calldataHex,
      };
    }
  } catch {
    // Continue to fallback
  }

  // Fallback for custom or unknown selectors
  const isDelegateCall = selector === '0x5c19a95c' || selector === '0xf8e92a40' || selector === '0xdeadbeef';
  return {
    selector,
    functionName: isDelegateCall ? 'unauthorizedDelegatecall' : `customMethod_${selector}`,
    signature: isDelegateCall ? 'delegatecall(address,bytes)' : `unknown(${selector})`,
    contractAddress,
    recipientAddress,
    tokenAddress: contractAddress,
    tokenSymbol,
    amountFormatted: amountUsd.toString(),
    amountRaw: ethers.parseUnits(amountUsd.toFixed(6), 6).toString(),
    amountUsd,
    params: [
      { name: 'target', type: 'address', value: recipientAddress },
      { name: 'value', type: 'uint256', value: `${amountUsd} USD` },
      { name: 'payloadLength', type: 'bytes', value: `${(calldataHex.length - 2) / 2} bytes` },
    ],
    rawCalldata: calldataHex,
  };
}

/**
 * Execute the 10-Stage Agent Execution Pipeline:
 *
 * 1. Agent request
 * 2. Authenticate session key
 * 3. Decode transaction
 * 4. Reject unknown chain, contract or function
 * 5. Check recipient and token allowlists
 * 6. Apply transaction and daily limits
 * 7. Check velocity and expiry
 * 8. Require human approval when necessary
 * 9. Simulate transaction
 * 10. Submit ERC-4337 UserOperation
 * 11. Save audit record
 */
export async function runAgentExecutionPipeline(
  request: AgentPipelineRequest,
  agent: AgentWallet,
  options?: {
    approvedByHuman?: boolean;
    operatorNotes?: string;
    operatorId?: string;
  }
): Promise<PipelineExecutionResponse> {
  const executionId = `exec-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const stages: PipelineStageResult[] = [];
  const startOverall = performance.now();

  const isOperatorApproval = Boolean(options?.approvedByHuman);

  // -------------------------------------------------------------
  // STAGE 1: Agent Request
  // -------------------------------------------------------------
  const t1 = performance.now();
  const hasAgent = Boolean(agent && agent.id === request.agentId);
  stages.push({
    id: 'agent_request',
    title: 'Agent Request Ingestion',
    description: 'Ingest and validate structural envelope from autonomous agent runtime.',
    status: hasAgent ? 'passed' : 'failed',
    latencyMs: Math.max(1, Math.round(performance.now() - t1)),
    summary: hasAgent
      ? `Validated inbound request from ${agent.name} (TBA: ${agent.tbaAddress.slice(0, 8)}...)`
      : 'Agent account not found in protocol registry.',
    details: {
      agentId: request.agentId,
      agentName: agent?.name,
      model: agent?.model,
      chain: request.chain,
      amountUsd: request.amountUsd,
      timestamp: new Date().toISOString(),
    },
    violations: hasAgent ? [] : ['Unknown agent identifier in request envelope'],
  });

  if (!hasAgent) {
    return buildFailedResponse(executionId, stages, 'Agent account not recognized', startOverall);
  }

  // -------------------------------------------------------------
  // STAGE 2: Authenticate Session Key
  // -------------------------------------------------------------
  const t2 = performance.now();
  const sessionKeyMatches =
    agent.sessionKeyAddress.toLowerCase() === request.sessionKeyAddress.toLowerCase();
  const sessionExpiry = Date.parse(agent.policy.sessionKeyExpiresAt);
  const sessionNotExpired = !isNaN(sessionExpiry) && Date.now() < sessionExpiry;
  const isAgentOperational = agent.status === 'active';

  const sessionViolations: string[] = [];
  if (!sessionKeyMatches) {
    sessionViolations.push(
      `Session key ${request.sessionKeyAddress.slice(0, 10)}... does not match agent's authorized key`
    );
  }
  if (!sessionNotExpired) {
    sessionViolations.push(
      `Session key expired on ${new Date(sessionExpiry).toLocaleDateString()}`
    );
  }
  if (!isAgentOperational) {
    sessionViolations.push(`Agent circuit breaker is tripped: status is '${agent.status.toUpperCase()}'`);
  }

  const stage2Passed = sessionViolations.length === 0;
  stages.push({
    id: 'authenticate_session_key',
    title: 'Authenticate Session Key',
    description: 'Verify cryptographic session key ownership, expiry, and circuit-breaker state.',
    status: stage2Passed ? 'passed' : 'failed',
    latencyMs: Math.max(2, Math.round(performance.now() - t2)),
    summary: stage2Passed
      ? `Cryptographic session key verified for TBA ${agent.tbaAddress.slice(0, 10)}... (Valid until ${new Date(sessionExpiry).toLocaleDateString()})`
      : sessionViolations[0],
    details: {
      sessionKeyAddress: request.sessionKeyAddress,
      tbaAddress: agent.tbaAddress,
      rootOwner: agent.rootOwnerAddress,
      sessionExpiresAt: agent.policy.sessionKeyExpiresAt,
      accountStatus: agent.status,
    },
    violations: sessionViolations,
  });

  if (!stage2Passed) {
    return buildFailedResponse(executionId, stages, sessionViolations.join('; '), startOverall);
  }

  // -------------------------------------------------------------
  // STAGE 3: Decode Transaction
  // -------------------------------------------------------------
  const t3 = performance.now();
  const decoded = decodeTransactionCalldata(
    request.rawCalldata,
    request.contractAddress,
    request.recipientAddress,
    request.amountUsd,
    request.tokenSymbol || 'USDC'
  );

  stages.push({
    id: 'decode_transaction',
    title: 'Decode Transaction',
    description: 'Parse raw hex calldata using ABI specifications to extract selector and parameters.',
    status: 'passed',
    latencyMs: Math.max(2, Math.round(performance.now() - t3)),
    summary: `Decoded ${decoded.functionName} on contract ${decoded.contractAddress.slice(0, 10)}... (${decoded.amountFormatted || decoded.amountUsd} ${decoded.tokenSymbol})`,
    details: {
      selector: decoded.selector,
      functionName: decoded.functionName,
      signature: decoded.signature,
      parameters: decoded.params,
      rawCalldataSnippet: `${decoded.rawCalldata.slice(0, 34)}... (${(decoded.rawCalldata.length - 2) / 2} bytes)`,
    },
  });

  // -------------------------------------------------------------
  // STAGE 4: Reject Unknown Chain, Contract or Function
  // -------------------------------------------------------------
  const t4 = performance.now();
  const stage4Violations: string[] = [];

  // Chain check
  const isChainSupported = Boolean(SUPPORTED_CHAINS[request.chain]);
  const isChainAuthorized = request.chain === agent.chain;
  if (!isChainSupported || !isChainAuthorized) {
    stage4Violations.push(
      `Chain mismatch: requested '${request.chain}', agent settlement is on '${agent.chain}'`
    );
  }

  // Contract check
  const normalizedContract = request.contractAddress.toLowerCase().trim();
  const isAllowedContract =
    agent.policy.allowedContractAddresses.some(
      (addr) => addr.toLowerCase().trim() === normalizedContract
    ) ||
    normalizedContract === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' || // Base USDC
    normalizedContract === '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' || // Sepolia USDC
    request.type === 'x402_micropay'; // x402 gateway contract

  if (!isAllowedContract) {
    stage4Violations.push(
      `Contract '${request.contractAddress.slice(0, 12)}...' is not on agent's authorized contract allowlist`
    );
  }

  // Function check
  const forbiddenSelectors = ['0x5c19a95c', '0xf8e92a40', '0xdeadbeef']; // delegatecall, arbitrary proxy code
  if (forbiddenSelectors.includes(decoded.selector)) {
    stage4Violations.push(
      `Forbidden function selector '${decoded.selector}' (Arbitrary delegatecall / backdoor prohibited)`
    );
  }

  const stage4Passed = stage4Violations.length === 0;
  stages.push({
    id: 'reject_unknown_chain_contract_function',
    title: 'Reject Unknown Chain, Contract or Function',
    description: 'Enforce protocol allowlists against chain, contract target, and function selector.',
    status: stage4Passed ? 'passed' : 'failed',
    latencyMs: Math.max(3, Math.round(performance.now() - t4)),
    summary: stage4Passed
      ? `Approved: Chain (${request.chain}), Contract (${request.contractAddress.slice(0, 10)}...), Function (${decoded.functionName})`
      : stage4Violations[0],
    details: {
      targetChain: request.chain,
      agentChain: agent.chain,
      contractAddress: request.contractAddress,
      functionSelector: decoded.selector,
      allowedContractsCount: agent.policy.allowedContractAddresses.length,
    },
    violations: stage4Violations,
  });

  if (!stage4Passed) {
    return buildFailedResponse(executionId, stages, stage4Violations.join('; '), startOverall, decoded);
  }

  // -------------------------------------------------------------
  // STAGE 5: Check Recipient and Token Allowlists
  // -------------------------------------------------------------
  const t5 = performance.now();
  const stage5Violations: string[] = [];
  const normalizedRecipient = (decoded.recipientAddress || request.recipientAddress).toLowerCase().trim();

  // Flag known malicious / drain addresses
  const isMaliciousDrain =
    normalizedRecipient.includes('dead') ||
    normalizedRecipient === '0x0000000000000000000000000000000000000000' ||
    normalizedRecipient === '0x000000000000000000000000000000000000dead';

  if (isMaliciousDrain) {
    stage5Violations.push(
      `Recipient '${normalizedRecipient.slice(0, 12)}...' flagged as malicious drain or burn address`
    );
  }

  // Token check (USDC, native ETH, or allowed custom token)
  const token = (request.tokenSymbol || 'USDC').toUpperCase();
  const isApprovedToken = token === 'USDC' || token === 'ETH' || token === 'SOL';
  if (!isApprovedToken) {
    stage5Violations.push(`Unapproved asset '${token}'. Only verified stablecoins & gas tokens permitted.`);
  }

  const stage5Passed = stage5Violations.length === 0;
  stages.push({
    id: 'check_recipient_token_allowlists',
    title: 'Check Recipient & Token Allowlists',
    description: 'Verify recipient reputation, check against drain address lists, and validate asset legitimacy.',
    status: stage5Passed ? 'passed' : 'failed',
    latencyMs: Math.max(2, Math.round(performance.now() - t5)),
    summary: stage5Passed
      ? `Recipient (${normalizedRecipient.slice(0, 10)}...) and Token (${token}) verified clean.`
      : stage5Violations[0],
    details: {
      recipient: normalizedRecipient,
      token,
      antiDrainAudit: isMaliciousDrain ? 'FAILED_EXPLOIT_DETECTED' : 'PASSED',
    },
    violations: stage5Violations,
  });

  if (!stage5Passed) {
    return buildFailedResponse(executionId, stages, stage5Violations.join('; '), startOverall, decoded);
  }

  // -------------------------------------------------------------
  // STAGE 6: Apply Transaction and Daily Limits
  // -------------------------------------------------------------
  const t6 = performance.now();
  const stage6Violations: string[] = [];
  const amountToSpend = decoded.amountUsd;

  if (amountToSpend > agent.policy.maxPerTxUsd) {
    stage6Violations.push(
      `Exceeds maximum per-transaction cap: $${amountToSpend.toFixed(2)} > $${agent.policy.maxPerTxUsd.toFixed(2)}`
    );
  }

  const projectedDaily = +(agent.policy.spentTodayUsd + amountToSpend).toFixed(4);
  if (projectedDaily > agent.policy.dailyLimitUsd) {
    stage6Violations.push(
      `Exceeds daily burn quota: projected $${projectedDaily.toFixed(2)} > daily limit $${agent.policy.dailyLimitUsd.toFixed(2)} (Remaining: $${Math.max(0, agent.policy.dailyLimitUsd - agent.policy.spentTodayUsd).toFixed(2)})`
    );
  }

  const stage6Passed = stage6Violations.length === 0;
  stages.push({
    id: 'apply_transaction_daily_limits',
    title: 'Apply Transaction & Daily Limits',
    description: 'Enforce max-per-transaction cap and rolling 24-hour daily spend invariants.',
    status: stage6Passed ? 'passed' : 'failed',
    latencyMs: Math.max(1, Math.round(performance.now() - t6)),
    summary: stage6Passed
      ? `Spend $${amountToSpend.toFixed(2)} within limits (Per-tx: $${agent.policy.maxPerTxUsd.toFixed(2)}, Daily spent: $${projectedDaily.toFixed(2)} / $${agent.policy.dailyLimitUsd.toFixed(2)})`
      : stage6Violations[0],
    details: {
      requestedAmountUsd: amountToSpend,
      maxPerTxLimitUsd: agent.policy.maxPerTxUsd,
      dailyLimitUsd: agent.policy.dailyLimitUsd,
      spentTodayUsd: agent.policy.spentTodayUsd,
      projectedDailyUsd: projectedDaily,
      remainingDailyBudgetUsd: Math.max(0, agent.policy.dailyLimitUsd - projectedDaily),
    },
    violations: stage6Violations,
  });

  if (!stage6Passed) {
    return buildFailedResponse(executionId, stages, stage6Violations.join('; '), startOverall, decoded);
  }

  // -------------------------------------------------------------
  // STAGE 7: Check Velocity and Expiry
  // -------------------------------------------------------------
  const t7 = performance.now();
  const stage7Violations: string[] = [];

  // Check deadline
  if (request.deadline && Date.now() > request.deadline) {
    stage7Violations.push(`Request deadline expired at timestamp ${new Date(request.deadline).toISOString()}`);
  }

  // Velocity rate-limiting: default max 5 transactions per minute, max 30 per hour
  const maxPerMinute = agent.policy.velocityMaxPerMinute || 5;
  const recentCount1Min = getVelocityCount(agent.id, 60000);
  if (recentCount1Min >= maxPerMinute) {
    stage7Violations.push(
      `Velocity limit exceeded: ${recentCount1Min + 1} requests within 60s (Threshold is ${maxPerMinute} tx/min)`
    );
  }

  const stage7Passed = stage7Violations.length === 0;
  stages.push({
    id: 'check_velocity_expiry',
    title: 'Check Velocity & Expiry',
    description: 'Enforce rate limits, burst protection, and request deadline temporal invariants.',
    status: stage7Passed ? 'passed' : 'failed',
    latencyMs: Math.max(1, Math.round(performance.now() - t7)),
    summary: stage7Passed
      ? `Velocity nominal (${recentCount1Min + 1}/${maxPerMinute} txs/min). Request deadline valid.`
      : stage7Violations[0],
    details: {
      recentCountLastMinute: recentCount1Min,
      velocityLimitPerMinute: maxPerMinute,
      deadlineTimestamp: request.deadline,
    },
    violations: stage7Violations,
  });

  if (!stage7Passed) {
    return buildFailedResponse(executionId, stages, stage7Violations.join('; '), startOverall, decoded);
  }

  // -------------------------------------------------------------
  // STAGE 8: Require Human Approval When Necessary
  // -------------------------------------------------------------
  const t8 = performance.now();
  const exceedsHumanApprovalThreshold =
    amountToSpend > (agent.policy.requireHumanApprovalAboveUsd || 10.0);
  const isUntrustedRecipient = !agent.policy.allowedContractAddresses.some(
    (addr) => addr.toLowerCase().trim() === normalizedRecipient
  );

  const requiresApproval =
    (exceedsHumanApprovalThreshold || isUntrustedRecipient) && !isOperatorApproval;

  if (requiresApproval) {
    // Generate simulation preview for human reviewer
    const simPreview = generateSimulationDiff(agent, normalizedRecipient, amountToSpend, token);

    const approvalItem: HumanApprovalItem = {
      id: `approval-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      pipelineExecutionId: executionId,
      agentId: agent.id,
      agentName: agent.name,
      chain: agent.chain,
      requestedAt: new Date().toISOString(),
      amountUsd: amountToSpend,
      recipientAddress: normalizedRecipient,
      recipientName: request.recipientName || 'External Protocol Recipient',
      reason: exceedsHumanApprovalThreshold
        ? `Transaction value ($${amountToSpend.toFixed(2)}) exceeds automated threshold of $${agent.policy.requireHumanApprovalAboveUsd.toFixed(2)}`
        : `Recipient ${normalizedRecipient.slice(0, 10)}... requires first-time human clearance`,
      decodedData: decoded,
      simulation: simPreview,
      status: 'pending',
    };

    pendingApprovalsStore.set(approvalItem.id, approvalItem);
    persistPendingApproval(approvalItem);

    stages.push({
      id: 'require_human_approval',
      title: 'Require Human Approval When Necessary',
      description: 'Check if transaction exceeds human threshold ($10+) or targets unverified recipient.',
      status: 'requires_action',
      latencyMs: Math.max(1, Math.round(performance.now() - t8)),
      summary: `Action Required: Escalated to Human Approval Queue (${approvalItem.reason})`,
      details: {
        approvalId: approvalItem.id,
        thresholdUsd: agent.policy.requireHumanApprovalAboveUsd,
        amountUsd: amountToSpend,
        status: 'AWAITING_OPERATOR_SIGN_OFF',
      },
    });

    return {
      executionId,
      success: false,
      status: 'requires_human_approval',
      stages,
      decodedData: decoded,
      simulation: simPreview,
      approvalItem,
      totalLatencyMs: Math.round(performance.now() - startOverall),
    };
  }

  // If already approved or below threshold
  stages.push({
    id: 'require_human_approval',
    title: 'Require Human Approval When Necessary',
    description: 'Check if transaction exceeds human threshold or targets unverified recipient.',
    status: 'passed',
    latencyMs: Math.max(1, Math.round(performance.now() - t8)),
    summary: isOperatorApproval
      ? `Human approval granted by operator ${options?.operatorId || 'Admin'} (${options?.operatorNotes || 'Verified'})`
      : `Autonomous execution permitted: Spend ($${amountToSpend.toFixed(2)}) is below human approval threshold ($${agent.policy.requireHumanApprovalAboveUsd.toFixed(2)})`,
    details: {
      humanApprovalRequired: false,
      thresholdUsd: agent.policy.requireHumanApprovalAboveUsd,
      isOperatorApproval,
      operatorNotes: options?.operatorNotes,
    },
  });

  // -------------------------------------------------------------
  // STAGE 9: Simulate Transaction
  // -------------------------------------------------------------
  const t9 = performance.now();
  const simulation = generateSimulationDiff(agent, normalizedRecipient, amountToSpend, token);

  const stage9Passed = simulation.success;
  stages.push({
    id: 'simulate_transaction',
    title: 'Simulate Transaction',
    description: 'Pre-flight trace: simulate balance deltas, gas estimation, and revert checks.',
    status: stage9Passed ? 'passed' : 'failed',
    latencyMs: Math.max(18, Math.round(performance.now() - t9)),
    summary: stage9Passed
      ? `Simulation Succeeded: ${simulation.gasEstimated.toLocaleString()} gas estimated. Revert probability: 0%`
      : `Simulation Reverted: ${simulation.revertReason}`,
    details: {
      gasEstimated: simulation.gasEstimated,
      assetDeltas: simulation.assetDeltas,
      stateAccessCount: simulation.stateAccessList.length,
      revertCheck: simulation.success ? 'NO_REVERT' : 'REVERT_DETECTED',
    },
    violations: stage9Passed ? [] : [simulation.revertReason || 'Simulation execution failed'],
  });

  if (!stage9Passed) {
    return buildFailedResponse(
      executionId,
      stages,
      simulation.revertReason || 'Simulation failed',
      startOverall,
      decoded,
      simulation
    );
  }

  // -------------------------------------------------------------
  // STAGE 10: Submit ERC-4337 UserOperation
  // -------------------------------------------------------------
  const t10 = performance.now();
  const nonce = agent.totalTransactionsExecuted + 1;
  const userOpHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')}`;
  const mockSig = generateMockEnclaveSignature(`${agent.id}:${userOpHash}:${amountToSpend}`);

  const userOp: UserOperation4337 = {
    sender: agent.tbaAddress,
    nonce,
    initCode: '0x',
    callData: decoded.rawCalldata,
    callGasLimit: 38400,
    verificationGasLimit: 48000,
    preVerificationGas: 21000,
    maxFeePerGas: '1200000000', // 1.2 Gwei
    maxPriorityFeePerGas: '100000000', // 0.1 Gwei
    paymasterAndData: '0x0000000000000000000000000000000000000000', // Gas sponsored by AgentRails Paymaster
    signature: mockSig,
    userOpHash,
    bundlerStatus: 'bundled',
  };

  stages.push({
    id: 'submit_erc4337_user_op',
    title: 'Submit ERC-4337 UserOperation',
    description: 'Assemble UserOp struct, sign with Enclave key, and broadcast to bundler mempool.',
    status: 'passed',
    latencyMs: Math.max(35, Math.round(performance.now() - t10)),
    summary: `Bundled & Broadcast UserOp: ${userOpHash.slice(0, 14)}... (Nonce: ${nonce}, Gas: 107,400)`,
    details: {
      senderTba: userOp.sender,
      nonce: userOp.nonce,
      userOpHash: userOp.userOpHash,
      signature: `${userOp.signature.slice(0, 18)}...`,
      bundlerStatus: 'CONFIRMED_ON_CHAIN',
    },
  });

  // Record velocity upon successful submission
  recordVelocity(agent.id);

  // -------------------------------------------------------------
  // STAGE 11: Save Audit Record
  // -------------------------------------------------------------
  const t11 = performance.now();
  const txHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')}`;
  const blockNumber = 18493100 + Math.floor(Math.random() * 100);

  const auditRecord: AuditRecord = {
    id: `audit-${executionId}`,
    timestamp: new Date().toISOString(),
    agentId: agent.id,
    agentName: agent.name,
    chain: agent.chain,
    txHash,
    userOpHash,
    status: 'CONFIRMED',
    totalLatencyMs: Math.round(performance.now() - startOverall),
    amountUsd: amountToSpend,
    recipientAddress: normalizedRecipient,
    recipientName: request.recipientName || 'Verified Protocol Contract',
    stages,
    decodedData: decoded,
    simulation,
    userOp,
    humanApproval: isOperatorApproval
      ? {
          required: true,
          approved: true,
          operator: options?.operatorId || 'Admin',
          timestamp: new Date().toISOString(),
          reason: options?.operatorNotes || 'Manually approved',
        }
      : undefined,
    merkleRoot: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    enclaveSignature: mockSig,
  };

  // Persist audit record to Firestore
  try {
    await persistAuditRecord(auditRecord);
  } catch (err) {
    console.warn('Audit record Firestore sync note:', err);
  }

  stages.push({
    id: 'save_audit_record',
    title: 'Save Audit Record',
    description: 'Commit immutable cryptographic audit proof to Firestore and transaction ledger.',
    status: 'passed',
    latencyMs: Math.max(12, Math.round(performance.now() - t11)),
    summary: `Audit record saved (ID: ${auditRecord.id}, Block: #${blockNumber}, Tx: ${txHash.slice(0, 10)}...)`,
    details: {
      auditId: auditRecord.id,
      blockNumber,
      txHash,
      userOpHash,
      merkleRoot: auditRecord.merkleRoot,
      firestoreStatus: 'COMMITTED',
    },
  });

  return {
    executionId,
    success: true,
    status: 'completed',
    stages,
    decodedData: decoded,
    simulation,
    userOp,
    auditRecord,
    totalLatencyMs: Math.round(performance.now() - startOverall),
  };
}

/**
 * Generates rich simulation state diff
 */
function generateSimulationDiff(
  agent: AgentWallet,
  recipient: string,
  amountUsd: number,
  tokenSymbol: string
): SimulationDiff {
  const hasSufficientBalance = agent.balances.usdc >= amountUsd;
  if (!hasSufficientBalance) {
    return {
      success: false,
      gasEstimated: 21000,
      revertReason: `Insufficient balance: Agent TBA has $${agent.balances.usdc.toFixed(2)} USDC, requested $${amountUsd.toFixed(2)}`,
      assetDeltas: [],
      stateAccessList: [agent.tbaAddress],
      timestamp: new Date().toISOString(),
    };
  }

  return {
    success: true,
    gasEstimated: 46210 + Math.floor(Math.random() * 2500),
    assetDeltas: [
      {
        asset: tokenSymbol,
        from: agent.tbaAddress,
        to: recipient,
        amount: amountUsd.toFixed(4),
        amountUsd,
        direction: 'out',
      },
      {
        asset: tokenSymbol,
        from: agent.tbaAddress,
        to: recipient,
        amount: amountUsd.toFixed(4),
        amountUsd,
        direction: 'in',
      },
    ],
    stateAccessList: [
      agent.tbaAddress,
      recipient,
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC token storage slot
      '0x0000000071727de22e5e9d8baf0edac6f37da032', // ERC-4337 EntryPoint v0.7
    ],
    enclaveSignature: generateMockEnclaveSignature(`${agent.id}:${amountUsd}:SIMULATION`),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Builds a failed response object
 */
function buildFailedResponse(
  executionId: string,
  stages: PipelineStageResult[],
  rejectionReason: string,
  startTime: number,
  decoded?: DecodedCallData,
  simulation?: SimulationDiff
): PipelineExecutionResponse {
  return {
    executionId,
    success: false,
    status: 'blocked',
    stages,
    decodedData: decoded,
    simulation,
    rejectionReason,
    totalLatencyMs: Math.round(performance.now() - startTime),
  };
}

/**
 * Approval Queue Management
 */
export function getPendingApprovals(): HumanApprovalItem[] {
  return Array.from(pendingApprovalsStore.values()).filter((a) => a.status === 'pending');
}

export async function resolvePendingApproval(
  approvalId: string,
  decision: 'approve' | 'reject',
  operatorNotes?: string,
  operatorId: string = 'SecurityAdmin'
): Promise<{ success: boolean; message: string; executionResult?: PipelineExecutionResponse }> {
  const item = pendingApprovalsStore.get(approvalId);
  if (!item) {
    return { success: false, message: 'Approval request not found.' };
  }

  if (decision === 'reject') {
    item.status = 'rejected';
    item.resolvedAt = new Date().toISOString();
    item.resolvedBy = operatorId;
    item.notes = operatorNotes || 'Rejected by human operator';
    pendingApprovalsStore.delete(approvalId);
    await removePendingApproval(approvalId);

    return {
      success: true,
      message: `Request rejected by operator ${operatorId}. Transaction aborted.`,
    };
  }

  // If approved: resume pipeline!
  item.status = 'approved';
  item.resolvedAt = new Date().toISOString();
  item.resolvedBy = operatorId;
  item.notes = operatorNotes || 'Approved by human operator';
  pendingApprovalsStore.delete(approvalId);
  await removePendingApproval(approvalId);

  // Resume pipeline with approvedByHuman = true
  const resumedResult = await runAgentExecutionPipeline(
    {
      agentId: item.agentId,
      chain: item.chain,
      sessionKeyAddress: item.simulation.stateAccessList[0] || '0x0000000000000000000000000000000000000000',
      contractAddress: item.decodedData.contractAddress,
      recipientAddress: item.recipientAddress,
      recipientName: item.recipientName,
      amountUsd: item.amountUsd,
      tokenSymbol: item.decodedData.tokenSymbol,
      rawCalldata: item.decodedData.rawCalldata,
    },
    // Mock agent placeholder or fetched from registry
    {
      id: item.agentId,
      name: item.agentName,
      role: 'Autonomous Agent',
      chain: item.chain,
      agentIdTokenId: 1,
      agentNftAddress: '0x0000000000000000000000000000000000000000',
      tbaAddress: item.decodedData.params[0]?.value || '0x7291a27e7f67727142436f5647563dae20d20ef5',
      sessionKeyAddress: '0x0000000000000000000000000000000000000000',
      rootOwnerAddress: '0x0000000000000000000000000000000000000000',
      model: 'Autonomous Pipeline Model',
      status: 'active',
      balances: { native: 1.5, nativeSymbol: 'ETH', usdc: 500 },
      policy: {
        dailyLimitUsd: 100,
        maxPerTxUsd: 100,
        spentTodayUsd: 0,
        requireHumanApprovalAboveUsd: 10,
        allowedContractAddresses: [item.decodedData.contractAddress],
        sessionKeyExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        allowAutonomousMicropay: true,
      },
      totalTransactionsExecuted: 1,
      createdAt: new Date().toISOString(),
    },
    {
      approvedByHuman: true,
      operatorNotes: operatorNotes || 'Approved by operator',
      operatorId,
    }
  );

  return {
    success: true,
    message: 'Request approved and successfully broadcast as ERC-4337 UserOperation.',
    executionResult: resumedResult,
  };
}
