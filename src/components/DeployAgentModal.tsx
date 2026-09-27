import React, { useState } from 'react';
import { AgentWallet, SupportedChain } from '../types/agent';
import { SUPPORTED_CHAINS } from '../data/mockData';
import { Cpu, Shield, Plus, X } from 'lucide-react';

interface DeployAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (agent: AgentWallet) => void;
  defaultChain: SupportedChain;
}

export const DeployAgentModal: React.FC<DeployAgentModalProps> = ({
  isOpen,
  onClose,
  onDeploy,
  defaultChain,
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [chain, setChain] = useState<SupportedChain>(defaultChain);
  const [model, setModel] = useState('Claude 3.7 Sonnet (Agentic Tooling)');
  const [initialUsdc, setInitialUsdc] = useState(150);
  const [dailyLimit, setDailyLimit] = useState(25);
  const [maxPerTx, setMaxPerTx] = useState(2.5);
  const [allowlistStr, setAllowlistStr] = useState(
    '0x036CbD53842c5426634e7929541eC2318f3dCF7e\n0x7291a27e7f67727142436f5647563dae20d20ef5'
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const hexId = Math.random().toString(16).slice(2, 8);
    const tokenId = Math.floor(1000 + Math.random() * 9000);
    const mockTba = `0x${Math.random().toString(16).slice(2, 10)}7B2Dfc1C53Ac20B042468F635dF7${Math.random().toString(16).slice(2, 6)}`;
    const mockSession = `0x${Math.random().toString(16).slice(2, 10)}9696FdB22080352A55b796d11f77d3c0`;
    const chainConfig = SUPPORTED_CHAINS[chain];

    const allowedContracts = allowlistStr
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const newAgent: AgentWallet = {
      id: `agent-${hexId}`,
      name: name || 'Autonomous Vanguard Scout',
      role: role || 'Decentralized Market & Compute Arbiter',
      chain,
      agentIdTokenId: tokenId,
      agentNftAddress: '0x498aD0b95761e389Ec72E44d0Ff0C872EBeA915C',
      tbaAddress: mockTba,
      sessionKeyAddress: mockSession,
      rootOwnerAddress: '0x71C83647c3E59218d6e355c32fa12D7541e21b72',
      model,
      status: 'active',
      balances: {
        native: 0.25,
        nativeSymbol: chainConfig.nativeCurrency,
        usdc: initialUsdc,
      },
      policy: {
        dailyLimitUsd: dailyLimit,
        maxPerTxUsd: maxPerTx,
        spentTodayUsd: 0,
        requireHumanApprovalAboveUsd: maxPerTx * 2,
        allowedContractAddresses: allowedContracts,
        sessionKeyExpiresAt: '2026-12-31T23:59:59Z',
        allowAutonomousMicropay: true,
      },
      totalTransactionsExecuted: 0,
      createdAt: new Date().toISOString(),
    };

    onDeploy(newAgent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-lg w-full p-6 text-white space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Deploy Autonomous Agent Smart Account</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300">Agent Identifier Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Hyperion Arbitrage Arbiter"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Operational Role / Mission</label>
            <input
              type="text"
              required
              placeholder="e.g. Sub-cent market data acquisition & routing"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">Settlement Network</label>
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value as SupportedChain)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
              >
                {(Object.keys(SUPPORTED_CHAINS) as SupportedChain[]).map((c) => (
                  <option key={c} value={c}>
                    {SUPPORTED_CHAINS[c].name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Model Lineage Hash</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
              >
                <option value="Claude 3.7 Sonnet (Agentic Tooling)">Claude 3.7 Sonnet</option>
                <option value="Gemini 2.0 Flash (Fast Reasoning)">Gemini 2.0 Flash</option>
                <option value="GPT-4o (Autonomous Verification)">GPT-4o</option>
                <option value="DeepSeek V3 671B">DeepSeek V3 671B</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">Fund Vault ($ USDC)</label>
              <input
                type="number"
                value={initialUsdc}
                onChange={(e) => setInitialUsdc(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Daily Cap ($)</label>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Max Per Tx ($)</label>
              <input
                type="number"
                step="0.5"
                value={maxPerTx}
                onChange={(e) => setMaxPerTx(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Allowlisted Contract Addresses (One per line)
            </label>
            <textarea
              rows={2}
              value={allowlistStr}
              onChange={(e) => setAllowlistStr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-slate-900 text-xs font-semibold rounded flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Deploy Self-Custodial Agent</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
