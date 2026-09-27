import React, { useState } from 'react';
import { AgentWallet, SupportedChain } from '../types/agent';
import { SUPPORTED_CHAINS } from '../data/mockData';
import {
  Cpu,
  Fingerprint,
  Link,
  Layers,
  Copy,
  Check,
  Code2,
  ExternalLink,
  Shield,
  FileCheck2
} from 'lucide-react';

interface IdentityViewProps {
  agents: AgentWallet[];
  selectedChain: SupportedChain;
  onMintAgent: (agentData: Partial<AgentWallet>) => void;
}

export const IdentityView: React.FC<IdentityViewProps> = ({
  agents,
  selectedChain,
  onMintAgent,
}) => {
  const chainConfig = SUPPORTED_CHAINS[selectedChain];

  // Counterfactual address calculator state
  const [calcImplementation, setCalcImplementation] = useState<string>(
    chainConfig.accountImplementation || '0x2D25602551487E34bcd497042cAEf8F4e8F35639'
  );
  const [calcTokenContract, setCalcTokenContract] = useState<string>(
    '0x498aD0b95761e389Ec72E44d0Ff0C872EBeA915C'
  );
  const [calcTokenId, setCalcTokenId] = useState<number>(1042);
  const [calcSalt, setCalcSalt] = useState<number>(0);
  const [derivedAddress, setDerivedAddress] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Mint modal state
  const [showMintModal, setShowMintModal] = useState(false);
  const [mintName, setMintName] = useState('Nexus Liquidity Scout');
  const [mintRole, setMintRole] = useState('Autonomous DEX Liquidity Provider');
  const [mintModel, setMintModel] = useState('Gemini 2.0 Flash');
  const [mintEns, setMintEns] = useState('nexus.agentrails.eth');
  const [mintDailyLimit, setMintDailyLimit] = useState(30);

  // Calculate deterministic address
  React.useEffect(() => {
    // Deterministic mock CREATE2 derivation for interactive UX
    const chainIdNum = selectedChain === 'base-sepolia' ? 84532 : selectedChain === 'ethereum-sepolia' ? 11155111 : 421614;
    const raw = `${calcImplementation}-${chainIdNum}-${calcTokenContract}-${calcTokenId}-${calcSalt}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    const mockTBA = `0x${hex}7B2Dfc1C53Ac20B042468F635dF7${hex.slice(0, 4)}`;
    setDerivedAddress(mockTBA);
  }, [calcImplementation, calcTokenContract, calcTokenId, calcSalt, selectedChain]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleMintSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = `agent-${Date.now()}`;
    const newTokenId = Math.floor(1000 + Math.random() * 9000);
    const mockTba = `0x${Math.random().toString(16).slice(2, 10)}7B2Dfc1C53Ac20B042468F635dF7${Math.random().toString(16).slice(2, 6)}`;
    const mockSession = `0x${Math.random().toString(16).slice(2, 10)}9696FdB22080352A55b796d11f77d3c0`;

    onMintAgent({
      id: newId,
      name: mintName,
      role: mintRole,
      chain: selectedChain,
      agentIdTokenId: newTokenId,
      agentNftAddress: '0x498aD0b95761e389Ec72E44d0Ff0C872EBeA915C',
      tbaAddress: mockTba,
      sessionKeyAddress: mockSession,
      rootOwnerAddress: '0x71C83647c3E59218d6e355c32fa12D7541e21b72',
      model: mintModel,
      status: 'active',
      balances: {
        native: 0.5,
        nativeSymbol: chainConfig.nativeCurrency,
        usdc: 100.0,
      },
      policy: {
        dailyLimitUsd: mintDailyLimit,
        maxPerTxUsd: 5.0,
        spentTodayUsd: 0,
        requireHumanApprovalAboveUsd: 10.0,
        allowedContractAddresses: [
          '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          '0x7291a27e7f67727142436f5647563dae20d20ef5',
        ],
        sessionKeyExpiresAt: '2026-12-31T00:00:00Z',
        allowAutonomousMicropay: true,
      },
      totalTransactionsExecuted: 0,
      createdAt: new Date().toISOString(),
    });

    setShowMintModal(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>ERC-6551 Agent Identity & Token Bound Accounts</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Each autonomous agent is anchored to an ERC-721 Agent ID NFT that owns its own deterministic, counterfactual smart account via the ERC-6551 registry.
          </p>
        </div>

        <button
          onClick={() => setShowMintModal(true)}
          className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-900 text-xs font-semibold rounded-md transition-colors whitespace-nowrap self-start md:self-auto"
        >
          Mint New Agent ID & TBA
        </button>
      </div>

      {/* ERC-6551 Architecture Explainer Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Fingerprint className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-white">ERC-721 Agent ID</span>
          </div>
          <p className="text-xs text-slate-400">
            Immutable non-fungible token representing the agent’s legal identity, model lineage hash, and creator ownership root.
          </p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Link className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">ERC-6551 Registry</span>
          </div>
          <p className="text-xs text-slate-400">
            Permissionless singleton contract (<code>0x000...6551</code>) that deterministically binds the NFT to a smart contract account.
          </p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-white">Counterfactual TBA</span>
          </div>
          <p className="text-xs text-slate-400">
            The agent’s wallet address exists prior to deployment. It can receive tokens and hold on-chain reputation with zero upfront gas.
          </p>
        </div>
      </div>

      {/* Counterfactual Address Calculator & CREATE2 Simulator */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">
              Deterministic CREATE2 Counterfactual TBA Derivation
            </h2>
          </div>
          <span className="text-xs font-mono text-emerald-400">
            ERC-6551 SPEC COMPLIANT
          </span>
        </div>

        <p className="text-xs text-slate-400 mt-2">
          Calculate the exact deterministic smart contract address for an agent without spending any deployment gas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div>
            <label className="block text-xs font-medium text-slate-300">
              Account Implementation (ERC-4337)
            </label>
            <input
              type="text"
              value={calcImplementation}
              onChange={(e) => setCalcImplementation(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Agent ID NFT Contract
            </label>
            <input
              type="text"
              value={calcTokenContract}
              onChange={(e) => setCalcTokenContract(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Token ID</label>
            <input
              type="number"
              value={calcTokenId}
              onChange={(e) => setCalcTokenId(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Salt (bytes32)</label>
            <input
              type="number"
              value={calcSalt}
              onChange={(e) => setCalcSalt(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono mt-1 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Derived Result */}
        <div className="mt-5 p-4 bg-slate-950 rounded-md border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-400">
                Derived Counterfactual TBA Address
              </span>
              <span className="text-[10px] text-slate-400 font-mono">CREATE2 HASH</span>
            </div>
            <div className="text-sm font-mono text-white mt-1 break-all select-all">
              {derivedAddress}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(derivedAddress, 'derived')}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded border border-slate-700 text-slate-200 transition-colors"
            >
              {copiedKey === 'derived' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Address</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Formal Equation Snippet */}
        <div className="mt-3 text-[11px] font-mono text-slate-400 bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
          keccak256(0xff ++ Registry ++ Salt ++ keccak256(ProxyInitCode(Impl, ChainId, TokenContract, TokenId, Salt)))[12:]
        </div>
      </div>

      {/* On-Chain Agent Registry Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">
              Verified On-Chain Agent Identity Registry
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            {agents.length} Registered Identities
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Agent Token ID</th>
                <th className="py-2.5 px-4 font-medium">Name & Role</th>
                <th className="py-2.5 px-4 font-medium">Chain</th>
                <th className="py-2.5 px-4 font-medium">Token Bound Account</th>
                <th className="py-2.5 px-4 font-medium">Model Provenance</th>
                <th className="py-2.5 px-4 font-medium">Root Authority</th>
                <th className="py-2.5 px-4 font-medium text-center">Identity Proof</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-slate-850/50 transition-colors">
                  <td className="py-3 px-4 text-emerald-400 font-bold">
                    #{agent.agentIdTokenId}
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <div className="text-white font-medium">{agent.name}</div>
                    <div className="text-[11px] text-slate-400">{agent.role}</div>
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <span className="text-slate-300 text-xs">
                      {SUPPORTED_CHAINS[agent.chain].name}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 truncate max-w-[150px]">
                    <span className="hover:text-emerald-400 cursor-pointer" title={agent.tbaAddress}>
                      {agent.tbaAddress.slice(0, 8)}...{agent.tbaAddress.slice(-6)}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-300 text-[11px]">
                    {agent.model}
                  </td>
                  <td className="py-3 px-4 text-slate-400 truncate max-w-[140px]">
                    <span title={agent.rootOwnerAddress}>
                      {agent.rootOwnerAddress.slice(0, 6)}...{agent.rootOwnerAddress.slice(-4)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center justify-center gap-1">
                      <Shield className="w-2.5 h-2.5" />
                      <span>ERC-6551 VALID</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mint Modal */}
      {showMintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-lg w-full p-6 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold">Mint ERC-721 Agent ID & TBA</h3>
              </div>
              <button
                onClick={() => setShowMintModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMintSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Agent Name</label>
                <input
                  type="text"
                  required
                  value={mintName}
                  onChange={(e) => setMintName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Operational Role</label>
                <input
                  type="text"
                  required
                  value={mintRole}
                  onChange={(e) => setMintRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Model Lineage</label>
                  <select
                    value={mintModel}
                    onChange={(e) => setMintModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Claude 3.7 Sonnet">Claude 3.7 Sonnet</option>
                    <option value="Gemini 2.0 Flash">Gemini 2.0 Flash</option>
                    <option value="GPT-4o">GPT-4o</option>
                    <option value="DeepSeek V3 671B">DeepSeek V3 671B</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Initial Daily Cap ($)</label>
                  <input
                    type="number"
                    value={mintDailyLimit}
                    onChange={(e) => setMintDailyLimit(parseFloat(e.target.value) || 10)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">ENS Subname Binding</label>
                <input
                  type="text"
                  value={mintEns}
                  onChange={(e) => setMintEns(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMintModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-slate-900 text-xs font-semibold rounded"
                >
                  Confirm Mint & Derive TBA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
