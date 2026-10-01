/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SupportedChain, AgentWallet, TransactionRecord, X402Endpoint } from './types/agent';
import { INITIAL_AGENTS, INITIAL_TRANSACTIONS } from './data/mockData';
import { TopNav } from './components/TopNav';
import { WalletsView } from './components/WalletsView';
import { IdentityView } from './components/IdentityView';
import { MicropayView } from './components/MicropayView';
import { SdkView } from './components/SdkView';
import { WhitepaperView } from './components/WhitepaperView';
import { GrantsView } from './components/GrantsView';
import { PipelineView } from './components/PipelineView';
import { DeployAgentModal } from './components/DeployAgentModal';
import { validateSpendClientSide, buildOnChainTransactionRecord } from './services/policyEngine';
import { loadAgents, persistAgents, loadTransactions, persistTransaction } from './services/firebase';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('pipeline');
  const [selectedChain, setSelectedChain] = useState<SupportedChain>('base-sepolia');
  const [agents, setAgents] = useState<AgentWallet[]>(INITIAL_AGENTS);
  const [transactions, setTransactions] = useState<TransactionRecord[]>(INITIAL_TRANSACTIONS);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load persisted state from Firebase / Local Cache on mount
  useEffect(() => {
    async function initData() {
      try {
        const loadedAgents = await loadAgents(INITIAL_AGENTS);
        const loadedTxs = await loadTransactions(INITIAL_TRANSACTIONS);
        setAgents(loadedAgents);
        setTransactions(loadedTxs);
      } catch (e) {
        console.warn('Initialization error, using initial presets:', e);
      } finally {
        setIsInitialized(true);
      }
    }
    initData();
  }, []);

  // Sync agents to Firestore whenever agents list changes
  useEffect(() => {
    if (isInitialized) {
      persistAgents(agents);
    }
  }, [agents, isInitialized]);

  // Execute transaction handler with dynamic smart contract policy firewall
  const handleExecuteTransaction = (
    agentId: string,
    recipient: string,
    recipientName: string,
    amountUsd: number,
    type: 'x402_micropay' | 'contract_call' | 'token_transfer'
  ) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      return { success: false, reason: 'Agent account not found.' };
    }

    // 1. Evaluate with Dynamic Policy Engine Invariants
    const validationResult = validateSpendClientSide({
      agent,
      recipientAddress: recipient,
      recipientName,
      amountUsd,
      type,
    });

    // 2. Build full on-chain transaction record with cryptographic proof
    const newTxRecord = buildOnChainTransactionRecord(
      {
        agent,
        recipientAddress: recipient,
        recipientName,
        amountUsd,
        type,
      },
      validationResult
    );

    // 3. Append to transaction ledger & persist
    const updatedTxs = [newTxRecord, ...transactions];
    setTransactions(updatedTxs);
    persistTransaction(newTxRecord, updatedTxs);

    if (!validationResult.valid) {
      const primaryReason = validationResult.violations[0] || 'Blocked by Policy Firewall';
      return {
        success: false,
        reason: primaryReason,
      };
    }

    // 4. Update agent vault balance and burn telemetry
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id === agent.id) {
          return {
            ...a,
            balances: {
              ...a.balances,
              usdc: Math.max(0, a.balances.usdc - amountUsd),
            },
            policy: {
              ...a.policy,
              spentTodayUsd: +(a.policy.spentTodayUsd + amountUsd).toFixed(4),
            },
            totalTransactionsExecuted: a.totalTransactionsExecuted + 1,
          };
        }
        return a;
      })
    );

    return { success: true, txHash: newTxRecord.txHash };
  };

  // Policy update handler
  const handleUpdatePolicy = (agentId: string, dailyLimit: number, maxPerTx: number) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id === agentId) {
          return {
            ...a,
            policy: {
              ...a.policy,
              dailyLimitUsd: dailyLimit,
              maxPerTxUsd: maxPerTx,
            },
          };
        }
        return a;
      })
    );
  };

  // Toggle agent circuit breaker status
  const handleToggleStatus = (agentId: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id === agentId) {
          return {
            ...a,
            status: a.status === 'active' ? 'paused' : 'active',
          };
        }
        return a;
      })
    );
  };

  // Rotate session key
  const handleRotateSessionKey = (agentId: string) => {
    const newSession = `0x${Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;

    setAgents((prev) =>
      prev.map((a) => {
        if (a.id === agentId) {
          return {
            ...a,
            sessionKeyAddress: newSession,
          };
        }
        return a;
      })
    );
  };

  // Execute x402 payment using Server-Side Enclave route where available
  const handleExecuteMicropayment = (agentId: string, endpoint: X402Endpoint) => {
    const res = handleExecuteTransaction(
      agentId,
      endpoint.recipientTba,
      `${endpoint.name} (x402)`,
      endpoint.priceUsd,
      'x402_micropay'
    );

    if (res.success) {
      return { success: true, data: endpoint.sampleResponse };
    }
    return { success: false, error: res.reason };
  };

  // Deploy new agent
  const handleDeployAgent = (newAgent: AgentWallet) => {
    setAgents((prev) => [newAgent, ...prev]);
    setSelectedChain(newAgent.chain);
    setCurrentTab('wallets');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* 3-Zone Top Navigation Contract */}
      <TopNav
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        selectedChain={selectedChain}
        onChainChange={setSelectedChain}
        onDeployClick={() => setIsDeployModalOpen(true)}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'pipeline' && (
          <PipelineView
            agents={agents}
            selectedChain={selectedChain}
            onChainChange={setSelectedChain}
            onAgentSpendConfirmed={(agentId, amountUsd) => {
              setAgents((prev) =>
                prev.map((a) => {
                  if (a.id === agentId) {
                    return {
                      ...a,
                      balances: {
                        ...a.balances,
                        usdc: Math.max(0, a.balances.usdc - amountUsd),
                      },
                      policy: {
                        ...a.policy,
                        spentTodayUsd: +(a.policy.spentTodayUsd + amountUsd).toFixed(4),
                      },
                      totalTransactionsExecuted: a.totalTransactionsExecuted + 1,
                    };
                  }
                  return a;
                })
              );
            }}
          />
        )}

        {currentTab === 'wallets' && (
          <WalletsView
            agents={agents}
            transactions={transactions}
            selectedChain={selectedChain}
            onExecuteTransaction={handleExecuteTransaction}
            onUpdatePolicy={handleUpdatePolicy}
            onToggleStatus={handleToggleStatus}
            onRotateSessionKey={handleRotateSessionKey}
          />
        )}

        {currentTab === 'identity' && (
          <IdentityView
            agents={agents}
            selectedChain={selectedChain}
            onMintAgent={(newAgent) => handleDeployAgent(newAgent as AgentWallet)}
          />
        )}

        {currentTab === 'x402' && (
          <MicropayView
            agents={agents}
            selectedChain={selectedChain}
            onExecuteMicropayment={handleExecuteMicropayment}
          />
        )}

        {currentTab === 'sdks' && <SdkView />}

        {currentTab === 'whitepaper' && <WhitepaperView />}

        {currentTab === 'grants' && <GrantsView />}
      </main>

      {/* Deploy Agent Modal */}
      <DeployAgentModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        onDeploy={handleDeployAgent}
        defaultChain={selectedChain}
      />

      {/* Clean, Quiet Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">AgentRails Protocol</span>
            <span>·</span>
            <span>Open Source Standard for Autonomous Agent Self-Custody & Machine Micropayments</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span>ERC-6551</span>
            <span>ERC-4337</span>
            <span>x402 RFC</span>
            <span>Apache-2.0 / MIT</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
