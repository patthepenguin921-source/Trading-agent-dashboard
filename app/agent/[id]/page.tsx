import { notFound } from "next/navigation";
import { getRuns, getPositions, getAccountState, getNewsContext, type Run, type Position, type AccountState, type NewsContext } from "../../../lib/supabase";
import { getAgentMeta } from "../../../lib/agents";
import { runHasTrade, SummaryBar, AnalyticsBar, RunEntry, QuietRunsEntry, groupQuietRuns } from "../../run-helpers";
import LogFilterBar from "../../log-filter-bar";
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
  searchParams: Promise<{ onlyTrades?: string; show?: string; view?: string; symbol?: string; confidence?: string }>;
}) {
  const { id } = await params;
  const agent = await getAgentMeta(id);
  if (!agent) notFound();

  const sp = await searchParams;
  // onlyTrades=1 is the legacy filter param — treat it as view=trades so old
  // bookmarks keep working.
  const view = sp.view || (sp.onlyTrades === "1" ? "trades" : "all");
  const symbolFilter = (sp.symbol || "").toUpperCase();
  const confidenceFilter = sp.confidence || "";
  const showCount = Math.max(10, parseInt(sp.show || "30", 10) || 30);

  let allRuns: Run[] = [];
  let positions: Position[] = [];
  let accountState: AccountState | null = null;
  let newsContext: NewsContext | null = null;
  let loadError: string | null = null;

  try {
    [allRuns, positions, accountState, newsContext] = await Promise.all([
      getRuns(500, undefined, id),
      getPositions(id),
      getAccountState(id),
      getNewsContext(id).catch(() => null),
    ]);
    allRuns = filterEquityAnomalies(allRuns);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  const positionsBySymbol = Object.fromEntries(positions.map((p) => [p.symbol, p]));

  // An "off-hours" run is an AI decision run made while the equity market
  // was closed — the pre-market review or (Eris) the crypto-only cycle.
  const isOffHours = (r: Run) => r.market_open === false && r.model_used != null;
  let filtered = allRuns;
  if (view === "trades") filtered = filtered.filter(runHasTrade);
  else if (view === "errors") filtered = filtered.filter((r) => r.error != null);
  else if (view === "offhours") filtered = filtered.filter(isOffHours);
  if (symbolFilter) {
    filtered = filtered.filter((r) =>
      (r.trading_agent_decisions || []).some((d) => d.symbol.replace("/", "").includes(symbolFilter.replace("/", "")))
    );
  }
  if (confidenceFilter) {
    filtered = filtered.filter((r) =>
      (r.trading_agent_decisions || []).some((d) => d.confidence === confidenceFilter)
    );
  }
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

  const moreParams = new URLSearchParams();
  if (view !== "all") moreParams.set("view", view);
  if (symbolFilter) moreParams.set("symbol", symbolFilter);
  if (confidenceFilter) moreParams.set("confidence", confidenceFilter);
  moreParams.set("show", String(showCount + 30));
  const showMoreHref = `/agent/${id}?${moreParams.toString()}`;

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

      {newsContext ? <BriefingCard news={newsContext} accent={agent.accent} /> : null}

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

          <LogFilterBar agentId={id} accent={agent.accent} />
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>
            showing {visible.length} of {filtered.length} runs
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "20px 0" }}>
              No runs match these filters.
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

// The agent's live news/sentiment briefing — the exact text its decision
// prompt receives, straight from agent_news_context. Age matters: the
// Python side refreshes this every news_refresh_minutes (15 for the day
// traders), and a briefing hours old means the refresh pipeline is failing
// — the same failure mode that once had agents trading on a 9-day-old
// briefing labeled as fresh.
function BriefingCard({ news, accent }: { news: NewsContext; accent: string }) {
  const ageMinutes = Math.round((Date.now() - new Date(news.updated_at).getTime()) / 60000);
  const stale = ageMinutes > 6 * 60;
  const ageLabel = ageMinutes < 60 ? `${ageMinutes}m ago` : `${(ageMinutes / 60).toFixed(1)}h ago`;
  return (
    <details
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        background: "var(--bg-surface)",
        padding: "12px 16px",
        marginBottom: 20,
      }}
    >
      <summary style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", color: accent }}>
          LIVE NEWS / SENTIMENT BRIEFING
        </span>
        <span style={{ fontSize: 11, color: stale ? "var(--accent-sell)" : "var(--text-faint)" }}>
          refreshed {ageLabel}
          {stale ? " — stale, refresh pipeline may be failing" : ""}
        </span>
      </summary>
      <p
        style={{
          fontSize: 12.5,
          lineHeight: 1.65,
          color: "var(--text-muted)",
          margin: "10px 0 0",
          whiteSpace: "pre-line",
          borderLeft: "2px solid var(--border-hairline)",
          paddingLeft: 12,
        }}
      >
        {news.content}
      </p>
    </details>
  );
}
