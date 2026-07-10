import type { Run, Decision, Position, AccountState } from "../lib/supabase";
import { computeAdvancedStats, fmtStatPct, fmtRatio } from "../lib/analytics";
import AnimatedNumber from "./animated-number";

// ── Log grouping ─────────────────────────────────────────────────────────────
// Consecutive runs where nothing happened (no executed trade, no error) get
// collapsed into one expandable row, so the log reads as a sequence of
// meaningful events instead of a wall of near-identical check-ins.

export type RunGroup = { kind: "run"; run: Run } | { kind: "quiet"; runs: Run[] };

export function groupQuietRuns(runs: Run[]): RunGroup[] {
  const groups: RunGroup[] = [];
  let quiet: Run[] = [];
  const flush = () => {
    if (quiet.length === 0) return;
    // A single quiet run isn't worth a collapse UI — show it normally.
    if (quiet.length === 1) groups.push({ kind: "run", run: quiet[0] });
    else groups.push({ kind: "quiet", runs: quiet });
    quiet = [];
  };
  for (const run of runs) {
    const isQuiet = !run.error && tradeCount(run) === 0;
    if (isQuiet) quiet.push(run);
    else {
      flush();
      groups.push({ kind: "run", run });
    }
  }
  flush();
  return groups;
}

export function triggerBadge(trigger: string | null) {
  if (trigger === "workflow_dispatch") {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          padding: "2px 6px",
          borderRadius: 4,
          color: "var(--accent-hold)",
          background: "var(--accent-hold-dim)",
          whiteSpace: "nowrap",
        }}
        title="Manually triggered — not part of the autonomous schedule"
      >
        MANUAL
      </span>
    );
  }
  if (trigger === "schedule") {
    return (
      <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
        scheduled
      </span>
    );
  }
  return null;
}

export function fmtTime(iso: string) {
  return (
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }) + " ET"
  );
}

export function isSameEtDay(isoA: string, isoB: string) {
  const opts: Intl.DateTimeFormatOptions = { timeZone: "America/New_York" };
  return new Date(isoA).toLocaleDateString("en-US", opts) === new Date(isoB).toLocaleDateString("en-US", opts);
}

export function runHasTrade(run: Run) {
  return (run.trading_agent_decisions || []).some((d) => d.order_id);
}

export function tradeCount(run: Run) {
  return (run.trading_agent_decisions || []).filter((d) => d.order_id).length;
}

export function fmtMoney(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function railColor(decisions: Decision[]) {
  const acted = decisions.filter((d) => d.order_id);
  // "buy" and "cover" both add bullish exposure (opening/adding a long,
  // closing out a short); "sell" and "short" both add bearish exposure.
  const bullish = acted.filter((d) => d.action === "buy" || d.action === "cover").length;
  const bearish = acted.filter((d) => d.action === "sell" || d.action === "short").length;
  if (bullish === 0 && bearish === 0) return "var(--border-hairline)";
  if (bullish > bearish) return "var(--accent-buy)";
  if (bearish > bullish) return "var(--accent-sell)";
  return "var(--accent-hold)";
}

export function actionBadge(action: string, executed: boolean) {
  const colorVar =
    action === "buy" || action === "cover" ? "buy" : action === "short" ? "short" : action === "sell" ? "sell" : "hold";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: 4,
        color: `var(--accent-${colorVar})`,
        background: `var(--accent-${colorVar}-dim)`,
        opacity: executed ? 1 : 0.5,
        whiteSpace: "nowrap",
      }}
    >
      {action.toUpperCase()}
      {!executed && " · skipped"}
    </span>
  );
}

export function confidenceDots(confidence: string | null) {
  const level = confidence === "high" ? 3 : confidence === "medium" ? 2 : confidence === "low" ? 1 : 0;
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: 8 }} title={confidence || "n/a"}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: i < level ? "var(--text-muted)" : "var(--border-hairline)",
          }}
        />
      ))}
    </span>
  );
}

export function StatBlock({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 3 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

export function SummaryBar({
  runs,
  accountState,
  displayScale = 1,
  dayScope,
}: {
  runs: Run[];
  accountState?: AccountState | null;
  displayScale?: number;
  // A YYYY-MM-DD date (the chart's Since-day-open date): the P/L baseline
  // becomes that day's first equity reading instead of the first-ever log,
  // so the bar answers "how did this day go" in step with the day chart.
  dayScope?: string;
}) {
  if (runs.length === 0) return null;
  const latest = runs[0];
  const oldest = runs[runs.length - 1];
  // Prefer the high-frequency Alpaca-only snapshot (updates every minute,
  // independent of the slower Gemini-driven decision cycle) for the
  // "right now" numbers. Fall back to the latest decision run if the
  // snapshot job hasn't populated yet.
  const rawEquity = accountState?.equity ?? latest.account_equity ?? null;
  const rawCash = accountState?.cash ?? latest.account_cash ?? null;
  const openPositions = accountState?.num_open_positions ?? latest.num_open_positions ?? 0;
  // Day scope: earliest equity reading of that date (runs arrive newest-
  // first, so scan reversed). Same UTC-date slice the chart's day series
  // uses, so both anchor to the identical baseline reading.
  const rawBaseline = dayScope
    ? [...runs].reverse().find((r) => r.account_equity != null && r.run_at.slice(0, 10) === dayScope)
        ?.account_equity ?? null
    : oldest.account_equity ?? null;
  // displayScale defaults to 1 (real dollar figures); no agent currently
  // overrides it — see lib/agents.ts for why Hermes/Eris don't.
  const equity = rawEquity !== null ? rawEquity * displayScale : null;
  const cash = rawCash !== null ? rawCash * displayScale : null;
  const baseline = rawBaseline !== null ? rawBaseline * displayScale : null;
  const pnl = equity !== null && baseline !== null ? equity - baseline : null;
  const pnlPct = pnl !== null && baseline ? (pnl / baseline) * 100 : null;
  const today = runs.filter((r) => isSameEtDay(r.run_at, latest.run_at));
  const tradesToday = today.reduce((sum, r) => sum + tradeCount(r), 0);
  const pnlColor =
    pnl === null || pnl === 0 ? "var(--text-primary)" : pnl > 0 ? "var(--accent-buy)" : "var(--accent-sell)";
  const lastScheduled = runs.find((r) => r.trigger === "schedule");

  return (
    <div
      className="card"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
        gap: 16,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 24,
      }}
    >
      <StatBlock label="Equity" value={<AnimatedNumber value={equity} />} />
      <StatBlock
        label={dayScope ? "P/L since day open" : "P/L since first log"}
        value={
          pnl === null
            ? "—"
            : `${pnl >= 0 ? "+" : ""}${fmtMoney(pnl)}${pnlPct !== null ? ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)` : ""}`
        }
        color={pnlColor}
      />
      <StatBlock label="Cash" value={fmtMoney(cash)} />
      <StatBlock label="Open positions" value={String(openPositions)} />
      <StatBlock label="Runs today" value={String(today.length)} />
      <StatBlock label="Trades today" value={String(tradesToday)} />
      <StatBlock
        label={accountState ? "Balance as of" : "Last run"}
        value={fmtTime(accountState?.updated_at ?? latest.run_at)}
      />
      <StatBlock label="Last AI decision" value={fmtTime(latest.run_at)} />
      <StatBlock
        label="Last autonomous run"
        value={lastScheduled ? fmtTime(lastScheduled.run_at) : "none yet"}
        color={lastScheduled ? undefined : "var(--text-faint)"}
      />
    </div>
  );
}

export function entryPriceLine(d: Decision, positionsBySymbol: Record<string, Position>) {
  if ((d.action !== "buy" && d.action !== "short") || !d.order_id || d.entry_price == null) return null;
  const verb = d.action === "short" ? "shorted" : "bought";
  const entered = fmtMoney(d.entry_price);
  const pos = positionsBySymbol[d.symbol];
  if (!pos || pos.current_price == null) {
    return (
      <>
        {verb} @ {entered}{" "}
        <span style={{ color: "var(--text-faint)" }}>(current price unavailable — order likely still unfilled)</span>
      </>
    );
  }
  const current = fmtMoney(pos.current_price);
  const pl = pos.unrealized_pl_pct;
  const plColor = pl === null || pl === undefined || pl === 0 ? "var(--text-muted)" : pl > 0 ? "var(--accent-buy)" : "var(--accent-sell)";
  return (
    <>
      {verb} @ {entered} · now {current}{" "}
      {pl != null ? <span style={{ color: plColor, fontWeight: 600 }}>({pl >= 0 ? "+" : ""}{pl.toFixed(2)}%)</span> : null}
    </>
  );
}

export function RunEntry({
  run,
  positionsBySymbol = {},
}: {
  run: Run;
  positionsBySymbol?: Record<string, Position>;
}) {
  const decisions = run.trading_agent_decisions || [];

  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
      <div
        style={{
          width: 3,
          borderRadius: 2,
          background: railColor(decisions),
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
            {fmtTime(run.run_at)}
            {triggerBadge(run.trigger)}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            equity {fmtMoney(run.account_equity)} · cash {fmtMoney(run.account_cash)} ·{" "}
            {run.num_open_positions ?? 0} open · {run.model_used || "—"}
          </span>
        </div>

        {run.error ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--accent-sell)",
              background: "var(--accent-sell-dim)",
              border: "1px solid var(--accent-sell)",
              borderRadius: 6,
              padding: "8px 12px",
              marginBottom: 10,
            }}
          >
            run failed: {run.error}
          </div>
        ) : null}

        {run.overall_reasoning ? (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--text-primary)",
              borderLeft: "2px solid var(--border-hairline)",
              paddingLeft: 12,
              margin: "0 0 12px",
            }}
          >
            {run.overall_reasoning}
          </p>
        ) : null}

        {run.news_context ? (
          <details style={{ marginBottom: 12 }}>
            <summary
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
                color: "var(--text-faint)",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              NEWS / POLITICS / SOCIETY CONTEXT CONSIDERED
            </summary>
            <p
              style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "var(--text-muted)",
                margin: "8px 0 0",
                whiteSpace: "pre-line",
                borderLeft: "2px solid var(--border-hairline)",
                paddingLeft: 12,
              }}
            >
              {run.news_context}
            </p>
          </details>
        ) : null}

        {decisions.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-faint)" }}>no symbols acted on this run</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {decisions.map((d) => (
              <div
                key={d.id}
                className="card"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-hairline)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {actionBadge(d.action, Boolean(d.order_id))}
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.symbol}</span>
                  {d.qty ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{d.qty} sh</span> : null}
                  {confidenceDots(d.confidence)}
                  <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto" }}>
                    {d.order_status}
                  </span>
                </div>
                {(() => {
                  const line = entryPriceLine(d, positionsBySymbol);
                  return line ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {line}
                    </div>
                  ) : null;
                })()}
                {d.reasoning ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    {d.reasoning}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Collapsed row for a stretch of consecutive quiet runs. The newest run's
// reasoning is shown as the row's one-line summary; expanding reveals every
// run in the stretch, fully rendered.
export function QuietRunsEntry({
  runs,
  positionsBySymbol = {},
}: {
  runs: Run[];
  positionsBySymbol?: Record<string, Position>;
}) {
  const newest = runs[0];
  const oldest = runs[runs.length - 1];
  const holdDecisions = runs.reduce((n, r) => n + (r.trading_agent_decisions || []).length, 0);
  return (
    <details style={{ marginBottom: 28 }}>
      <summary
        style={{
          display: "flex",
          gap: 16,
          cursor: "pointer",
          userSelect: "none",
          listStyle: "none",
        }}
      >
        <div style={{ width: 3, borderRadius: 2, background: "var(--border-hairline)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {fmtTime(oldest.run_at)} → {fmtTime(newest.run_at)}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 3 }}>
            {runs.length} runs, no trades{holdDecisions > 0 ? ` (${holdDecisions} hold decisions)` : ""} — tap to
            expand
          </div>
        </div>
      </summary>
      <div style={{ marginTop: 16 }}>
        {runs.map((run) => (
          <RunEntry key={run.id} run={run} positionsBySymbol={positionsBySymbol} />
        ))}
      </div>
    </details>
  );
}

// ── Analytics bar ─────────────────────────────────────────────────────────────
// The numbers that make a win rate meaningful: how big the wins are relative
// to the losses, whether the edge nets positive, and risk-adjusted return.
export function AnalyticsBar({ runs }: { runs: Run[] }) {
  const s = computeAdvancedStats(runs);
  // Trade-based stats need at least one closed sell, but Sharpe and max
  // drawdown only need equity history — a buy-and-hold agent (Helios)
  // should still get its risk numbers, with the trade columns as dashes.
  if (s.closedTrades === 0 && s.sharpe == null && s.maxDrawdownPct === 0) return null;
  const pfColor =
    s.profitFactor == null
      ? undefined
      : s.profitFactor >= 1
        ? "var(--accent-buy)"
        : "var(--accent-sell)";
  return (
    <div
      className="card"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))",
        gap: 16,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 24,
      }}
    >
      <StatBlock label="Closed trades" value={String(s.closedTrades)} />
      <StatBlock label="Win rate" value={s.winRate == null ? "—" : `${s.winRate.toFixed(0)}%`} />
      <StatBlock label="Avg win" value={fmtStatPct(s.avgWinPct)} color="var(--accent-buy)" />
      <StatBlock label="Avg loss" value={fmtStatPct(s.avgLossPct)} color="var(--accent-sell)" />
      <StatBlock label="Profit factor" value={fmtRatio(s.profitFactor)} color={pfColor} />
      <StatBlock label="Expectancy / trade" value={fmtStatPct(s.expectancyPct)} />
      <StatBlock label="Sharpe (ann.)" value={fmtRatio(s.sharpe)} />
      <StatBlock label="Max drawdown" value={fmtStatPct(s.maxDrawdownPct, false)} />
    </div>
  );
}
