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
