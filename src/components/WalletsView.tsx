import React, { useState } from 'react';
import { AgentWallet, TransactionRecord, SupportedChain, PolicyValidationResult } from '../types/agent';
import { SUPPORTED_CHAINS } from '../data/mockData';
import { SpendingTrendsChart } from './SpendingTrendsChart';
import { PromptInjectionModal } from './PromptInjectionModal';
import { TxDetailsModal } from './TxDetailsModal';
import { validateSpendClientSide, validateSpendServerSide } from '../services/policyEngine';
import { getEnclaveKeyInfo } from '../services/enclaveKey';
import {
  ShieldCheck,
  Key,
  AlertTriangle,
  Send,
  Zap,
  RefreshCw,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  Sliders,
  Sparkles,
  ShieldAlert,
  FileCode,
  Layers,
  ChevronRight
} from 'lucide-react';

interface WalletsViewProps {
  agents: AgentWallet[];
  transactions: TransactionRecord[];
  selectedChain: SupportedChain;
  onExecuteTransaction: (
    agentId: string,
    recipient: string,
    recipientName: string,
    amountUsd: number,
    type: 'x402_micropay' | 'contract_call' | 'token_transfer'
  ) => { success: boolean; reason?: string; txHash?: string };
  onUpdatePolicy: (agentId: string, dailyLimit: number, maxPerTx: number) => void;
  onToggleStatus: (agentId: string) => void;
  onRotateSessionKey: (agentId: string) => void;
}

export const WalletsView: React.FC<WalletsViewProps> = ({
  agents,
  transactions,
  selectedChain,
  onExecuteTransaction,
  onUpdatePolicy,
  onToggleStatus,
  onRotateSessionKey,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || '');

  // Transaction Simulator state
  const [simRecipient, setSimRecipient] = useState<string>('0x7291a27e7f67727142436f5647563dae20d20ef5');
  const [simRecipientName, setSimRecipientName] = useState<string>('Decentralized Weather API');
  const [simAmount, setSimAmount] = useState<string>('0.25');
  const [simType, setSimType] = useState<'x402_micropay' | 'token_transfer'>('x402_micropay');
  const [validationDetail, setValidationDetail] = useState<PolicyValidationResult | null>(null);
  const [lastSimResult, setLastSimResult] = useState<{ success: boolean; message: string; txHash?: string } | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Modals state
  const [isAttackModalOpen, setIsAttackModalOpen] = useState<boolean>(false);
  const [selectedTxForDetails, setSelectedTxForDetails] = useState<TransactionRecord | null>(null);

  // Policy edit state
  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const [editDailyLimit, setEditDailyLimit] = useState<number>(activeAgent?.policy.dailyLimitUsd || 25);
  const [editMaxPerTx, setEditMaxPerTx] = useState<number>(activeAgent?.policy.maxPerTxUsd || 2.5);
  const [policySavedNotice, setPolicySavedNotice] = useState(false);

  // Sync edits when active agent changes
  React.useEffect(() => {
    if (activeAgent) {
      setEditDailyLimit(activeAgent.policy.dailyLimitUsd);
      setEditMaxPerTx(activeAgent.policy.maxPerTxUsd);
      setLastSimResult(null);
      setValidationDetail(null);
    }
  }, [activeAgent?.id]);

  const handleSavePolicy = () => {
    if (!activeAgent) return;
    onUpdatePolicy(activeAgent.id, editDailyLimit, editMaxPerTx);
    setPolicySavedNotice(true);
    setTimeout(() => setPolicySavedNotice(false), 2500);
  };

  // Run dynamic policy evaluation and dispatch
  const handleRunSimulator = async () => {
    if (!activeAgent) return;
    const amount = parseFloat(simAmount);
    if (isNaN(amount) || amount <= 0) {
      setLastSimResult({ success: false, message: 'Please enter a valid amount.' });
      return;
    }

    setIsValidating(true);

    // 1. Evaluate with Policy Engine
    const evalResult = await validateSpendServerSide({
      agent: activeAgent,
      recipientAddress: simRecipient,
      recipientName: simRecipientName,
      amountUsd: amount,
      type: simType,
    });
    setValidationDetail(evalResult);

    // 2. Dispatch if approved
    const res = onExecuteTransaction(
      activeAgent.id,
      simRecipient,
      simRecipientName,
      amount,
      simType
    );

    if (res.success) {
      setLastSimResult({
        success: true,
        message: `Transaction Approved & Broadcast. Enclave attestation verified in ${evalResult.latencyMs}ms.`,
        txHash: res.txHash,
      });
    } else {
      setLastSimResult({
        success: false,
        message: `BLOCKED BY POLICY FIREWALL: ${res.reason}`,
      });
    }

    setIsValidating(false);
  };

  // Trigger simulated prompt injection attack
  const handleOpenAttackSimulation = () => {
    if (!activeAgent) return;
    setIsAttackModalOpen(true);
  };

  // When attack modal completes interception, record in ledger
  const handleAttackIntercepted = (drainAmount: number, attackerAddr: string, reason: string) => {
    onExecuteTransaction(
      activeAgent.id,
      attackerAddr,
      'Adversarial Drain Contract (Prompt Injected)',
      drainAmount,
      'token_transfer'
    );
  };

  return (
    <div className="space-y-8">
      {/* Overview Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Self-Custodied Agent Wallet Fleet</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Autonomous smart contract accounts powered by ERC-6551 Token Bound Accounts and ERC-4337. Ephemeral session keys execute micro-payments while the spend firewall prevents prompt-injection drain attacks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400">
            <span>Active Agents: </span>
            <span className="font-mono text-white font-semibold">{agents.length}</span>
          </div>
          <span className="text-slate-700">·</span>
          <div className="text-xs text-slate-400">
            <span>Total Txs: </span>
            <span className="font-mono text-white font-semibold">
              {agents.reduce((acc, a) => acc + a.totalTransactionsExecuted, 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Agents Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const isSelected = agent.id === activeAgent?.id;
          const chainInfo = SUPPORTED_CHAINS[agent.chain];
          const budgetPct = Math.min(
            100,
            Math.round((agent.policy.spentTodayUsd / agent.policy.dailyLimitUsd) * 100)
          );

          return (
            <div
              key={agent.id}
              onClick={() => setSelectedAgentId(agent.id)}
              className={`p-4 rounded-lg cursor-pointer transition-all border text-left ${
                isSelected
                  ? 'bg-slate-800/90 border-emerald-500/60 shadow-lg shadow-emerald-500/5'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{agent.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        agent.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : agent.status === 'paused'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {agent.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{agent.role}</p>
                </div>
                <span className="text-[11px] font-mono text-slate-400">#{agent.agentIdTokenId}</span>
              </div>

              {/* Balances */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-baseline justify-between">
                <div>
                  <span className="text-xs text-slate-400">Vault Balance</span>
                  <div className="text-sm font-mono font-medium text-white">
                    ${agent.balances.usdc.toFixed(2)}{' '}
                    <span className="text-xs text-slate-400">
                      ({agent.balances.native.toFixed(3)} {agent.balances.nativeSymbol})
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Daily Cap</span>
                  <div className="text-xs font-mono text-slate-300">
                    ${agent.policy.spentTodayUsd.toFixed(2)} / ${agent.policy.dailyLimitUsd.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    budgetPct > 80 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>

              {/* Chain & TBA preview */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {chainInfo.name}
                </span>
                <span className="font-mono truncate max-w-[130px]">
                  {agent.tbaAddress.slice(0, 6)}...{agent.tbaAddress.slice(-4)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {activeAgent && (
        <>
          {/* Recharts Agent Spending Trends & Daily Transaction Volume Chart with Fleet Comparative View */}
          <SpendingTrendsChart
            activeAgent={activeAgent}
            allAgents={agents}
            transactions={transactions}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1 & 2: Cryptographic Architecture & Security Enclave */}
            <div className="lg:col-span-2 space-y-6">
              {/* Dual-Key Architecture Inspection Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">
                      Dual-Key Enclave & Cryptographic Separation
                    </h2>
                  </div>
                  <button
                    onClick={() => onRotateSessionKey(activeAgent.id)}
                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 px-2.5 py-1 rounded border border-slate-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3 text-emerald-400" />
                    <span>Rotate Session Signer</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {/* Root Owner (Cold) */}
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-md">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-blue-400" />
                        Root Owner Authority (Cold / Enclave)
                      </span>
                      <span className="text-[10px] text-blue-400 font-mono">ERC-721 HOLDER</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Holds the Agent ID NFT. Never exposed to LLM prompts. Holds sole revocation privilege.
                    </p>
                    <div className="mt-2 text-xs font-mono text-slate-200 bg-slate-900 px-2 py-1 rounded border border-slate-800 truncate">
                      {activeAgent.rootOwnerAddress}
                    </div>
                  </div>

                  {/* Session Signer (Hot / Runtime) */}
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-md">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Unlock className="w-3 h-3 text-emerald-400" />
                        Session Delegated Signer (Hot / Ephemeral)
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono">EIP-712 RUNTIME</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Ephemeral key used by the agent tool loop. Strictly bounded by smart contract spend firewall.
                    </p>
                    <div className="mt-2 text-xs font-mono text-emerald-400 bg-slate-900 px-2 py-1 rounded border border-slate-800 truncate">
                      {activeAgent.sessionKeyAddress}
                    </div>
                  </div>
                </div>

                {/* Token Bound Account Address */}
                <div className="mt-4 p-3.5 bg-slate-950/80 border border-emerald-500/20 rounded-md flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs text-slate-400">ERC-6551 Token Bound Account (Self-Custodial Vault)</span>
                    <div className="text-xs font-mono text-white font-medium break-all">
                      {activeAgent.tbaAddress}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`${SUPPORTED_CHAINS[activeAgent.chain].explorerUrl}/address/${activeAgent.tbaAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-400 hover:underline flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>View on Explorer</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Enclave Signer Key Auto-Generation Telemetry */}
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded border border-slate-800">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Signing Enclave Key:</span>
                    <span className="font-mono text-slate-300">{getEnclaveKeyInfo().keyPreview}</span>
                  </span>
                  <span className="font-mono text-[10px] text-emerald-400">
                    {getEnclaveKeyInfo().isAutoGenerated ? 'LOCAL STATE (AUTO-GENERATED 64-HEX)' : 'ENV SECRET (ACTIVE)'}
                  </span>
                </div>
              </div>

              {/* Spend Firewall Policy Engine Configuration */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">Spend Firewall & Invariant Rules</h2>
                  </div>
                  <button
                    onClick={() => onToggleStatus(activeAgent.id)}
                    className={`text-xs px-2.5 py-1 rounded font-medium border flex items-center gap-1.5 transition-colors ${
                      activeAgent.status === 'active'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>
                      {activeAgent.status === 'active' ? 'Emergency Pause (Circuit Breaker)' : 'Resume Agent'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Daily Burn Rate Limit (USD)
                    </label>
                    <div className="relative mt-1">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-slate-400">
                        $
                      </span>
                      <input
                        type="number"
                        step="1"
                        value={editDailyLimit}
                        onChange={(e) => setEditDailyLimit(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-md pl-7 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Current burn: ${activeAgent.policy.spentTodayUsd.toFixed(2)} / ${activeAgent.policy.dailyLimitUsd.toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Max Per-Transaction Cap (USD)
                    </label>
                    <div className="relative mt-1">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-slate-400">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        value={editMaxPerTx}
                        onChange={(e) => setEditMaxPerTx(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-md pl-7 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Transactions exceeding this cap trigger immediate firewall rejection.
                    </span>
                  </div>
                </div>

                {/* Allowlisted Target Contracts */}
                <div className="mt-4">
                  <span className="text-xs font-medium text-slate-300 block mb-1.5">
                    Allowlisted Contracts & API Providers
                  </span>
                  <div className="space-y-1.5">
                    {activeAgent.policy.allowedContractAddresses.map((addr, idx) => (
                      <div
                        key={idx}
                        className="text-xs font-mono bg-slate-950 border border-slate-800 px-3 py-1.5 rounded flex items-center justify-between text-slate-300"
                      >
                        <span>{addr}</span>
                        <span className="text-[10px] text-emerald-400 font-sans">VERIFIED ALLOWLIST</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save Policy Button */}
                <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800">
                  <div className="text-xs text-slate-400">
                    {policySavedNotice ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Policy Invariants Updated & Synced
                      </span>
                    ) : (
                      <span>Changes are enforced across both client and server validation layers.</span>
                    )}
                  </div>
                  <button
                    onClick={handleSavePolicy}
                    className="px-3 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-slate-900 text-xs font-semibold rounded transition-colors"
                  >
                    Save Policy Invariants
                  </button>
                </div>
              </div>
            </div>

            {/* Column 3: Transaction Dispatcher & Threat Defense Simulator */}
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Send className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Dynamic Transaction Simulator</h2>
                </div>

                <p className="text-xs text-slate-400 mt-2">
                  Test custom contract destinations and amounts against the agent's real-time policy engine.
                </p>

                <div className="space-y-3 mt-4">
                  <div>
                    <label className="block text-xs text-slate-300">Recipient Label</label>
                    <input
                      type="text"
                      value={simRecipientName}
                      onChange={(e) => setSimRecipientName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300">Target Address</label>
                    <input
                      type="text"
                      value={simRecipient}
                      onChange={(e) => setSimRecipient(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-300">Amount (USD)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={simAmount}
                        onChange={(e) => setSimAmount(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300">Payment Standard</label>
                      <select
                        value={simType}
                        onChange={(e) => setSimType(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="x402_micropay">x402 Micropay</option>
                        <option value="token_transfer">Direct Transfer</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      disabled={isValidating}
                      onClick={handleRunSimulator}
                      className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isValidating ? 'Validating Invariants...' : 'Execute Autonomous Dispatch'}</span>
                    </button>

                    <button
                      onClick={handleOpenAttackSimulation}
                      className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Simulate Prompt Injection Drain Attack</span>
                    </button>
                  </div>

                  {/* Visual Policy Firewall Invariant Evaluation Status */}
                  {validationDetail && (
                    <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Invariant Checks:</span>
                        <span
                          className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            validationDetail.valid
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-xs'
                          }`}
                        >
                          {validationDetail.valid ? 'PASSED ALL INVARIANTS' : 'BLOCKED BY POLICY FIREWALL'}
                        </span>
                      </div>

                      <div className="space-y-1 bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px] font-mono">
                        {validationDetail.checks.map((chk, i) => (
                          <div key={i} className="flex items-center justify-between text-slate-300">
                            <span className="flex items-center gap-1.5 truncate max-w-[200px]">
                              {chk.passed ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                              )}
                              <span>{chk.rule}</span>
                            </span>
                            <span className={chk.passed ? 'text-emerald-400' : 'text-red-400 font-bold'}>
                              {chk.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Simulator Result Feedback */}
                  {lastSimResult && (
                    <div
                      className={`p-3 rounded border text-xs mt-3 ${
                        lastSimResult.success
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                          : 'bg-red-950/40 border-red-500/40 text-red-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {lastSimResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className="font-semibold block">
                            {lastSimResult.success ? 'Transaction Verified & Enclave Signed' : 'BLOCKED BY POLICY FIREWALL'}
                          </span>
                          <p className="text-[11px] mt-0.5 opacity-90 break-words">{lastSimResult.message}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Model Provenance Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-white">Agent Model Provenance</span>
                </div>
                <div className="text-xs text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800">
                  {activeAgent.model}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Verified through decentralized cryptographic attestation. System prompt hashes are immutably tied to the Token Bound Account.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* On-Chain Activity & Verification Ledger */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">
              On-Chain Activity & Verification Ledger
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Click any row to open the on-chain explorer modal
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Timestamp</th>
                <th className="py-2.5 px-4 font-medium">Agent</th>
                <th className="py-2.5 px-4 font-medium">Type</th>
                <th className="py-2.5 px-4 font-medium">Recipient / Target</th>
                <th className="py-2.5 px-4 font-medium text-right">Amount (USD)</th>
                <th className="py-2.5 px-4 font-medium text-center">Status</th>
                <th className="py-2.5 px-4 font-medium">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => setSelectedTxForDetails(tx)}
                  className="hover:bg-slate-850 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                    {new Date(tx.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-2.5 px-4 text-white font-sans whitespace-nowrap font-medium">
                    {tx.agentName}
                  </td>
                  <td className="py-2.5 px-4 font-sans whitespace-nowrap">
                    <span className="text-[11px] text-slate-400">
                      {tx.type === 'x402_micropay'
                        ? 'x402 Micro'
                        : tx.type === 'inference_fee'
                        ? 'Inference Fee'
                        : 'Transfer'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-sans text-slate-300 max-w-[220px] truncate">
                    {tx.recipientName}
                  </td>
                  <td className="py-2.5 px-4 text-right text-white tabular-nums font-semibold">
                    ${tx.amountUsd.toFixed(4)}
                  </td>
                  <td className="py-2.5 px-4 text-center font-sans">
                    {tx.status === 'confirmed' ? (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-semibold">
                        CONFIRMED
                      </span>
                    ) : (
                      <span
                        title={tx.policyCheckReason}
                        className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded font-semibold"
                      >
                        POLICY BLOCKED
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-slate-400 truncate max-w-[140px]">
                    {tx.status === 'confirmed' ? (
                      <span className="text-emerald-400 hover:underline">
                        {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-6)}
                      </span>
                    ) : (
                      <span className="text-red-400/80 italic font-sans">Reverted Invariant</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulated Prompt Injection Attack Vector Modal */}
      {activeAgent && (
        <PromptInjectionModal
          isOpen={isAttackModalOpen}
          onClose={() => setIsAttackModalOpen(false)}
          activeAgent={activeAgent}
          onAttackIntercepted={handleAttackIntercepted}
        />
      )}

      {/* On-Chain Activity Explorer & Verification Ledger Modal */}
      <TxDetailsModal
        tx={selectedTxForDetails}
        onClose={() => setSelectedTxForDetails(null)}
      />
    </div>
  );
};
