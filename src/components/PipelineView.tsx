import React, { useState, useEffect } from 'react';
import {
  AgentWallet,
  SupportedChain,
  PipelineExecutionResponse,
  PipelineStageResult,
  HumanApprovalItem,
  AuditRecord,
} from '../types/agent';
import {
  runAgentExecutionPipeline,
  getPendingApprovals,
  resolvePendingApproval,
  decodeTransactionCalldata,
} from '../services/pipelineEngine';
import { loadAuditRecords } from '../services/firebase';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  ArrowRight,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  ChevronDown,
  ChevronUp,
  FileCode,
  Terminal,
  Cpu,
  Layers,
  Database,
  ExternalLink,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface PipelineViewProps {
  agents: AgentWallet[];
  selectedChain: SupportedChain;
  onChainChange?: (chain: SupportedChain) => void;
  onAgentSpendConfirmed?: (agentId: string, amountUsd: number) => void;
}

// Preset testing scenarios covering every step of the 10-stage pipeline
const PRESET_SCENARIOS = [
  {
    id: 'valid_micropay',
    title: 'Standard x402 Micropay',
    description: 'Autonomous $0.15 weather API fee. Passes all 10 stages instantaneously.',
    amount: '0.15',
    type: 'x402_micropay' as const,
    recipient: '0x7291a27e7f67727142436f5647563dae20d20ef5',
    recipientName: 'Weather Feed Oracle (x402)',
    contractAddress: '0x7291a27e7f67727142436f5647563dae20d20ef5',
    expectedOutcome: 'PASS_ALL',
  },
  {
    id: 'valid_usdc_transfer',
    title: 'ERC-20 USDC Transfer',
    description: 'Valid $2.50 transfer to allowlisted protocol smart contract.',
    amount: '2.50',
    type: 'token_transfer' as const,
    recipient: '0x1010101010101010101010101010101010101010',
    recipientName: 'Compute Cluster Vault',
    contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    expectedOutcome: 'PASS_ALL',
  },
  {
    id: 'human_approval_high_value',
    title: 'High-Value Transfer ($45.00)',
    description: 'Exceeds autonomous approval threshold ($10.00). Halts at Stage 8 for Operator sign-off.',
    amount: '45.00',
    type: 'token_transfer' as const,
    recipient: '0x1010101010101010101010101010101010101010',
    recipientName: 'High Compute Model Cluster',
    contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    expectedOutcome: 'REQUIRE_HUMAN_APPROVAL',
  },
  {
    id: 'unauthorized_contract',
    title: 'Unknown Contract Attack',
    description: 'Attempts to call untrusted contract not in agent whitelist. Blocked at Stage 4.',
    amount: '1.00',
    type: 'contract_call' as const,
    recipient: '0x9999999999999999999999999999999999999999',
    recipientName: 'Shadow Drainer Proxy',
    contractAddress: '0x9999999999999999999999999999999999999999',
    expectedOutcome: 'BLOCKED_STAGE_4',
  },
  {
    id: 'malicious_drain_recipient',
    title: 'Malicious Drain Address',
    description: 'Attempts transfer to blacklisted zero/dead burn drainer. Blocked at Stage 5.',
    amount: '0.50',
    type: 'token_transfer' as const,
    recipient: '0x000000000000000000000000000000000000dead',
    recipientName: 'Known Exploiter Burn Sink',
    contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    expectedOutcome: 'BLOCKED_STAGE_5',
  },
  {
    id: 'daily_cap_breach',
    title: 'Daily Spend Limit Breach',
    description: 'Requested $35.00 exceeds remaining daily allowance ($25.00 cap). Blocked at Stage 6.',
    amount: '35.00',
    type: 'token_transfer' as const,
    recipient: '0x1010101010101010101010101010101010101010',
    recipientName: 'Compute Vault',
    contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    expectedOutcome: 'BLOCKED_STAGE_6',
  },
  {
    id: 'expired_session',
    title: 'Expired Session Key',
    description: 'Agent session key past validity timestamp. Blocked at Stage 2.',
    amount: '0.10',
    type: 'x402_micropay' as const,
    recipient: '0x7291a27e7f67727142436f5647563dae20d20ef5',
    recipientName: 'Weather Feed',
    contractAddress: '0x7291a27e7f67727142436f5647563dae20d20ef5',
    expectedOutcome: 'BLOCKED_STAGE_2',
  },
];

export const PipelineView: React.FC<PipelineViewProps> = ({
  agents,
  selectedChain,
  onAgentSpendConfirmed,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || '');
  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  // Request form state
  const [recipient, setRecipient] = useState<string>('0x7291a27e7f67727142436f5647563dae20d20ef5');
  const [recipientName, setRecipientName] = useState<string>('Weather Feed Oracle (x402)');
  const [contractAddress, setContractAddress] = useState<string>('0x7291a27e7f67727142436f5647563dae20d20ef5');
  const [amountUsd, setAmountUsd] = useState<string>('0.15');
  const [txType, setTxType] = useState<'x402_micropay' | 'contract_call' | 'token_transfer'>('x402_micropay');
  const [customCalldata, setCustomCalldata] = useState<string>('');
  const [activePreset, setActivePreset] = useState<string>('valid_micropay');

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineExecutionResponse | null>(null);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

  // Approval queue & audit records state
  const [pendingApprovals, setPendingApprovals] = useState<HumanApprovalItem[]>([]);
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [selectedAuditForModal, setSelectedAuditForModal] = useState<AuditRecord | null>(null);
  const [operatorNotes, setOperatorNotes] = useState<string>('Risk checked and verified by security officer');
  const [isResolvingApproval, setIsResolvingApproval] = useState<boolean>(false);

  // Load approvals and audits on mount
  useEffect(() => {
    setPendingApprovals(getPendingApprovals());
    loadAuditRecords().then((records) => setAuditRecords(records));
  }, []);

  // Update form when preset is selected
  const handleSelectPreset = (presetId: string) => {
    const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    setAmountUsd(preset.amount);
    setTxType(preset.type);
    setRecipient(preset.recipient);
    setRecipientName(preset.recipientName);
    setContractAddress(preset.contractAddress);
    setPipelineResult(null);

    // If expired session preset, set session key to an expired or invalid mock
    if (preset.id === 'expired_session') {
      setCustomCalldata('');
    }
  };

  // Run the full 10-stage execution pipeline
  const handleExecutePipeline = async () => {
    if (!activeAgent) return;
    setIsRunning(true);
    setPipelineResult(null);

    const amount = parseFloat(amountUsd);
    if (isNaN(amount) || amount <= 0) {
      setIsRunning(false);
      return;
    }

    // Determine session key to use
    let sessionKeyToUse = activeAgent.sessionKeyAddress;
    let agentToRun = activeAgent;

    if (activePreset === 'expired_session') {
      // Simulate expired session key
      agentToRun = {
        ...activeAgent,
        policy: {
          ...activeAgent.policy,
          sessionKeyExpiresAt: '2023-01-01T00:00:00.000Z',
        },
      };
    }

    try {
      const response = await runAgentExecutionPipeline(
        {
          agentId: activeAgent.id,
          chain: activeAgent.chain,
          sessionKeyAddress: sessionKeyToUse,
          contractAddress: contractAddress.trim(),
          recipientAddress: recipient.trim(),
          recipientName,
          amountUsd: amount,
          tokenSymbol: 'USDC',
          rawCalldata: customCalldata.trim() || undefined,
          type: txType,
        },
        agentToRun
      );

      setPipelineResult(response);

      // Auto-expand failed or action-required stage
      const firstFailingStage = response.stages.find(
        (s) => s.status === 'failed' || s.status === 'requires_action'
      );
      if (firstFailingStage) {
        setExpandedStageId(firstFailingStage.id);
      } else {
        setExpandedStageId('submit_erc4337_user_op');
      }

      // Refresh approval queue & audit logs
      setPendingApprovals(getPendingApprovals());
      if (response.auditRecord) {
        setAuditRecords((prev) => [response.auditRecord!, ...prev]);
        if (response.success && onAgentSpendConfirmed) {
          onAgentSpendConfirmed(activeAgent.id, amount);
        }
      }
    } catch (err) {
      console.error('Pipeline execution failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // Handle operator approval or rejection
  const handleResolveApproval = async (approvalId: string, decision: 'approve' | 'reject') => {
    setIsResolvingApproval(true);
    try {
      const result = await resolvePendingApproval(
        approvalId,
        decision,
        operatorNotes,
        'Senior Security Lead'
      );

      setPendingApprovals(getPendingApprovals());

      if (result.executionResult) {
        setPipelineResult(result.executionResult);
        if (result.executionResult.auditRecord) {
          setAuditRecords((prev) => [result.executionResult!.auditRecord!, ...prev]);
        }
        if (result.executionResult.success && onAgentSpendConfirmed) {
          onAgentSpendConfirmed(activeAgent.id, parseFloat(amountUsd));
        }
      }
    } catch (err) {
      console.error('Approval resolution failed:', err);
    } finally {
      setIsResolvingApproval(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb & Executive Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>Protocol Invariants</span>
            <span aria-hidden="true">·</span>
            <span>Deterministic Policy Firewall</span>
            <span aria-hidden="true">·</span>
            <span>ERC-4337 UserOperation Pipeline</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Agent Request Execution Pipeline</span>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              10-Stage Deterministic Verification
            </span>
          </h1>
        </div>

        {/* Pending Approval Badge & Telemetry */}
        <div className="flex items-center gap-3">
          {pendingApprovals.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>{pendingApprovals.length} Pending Human Review</span>
            </div>
          )}
          <div className="text-xs text-slate-400">
            <span>Target: </span>
            <span className="text-slate-200 font-mono">{activeAgent?.name}</span>
          </div>
        </div>
      </div>

      {/* Preset Test Scenarios Segmented Selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-300 block">
          Preset Invariant Test Scenarios (Select to test specific pipeline gate)
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {PRESET_SCENARIOS.map((preset) => {
            const isSelected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset.id)}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-800 border-emerald-500/60 text-white shadow-sm ring-1 ring-emerald-500/30'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <div className="font-semibold truncate mb-1">{preset.title}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2 leading-tight">
                  {preset.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Request Builder & Live Pipeline Stepper */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Inbound Request Envelope Builder */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Agent Request Configuration</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              Chain: {activeAgent?.chain}
            </span>
          </div>

          {/* Agent Picker */}
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Executing Agent
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role} · TBA: {a.tbaAddress.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>

          {/* Recipient and Name */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Recipient Contract / TBA Address
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                placeholder="0x..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Recipient Label / Service
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                placeholder="e.g. Weather API Oracle"
              />
            </div>
          </div>

          {/* Amount and Call Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Amount (USDC)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">
                  USD
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Call Type
              </label>
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value="x402_micropay">x402 Micropayment</option>
                <option value="token_transfer">ERC-20 Transfer</option>
                <option value="contract_call">Contract Call</option>
              </select>
            </div>
          </div>

          {/* Active Policy Rules Preview */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 text-xs space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Active Policy Thresholds
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Max Per-Tx Limit:</span>
              <span className="font-mono tabular-nums text-white">
                ${activeAgent?.policy.maxPerTxUsd.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Daily Burn Limit:</span>
              <span className="font-mono tabular-nums text-white">
                ${activeAgent?.policy.spentTodayUsd.toFixed(2)} / ${activeAgent?.policy.dailyLimitUsd.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Human Approval Threshold:</span>
              <span className="font-mono tabular-nums text-amber-300">
                &gt; ${activeAgent?.policy.requireHumanApprovalAboveUsd.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Allowed Contracts:</span>
              <span className="font-mono tabular-nums text-emerald-400">
                {activeAgent?.policy.allowedContractAddresses.length} verified
              </span>
            </div>
          </div>

          {/* Run Pipeline Button */}
          <button
            onClick={handleExecutePipeline}
            disabled={isRunning}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm ${
              isRunning
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
            }`}
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Evaluating Invariants Across 10 Stages...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Agent Request Pipeline</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column (7 cols): The 10-Stage Pipeline Visualizer */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Execution Pipeline Trace</span>
                </h2>
                <span className="text-xs text-slate-400">
                  {pipelineResult
                    ? `Execution ID: ${pipelineResult.executionId} · Evaluated in ${pipelineResult.totalLatencyMs}ms`
                    : 'Click "Run Agent Request Pipeline" to trigger deterministic checks.'}
                </span>
              </div>

              {pipelineResult && (
                <div
                  className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                    pipelineResult.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : pipelineResult.status === 'requires_human_approval'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {pipelineResult.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {pipelineResult.status === 'requires_human_approval' && <AlertTriangle className="w-3.5 h-3.5" />}
                  {pipelineResult.status === 'blocked' && <XCircle className="w-3.5 h-3.5" />}
                  <span>{pipelineResult.status.replace(/_/g, ' ')}</span>
                </div>
              )}
            </div>

            {/* Stages Stepper */}
            <div className="space-y-2">
              {/* Default Empty State or Live Rendered Stages */}
              {!pipelineResult && !isRunning && (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-800/80 mx-auto flex items-center justify-center text-slate-400">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="text-sm font-semibold text-slate-300">
                    Ready to evaluate incoming agent request
                  </div>
                  <div className="text-xs text-slate-500 max-w-md mx-auto">
                    Select any test preset above or configure custom parameters on the left to watch all 10 stages execute with cryptographic proof.
                  </div>
                </div>
              )}

              {/* Render Stages */}
              {pipelineResult?.stages.map((stage, idx) => {
                const isExpanded = expandedStageId === stage.id;
                const isPassed = stage.status === 'passed';
                const isActionRequired = stage.status === 'requires_action';
                const isFailed = stage.status === 'failed';

                return (
                  <div
                    key={stage.id}
                    className={`rounded-lg border transition-colors ${
                      isPassed
                        ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        : isActionRequired
                        ? 'bg-amber-950/20 border-amber-500/50 shadow-sm'
                        : 'bg-rose-950/20 border-rose-500/50 shadow-sm'
                    }`}
                  >
                    {/* Stage Header Row */}
                    <div
                      onClick={() => setExpandedStageId(isExpanded ? null : stage.id)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                            isPassed
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : isActionRequired
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">
                              {stage.title}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              ({stage.latencyMs}ms)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-md">
                            {stage.summary}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded ${
                            isPassed
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : isActionRequired
                              ? 'text-amber-300 bg-amber-500/20'
                              : 'text-rose-400 bg-rose-500/10'
                          }`}
                        >
                          {stage.status.toUpperCase()}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Stage Expanded Details Drawer */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 border-t border-slate-800/80 text-xs space-y-2 bg-slate-950/40">
                        <p className="text-slate-400">{stage.description}</p>

                        {/* Violations / Errors */}
                        {stage.violations && stage.violations.length > 0 && (
                          <div className="bg-rose-500/10 border border-rose-500/30 rounded p-2.5 text-rose-300">
                            <div className="font-semibold mb-1">Violations Identified:</div>
                            <ul className="list-disc list-inside space-y-0.5">
                              {stage.violations.map((v, i) => (
                                <li key={i}>{v}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Stage Specific Forensics */}
                        {stage.details && (
                          <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto">
                            {JSON.stringify(stage.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Human-in-the-Loop Approval Queue (Active Banner & Cards) */}
      {pendingApprovals.length > 0 && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Human-in-the-Loop Operator Clearance Queue
                </h2>
                <span className="text-xs text-slate-400">
                  Autonomous threshold or unverified destination triggered Stage 8 escalation.
                </span>
              </div>
            </div>
            <span className="text-xs font-mono text-amber-400 font-medium">
              {pendingApprovals.length} Pending Actions
            </span>
          </div>

          <div className="space-y-4">
            {pendingApprovals.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div>
                    <span className="text-xs font-bold text-white mr-2">
                      Agent: {item.agentName}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      (ID: {item.id})
                    </span>
                    <div className="text-xs text-amber-300 mt-0.5">
                      Escalation Reason: {item.reason}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold font-mono text-white">
                      ${item.amountUsd.toFixed(2)} USDC
                    </span>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Chain: {item.chain}
                    </div>
                  </div>
                </div>

                {/* Decoded Calldata & Simulation preview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Decoded Transaction Action
                    </span>
                    <div className="space-y-1 font-mono text-slate-300">
                      <div>Method: <span className="text-emerald-400">{item.decodedData.functionName}</span></div>
                      <div>Target: <span className="text-slate-200">{item.recipientAddress.slice(0, 14)}...</span></div>
                      <div>Recipient Name: <span className="text-slate-200">{item.recipientName}</span></div>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Dry-Run Simulation Trace
                    </span>
                    <div className="space-y-1 font-mono text-slate-300">
                      <div>Gas Estimate: <span className="text-slate-200">{item.simulation.gasEstimated.toLocaleString()}</span></div>
                      <div>Revert Risk: <span className="text-emerald-400">0% (Safe)</span></div>
                      <div>Delta: <span className="text-rose-400">-{item.amountUsd.toFixed(2)} USDC</span> from Agent TBA</div>
                    </div>
                  </div>
                </div>

                {/* Operator Decision Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <input
                    type="text"
                    value={operatorNotes}
                    onChange={(e) => setOperatorNotes(e.target.value)}
                    placeholder="Enter operator clearance notes..."
                    className="flex-1 w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-slate-700"
                  />
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => handleResolveApproval(item.id, 'reject')}
                      disabled={isResolvingApproval}
                      className="px-3 py-1.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 transition-colors"
                    >
                      Reject & Abort
                    </button>
                    <button
                      onClick={() => handleResolveApproval(item.id, 'approve')}
                      disabled={isResolvingApproval}
                      className="px-4 py-1.5 rounded bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition-colors shadow-sm"
                    >
                      Approve & Submit UserOp
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Trail & Ledger Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Immutable Audit Trail & Cryptographic Proofs</span>
            </h2>
            <span className="text-xs text-slate-400">
              Synced with Firestore persistent storage collection (/audit_records)
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {auditRecords.length} Records Logged
          </span>
        </div>

        {auditRecords.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No audit records created yet. Run the pipeline above to save on-chain receipts.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-mono">
                <tr>
                  <th className="py-2.5 px-3">Audit ID</th>
                  <th className="py-2.5 px-3">Agent</th>
                  <th className="py-2.5 px-3">Recipient</th>
                  <th className="py-2.5 px-3 text-right">Amount (USD)</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Tx Hash</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {auditRecords.slice(0, 10).map((record) => (
                  <tr key={record.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">
                      {record.id.slice(0, 14)}...
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      {record.agentName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {record.recipientName || record.recipientAddress.slice(0, 10) + '...'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white tabular-nums">
                      ${record.amountUsd.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] font-medium">
                        {record.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {record.txHash ? record.txHash.slice(0, 12) + '...' : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setSelectedAuditForModal(record)}
                        className="text-emerald-400 hover:text-emerald-300 text-xs font-sans hover:underline"
                      >
                        Inspect Proof
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Record Modal */}
      {selectedAuditForModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Cryptographic Audit Proof</h3>
                <span className="text-xs text-slate-400 font-mono">
                  ID: {selectedAuditForModal.id}
                </span>
              </div>
              <button
                onClick={() => setSelectedAuditForModal(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 text-xs font-mono">
              <div>
                <span className="text-slate-400">Merkle Root:</span>
                <div className="bg-slate-950 p-2 rounded text-emerald-300 break-all select-all mt-1">
                  {selectedAuditForModal.merkleRoot}
                </div>
              </div>
              <div>
                <span className="text-slate-400">UserOp Hash:</span>
                <div className="bg-slate-950 p-2 rounded text-slate-200 break-all select-all mt-1">
                  {selectedAuditForModal.userOpHash}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Full Audit Payload:</span>
                <pre className="bg-slate-950 p-3 rounded text-[11px] text-slate-300 overflow-x-auto mt-1 max-h-60">
                  {JSON.stringify(selectedAuditForModal, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
