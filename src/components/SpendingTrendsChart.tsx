import React, { useState, useMemo } from 'react';
import { AgentWallet, TransactionRecord } from '../types/agent';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Users, Activity, BarChart3, Shield } from 'lucide-react';

interface SpendingTrendsChartProps {
  activeAgent: AgentWallet;
  allAgents?: AgentWallet[];
  transactions: TransactionRecord[];
}

export const SpendingTrendsChart: React.FC<SpendingTrendsChartProps> = ({
  activeAgent,
  allAgents = [],
  transactions,
}) => {
  const [chartViewMode, setChartViewMode] = useState<'single' | 'fleet'>('single');
  const [timeframe, setTimeframe] = useState<'7d' | '14d' | '30d'>('7d');
  const [metricMode, setMetricMode] = useState<'all' | 'spend' | 'volume'>('all');

  // Colors for multi-agent fleet chart
  const agentColors = ['#10b981', '#38bdf8', '#a855f7', '#f59e0b', '#ec4899', '#6366f1'];

  // Single Agent Data
  const singleAgentData = useMemo(() => {
    const daysCount = timeframe === '7d' ? 7 : timeframe === '14d' ? 14 : 30;
    const data = [];
    const now = new Date('2026-09-27T00:50:00Z');

    const baseBurnMultiplier =
      activeAgent.id === 'agent-sol-courier' ? 1.8 : activeAgent.id === 'agent-orion-01' ? 1.0 : 0.4;
    const baseTxMultiplier =
      activeAgent.id === 'agent-sol-courier' ? 55 : activeAgent.id === 'agent-orion-01' ? 12 : 3;

    const agentTodayTxs = transactions.filter(
      (tx) => tx.agentId === activeAgent.id && tx.status === 'confirmed'
    );

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (i === 0) {
        data.push({
          date: `${dateStr} (Today)`,
          spendUsd: +activeAgent.policy.spentTodayUsd.toFixed(2),
          txVolume: Math.max(agentTodayTxs.length, 4),
          dailyCap: activeAgent.policy.dailyLimitUsd,
          blockedAttacks: transactions.filter(
            (t) => t.agentId === activeAgent.id && t.status === 'blocked_by_policy'
          ).length,
        });
      } else {
        const daySeed = (d.getDate() * 17 + activeAgent.agentIdTokenId) % 100;
        const normalizedFactor = 0.5 + (daySeed / 100) * 0.9;
        const historicalSpend = +Math.min(
          activeAgent.policy.dailyLimitUsd * 0.85,
          activeAgent.policy.dailyLimitUsd * 0.3 * normalizedFactor * baseBurnMultiplier
        ).toFixed(2);
        const historicalVolume = Math.round(baseTxMultiplier * normalizedFactor);

        data.push({
          date: dateStr,
          spendUsd: historicalSpend,
          txVolume: historicalVolume,
          dailyCap: activeAgent.policy.dailyLimitUsd,
          blockedAttacks: daySeed % 5 === 0 ? 1 : 0,
        });
      }
    }
    return data;
  }, [timeframe, activeAgent.id, activeAgent.policy.spentTodayUsd, activeAgent.policy.dailyLimitUsd, transactions]);

  // Fleet Comparative Data across ALL active agents vs their daily burn caps
  const fleetComparativeData = useMemo(() => {
    const daysCount = timeframe === '7d' ? 7 : timeframe === '14d' ? 14 : 30;
    const data = [];
    const now = new Date('2026-09-27T00:50:00Z');
    const fleet = allAgents.length > 0 ? allAgents : [activeAgent];

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const dayObj: Record<string, any> = {
        date: i === 0 ? `${dateStr} (Today)` : dateStr,
        totalFleetSpend: 0,
        totalFleetCap: 0,
      };

      fleet.forEach((agent) => {
        const agentKey = `spend_${agent.id}`;
        const capKey = `cap_${agent.id}`;
        dayObj[capKey] = agent.policy.dailyLimitUsd;
        dayObj.totalFleetCap += agent.policy.dailyLimitUsd;

        if (i === 0) {
          const spend = +agent.policy.spentTodayUsd.toFixed(2);
          dayObj[agentKey] = spend;
          dayObj.totalFleetSpend += spend;
        } else {
          const daySeed = (d.getDate() * 19 + agent.agentIdTokenId) % 100;
          const factor = 0.35 + (daySeed / 100) * 0.55;
          const histSpend = +Math.min(
            agent.policy.dailyLimitUsd * 0.8,
            agent.policy.dailyLimitUsd * factor
          ).toFixed(2);
          dayObj[agentKey] = histSpend;
          dayObj.totalFleetSpend += histSpend;
        }
      });

      dayObj.totalFleetSpend = +dayObj.totalFleetSpend.toFixed(2);
      data.push(dayObj);
    }
    return data;
  }, [timeframe, allAgents, activeAgent]);

  // Aggregate stats
  const totalPeriodSpend = useMemo(
    () => singleAgentData.reduce((acc, curr) => acc + curr.spendUsd, 0),
    [singleAgentData]
  );
  const totalPeriodVolume = useMemo(
    () => singleAgentData.reduce((acc, curr) => acc + curr.txVolume, 0),
    [singleAgentData]
  );
  const avgTxValue = totalPeriodVolume > 0 ? totalPeriodSpend / totalPeriodVolume : 0;
  const firewallHeadroom = Math.max(0, activeAgent.policy.dailyLimitUsd - activeAgent.policy.spentTodayUsd);

  // Custom single agent tooltip
  const CustomSingleTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700/80 p-3 rounded-lg shadow-xl text-xs space-y-1.5 min-w-[190px]">
          <div className="font-semibold text-white border-b border-slate-800 pb-1.5">{label}</div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Settled Spend:
            </span>
            <span className="font-mono text-emerald-400 font-semibold tabular-nums">
              ${dataPoint.spendUsd?.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Tx Count:
            </span>
            <span className="font-mono text-blue-400 font-semibold tabular-nums">
              {dataPoint.txVolume} txs
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/80 text-[11px]">
            <span>Firewall Daily Cap:</span>
            <span className="font-mono tabular-nums">${dataPoint.dailyCap?.toFixed(2)}</span>
          </div>
          {dataPoint.blockedAttacks > 0 && (
            <div className="text-[10px] text-red-400 font-medium pt-0.5">
              {dataPoint.blockedAttacks} prompt drain attack intercepted
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom fleet tooltip
  const CustomFleetTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const fleet = allAgents.length > 0 ? allAgents : [activeAgent];
      return (
        <div className="bg-slate-900 border border-slate-700/80 p-3 rounded-lg shadow-xl text-xs space-y-1.5 min-w-[220px]">
          <div className="font-semibold text-white border-b border-slate-800 pb-1.5 flex justify-between">
            <span>{label}</span>
            <span className="font-mono text-emerald-400">Total: ${dataPoint.totalFleetSpend}</span>
          </div>
          <div className="space-y-1 pt-1">
            {fleet.map((agent, i) => {
              const spend = dataPoint[`spend_${agent.id}`] || 0;
              const cap = agent.policy.dailyLimitUsd;
              const color = agentColors[i % agentColors.length];
              return (
                <div key={agent.id} className="flex items-center justify-between text-slate-300 text-[11px]">
                  <span className="flex items-center gap-1.5 truncate max-w-[130px]" title={agent.name}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {agent.name}
                  </span>
                  <span className="font-mono tabular-nums">
                    <span className="text-white font-medium">${spend.toFixed(2)}</span>
                    <span className="text-slate-500"> / ${cap}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-slate-400 pt-1.5 border-t border-slate-800 text-[11px]">
            <span>Aggregate Daily Cap:</span>
            <span className="font-mono font-semibold text-amber-400 tabular-nums">
              ${dataPoint.totalFleetCap}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const fleet = allAgents.length > 0 ? allAgents : [activeAgent];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Agent Spending Analytics & Invariants</h2>
          </div>

          {/* View Mode Switcher (Active Agent vs Fleet Overview) */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-md border border-slate-800">
            <button
              onClick={() => setChartViewMode('single')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                chartViewMode === 'single'
                  ? 'bg-slate-800 text-emerald-400 font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Active Agent
            </button>
            <button
              onClick={() => setChartViewMode('fleet')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
                chartViewMode === 'fleet'
                  ? 'bg-slate-800 text-blue-400 font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Fleet Overview ({fleet.length})</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Metric View Segmented Control (Active Agent Mode) */}
          {chartViewMode === 'single' && (
            <div className="flex items-center bg-slate-950 p-1 rounded-md border border-slate-800">
              <button
                onClick={() => setMetricMode('all')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  metricMode === 'all'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setMetricMode('spend')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  metricMode === 'spend'
                    ? 'bg-slate-800 text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Spend ($)
              </button>
              <button
                onClick={() => setMetricMode('volume')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  metricMode === 'volume'
                    ? 'bg-slate-800 text-blue-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Volume (Txs)
              </button>
            </div>
          )}

          {/* Timeframe Segmented Control */}
          <div className="flex items-center bg-slate-950 p-1 rounded-md border border-slate-800">
            {(['7d', '14d', '30d'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-md">
          <span className="text-[11px] text-slate-400 block">
            {chartViewMode === 'single' ? 'Agent Cumulative Spend' : 'Fleet Total Spend'}
          </span>
          <div className="text-base font-mono font-bold text-emerald-400 tabular-nums mt-0.5">
            ${chartViewMode === 'single'
              ? totalPeriodSpend.toFixed(2)
              : fleetComparativeData.reduce((acc, d) => acc + d.totalFleetSpend, 0).toFixed(2)}
          </div>
        </div>

        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-md">
          <span className="text-[11px] text-slate-400 block">
            {chartViewMode === 'single' ? 'Total Operations' : 'Active Wallets'}
          </span>
          <div className="text-base font-mono font-bold text-blue-400 tabular-nums mt-0.5">
            {chartViewMode === 'single' ? `${totalPeriodVolume} txs` : `${fleet.length} Agents`}
          </div>
        </div>

        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-md">
          <span className="text-[11px] text-slate-400 block">
            {chartViewMode === 'single' ? 'Average Tx Cost' : 'Fleet Daily Cap'}
          </span>
          <div className="text-base font-mono font-semibold text-slate-200 tabular-nums mt-0.5">
            ${chartViewMode === 'single'
              ? avgTxValue.toFixed(4)
              : fleet.reduce((acc, a) => acc + a.policy.dailyLimitUsd, 0).toFixed(2)}
          </div>
        </div>

        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-md">
          <span className="text-[11px] text-slate-400 block">Today's Cap Headroom</span>
          <div className="text-base font-mono font-semibold text-emerald-400 tabular-nums mt-0.5">
            ${chartViewMode === 'single'
              ? firewallHeadroom.toFixed(2)
              : Math.max(
                  0,
                  fleet.reduce((acc, a) => acc + (a.policy.dailyLimitUsd - a.policy.spentTodayUsd), 0)
                ).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartViewMode === 'single' ? (
            /* Single Agent Composed Chart */
            <ComposedChart
              data={singleAgentData}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
            >
              <defs>
                <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />

              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />

              <YAxis
                yAxisId="spend"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
                domain={[
                  0,
                  (dataMax: number) =>
                    Math.max(dataMax * 1.15, activeAgent.policy.dailyLimitUsd * 1.05),
                ]}
              />

              <YAxis
                yAxisId="volume"
                orientation="right"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}`}
              />

              <Tooltip content={<CustomSingleTooltip />} />

              <ReferenceLine
                yAxisId="spend"
                y={activeAgent.policy.dailyLimitUsd}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Cap: $${activeAgent.policy.dailyLimitUsd.toFixed(0)}`,
                  position: 'insideTopRight',
                  fill: '#f59e0b',
                  fontSize: 10,
                  fontFamily: 'monospace',
                }}
              />

              {(metricMode === 'all' || metricMode === 'volume') && (
                <Bar
                  yAxisId="volume"
                  dataKey="txVolume"
                  name="Tx Volume"
                  fill="#38bdf8"
                  opacity={0.35}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
              )}

              {(metricMode === 'all' || metricMode === 'spend') && (
                <Area
                  yAxisId="spend"
                  type="monotone"
                  dataKey="spendUsd"
                  name="Settled Spend ($)"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#spendGradient)"
                  activeDot={{ r: 5, fill: '#10b981', stroke: '#0f172a', strokeWidth: 2 }}
                />
              )}
            </ComposedChart>
          ) : (
            /* Fleet Comparative Chart across all agents vs daily burn caps */
            <ComposedChart
              data={fleetComparativeData}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />

              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />

              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />

              <Tooltip content={<CustomFleetTooltip />} />

              {/* Render Stacked Bars for each agent in fleet */}
              {fleet.map((agent, idx) => (
                <Bar
                  key={agent.id}
                  dataKey={`spend_${agent.id}`}
                  name={agent.name}
                  stackId="fleetSpend"
                  fill={agentColors[idx % agentColors.length]}
                  opacity={0.85}
                  radius={idx === fleet.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={32}
                />
              ))}

              {/* Aggregate Fleet Daily Burn Cap Line */}
              <Line
                type="monotone"
                dataKey="totalFleetCap"
                name="Aggregate Daily Burn Cap"
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend & Notes */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-4 flex-wrap">
          {chartViewMode === 'single' ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
                <span>Settled Spend Trend (USD)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-blue-400/40 rounded-xs inline-block" />
                <span>M2M Tx Volume</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-amber-400 inline-block" />
                <span>Daily Firewall Cap</span>
              </div>
            </>
          ) : (
            <>
              {fleet.map((agent, i) => (
                <div key={agent.id} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs inline-block"
                    style={{ backgroundColor: agentColors[i % agentColors.length] }}
                  />
                  <span>{agent.name}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-amber-400 inline-block" />
                <span>Aggregate Fleet Cap</span>
              </div>
            </>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          On-Chain Invariant Monitoring Engine · EIP-712
        </span>
      </div>
    </div>
  );
};
