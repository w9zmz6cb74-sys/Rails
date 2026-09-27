import React, { useState } from 'react';
import { SdkSnippet } from '../types/agent';
import { SDK_SNIPPETS } from '../data/mockData';
import {
  Terminal,
  Play,
  Copy,
  Check,
  Code,
  Download,
  BookOpen,
  Sparkles,
  Layers,
  CheckCircle2
} from 'lucide-react';

export const SdkView: React.FC = () => {
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>(SDK_SNIPPETS[0].id);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'sandbox'>('code');

  // Interactive Sandbox state
  const [sandboxParamAgentId, setSandboxParamAgentId] = useState('1042');
  const [sandboxParamDailyCap, setSandboxParamDailyCap] = useState('25.00');
  const [sandboxParamTxAmount, setSandboxParamTxAmount] = useState('1.50');
  const [sandboxRecipient, setSandboxRecipient] = useState('0x7291a27e7f67727142436f5647563dae20d20ef5');
  const [sandboxIsRunning, setSandboxIsRunning] = useState(false);
  const [sandboxOutput, setSandboxOutput] = useState<string[]>([
    'AgentRails Python SDK REPL (v1.2.0)',
    'Ready. Select parameters and click "Run Python Prototype".',
  ]);

  const activeSnippet = SDK_SNIPPETS.find((s) => s.id === selectedSnippetId) || SDK_SNIPPETS[0];

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeSnippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunSandbox = async () => {
    setSandboxIsRunning(true);
    setSandboxOutput([
      '>>> import agentrails',
      '>>> from agentrails import AgentWallet, SpendPolicy',
      `>>> policy = SpendPolicy(daily_limit_usd=${sandboxParamDailyCap}, max_per_tx_usd=5.00)`,
      `>>> wallet = AgentWallet(agent_id_token=${sandboxParamAgentId}, policy=policy)`,
    ]);

    await new Promise((r) => setTimeout(r, 400));
    setSandboxOutput((prev) => [
      ...prev,
      `[TBA Derivation] Computed ERC-6551 counterfactual address: 0x95c884E07B2Dfc1C53Ac20B042468F635dF78d91`,
      `[Enclave] Ephemeral session key generated: 0x3Fe1574F9696FdB22080352A55b796d11f77d3c0`,
      `>>> wallet.execute_spend(recipient="${sandboxRecipient}", amount_usd=${sandboxParamTxAmount})`,
    ]);

    await new Promise((r) => setTimeout(r, 600));
    const txAmountNum = parseFloat(sandboxParamTxAmount);
    const dailyCapNum = parseFloat(sandboxParamDailyCap);

    if (txAmountNum > 5.0) {
      setSandboxOutput((prev) => [
        ...prev,
        `Traceback (most recent call last):`,
        `PermissionError: Tx rejected: $${txAmountNum} exceeds per-transaction limit of $5.00 (Firewall Enforced)`,
      ]);
    } else if (txAmountNum > dailyCapNum) {
      setSandboxOutput((prev) => [
        ...prev,
        `Traceback (most recent call last):`,
        `PermissionError: Daily limit exceeded: Requested $${txAmountNum} of remaining $${dailyCapNum}`,
      ]);
    } else {
      setSandboxOutput((prev) => [
        ...prev,
        `[Firewall] Policy check PASSED (Daily burn: $${txAmountNum} / $${dailyCapNum})`,
        `[EIP-712] Signed UserOperation with session key 0x3Fe...3c0`,
        `[Success] { "status": "APPROVED", "tba": "0x95c884E07B2Dfc1C53Ac20B042468F635dF78d91", "amount_usd": ${txAmountNum}, "remaining_budget": ${(dailyCapNum - txAmountNum).toFixed(2)} }`,
      ]);
    }

    setSandboxIsRunning(false);
  };

  const handleDownloadFile = () => {
    const ext = activeSnippet.language === 'python' ? 'py' : 'ts';
    const filename = `${activeSnippet.id}.${ext}`;
    const blob = new Blob([activeSnippet.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Open-Source SDKs & Python Prototypes</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Production-grade Python and TypeScript libraries for autonomous AI agents. Compatible with Coinbase AgentKit, LangChain, CrewAI, AutoGen, Web3.py, and Solana.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs bg-slate-900 border border-slate-800 rounded px-3 py-1 font-mono text-emerald-400">
            pip install agentrails
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('code')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            activeTab === 'code'
              ? 'bg-slate-800 text-white border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>SDK Source & Adapters</span>
        </button>

        <button
          onClick={() => setActiveTab('sandbox')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            activeTab === 'sandbox'
              ? 'bg-slate-800 text-emerald-400 border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>Interactive Python REPL & Sandbox</span>
        </button>
      </div>

      {activeTab === 'code' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Navigation: Snippet Categories */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 block px-1">
              Libraries & Toolkits
            </span>

            {SDK_SNIPPETS.map((snippet) => {
              const isSelected = snippet.id === selectedSnippetId;
              return (
                <button
                  key={snippet.id}
                  onClick={() => setSelectedSnippetId(snippet.id)}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${
                    isSelected
                      ? 'bg-slate-800 border-emerald-500/50 text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold truncate">{snippet.title.split(':')[0]}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        snippet.language === 'python'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {snippet.language}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                    {snippet.description}
                  </p>
                </button>
              );
            })}

            {/* Quick Install Guide */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-2 mt-4">
              <span className="font-semibold text-white block">Installation</span>
              <pre className="font-mono text-[11px] text-emerald-400 bg-slate-900 p-2 rounded overflow-x-auto">
                pip install agentrails web3 eth-account cdp-agentkit-core
              </pre>
            </div>
          </div>

          {/* Right: Code Viewer */}
          <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div>
                <span className="text-xs font-semibold text-white">{activeSnippet.title}</span>
                <p className="text-[11px] text-slate-400 mt-0.5">{activeSnippet.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadFile}
                  className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-700 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>

                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-950 font-mono text-xs text-slate-200 overflow-x-auto flex-1 leading-relaxed">
              <pre>{activeSnippet.code}</pre>
            </div>
          </div>
        </div>
      ) : (
        /* Sandbox / REPL Runner */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <span className="text-xs font-semibold text-white block">
                Sandbox Environment Configuration
              </span>
              <p className="text-[11px] text-slate-400 mt-1">
                Configure runtime agent parameters and trigger simulated Python executions.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Agent ID Token Index</label>
              <input
                type="text"
                value={sandboxParamAgentId}
                onChange={(e) => setSandboxParamAgentId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Daily Spend Cap ($ USD)</label>
              <input
                type="number"
                value={sandboxParamDailyCap}
                onChange={(e) => setSandboxParamDailyCap(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Transaction Value ($ USD)</label>
              <input
                type="number"
                step="0.25"
                value={sandboxParamTxAmount}
                onChange={(e) => setSandboxParamTxAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Target Recipient Address</label>
              <input
                type="text"
                value={sandboxRecipient}
                onChange={(e) => setSandboxRecipient(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              disabled={sandboxIsRunning}
              onClick={handleRunSandbox}
              className={`w-full py-2.5 text-xs font-semibold rounded flex items-center justify-center gap-2 transition-colors ${
                sandboxIsRunning
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-400 hover:bg-emerald-300 text-slate-900'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>{sandboxIsRunning ? 'Running Python Execution...' : 'Run Python Prototype'}</span>
            </button>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">Python Execution Terminal</span>
              </div>
              <button
                onClick={() => setSandboxOutput(['Terminal cleared.'])}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 bg-slate-950 border border-slate-800 rounded p-4 font-mono text-xs text-slate-200 overflow-y-auto space-y-1 min-h-[300px]">
              {sandboxOutput.map((line, idx) => (
                <div key={idx} className="leading-relaxed">
                  {line.startsWith('>>>') ? (
                    <span className="text-emerald-400 font-semibold">{line}</span>
                  ) : line.includes('PermissionError') ? (
                    <span className="text-red-400 font-bold">{line}</span>
                  ) : line.includes('[Success]') ? (
                    <span className="text-emerald-300">{line}</span>
                  ) : line.includes('[TBA Derivation]') ? (
                    <span className="text-blue-400">{line}</span>
                  ) : (
                    line
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
