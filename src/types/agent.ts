export type SupportedChain = 'base-sepolia' | 'ethereum-sepolia' | 'solana-devnet' | 'arbitrum-sepolia';

export interface ChainConfig {
  id: SupportedChain;
  name: string;
  nativeCurrency: string;
  rpcEndpoint: string;
  explorerUrl: string;
  erc6551RegistryAddress?: string;
  accountImplementation?: string;
  type: 'evm' | 'svm';
}

export interface SpendPolicy {
  dailyLimitUsd: number;
  maxPerTxUsd: number;
  spentTodayUsd: number;
  requireHumanApprovalAboveUsd: number;
  allowedContractAddresses: string[];
  sessionKeyExpiresAt: string; // ISO string
  allowAutonomousMicropay: boolean;
  velocityMaxPerHour?: number;
  velocityMaxPerMinute?: number;
}

export interface AgentWallet {
  id: string;
  name: string;
  role: string;
  chain: SupportedChain;
  agentIdTokenId: number;
  agentNftAddress: string;
  tbaAddress: string; // Token Bound Account (ERC-6551)
  sessionKeyAddress: string;
  rootOwnerAddress: string;
  model: string;
  status: 'active' | 'paused' | 'circuit_broken';
  balances: {
    native: number;
    nativeSymbol: string;
    usdc: number;
    customToken?: {
      symbol: string;
      amount: number;
    };
  };
  policy: SpendPolicy;
  totalTransactionsExecuted: number;
  createdAt: string;
}

export type PipelineStageId =
  | 'agent_request'
  | 'authenticate_session_key'
  | 'decode_transaction'
  | 'reject_unknown_chain_contract_function'
  | 'check_recipient_token_allowlists'
  | 'apply_transaction_daily_limits'
  | 'check_velocity_expiry'
  | 'require_human_approval'
  | 'simulate_transaction'
  | 'submit_erc4337_user_op'
  | 'save_audit_record';

export type PipelineStageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'requires_action' | 'skipped';

export interface PipelineStageResult {
  id: PipelineStageId;
  title: string;
  description: string;
  status: PipelineStageStatus;
  latencyMs: number;
  summary: string;
  details?: Record<string, unknown>;
  violations?: string[];
}

export interface DecodedCallData {
  selector: string;
  functionName: string;
  signature: string;
  contractAddress: string;
  recipientAddress: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  amountFormatted?: string;
  amountRaw?: string;
  amountUsd: number;
  params: Array<{ name: string; type: string; value: string }>;
  rawCalldata: string;
}

export interface SimulationDiff {
  success: boolean;
  gasEstimated: number;
  revertReason?: string;
  assetDeltas: Array<{
    asset: string;
    from: string;
    to: string;
    amount: string;
    amountUsd: number;
    direction: 'in' | 'out';
  }>;
  stateAccessList: string[];
  enclaveSignature?: string;
  timestamp: string;
}

export interface UserOperation4337 {
  sender: string;
  nonce: number;
  initCode: string;
  callData: string;
  callGasLimit: number;
  verificationGasLimit: number;
  preVerificationGas: number;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
  userOpHash: string;
  bundlerStatus: 'bundled' | 'mined' | 'failed';
}

export interface HumanApprovalItem {
  id: string;
  pipelineExecutionId: string;
  agentId: string;
  agentName: string;
  chain: SupportedChain;
  requestedAt: string;
  amountUsd: number;
  recipientAddress: string;
  recipientName: string;
  reason: string;
  decodedData: DecodedCallData;
  simulation: SimulationDiff;
  status: 'pending' | 'approved' | 'rejected';
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  chain: SupportedChain;
  txHash: string;
  userOpHash: string;
  status: 'CONFIRMED' | 'BLOCKED' | 'HUMAN_REJECTED' | 'PENDING_APPROVAL';
  totalLatencyMs: number;
  amountUsd: number;
  recipientAddress: string;
  recipientName: string;
  stages: PipelineStageResult[];
  decodedData?: DecodedCallData;
  simulation?: SimulationDiff;
  userOp?: UserOperation4337;
  humanApproval?: {
    required: boolean;
    approved: boolean;
    operator: string;
    timestamp: string;
    reason: string;
  };
  merkleRoot: string;
  enclaveSignature: string;
}

export interface AgentPipelineRequest {
  agentId: string;
  chain: SupportedChain;
  sessionKeyAddress: string;
  sessionKeySignature?: string;
  contractAddress: string;
  recipientAddress: string;
  recipientName?: string;
  amountUsd: number;
  tokenSymbol?: string;
  tokenAddress?: string;
  functionCall?: string;
  rawCalldata?: string;
  type?: 'x402_micropay' | 'contract_call' | 'token_transfer' | 'inference_fee';
  deadline?: number; // timestamp in ms
}

export interface PipelineExecutionResponse {
  executionId: string;
  success: boolean;
  status: 'completed' | 'blocked' | 'requires_human_approval' | 'human_rejected';
  stages: PipelineStageResult[];
  decodedData?: DecodedCallData;
  simulation?: SimulationDiff;
  userOp?: UserOperation4337;
  auditRecord?: AuditRecord;
  approvalItem?: HumanApprovalItem;
  txRecord?: TransactionRecord;
  rejectionReason?: string;
  totalLatencyMs: number;
}

export interface TransactionRecord {
  id: string;
  agentId: string;
  agentName: string;
  chain: SupportedChain;
  timestamp: string;
  recipientAddress: string;
  recipientName: string;
  amountUsd: number;
  asset: string;
  txHash: string;
  type: 'x402_micropay' | 'contract_call' | 'token_transfer' | 'inference_fee';
  status: 'confirmed' | 'pending' | 'blocked_by_policy';
  policyCheckReason?: string;
  sessionKeyUsed: string;
  // Enhanced On-Chain Explorer fields
  blockNumber?: number;
  gasUsed?: number;
  gasPriceGwei?: number;
  nonce?: number;
  senderTba?: string;
  userOpHash?: string;
  signature?: string;
  attestationProof?: {
    merkleRoot: string;
    validatorAddress: string;
    timestamp: string;
    circuitProofType: string;
  };
  payloadData?: Record<string, unknown>;
}

export interface PolicyValidationResult {
  valid: boolean;
  status: 'APPROVED' | 'BLOCKED_BY_POLICY';
  violations: string[];
  checks: {
    rule: string;
    passed: boolean;
    detail: string;
  }[];
  latencyMs: number;
  evaluatedAt: string;
  enclaveSignature?: string;
}

export interface X402Endpoint {
  id: string;
  name: string;
  path: string;
  description: string;
  priceUsd: number;
  paymentToken: 'USDC' | 'ETH' | 'SOL';
  recipientTba: string;
  category: 'Compute' | 'Data Feeds' | 'Model Inference' | 'Web Scraping';
  sampleResponse: Record<string, unknown>;
}

export interface SdkSnippet {
  id: string;
  title: string;
  language: 'python' | 'typescript';
  category: 'wallet' | 'erc6551' | 'x402' | 'coinbase_agentkit' | 'langchain';
  description: string;
  code: string;
}

export interface WhitepaperSection {
  id: string;
  number: string;
  title: string;
  content: string;
  diagram?: string;
}

export interface GrantProposal {
  id: string;
  funderName: string;
  programName: string;
  grantType: 'Ecosystem' | 'Academic Research' | 'Public Goods' | 'Developer Tooling';
  requestedAmount: string;
  currency: 'USDC' | 'ETH' | 'SOL';
  projectTitle: string;
  shortSummary: string;
  problemStatement: string;
  proposedSolution: string;
  openSourceRepositories: string[];
  milestones: {
    number: number;
    title: string;
    durationWeeks: number;
    deliverables: string[];
    payoutAmount: string;
  }[];
  budgetBreakdown: {
    category: string;
    percentage: number;
    amount: string;
    justification: string;
  }[];
  readinessScore: number;
}
