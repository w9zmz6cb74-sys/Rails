import React, { useState } from 'react';
import { TransactionRecord } from '../types/agent';
import { SUPPORTED_CHAINS } from '../data/mockData';
import {
  X,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ExternalLink,
  Shield,
  FileCode,
  Layers,
  Cpu,
  Hash,
  Clock,
  Zap,
  ArrowUpRight
} from 'lucide-react';

interface TxDetailsModalProps {
  tx: TransactionRecord | null;
  onClose: () => void;
}

export const TxDetailsModal: React.FC<TxDetailsModalProps> = ({ tx, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!tx) return null;

  const chainInfo = SUPPORTED_CHAINS[tx.chain] || SUPPORTED_CHAINS['base-sepolia'];
  const isConfirmed = tx.status === 'confirmed';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 text-white space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isConfirmed
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}
            >
              {isConfirmed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  On-Chain Transaction & Enclave Verification
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                    isConfirmed
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                  }`}
                >
                  {isConfirmed ? 'CONFIRMED ON-CHAIN' : 'BLOCKED BY POLICY'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Settled on <span className="text-slate-200 font-medium">{chainInfo.name}</span> · {tx.agentName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Rejection notice if blocked */}
        {!isConfirmed && (
          <div className="p-3.5 bg-red-950/40 border border-red-500/30 rounded-lg text-xs space-y-1">
            <span className="font-semibold text-red-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Policy Firewall Revert Reason
            </span>
            <p className="text-red-200 font-mono text-[11px] pl-5 leading-relaxed">
              {tx.policyCheckReason || 'Exceeded per-transaction threshold or target address not allowlisted.'}
            </p>
          </div>
        )}

        {/* Transaction Identity Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
            <span className="text-[11px] text-slate-400">Transaction Hash</span>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-white truncate text-[11px]">{tx.txHash}</span>
              <button
                onClick={() => copyToClipboard(tx.txHash, 'txHash')}
                className="text-slate-400 hover:text-white p-1"
                title="Copy Hash"
              >
                {copiedKey === 'txHash' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
            <span className="text-[11px] text-slate-400">ERC-4337 UserOperation Hash</span>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-white truncate text-[11px]">
                {tx.userOpHash || `0x7f2a...${tx.id.slice(-8)}`}
              </span>
              <button
                onClick={() => copyToClipboard(tx.userOpHash || tx.id, 'userOp')}
                className="text-slate-400 hover:text-white p-1"
              >
                {copiedKey === 'userOp' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Account & Recipient Topology */}
        <div className="space-y-2 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Sender Token Bound Account (TBA)</span>
              <span className="font-mono text-emerald-400 font-semibold">{tx.senderTba || '0x95c884E07B2Dfc1C53Ac20B042468F635dF78d91'}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Session Delegated Signer (Hot)</span>
              <span className="font-mono text-slate-300">{tx.sessionKeyUsed}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Recipient / Service Target</span>
              <span className="font-mono text-white">{tx.recipientAddress}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Settlement Amount</span>
              <span className="font-mono text-emerald-400 font-bold text-sm">
                ${tx.amountUsd.toFixed(4)} {tx.asset}
              </span>
            </div>
          </div>
        </div>

        {/* Network & Gas Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
            <span className="text-[10px] text-slate-400 block">Block Height</span>
            <span className="font-mono font-semibold text-white mt-0.5 block">
              {tx.blockNumber || '18,492,841'}
            </span>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
            <span className="text-[10px] text-slate-400 block">Gas Consumed</span>
            <span className="font-mono font-semibold text-white mt-0.5 block">
              {(tx.gasUsed || 46210).toLocaleString()} units
            </span>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
            <span className="text-[10px] text-slate-400 block">Base Fee</span>
            <span className="font-mono font-semibold text-emerald-400 mt-0.5 block">
              {tx.gasPriceGwei || 0.085} Gwei
            </span>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
            <span className="text-[10px] text-slate-400 block">Execution Latency</span>
            <span className="font-mono font-semibold text-blue-400 mt-0.5 block">
              118 ms
            </span>
          </div>
        </div>

        {/* Cryptographic Attestation Proof */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              Cryptographic Policy Attestation Proof
            </span>
            <span className="text-[10px] font-mono text-purple-400">ERC-7579 VALIDATED</span>
          </div>

          <div className="space-y-1 font-mono text-[11px] text-slate-400">
            <div>
              <span className="text-slate-500">Validator Contract: </span>
              <span className="text-slate-300">{tx.attestationProof?.validatorAddress || '0x000000006551c194871ba60f6400ac5642d96551'}</span>
            </div>
            <div>
              <span className="text-slate-500">Proof Scheme: </span>
              <span className="text-slate-300">{tx.attestationProof?.circuitProofType || 'ERC-7579 Policy Invariant Proof (Groth16)'}</span>
            </div>
            <div className="truncate">
              <span className="text-slate-500">Merkle State Root: </span>
              <span className="text-slate-300">{tx.attestationProof?.merkleRoot || '0x8f3c7e91a2b4d5e8f0c3a2b1d7e9f2a4c8e1b3d5a7f9c2e4b6d8a0c2e4f6a8b0'}</span>
            </div>
          </div>
        </div>

        {/* Decoded Transaction Payload JSON */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-emerald-400" />
              Decoded Smart Contract Payload Data
            </span>
            <span className="text-[10px] font-mono text-slate-400">CALLDATA DECODED</span>
          </div>
          <pre className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300 overflow-x-auto">
            {JSON.stringify(
              tx.payloadData || {
                target: tx.recipientAddress,
                amountUsd: tx.amountUsd,
                type: tx.type,
                sessionSigner: tx.sessionKeyUsed,
                timestamp: tx.timestamp,
                status: tx.status,
              },
              null,
              2
            )}
          </pre>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <a
            href={`${chainInfo.explorerUrl}/tx/${tx.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>View on Block Explorer</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded transition-colors"
          >
            Close Explorer
          </button>
        </div>
      </div>
    </div>
  );
};
