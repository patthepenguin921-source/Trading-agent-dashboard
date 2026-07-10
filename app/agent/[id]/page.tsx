import { notFound } from "next/navigation";
import { getRuns, getPositions, getAccountState, type Run, type Position, type AccountState } from "../../../lib/supabase";
import { getAgentMeta } from "../../../lib/agents";
import { runHasTrade, SummaryBar, AnalyticsBar, RunEntry, QuietRunsEntry, groupQuietRuns } from "../../run-helpers";
import AgentSubNav from "../../agent-sub-nav";
import ManualRunPanel from "../../manual-run-panel";
import {
  filterEquityAnomalies,
  buildPerAgentPctSeries,
  buildPerAgentPctSeriesLatestDay,
  latestDayWindow,
  fmtShortDate,
} from "../../compare/compare-helpers";
import ChartModeView from "../../compare/ChartModeView";

export default async function AgentLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onlyTrades?: string; show?: string }>;
}) {
  const { id } = await params;
  const agent = await getAgentMeta(id);
  if (!agent) notFound();

  const sp = await searchParams;
  const onlyTrades = sp.onlyTrades === "1";
  const showCount = Math.max(10, parseInt(sp.show || "30", 10) || 30);

  let allRuns: Run[] = [];
  let positions: Position[] = [];
  let accountState: AccountState | null = null;
  let loadError: string | null = null;

  try {
    [allRuns, positions, accountState] = await Promise.all([
      getRuns(500, undefined, id),
      getPositions(id),
      getAccountState(id),
    ]);
    allRuns = filterEquityAnomalies(allRuns);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  const positionsBySymbol = Object.fromEntries(positions.map((p) => [p.symbol, p]));

  const filtered = onlyTrades ? allRuns.filter(runHasTrade) : allRuns;
  const visible = filtered.slice(0, showCount);
  const hasMore = filtered.length > showCount;

  const equityDateStrs = new Set<string>();
  for (const r of allRuns) if (r.account_equity != null) equityDateStrs.add(r.run_at.slice(0, 10));
  const equityDaySlots = Array.from(equityDateStrs).sort();
  const equityDaySlotIndex = Object.fromEntries(equityDaySlots.map((d, i) => [d, i]));
  const equityDaySlotCount = equityDaySlots.length || 1;
  const seriesByAgent = buildPerAgentPctSeries({ [id]: allRuns }, equityDaySlotIndex, equityDaySlotCount);
  // "Since day open" tab: this agent's latest day only, on a time-of-day axis.
  const dailyAxis = latestDayWindow({ [id]: allRuns });
  const seriesByAgentDaily = dailyAxis
    ? buildPerAgentPctSeriesLatestDay({ [id]: allRuns }, dailyAxis)
    : undefined;

  const toggleHref = `/agent/${id}?onlyTrades=${onlyTrades ? "0" : "1"}`;
  const showMoreHref = `/agent/${id}?onlyTrades=${onlyTrades ? "1" : "0"}&show=${showCount + 30}`;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.description}</div>
      </div>

      <ManualRunPanel agentId={id} accent={agent.accent} />

      <AgentSubNav id={id} accent={agent.accent} active="log" />

      {loadError ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Couldn&apos;t load the log: {loadError}</div>
      ) : allRuns.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "40px 0" }}>
          No runs logged yet for {agent.label}. Once it runs, entries will show up here — newest first.
        </div>
      ) : (
        <>
          <ChartModeView
            chartProps={{
              seriesByAgent,
              agentIds: [id],
              colors: { [id]: agent.accent },
              labels: { [id]: agent.label },
              daySlots: equityDaySlots,
              seriesByAgentDaily,
              dailyAxis: dailyAxis ?? undefined,
            }}
            belowAlltime={
              <>
                <SummaryBar runs={allRuns} accountState={accountState} displayScale={agent.displayScale ?? 1} />
                <AnalyticsBar runs={allRuns} />
              </>
            }
            belowDaily={
              dailyAxis ? (
                <>
                  <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10 }}>
                    Numbers below are for {fmtShortDate(dailyAxis.dateStr)} only — switch the chart to
                    &ldquo;Since first log&rdquo; for all-time numbers.
                  </div>
                  <SummaryBar
                    runs={allRuns}
                    accountState={accountState}
                    displayScale={agent.displayScale ?? 1}
                    dayScope={dailyAxis.dateStr}
                  />
                  <AnalyticsBar runs={allRuns.filter((r) => r.run_at.slice(0, 10) === dailyAxis.dateStr)} />
                </>
              ) : undefined
            }
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              showing {visible.length} of {filtered.length}
              {onlyTrades ? " runs with trades" : " runs"}
            </span>
            <a
              href={toggleHref}
              className="btn"
              style={{
                fontSize: 12,
                color: onlyTrades ? agent.accent : "var(--text-muted)",
                borderRadius: 999,
                padding: "5px 12px",
              }}
            >
              {onlyTrades ? "✓ only trades" : "show only trades"}
            </a>
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "20px 0" }}>
              No runs with executed trades yet.
            </div>
          ) : (
            groupQuietRuns(visible).map((g) =>
              g.kind === "run" ? (
                <RunEntry key={g.run.id} run={g.run} positionsBySymbol={positionsBySymbol} />
              ) : (
                <QuietRunsEntry key={`quiet-${g.runs[0].id}`} runs={g.runs} positionsBySymbol={positionsBySymbol} />
              )
            )
          )}

          {hasMore ? (
            <a
              href={showMoreHref}
              className="btn"
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 13,
                borderRadius: 8,
                padding: "10px 0",
                marginTop: 8,
              }}
            >
              Show more (+30)
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}
