import React, { useState } from 'react';
import { AgentWallet, X402Endpoint, SupportedChain } from '../types/agent';
import { X402_ENDPOINTS, SUPPORTED_CHAINS } from '../data/mockData';
import {
  Globe,
  Zap,
  ArrowRight,
  CheckCircle2,
  Lock,
  Coins,
  FileCode,
  Terminal,
  Activity,
  Layers,
  ChevronRight
} from 'lucide-react';

interface MicropayViewProps {
  agents: AgentWallet[];
  selectedChain: SupportedChain;
  onExecuteMicropayment: (agentId: string, endpoint: X402Endpoint) => { success: boolean; data?: any; error?: string };
}

export const MicropayView: React.FC<MicropayViewProps> = ({
  agents,
  selectedChain,
  onExecuteMicropayment,
}) => {
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>(X402_ENDPOINTS[0].id);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || '');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStep, setExecutionStep] = useState<number>(0); // 0: Idle, 1: 402 Challenge, 2: Policy Check, 3: Sign EIP-712, 4: 200 OK
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'AgentRails x402 Protocol Gateway v1.4 initialized.',
    'Listening on machine-to-machine payment rails...',
  ]);
  const [apiResponsePayload, setApiResponsePayload] = useState<any>(null);

  // Streaming rails simulation state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedTokens, setStreamedTokens] = useState(0);
  const [streamedCostUsd, setStreamedCostUsd] = useState(0);

  const activeEndpoint = X402_ENDPOINTS.find((e) => e.id === selectedEndpointId) || X402_ENDPOINTS[0];
  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  // Streaming effect
  React.useEffect(() => {
    let interval: any;
    if (isStreaming) {
      interval = setInterval(() => {
        setStreamedTokens((prev) => prev + 12);
        setStreamedCostUsd((prev) => +(prev + 0.00012).toFixed(5));
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

  const addLog = (msg: string) => {
    setTerminalLogs((prev) => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleRunX402Flow = async () => {
    if (!activeAgent || isExecuting) return;

    setIsExecuting(true);
    setApiResponsePayload(null);
    setExecutionStep(1);
    addLog(`Agent '${activeAgent.name}' sending unauthenticated request to: ${activeEndpoint.path}`);

    // Step 1: Initial call -> 402 challenge
    await new Promise((r) => setTimeout(r, 600));
    setExecutionStep(2);
    addLog(`<< HTTP 402 Payment Required: Quote nonce=0x7f2a... Price=$${activeEndpoint.priceUsd} USDC`);

    // Step 2: Policy Engine validation
    await new Promise((r) => setTimeout(r, 700));
    setExecutionStep(3);
    addLog(`[PolicyEngine] Validating quote against daily cap. Remaining: $${(activeAgent.policy.dailyLimitUsd - activeAgent.policy.spentTodayUsd).toFixed(2)}`);

    // Step 3: Sign EIP-712 authorization
    await new Promise((r) => setTimeout(r, 700));
    setExecutionStep(4);
    addLog(`[SessionSigner] Generated EIP-712 Permit2 authorization token with ephemeral key ${activeAgent.sessionKeyAddress.slice(0, 8)}...`);

    // Step 4: Retry with Authorization header -> 200 OK
    await new Promise((r) => setTimeout(r, 600));
    const result = onExecuteMicropayment(activeAgent.id, activeEndpoint);

    if (result.success) {
      addLog(`<< HTTP 200 OK. Settlement confirmed on-chain. Delivered ${JSON.stringify(activeEndpoint.sampleResponse).length} bytes`);
      setApiResponsePayload(activeEndpoint.sampleResponse);
    } else {
      addLog(`<< ERROR: ${result.error}`);
    }

    setIsExecuting(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>x402 Stateless HTTP Micropayment Rails</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Autonomous Machine-to-Machine (M2M) commerce. AI agents pay for APIs, compute, and data per-request over standard HTTP 402 status codes using EIP-712 cryptographic permit signatures.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">
            <span>Settlement Standard: </span>
            <span className="text-emerald-400 font-mono font-semibold">x402 / EIP-712 Permit2</span>
          </div>
        </div>
      </div>

      {/* Protocol Handshake Visualizer */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-xs font-semibold text-white mb-4">
          Autonomous 5-Step HTTP 402 Handshake Pipeline
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div
            className={`p-3 rounded-md border text-xs transition-all ${
              executionStep >= 1
                ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                : 'bg-slate-950/60 border-slate-800 text-slate-400'
            }`}
          >
            <div className="text-[10px] text-slate-400 font-mono">01. INITIATION</div>
            <div className="font-semibold mt-1">GET /api/v1/...</div>
            <p className="text-[11px] text-slate-400 mt-1">Agent calls API with zero credentials.</p>
          </div>

          <div
            className={`p-3 rounded-md border text-xs transition-all ${
              executionStep >= 2
                ? 'bg-amber-950/40 border-amber-500/50 text-white'
                : 'bg-slate-950/60 border-slate-800 text-slate-400'
            }`}
          >
            <div className="text-[10px] text-amber-400 font-mono">02. CHALLENGE</div>
            <div className="font-semibold mt-1">HTTP 402 Payment</div>
            <p className="text-[11px] text-slate-400 mt-1">Server sends pricing quote, nonce & recipient TBA.</p>
          </div>

          <div
            className={`p-3 rounded-md border text-xs transition-all ${
              executionStep >= 3
                ? 'bg-purple-950/40 border-purple-500/50 text-white'
                : 'bg-slate-950/60 border-slate-800 text-slate-400'
            }`}
          >
            <div className="text-[10px] text-purple-400 font-mono">03. FIREWALL</div>
            <div className="font-semibold mt-1">Policy Engine</div>
            <p className="text-[11px] text-slate-400 mt-1">Agent verifies quote against daily burn limits.</p>
          </div>

          <div
            className={`p-3 rounded-md border text-xs transition-all ${
              executionStep >= 4
                ? 'bg-blue-950/40 border-blue-500/50 text-white'
                : 'bg-slate-950/60 border-slate-800 text-slate-400'
            }`}
          >
            <div className="text-[10px] text-blue-400 font-mono">04. SIGNING</div>
            <div className="font-semibold mt-1">EIP-712 Permit2</div>
            <p className="text-[11px] text-slate-400 mt-1">Session key signs gasless micropayment authorization.</p>
          </div>

          <div
            className={`p-3 rounded-md border text-xs transition-all ${
              apiResponsePayload
                ? 'bg-emerald-950/60 border-emerald-400 text-white shadow-lg shadow-emerald-500/10'
                : 'bg-slate-950/60 border-slate-800 text-slate-400'
            }`}
          >
            <div className="text-[10px] text-emerald-400 font-mono">05. SETTLEMENT</div>
            <div className="font-semibold mt-1">HTTP 200 OK</div>
            <p className="text-[11px] text-slate-400 mt-1">Provider serves data and settles invoice.</p>
          </div>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Endpoint Marketplace */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-white mb-2">
              Select Paying Agent
            </h2>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-sans"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (${a.balances.usdc.toFixed(2)} USDC available)
                </option>
              ))}
            </select>
            {activeAgent && (
              <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>Daily Limit: ${activeAgent.policy.dailyLimitUsd.toFixed(2)}</span>
                <span>Spent: ${activeAgent.policy.spentTodayUsd.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-white mb-3">
              Machine-Payable API Endpoints
            </h2>

            <div className="space-y-2">
              {X402_ENDPOINTS.map((ep) => {
                const isSelected = ep.id === selectedEndpointId;
                return (
                  <div
                    key={ep.id}
                    onClick={() => setSelectedEndpointId(ep.id)}
                    className={`p-3 rounded-md cursor-pointer border transition-colors ${
                      isSelected
                        ? 'bg-slate-800/90 border-emerald-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-medium text-white">{ep.name}</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        ${ep.priceUsd.toFixed(3)}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                      {ep.path}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
                      <span>{ep.category}</span>
                      <span className="font-mono text-slate-400">
                        TBA: {ep.recipientTba.slice(0, 6)}...
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center: Live Terminal & Invocation Control */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">
                  x402 Autonomous M2M Request Dispatcher
                </span>
              </div>

              <button
                disabled={isExecuting}
                onClick={handleRunX402Flow}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded transition-colors ${
                  isExecuting
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-400 hover:bg-emerald-300 text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isExecuting ? 'Negotiating 402 Settlement...' : 'Dispatch Autonomous Call'}</span>
              </button>
            </div>

            {/* Target Path Banner */}
            <div className="mt-4 p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between font-mono text-xs">
              <span className="text-emerald-400">POST {activeEndpoint.path}</span>
              <span className="text-slate-400">Quote: ${activeEndpoint.priceUsd.toFixed(3)} USDC</span>
            </div>

            {/* Live Terminal Output */}
            <div className="mt-3 bg-slate-950 border border-slate-800 rounded p-3 font-mono text-xs text-slate-300 h-44 overflow-y-auto space-y-1">
              {terminalLogs.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  {log.includes('200 OK') ? (
                    <span className="text-emerald-400 font-semibold">{log}</span>
                  ) : log.includes('402 Payment') ? (
                    <span className="text-amber-400">{log}</span>
                  ) : log.includes('ERROR') ? (
                    <span className="text-red-400 font-semibold">{log}</span>
                  ) : (
                    log
                  )}
                </div>
              ))}
            </div>

            {/* JSON Response View */}
            {apiResponsePayload && (
              <div className="mt-4 p-3 bg-slate-950 border border-emerald-500/30 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    200 OK Payload Received
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">JSON DECODED</span>
                </div>
                <pre className="text-[11px] font-mono text-slate-200 overflow-x-auto p-2 bg-slate-900/60 rounded">
                  {JSON.stringify(apiResponsePayload, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Streaming Micropayments Section (Sablier / Superfluid / SVM Stream) */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <h2 className="text-xs font-semibold text-white">
                  Continuous Token Streaming Rails (Real-Time Sub-Cent Payment)
                </h2>
              </div>
              <button
                onClick={() => setIsStreaming(!isStreaming)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  isStreaming
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                }`}
              >
                {isStreaming ? 'Halt Stream' : 'Start Streaming Payment'}
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              For real-time LLM token streams and WebSocket sensor streams, agents open continuous state channels flowing micropayments at $0.0001 per token without separate transaction fees.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded text-center">
                <span className="text-[11px] text-slate-400">Tokens Streamed</span>
                <div className="text-lg font-mono font-bold text-white mt-0.5">
                  {streamedTokens}
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded text-center">
                <span className="text-[11px] text-slate-400">Total Micro-Cost</span>
                <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
                  ${streamedCostUsd.toFixed(5)}
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded text-center">
                <span className="text-[11px] text-slate-400">Flow Rate</span>
                <div className="text-sm font-mono text-purple-300 mt-1">
                  60 tps / $0.0006/s
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
