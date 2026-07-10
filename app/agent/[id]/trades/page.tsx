import Link from "next/link";
import { notFound } from "next/navigation";
import { getClosedTrades, type ClosedTrade } from "../../../../lib/supabase";
import { getAgentMeta } from "../../../../lib/agents";
import { computeTradeStats, fmtStatPct, fmtRatio } from "../../../../lib/analytics";
import { fmtTime } from "../../../run-helpers";
import { getTickerName } from "../../../../lib/ticker-names";
import AgentSubNav from "../../../agent-sub-nav";

function pnlColor(pnl: number) {
  return pnl === 0 ? "var(--text-muted)" : pnl > 0 ? "var(--accent-buy)" : "var(--accent-sell)";
}

function fmtPnl(pnl: number) {
  return `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`;
}

function isBackstopClose(t: ClosedTrade) {
  return (t.reasoning || "").startsWith("Code-enforced stop-loss backstop");
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3, color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

function TradeRow({ trade }: { trade: ClosedTrade }) {
  const closedShort = trade.action === "cover";
  const backstop = isBackstopClose(trade);
  return (
    <details
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        background: "var(--bg-surface)",
        padding: "10px 14px",
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          cursor: "pointer",
          userSelect: "none",
          listStyle: "none",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, minWidth: 0 }}>{trade.symbol}</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "2px 6px",
            borderRadius: 4,
            flexShrink: 0,
            color: closedShort ? "var(--accent-short)" : "var(--accent-buy)",
            background: closedShort ? "var(--accent-short-dim)" : "var(--accent-buy-dim)",
          }}
        >
          {closedShort ? "SHORT CLOSED" : "LONG CLOSED"}
        </span>
        {backstop ? (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 6px",
              borderRadius: 4,
              flexShrink: 0,
              color: "var(--accent-sell)",
              background: "var(--accent-sell-dim)",
            }}
          >
            AUTO STOP
          </span>
        ) : null}
        <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto", flexShrink: 0 }}>
          {fmtTime(trade.created_at)}
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
            minWidth: 64,
            textAlign: "right",
            color: pnlColor(trade.realized_pnl_pct),
          }}
        >
          {fmtPnl(trade.realized_pnl_pct)}
        </span>
      </summary>
      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--text-muted)",
          borderLeft: "2px solid var(--border-hairline)",
          paddingLeft: 12,
        }}
      >
        {getTickerName(trade.symbol) ? (
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>
            {getTickerName(trade.symbol)}
            {trade.exit_price != null ? ` · exited @ $${trade.exit_price}` : ""}
            {trade.confidence ? ` · ${trade.confidence} confidence` : ""}
          </div>
        ) : null}
        {trade.reasoning || "(no reasoning logged)"}
      </div>
    </details>
  );
}

export default async function TradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { id } = await params;
  const agent = await getAgentMeta(id);
  if (!agent) notFound();

  const sp = await searchParams;
  const showCount = Math.max(25, parseInt(sp.show || "50", 10) || 50);

  let trades: ClosedTrade[] = [];
  let loadError: string | null = null;
  try {
    // Coerce once: numeric columns can come back as strings depending on the
    // Postgres column type, and everything below does arithmetic on this.
    trades = (await getClosedTrades(id)).map((t) => ({
      ...t,
      realized_pnl_pct: Number(t.realized_pnl_pct),
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  const stats = computeTradeStats(trades.map((t) => t.realized_pnl_pct));

  // Per-symbol scorecard: which names this agent actually makes (and loses)
  // money trading — cumulative realized %, not per-trade averages, so a
  // symbol churned five times for -1% each shows up as the -5% problem it is.
  const bySymbol = new Map<string, { trades: number; wins: number; totalPct: number }>();
  for (const t of trades) {
    const s = bySymbol.get(t.symbol) || { trades: 0, wins: 0, totalPct: 0 };
    s.trades += 1;
    if (t.realized_pnl_pct > 0) s.wins += 1;
    s.totalPct += t.realized_pnl_pct;
    bySymbol.set(t.symbol, s);
  }
  const symbolRows = Array.from(bySymbol.entries()).sort((a, b) => b[1].totalPct - a[1].totalPct);

  const visible = trades.slice(0, showCount);
  const hasMore = trades.length > showCount;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.description}</div>
      </div>

      <AgentSubNav id={id} accent={agent.accent} active="trades" />

      {loadError ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Couldn&apos;t load trades: {loadError}</div>
      ) : trades.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "30px 0" }}>
          No closed trades yet for {agent.label}. Once it sells or covers a position, every realized trade
          lands here — newest first, with its P/L and the reasoning behind the exit.
        </div>
      ) : (
        <>
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
              marginBottom: 20,
            }}
          >
            <StatTile label="CLOSED TRADES" value={String(stats.closedTrades)} />
            <StatTile
              label="WIN RATE"
              value={stats.winRate == null ? "—" : `${stats.winRate.toFixed(0)}%`}
              color={stats.winRate == null ? undefined : stats.winRate >= 50 ? "var(--accent-buy)" : "var(--accent-sell)"}
            />
            <StatTile label="AVG WIN" value={fmtStatPct(stats.avgWinPct)} color="var(--accent-buy)" />
            <StatTile label="AVG LOSS" value={fmtStatPct(stats.avgLossPct)} color="var(--accent-sell)" />
            <StatTile
              label="PROFIT FACTOR"
              value={fmtRatio(stats.profitFactor)}
              color={
                stats.profitFactor == null
                  ? undefined
                  : stats.profitFactor >= 1
                    ? "var(--accent-buy)"
                    : "var(--accent-sell)"
              }
            />
            <StatTile
              label="EXPECTANCY"
              value={fmtStatPct(stats.expectancyPct)}
              color={
                stats.expectancyPct == null
                  ? undefined
                  : stats.expectancyPct >= 0
                    ? "var(--accent-buy)"
                    : "var(--accent-sell)"
              }
            />
          </div>

          {symbolRows.length > 1 ? (
            <details style={{ marginBottom: 20 }}>
              <summary
                style={{
                  fontSize: 11,
                  letterSpacing: "0.05em",
                  color: "var(--text-faint)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                BY SYMBOL — CUMULATIVE REALIZED P/L ({symbolRows.length} symbols)
              </summary>
              <div
                className="card"
                style={{
                  marginTop: 10,
                  border: "1px solid var(--border-hairline)",
                  borderRadius: 10,
                  background: "var(--bg-surface)",
                  padding: "6px 14px",
                }}
              >
                {symbolRows.map(([symbol, s]) => (
                  <div
                    key={symbol}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      padding: "7px 0",
                      borderBottom: "1px solid var(--border-hairline)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600, minWidth: 76 }}>{symbol}</span>
                    <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
                      {s.trades} trade{s.trades === 1 ? "" : "s"} · {Math.round((s.wins / s.trades) * 100)}% won
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontWeight: 700,
                        color: pnlColor(s.totalPct),
                      }}
                    >
                      {fmtPnl(s.totalPct)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10 }}>
            {trades.length} closed trade{trades.length === 1 ? "" : "s"} · realized P/L is per trade, as a % of
            the position · tap a row for the exit reasoning
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map((t) => (
              <TradeRow key={t.id} trade={t} />
            ))}
          </div>

          {hasMore ? (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <Link
                href={`/agent/${id}/trades?show=${showCount + 50}`}
                style={{ fontSize: 13, color: agent.accent, textDecoration: "none" }}
              >
                Show more ({trades.length - showCount} older)
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
