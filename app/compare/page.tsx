import { getRuns, getBenchmarkPrices, type Run } from "../../lib/supabase";
import { getAllAgents, type AgentMeta } from "../../lib/agents";
import { fmtTime } from "../run-helpers";
import {
  computeAgentStats,
  capRejectionBreakdown,
  buildPerAgentPctSeries,
  buildBenchmarkPctSeries,
  buildPerAgentPctSeriesLatestDay,
  buildBenchmarkPctSeriesLatestDay,
  latestDayWindow,
  filterEquityAnomalies,
  fmtPct,
  fmtShortDate,
} from "./compare-helpers";
import { type BenchmarkDef } from "./DualReturnChartClient";
import ChartModeView from "./ChartModeView";
import Leaderboard, { type LeaderboardRow } from "./Leaderboard";
import CalendarHeatmap from "./CalendarHeatmap";
import DrawdownStrip from "./DrawdownStrip";
import { computeAdvancedStats } from "../../lib/analytics";
import { isSameEtDay } from "../run-helpers";
import { fetchRangeSeries } from "../../lib/quotes";
import EquityRefresher from "../equity-refresher";

// Index/ETF comparison lines shown on the chart alongside the agents.
// SPY/QQQ are the standard tradeable-ETF proxies for the S&P 500 and
// Nasdaq-100, same convention as VTI standing in for "total market" —
// all three trade on Alpaca/stooq/Yahoo under these tickers, so no new
// data-source plumbing is needed, just more symbols through the same path.
const BENCHMARK_DEFS: { symbol: string; label: string; color: string }[] = [
  { symbol: "VTI", label: "Total market (VTI)", color: "var(--accent-benchmark)" },
  { symbol: "SPY", label: "S&P 500 (SPY)", color: "var(--accent-benchmark-spy)" },
  { symbol: "QQQ", label: "NASDAQ-100 (QQQ)", color: "var(--accent-benchmark-qqq)" },
];

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border-hairline)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-faint)" }}>{label}</span>
      <span style={{ color: color || "var(--text-primary)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// daily: the stats are computed from a single day's runs (the day the chart's
// Since-day-open tab shows), so the return/drawdown labels say so — the math
// is identical, just anchored to that day's first reading instead of the
// agent's first-ever log.
function AgentStatsColumn({ agent, runs, daily = false }: { agent: AgentMeta; runs: Run[]; daily?: boolean }) {
  const stats = computeAgentStats(runs);
  const rejections = capRejectionBreakdown(runs);
  const returnColor =
    stats.totalReturnPct == null || stats.totalReturnPct === 0
      ? "var(--text-primary)"
      : stats.totalReturnPct > 0
        ? "var(--accent-buy)"
        : "var(--accent-sell)";

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        padding: 18,
        background: "var(--bg-surface)",
        flex: 1,
        minWidth: 240,
      }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: agent.accent }}>
        {agent.label}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2, marginBottom: 14 }}>{agent.tagline}</div>

      <StatRow label={daily ? "Day return" : "Total return"} value={fmtPct(stats.totalReturnPct)} color={returnColor} />
      <StatRow label={daily ? "Day drawdown" : "Max drawdown"} value={fmtPct(stats.maxDrawdownPct)} />
      <StatRow
        label="Win rate"
        value={stats.closedTradeCount ? `${stats.winRate!.toFixed(0)}% (${stats.closedTradeCount} closed)` : daily ? "no closes this day" : "no closes yet"}
      />
      <StatRow label="Trades executed" value={String(stats.tradeCount)} />
      <StatRow label="Cap rejections" value={String(stats.capRejectionCount)} />
      <StatRow label="Last run" value={stats.lastRunAt ? fmtTime(stats.lastRunAt) : daily ? "no runs this day" : "—"} />

      {rejections.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 6 }}>
            REJECTION REASONS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rejections.map(({ reason, count }) => (
              <div
                key={reason}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                <span>{reason}</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default async function ComparePage() {
  const agents = await getAllAgents();
  const results = await Promise.all(
    agents.map(async (agent) => {
      try {
        const runs = await getRuns(2000, undefined, agent.id);
        return { agent, runs: filterEquityAnomalies(runs), loadError: null as string | null };
      } catch (e) {
        return { agent, runs: [] as Run[], loadError: e instanceof Error ? e.message : "Unknown error" };
      }
    })
  );

  const runsByAgent: Record<string, Run[]> = {};
  for (const { agent, runs } of results) runsByAgent[agent.id] = runs;

  const agentIds = agents.map((a) => a.id);

  // Date range anchor — use only agents with meaningful history so a brand-new
  // agent doesn't pull the VTI start date forward to today.
  const MIN_BENCHMARK_RUNS = 50;
  const anchorAgentIds = agentIds.filter((id) => (runsByAgent[id]?.length ?? 0) >= MIN_BENCHMARK_RUNS);
  const allRunTimes = (anchorAgentIds.length ? anchorAgentIds : agentIds)
    .flatMap((id) => (runsByAgent[id] ?? []).map((r) => new Date(r.run_at).getTime()))
    .filter((t) => Number.isFinite(t));
  const rangeStartMs = allRunTimes.length
    ? Math.min(...allRunTimes)
    : Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rangeEndMs = Date.now();

  // Fetch each benchmark from Supabase (written by Plutus's snapshot via
  // Alpaca). Fallback to Yahoo Finance per-symbol in case the table is
  // empty for that symbol (e.g. on first deploy, or before the snapshot
  // job has backfilled a newly added benchmark).
  const rangeStartDate = new Date(rangeStartMs).toISOString().slice(0, 10);
  const rawBenchmarks = await Promise.all(
    BENCHMARK_DEFS.map(async (def) => {
      let raw: { date: string; close: number }[] = [];
      try {
        raw = await getBenchmarkPrices(def.symbol, rangeStartDate);
      } catch {
        try {
          raw = await fetchRangeSeries(
            def.symbol,
            Math.floor(rangeStartMs / 1000) - 86400,
            Math.floor(rangeEndMs / 1000)
          );
        } catch {
          raw = [];
        }
      }
      return { ...def, raw };
    })
  );

  // Build the shared day-slot index from all dates that appear in any series.
  // Each calendar date gets equal horizontal width; runs within a day are
  // evenly spaced by count — no overnight diagonal straight-line artifacts.
  const allDateStrs = new Set<string>();
  for (const runs of Object.values(runsByAgent)) {
    for (const r of runs) if (r.account_equity != null) allDateStrs.add(r.run_at.slice(0, 10));
  }
  for (const { raw } of rawBenchmarks) {
    for (const p of raw) allDateStrs.add(p.date.slice(0, 10));
  }
  const daySlots = Array.from(allDateStrs).sort(); // ["2026-06-28", "2026-06-29", ...]
  const daySlotIndex: Record<string, number> = Object.fromEntries(daySlots.map((d, i) => [d, i]));
  const daySlotCount = daySlots.length || 1;

  const seriesByAgent = buildPerAgentPctSeries(runsByAgent, daySlotIndex, daySlotCount);
  const colors: Record<string, string> = Object.fromEntries(agents.map((a) => [a.id, a.accent]));
  const labels: Record<string, string> = Object.fromEntries(agents.map((a) => [a.id, a.label]));

  // Single-day series for the "Since day open" tab: the most recent day with
  // data, on a shared time-of-day axis (agents + benchmarks together).
  const dailyAxis = latestDayWindow(runsByAgent, rawBenchmarks.map(({ raw }) => raw));
  const seriesByAgentDaily = dailyAxis
    ? buildPerAgentPctSeriesLatestDay(runsByAgent, dailyAxis)
    : undefined;

  const benchmarks: BenchmarkDef[] = rawBenchmarks
    .filter(({ raw }) => raw.length >= 2)
    .map(({ symbol, label, color, raw }) => ({
      id: symbol,
      label,
      color,
      series: buildBenchmarkPctSeries(raw, rangeStartMs, rangeEndMs, daySlotIndex, daySlotCount),
      seriesDaily: dailyAxis ? buildBenchmarkPctSeriesLatestDay(raw, dailyAxis) : undefined,
    }));

  const legend = (
    <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
      {agents.map((agent) => (
        <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: agent.accent }} />
          <span style={{ color: "var(--text-muted)" }}>{agent.label}</span>
        </div>
      ))}
      {benchmarks.map((b) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <svg width="14" height="10" style={{ flexShrink: 0 }}>
            <line x1="0" y1="5" x2="14" y2="5" stroke={b.color} strokeWidth="2" strokeDasharray="3,2" />
          </svg>
          <span style={{ color: "var(--text-muted)" }}>{b.label}</span>
        </div>
      ))}
    </div>
  );

  // Day-scoped stats for the Since-day-open tab: same columns, computed from
  // only the runs of the day the chart is showing.
  const belowDaily = dailyAxis ? (
    <>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10 }}>
        Stats below are for {fmtShortDate(dailyAxis.dateStr)} only — switch the chart to
        &ldquo;Since first log&rdquo; for all-time numbers.
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {results.map(({ agent, runs }) => (
          <AgentStatsColumn
            key={agent.id}
            agent={agent}
            runs={runs.filter((r) => r.run_at.slice(0, 10) === dailyAxis.dateStr)}
            daily
          />
        ))}
      </div>
    </>
  ) : undefined;

  // Leaderboard rows: basic stats + risk-adjusted numbers per agent.
  const leaderboardRows: LeaderboardRow[] = results
    .filter(({ runs }) => runs.length > 0)
    .map(({ agent, runs }) => {
      const basic = computeAgentStats(runs);
      const adv = computeAdvancedStats(runs);
      const latest = runs[0];
      const chronological = [...runs].reverse();
      const todayFirst = chronological.find(
        (r) => r.account_equity != null && isSameEtDay(r.run_at, latest.run_at)
      );
      const todayPct =
        basic.currentEquity != null && todayFirst?.account_equity
          ? ((basic.currentEquity - todayFirst.account_equity) / todayFirst.account_equity) * 100
          : null;
      return {
        id: agent.id,
        label: agent.label,
        accent: agent.accent,
        returnPct: basic.totalReturnPct,
        todayPct,
        sharpe: adv.sharpe,
        profitFactor: adv.profitFactor,
        winRate: adv.winRate,
        maxDrawdownPct: adv.maxDrawdownPct,
        closedTrades: adv.closedTrades,
      };
    });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <EquityRefresher />
      </div>

      <Leaderboard rows={leaderboardRows} />

      <ChartModeView
        chartHeader={legend}
        chartProps={{
          seriesByAgent,
          agentIds,
          colors,
          labels,
          benchmarks,
          daySlots,
          seriesByAgentDaily,
          dailyAxis: dailyAxis ?? undefined,
        }}
        belowAlltime={
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {results.map(({ agent, runs }) => (
              <AgentStatsColumn key={agent.id} agent={agent} runs={runs} />
            ))}
          </div>
        }
        belowDaily={belowDaily}
      />

      <div style={{ marginTop: 24 }}>
        <CalendarHeatmap agents={agents} runsByAgent={runsByAgent} />
        <DrawdownStrip agents={agents} runsByAgent={runsByAgent} />
      </div>
    </div>
  );
}
