import type { Run } from "../../lib/supabase";

// Alpaca has intermittently reported an agent's equity dropping sharply in a
// single snapshot with no matching trade activity — positions (partially or
// fully) wiped with cash barely/never crediting the difference — then a
// later reading recovering back near the prior level, sometimes repeating
// the cycle again hours later (seen on Plutus/Helios/Eris/Hermes on
// 2026-07-07, ranging ~80-90% down to ~28%, and on Hermes again on
// 2026-07-06 at only ~7%). 0.06 is set just below that smallest confirmed
// case; a scan of every agent's full history found no single-run move
// between 0% and 15% other than known incidents, so this has no observed
// false-positive risk against real trading swings. Any drop past
// ANOMALY_DROP_THRESHOLD is held at the last trusted reading until a later
// run comes back within the threshold — at which point that reading is
// trusted again as the new baseline. If it never recovers, the line just
// stays flat at the last good value.
const ANOMALY_DROP_THRESHOLD = 0.06;

// `runs` must be ordered run_at DESC (as returned by getRuns).
export function filterEquityAnomalies(runs: Run[]): Run[] {
  const chronological = [...runs].reverse();
  let lastGood: Run | null = null;

  const patched = chronological.map((r) => {
    if (r.account_equity == null) return r;
    if (!lastGood || lastGood.account_equity == null) {
      lastGood = r;
      return r;
    }

    const pctChange = (r.account_equity - lastGood.account_equity) / lastGood.account_equity;
    if (pctChange <= -ANOMALY_DROP_THRESHOLD) {
      return {
        ...r,
        account_equity: lastGood.account_equity,
        account_cash: lastGood.account_cash,
        num_open_positions: lastGood.num_open_positions,
      };
    }

    lastGood = r;
    return r;
  });

  return patched.reverse();
}

const CAP_REASONS = new Set([
  "max open positions reached",
  "max new buys per run reached",
  "insufficient free cash after buffer",
  "no position held to sell",
  "already held, ignoring duplicate buy",
  "a buy order for this symbol is already pending/unfilled, ignoring duplicate",
  "duplicate buy for this symbol already approved this run, ignoring",
  "no price data available for this symbol this run",
  "symbol not in approved universe",
]);

export type AgentStats = {
  startingEquity: number | null;
  currentEquity: number | null;
  totalReturnPct: number | null;
  maxDrawdownPct: number;
  tradeCount: number;
  closedTradeCount: number;
  winRate: number | null;
  capRejectionCount: number;
  lastRunAt: string | null;
};

export function computeAgentStats(runs: Run[]): AgentStats {
  if (runs.length === 0) {
    return {
      startingEquity: null,
      currentEquity: null,
      totalReturnPct: null,
      maxDrawdownPct: 0,
      tradeCount: 0,
      closedTradeCount: 0,
      winRate: null,
      capRejectionCount: 0,
      lastRunAt: null,
    };
  }

  const chronological = [...runs].reverse();
  const equitySeries = chronological
    .map((r) => r.account_equity)
    .filter((v): v is number => v !== null);

  const startingEquity = equitySeries[0] ?? null;
  const currentEquity = equitySeries[equitySeries.length - 1] ?? null;
  const totalReturnPct =
    startingEquity && currentEquity ? ((currentEquity - startingEquity) / startingEquity) * 100 : null;

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const equity of equitySeries) {
    peak = Math.max(peak, equity);
    if (peak > 0) {
      const dd = ((equity - peak) / peak) * 100;
      if (dd < maxDrawdownPct) maxDrawdownPct = dd;
    }
  }

  const decisions = runs.flatMap((r) => r.trading_agent_decisions || []);
  const closedTrades = decisions.filter(
    (d) => d.action === "sell" && d.order_id && d.realized_pnl_pct != null
  );
  const wins = closedTrades.filter((d) => Number(d.realized_pnl_pct) > 0).length;
  const winRate = closedTrades.length ? (wins / closedTrades.length) * 100 : null;

  const tradeCount = decisions.filter((d) => d.order_id).length;
  const capRejectionCount = decisions.filter(
    (d) => d.order_status && CAP_REASONS.has(d.order_status)
  ).length;

  return {
    startingEquity,
    currentEquity,
    totalReturnPct,
    maxDrawdownPct,
    tradeCount,
    closedTradeCount: closedTrades.length,
    winRate,
    capRejectionCount,
    lastRunAt: runs[0].run_at,
  };
}

export type CapRejectionReason = { reason: string; count: number };

export function capRejectionBreakdown(runs: Run[]): CapRejectionReason[] {
  const counts = new Map<string, number>();
  for (const d of runs.flatMap((r) => r.trading_agent_decisions || [])) {
    if (!d.order_status || !CAP_REASONS.has(d.order_status)) continue;
    counts.set(d.order_status, (counts.get(d.order_status) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export type AlignedPoint = { date: string; pctByAgent: Record<string, number | null> };

export function buildAlignedReturnSeries(runsByAgent: Record<string, Run[]>): AlignedPoint[] {
  const dailyByAgent: Record<string, { byDate: Map<string, number>; start: number | null }> = {};

  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const chronological = [...runs].reverse();
    const byDate = new Map<string, number>();
    for (const r of chronological) {
      if (r.account_equity == null) continue;
      byDate.set(r.run_at.slice(0, 10), r.account_equity);
    }
    const firstEquity = chronological.find((r) => r.account_equity != null)?.account_equity ?? null;
    dailyByAgent[agentId] = { byDate, start: firstEquity };
  }

  const allDates = Array.from(
    new Set(Object.values(dailyByAgent).flatMap((a) => Array.from(a.byDate.keys())))
  ).sort();

  const lastKnownPct: Record<string, number | null> = {};
  return allDates.map((date) => {
    const pctByAgent: Record<string, number | null> = {};
    for (const [agentId, a] of Object.entries(dailyByAgent)) {
      const equity = a.byDate.get(date);
      if (equity != null && a.start) {
        lastKnownPct[agentId] = ((equity - a.start) / a.start) * 100;
      }
      pctByAgent[agentId] = lastKnownPct[agentId] ?? null;
    }
    return { date, pctByAgent };
  });
}

export type PctSeriesPoint = { runAt: string; pct: number; xFrac: number };

// Day-slot xFrac: each calendar date in the shared axis gets equal width
// (1/numSlots). Runs within a day are evenly spaced by count within that
// slot. This eliminates the long diagonal "straight lines" that appear in
// raw calendar-time xFrac when agents don't run overnight — a 16-hour gap
// would otherwise span ~30% of the chart as one straight line.
//
// Agents that started later (e.g. Hermes on Jul 1) correctly appear only
// in their day's slot rather than spanning the full chart width.
export function buildPerAgentPctSeries(
  runsByAgent: Record<string, Run[]>,
  daySlotIndex: Record<string, number>,
  daySlotCount: number
): Record<string, PctSeriesPoint[]> {
  const result: Record<string, PctSeriesPoint[]> = {};

  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const chronological = [...runs].reverse().filter((r) => r.account_equity != null);
    const base = chronological[0]?.account_equity ?? null;
    if (!base) { result[agentId] = []; continue; }

    // Group runs by calendar date; Map preserves insertion order (chronological).
    const byDate = new Map<string, typeof chronological>();
    for (const r of chronological) {
      const d = r.run_at.slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(r);
    }

    const points: PctSeriesPoint[] = [];
    for (const [dateStr, dateRuns] of byDate) {
      const slotIdx = daySlotIndex[dateStr] ?? 0;
      const n = dateRuns.length;
      dateRuns.forEach((r, i) => {
        const inSlotFrac = n > 1 ? i / (n - 1) : 0.5;
        points.push({
          runAt: r.run_at,
          pct: ((r.account_equity! - base) / base) * 100,
          xFrac: (slotIdx + inSlotFrac) / daySlotCount,
        });
      });
    }

    result[agentId] = points;
  }
  return result;
}

// Index/ETF benchmark (VTI, SPY, QQQ, ...): placed using the same day-slot
// logic as agent runs so the line has the same visual density. When
// intraday bars are available (written by Plutus's snapshot) the result is
// dozens of points per trading day, matching Plutus's own run density and
// giving the benchmark real shape on the chart. Falls back gracefully to
// daily-close-only mode (3 points) if intraday data hasn't been collected
// yet. Called once per benchmark symbol.
export function buildBenchmarkPctSeries(
  points: { date: string; close: number }[],
  rangeStartMs: number,
  rangeEndMs: number,
  daySlotIndex: Record<string, number>,
  daySlotCount: number
): PctSeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  // Anchor % return to the first price at/after the agents' start date.
  const rangeStartDate = new Date(rangeStartMs).toISOString().slice(0, 10);
  const basePoint = sorted.find((p) => p.date.slice(0, 10) >= rangeStartDate) ?? sorted[0];
  const base = basePoint.close;

  // Group by calendar date so intraday points get evenly spaced within
  // their day-slot, exactly like buildPerAgentPctSeries does for agent runs.
  const byDate = new Map<string, typeof sorted>();
  for (const p of sorted) {
    const d = p.date.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(p);
  }

  const result: PctSeriesPoint[] = [];
  for (const [dateStr, dayPoints] of byDate) {
    const slotIdx = daySlotIndex[dateStr];
    if (slotIdx === undefined) continue; // date outside agent date range
    const n = dayPoints.length;
    dayPoints.forEach((p, i) => {
      const inSlotFrac = n > 1 ? i / (n - 1) : 0.5;
      result.push({
        runAt: p.date,
        pct: ((p.close - base) / base) * 100,
        xFrac: (slotIdx + inSlotFrac) / daySlotCount,
      });
    });
  }

  return result;
}

// ── "Since day open" (single-day) series builders ────────────────────────────
// The Since-day-open tab shows ONLY the most recent day with data, spanning
// the full chart width on a real time-of-day axis. (It previously drew a
// daily-resetting sawtooth across the entire history, which made the one day
// anyone actually cares about — today — a sliver at the right edge.)

export type DailyAxis = { dateStr: string; startMs: number; endMs: number };

// The "day in question": the most recent calendar date any agent logged an
// equity reading, plus the shared intraday time window (first to last
// timestamp across every series that day) so all lines share one time axis.
// Benchmark points can widen the window but never pick the date — the agents
// are the subject of the chart. Returns null when there's no day with at
// least two distinct timestamps (nothing drawable yet).
export function latestDayWindow(
  runsByAgent: Record<string, Run[]>,
  benchmarkPointSets: { date: string; close: number }[][] = []
): DailyAxis | null {
  let dateStr: string | null = null;
  for (const runs of Object.values(runsByAgent)) {
    for (const r of runs) {
      if (r.account_equity == null) continue;
      const d = r.run_at.slice(0, 10);
      if (!dateStr || d > dateStr) dateStr = d;
    }
  }
  if (!dateStr) return null;

  let startMs = Infinity;
  let endMs = -Infinity;
  const consider = (iso: string) => {
    // Only full timestamps count toward the time window — a date-only string
    // parses as midnight UTC and would skew the axis.
    if (iso.slice(0, 10) !== dateStr || !iso.includes("T")) return;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return;
    if (t < startMs) startMs = t;
    if (t > endMs) endMs = t;
  };
  for (const runs of Object.values(runsByAgent)) {
    for (const r of runs) if (r.account_equity != null) consider(r.run_at);
  }
  for (const set of benchmarkPointSets) for (const p of set) consider(p.date);

  if (!Number.isFinite(startMs) || endMs <= startMs) return null;
  return { dateStr, startMs, endMs };
}

export function buildPerAgentPctSeriesLatestDay(
  runsByAgent: Record<string, Run[]>,
  axis: DailyAxis
): Record<string, PctSeriesPoint[]> {
  const span = axis.endMs - axis.startMs || 1;
  const result: Record<string, PctSeriesPoint[]> = {};

  for (const [agentId, runs] of Object.entries(runsByAgent)) {
    const dayRuns = [...runs]
      .reverse()
      .filter((r) => r.account_equity != null && r.run_at.slice(0, 10) === axis.dateStr);
    const base = dayRuns[0]?.account_equity ?? null;
    if (!base) {
      result[agentId] = [];
      continue;
    }
    result[agentId] = dayRuns.map((r) => ({
      runAt: r.run_at,
      pct: ((r.account_equity! - base) / base) * 100,
      xFrac: Math.min(1, Math.max(0, (Date.parse(r.run_at) - axis.startMs) / span)),
    }));
  }
  return result;
}

export function buildBenchmarkPctSeriesLatestDay(
  points: { date: string; close: number }[],
  axis: DailyAxis
): PctSeriesPoint[] {
  const span = axis.endMs - axis.startMs || 1;
  const dayPoints = points
    .filter((p) => p.date.slice(0, 10) === axis.dateStr && p.date.includes("T"))
    .sort((a, b) => a.date.localeCompare(b.date));
  const base = dayPoints[0]?.close;
  if (!base) return [];
  return dayPoints.map((p) => ({
    runAt: p.date,
    pct: ((p.close - base) / base) * 100,
    xFrac: Math.min(1, Math.max(0, (Date.parse(p.date) - axis.startMs) / span)),
  }));
}

export function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtShortDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
