import React, { useState } from 'react';
import { GrantProposal } from '../types/agent';
import { GRANT_PROPOSALS } from '../data/mockData';
import {
  Award,
  CheckCircle2,
  Copy,
  Check,
  Download,
  Calendar,
  DollarSign,
  Layers,
  ExternalLink,
  ShieldCheck,
  Send,
  Sparkles
} from 'lucide-react';

export const GrantsView: React.FC = () => {
  const [selectedGrantId, setSelectedGrantId] = useState<string>(GRANT_PROPOSALS[0].id);
  const [copied, setCopied] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<Record<string, boolean>>({});

  const activeGrant = GRANT_PROPOSALS.find((g) => g.id === selectedGrantId) || GRANT_PROPOSALS[0];

  const handleCopyProposal = () => {
    const text = `================================================================================
GRANT APPLICATION: ${activeGrant.programName.toUpperCase()}
Funder: ${activeGrant.funderName}
Project: ${activeGrant.projectTitle}
Requested Amount: ${activeGrant.requestedAmount} ${activeGrant.currency}
Grant Category: ${activeGrant.grantType}
================================================================================

1. SHORT SUMMARY:
${activeGrant.shortSummary}

2. PROBLEM STATEMENT:
${activeGrant.problemStatement}

3. PROPOSED SOLUTION & ARCHITECTURE:
${activeGrant.proposedSolution}

4. OPEN SOURCE REPOSITORIES:
${activeGrant.openSourceRepositories.map((r) => `- ${r}`).join('\n')}

5. MILESTONES & DELIVERABLES:
${activeGrant.milestones
  .map(
    (m) =>
      `Milestone ${m.number}: ${m.title} (${m.durationWeeks} weeks) - ${m.payoutAmount}\nDeliverables:\n${m.deliverables
        .map((d) => `  * ${d}`)
        .join('\n')}`
  )
  .join('\n\n')}

6. BUDGET ALLOCATION:
${activeGrant.budgetBreakdown
  .map((b) => `- ${b.category}: ${b.amount} (${b.percentage}%) - ${b.justification}`)
  .join('\n')}
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadDossier = () => {
    const text = `# Web3 Grant Application Dossier: ${activeGrant.funderName}
## Program: ${activeGrant.programName}
**Requested Funding:** ${activeGrant.requestedAmount} ${activeGrant.currency}  
**Category:** ${activeGrant.grantType}  
**Date:** September 2026

---

### Project Title
${activeGrant.projectTitle}

### Executive Summary
${activeGrant.shortSummary}

### Problem Statement
${activeGrant.problemStatement}

### Proposed Solution
${activeGrant.proposedSolution}

### Open-Source Repositories & Licensing
${activeGrant.openSourceRepositories.map((r) => `- ${r}`).join('\n')}

### Milestones & Deliverables Roadmap
| Milestone | Duration | Payout | Deliverables |
| :--- | :--- | :--- | :--- |
${activeGrant.milestones
  .map(
    (m) =>
      `| **M${m.number}: ${m.title}** | ${m.durationWeeks} wks | ${m.payoutAmount} | ${m.deliverables.join('; ')} |`
  )
  .join('\n')}

### Budget Allocation
${activeGrant.budgetBreakdown
  .map((b) => `- **${b.category}** (${b.percentage}% / ${b.amount}): ${b.justification}`)
  .join('\n')}
`;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeGrant.id}_dossier.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitSimulation = () => {
    setSubmittedStatus((prev) => ({ ...prev, [activeGrant.id]: true }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Web3 Grant Applications & Proposal Studio</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Custom-tailored grant proposals prepared for the Ethereum Foundation ESP, Solana Foundation, and Gitcoin Grants. Fully structured with verifiable milestones, deliverables, and budget allocations.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopyProposal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied for Portal</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy for Grant Portal</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownloadDossier}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Download Dossier (.MD)</span>
          </button>
        </div>
      </div>

      {/* Grant Program Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {GRANT_PROPOSALS.map((grant) => {
          const isSelected = grant.id === selectedGrantId;
          const isSubmitted = submittedStatus[grant.id];
          return (
            <div
              key={grant.id}
              onClick={() => setSelectedGrantId(grant.id)}
              className={`p-4 rounded-lg cursor-pointer border text-left transition-all ${
                isSelected
                  ? 'bg-slate-800 border-emerald-500/60 shadow-lg shadow-emerald-500/5'
                  : 'bg-slate-900/60 border-slate-800 hover:bg-slate-850 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">
                    {grant.funderName}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    {grant.programName}
                  </span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
                  {grant.grantType}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">Requested Amount</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {grant.requestedAmount} {grant.currency}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Readiness</span>
                  <span className="text-xs font-mono font-semibold text-white">
                    {grant.readinessScore}% Match
                  </span>
                </div>
              </div>

              {isSubmitted && (
                <div className="mt-2 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Packet Verified & Prepared
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Proposal Full Details */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
        {/* Banner with Title & Quick Info */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                {activeGrant.funderName.toUpperCase()} · {activeGrant.grantType.toUpperCase()}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white mt-1">{activeGrant.projectTitle}</h2>
            <p className="text-xs text-slate-300 mt-2 max-w-3xl leading-relaxed">
              {activeGrant.shortSummary}
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-right shrink-0">
            <span className="text-[11px] text-slate-400 block">Grant Request Budget</span>
            <div className="text-xl font-mono font-bold text-emerald-400">
              {activeGrant.requestedAmount} {activeGrant.currency}
            </div>
            <button
              onClick={handleSubmitSimulation}
              className={`mt-2 px-3 py-1 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                submittedStatus[activeGrant.id]
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-emerald-400 hover:bg-emerald-300 text-slate-900 font-semibold'
              }`}
            >
              {submittedStatus[activeGrant.id] ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Dossier Finalized</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Finalize & Validate Dossier</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Problem vs Solution Split */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <span className="text-xs font-semibold text-red-400 block">
              Problem Statement & Ecosystem Gap
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              {activeGrant.problemStatement}
            </p>
          </div>

          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <span className="text-xs font-semibold text-emerald-400 block">
              Proposed Solution & Innovation
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              {activeGrant.proposedSolution}
            </p>
          </div>
        </div>

        {/* Open-Source Repositories */}
        <div>
          <span className="text-xs font-semibold text-white block mb-2">
            Open-Source Repositories & Deliverable Artifacts
          </span>
          <div className="space-y-1.5">
            {activeGrant.openSourceRepositories.map((repo, idx) => (
              <div
                key={idx}
                className="text-xs font-mono bg-slate-950 border border-slate-800 px-3 py-2 rounded flex items-center justify-between text-slate-300"
              >
                <span>{repo}</span>
                <span className="text-[10px] text-emerald-400 font-sans">OPEN SOURCE</span>
              </div>
            ))}
          </div>
        </div>

        {/* Milestones Table */}
        <div>
          <span className="text-xs font-semibold text-white block mb-3">
            Milestone Roadmap & Tranche Payouts
          </span>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Milestone</th>
                  <th className="py-2.5 px-4 font-medium">Duration</th>
                  <th className="py-2.5 px-4 font-medium">Key Technical Deliverables</th>
                  <th className="py-2.5 px-4 font-medium text-right">Tranche Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {activeGrant.milestones.map((m) => (
                  <tr key={m.number} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-3 px-4 font-medium text-white whitespace-nowrap">
                      M{m.number}: {m.title}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {m.durationWeeks} weeks
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <ul className="list-disc list-inside space-y-1 text-[11px]">
                        {m.deliverables.map((del, dIdx) => (
                          <li key={dIdx}>{del}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                      {m.payoutAmount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Budget Allocation Breakdown */}
        <div>
          <span className="text-xs font-semibold text-white block mb-3">
            Detailed Budget Justification
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeGrant.budgetBreakdown.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{item.category}</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {item.amount} ({item.percentage}%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">{item.justification}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
