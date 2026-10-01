import { getAddress } from "ethers";

export type Policy = {
  enabled: boolean;
  chainId: number;
  expiresAt: number;
  maximumTransactionWei: bigint;
  maximumDailyWei: bigint;
  maximumTransactionsPerHour: number;
  approvalThresholdWei: bigint;
  allowedRecipients: string[];
  blockedRecipients: string[];
  allowedContracts: string[];
  allowedFunctionSelectors: string[];
};

export type TransactionRequest = {
  agentId: string;
  sessionKey: string;
  chainId: number;
  recipient: string;
  contractAddress: string;
  functionSelector: string;
  valueWei: bigint;
  timestamp: number;
};

export type Usage = {
  spentTodayWei: bigint;
  transactionsLastHour: number;
};

export type Decision = {
  status: "ALLOW" | "DENY" | "REVIEW";
  reason: string;
  checks: string[];
};

function normalize(address: string): string {
  return getAddress(address).toLowerCase();
}

export function evaluateTransaction(
  request: TransactionRequest,
  policy: Policy,
  usage: Usage
): Decision {
  const checks: string[] = [];

  if (!policy.enabled) {
    return deny("Agent policy is disabled", checks);
  }

  if (request.timestamp >= policy.expiresAt) {
    return deny("Session policy has expired", checks);
  }
  checks.push("Policy active");

  if (request.chainId !== policy.chainId) {
    return deny("Chain is not permitted", checks);
  }
  checks.push("Chain permitted");

  let recipient: string;
  let contractAddress: string;

  try {
    recipient = normalize(request.recipient);
    contractAddress = normalize(request.contractAddress);
  } catch {
    return deny("Invalid address", checks);
  }

  const blocked = policy.blockedRecipients.map(normalize);
  const recipients = policy.allowedRecipients.map(normalize);
  const contracts = policy.allowedContracts.map(normalize);

  if (blocked.includes(recipient)) {
    return deny("Recipient is blocked", checks);
  }

  if (!recipients.includes(recipient)) {
    return deny("Recipient is not allowlisted", checks);
  }
  checks.push("Recipient allowlisted");

  if (!contracts.includes(contractAddress)) {
    return deny("Contract is not allowlisted", checks);
  }
  checks.push("Contract allowlisted");

  if (
    !policy.allowedFunctionSelectors.includes(
      request.functionSelector.toLowerCase()
    )
  ) {
    return deny("Contract function is not permitted", checks);
  }
  checks.push("Function permitted");

  if (request.valueWei < 0n) {
    return deny("Invalid transaction value", checks);
  }

  if (request.valueWei > policy.maximumTransactionWei) {
    return deny("Per-transaction spending limit exceeded", checks);
  }
  checks.push("Transaction limit passed");

  if (
    usage.spentTodayWei + request.valueWei >
    policy.maximumDailyWei
  ) {
    return deny("Daily spending limit exceeded", checks);
  }
  checks.push("Daily limit passed");

  if (
    usage.transactionsLastHour >=
    policy.maximumTransactionsPerHour
  ) {
    return deny("Hourly transaction limit exceeded", checks);
  }
  checks.push("Velocity check passed");

  if (request.valueWei >= policy.approvalThresholdWei) {
    return {
      status: "REVIEW",
      reason: "Human approval required",
      checks
    };
  }

  return {
    status: "ALLOW",
    reason: "Transaction satisfies policy",
    checks
  };
}

function deny(reason: string, checks: string[]): Decision {
  return { status: "DENY", reason, checks };
}
