import React from 'react';
import { SupportedChain } from '../types/agent';
import { SUPPORTED_CHAINS } from '../data/mockData';
import { Cpu, Shield, Globe, Terminal, FileText, Award, Plus, ChevronDown, Layers } from 'lucide-react';

interface TopNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  selectedChain: SupportedChain;
  onChainChange: (chain: SupportedChain) => void;
  onDeployClick: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentTab,
  onTabChange,
  selectedChain,
  onChainChange,
  onDeployClick,
}) => {
  const [chainDropdownOpen, setChainDropdownOpen] = React.useState(false);

  const navItems = [
    { id: 'pipeline', label: 'Firewall Pipeline', icon: Layers },
    { id: 'wallets', label: 'Wallets & Policies', icon: Shield },
    { id: 'identity', label: 'Identity & ERC-6551', icon: Cpu },
    { id: 'x402', label: 'x402 Micropayments', icon: Globe },
    { id: 'sdks', label: 'SDKs & Python', icon: Terminal },
    { id: 'whitepaper', label: 'Whitepaper', icon: FileText },
    { id: 'grants', label: 'Grant Proposals', icon: Award },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Wordmark Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
            AR
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            AgentRails
          </span>
          <span className="hidden sm:inline-block text-xs text-slate-400 border-l border-slate-700 pl-3">
            Autonomous Crypto Protocol
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Actions (Chain Selector + Deploy Button) */}
        <div className="flex items-center gap-3">
          {/* Chain Selector */}
          <div className="relative">
            <button
              onClick={() => setChainDropdownOpen(!chainDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 rounded-md text-slate-200 hover:bg-slate-750 transition-colors whitespace-nowrap"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{SUPPORTED_CHAINS[selectedChain].name}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {chainDropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50">
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 border-b border-slate-700">
                  Select Settlement Rail
                </div>
                {(Object.keys(SUPPORTED_CHAINS) as SupportedChain[]).map((chainId) => {
                  const chain = SUPPORTED_CHAINS[chainId];
                  const isSelected = selectedChain === chainId;
                  return (
                    <button
                      key={chainId}
                      onClick={() => {
                        onChainChange(chainId);
                        setChainDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-700/60 transition-colors ${
                        isSelected ? 'text-emerald-400 font-medium' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span>{chain.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {chain.type.toUpperCase()} · {chain.nativeCurrency}
                        </span>
                      </div>
                      {isSelected && <span className="text-xs text-emerald-400">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            onClick={onDeployClick}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-md transition-colors whitespace-nowrap shadow-sm font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Deploy Agent</span>
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer Strip */}
      <div className="lg:hidden flex items-center gap-2 overflow-x-auto px-4 py-2 bg-slate-950 border-t border-slate-800">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                isActive ? 'bg-emerald-500/20 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
