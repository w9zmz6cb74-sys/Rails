import React, { useState } from 'react';
import { WhitepaperSection } from '../types/agent';
import { WHITEPAPER_SECTIONS } from '../data/mockData';
import {
  FileText,
  Download,
  Copy,
  Check,
  BookOpen,
  Printer,
  ChevronRight,
  Shield,
  Layers,
  ArrowRight
} from 'lucide-react';

export const WhitepaperView: React.FC = () => {
  const [activeSectionId, setActiveSectionId] = useState<string>(WHITEPAPER_SECTIONS[0].id);
  const [copied, setCopied] = useState(false);

  const activeSection = WHITEPAPER_SECTIONS.find((s) => s.id === activeSectionId) || WHITEPAPER_SECTIONS[0];

  const handleCopyMarkdown = () => {
    const fullText = WHITEPAPER_SECTIONS.map(
      (s) => `## ${s.number}. ${s.title}\n\n${s.content}\n`
    ).join('\n---\n\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const fullText = `# AgentRails Protocol Specification & Technical Whitepaper
Version 1.2 · Autonomous Agent Self-Custody & Micropayment Standard
Date: September 2026

${WHITEPAPER_SECTIONS.map((s) => `## Section ${s.number}: ${s.title}\n\n${s.content}\n`).join('\n---\n\n')}
`;
    const blob = new Blob([fullText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AgentRails_Technical_Whitepaper.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadLatex = () => {
    const latexText = `\\documentclass[11pt,journal,compsoc]{IEEEtran}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{url}
\\usepackage{listings}

\\title{AgentRails: Cryptographic Identity, Token-Bound Accounts, and Stateless Micropayment Protocols for Autonomous AI Agents}
\\author{AgentRails Working Group}
\\date{September 2026}

\\begin{document}
\\maketitle

\\begin{abstract}
Autonomous software agents require self-custodial financial infrastructure to participate in open computational markets. We present AgentRails, a cryptographic protocol standard leveraging ERC-6551 Token Bound Accounts, dual-key session enclaves, and x402 HTTP micropayment rails to provide provable spend invariance and prompt-injection defense.
\\end{abstract}

${WHITEPAPER_SECTIONS.map((s) => `\\section{${s.title}}\n${s.content.replace(/\$/g, '$')}\n`).join('\n')}

\\end{document}`;
    const blob = new Blob([latexText], { type: 'text/x-tex' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AgentRails_Whitepaper_IEEE.tex';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header & Export Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Technical Whitepaper & Protocol Specification</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Formal architectural blueprint, cryptographic invariants, CREATE2 address derivation proofs, and mathematical threat models for autonomous agent financial self-custody.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownloadMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Download .MD</span>
          </button>

          <button
            onClick={handleDownloadLatex}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export LaTeX (.tex)</span>
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Table of Contents */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 block px-1">
            Table of Contents
          </span>

          {WHITEPAPER_SECTIONS.map((section) => {
            const isSelected = section.id === activeSectionId;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSectionId(section.id)}
                className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                  isSelected
                    ? 'bg-slate-800 border-emerald-500/50 text-white'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                }`}
              >
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 block">
                    CHAPTER {section.number}
                  </span>
                  <span className="font-semibold text-xs mt-0.5">{section.title}</span>
                </div>
                {isSelected && <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />}
              </button>
            );
          })}

          {/* Document Metadata Card */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-2 mt-4">
            <span className="font-semibold text-white block">Document Spec</span>
            <div className="text-[11px] text-slate-400 space-y-1">
              <div>Status: Final Draft (v1.2)</div>
              <div>Standard: ERC-6551 / ERC-4337 / x402</div>
              <div>License: CC-BY-4.0 & MIT</div>
            </div>
          </div>
        </div>

        {/* Content Reader */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <span className="text-xs font-mono text-emerald-400 font-semibold">
              SECTION {activeSection.number}
            </span>
            <h2 className="text-lg font-bold text-white mt-1">{activeSection.title}</h2>
          </div>

          <div className="prose prose-invert max-w-none text-slate-300 text-xs sm:text-sm leading-relaxed space-y-4">
            {activeSection.content.split('\n\n').map((paragraph, idx) => {
              if (paragraph.startsWith('$$')) {
                // LaTeX / Math block
                return (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-xs text-emerald-300 overflow-x-auto text-center my-3"
                  >
                    {paragraph.replace(/\$\$/g, '')}
                  </div>
                );
              }
              if (paragraph.startsWith('1.') || paragraph.startsWith('- ')) {
                // List
                return (
                  <div key={idx} className="pl-4 border-l-2 border-slate-700 py-1 space-y-1 text-slate-300">
                    {paragraph.split('\n').map((line, lIdx) => (
                      <div key={lIdx} className="leading-normal">{line}</div>
                    ))}
                  </div>
                );
              }
              return <p key={idx}>{paragraph}</p>;
            })}
          </div>

          {/* Interactive Chapter Switcher */}
          <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-mono">
              AgentRails Protocol Specification · 2026
            </span>

            <div className="flex items-center gap-2">
              {WHITEPAPER_SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => setActiveSectionId(sec.id)}
                  className={`w-6 h-6 rounded text-[11px] font-mono flex items-center justify-center transition-colors ${
                    sec.id === activeSectionId
                      ? 'bg-emerald-400 text-slate-900 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {sec.number}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
