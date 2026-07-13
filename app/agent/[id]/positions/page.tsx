import { notFound } from "next/navigation";
import { getPositions, getEntryDecisions, getOpenOrders, type Position, type EntryDecision, type OpenOrder } from "../../../../lib/supabase";
import { getAgentMeta } from "../../../../lib/agents";
import { fmtMoney, fmtTime } from "../../../run-helpers";
import AgentSubNav from "../../../agent-sub-nav";
import { getTickerName } from "../../../../lib/ticker-names";
import { sectorOf } from "../../../../lib/sectors";
import { Badge, MeterBar, SectionHeader } from "../../../ui";
import { AllocationView } from "./AllocationView";
import { DaySparkline } from "./DaySparkline";
import { fetchTodaySeries, type QuotePoint } from "../../../../lib/quotes";

function PositionCard({
  position,
  accent,
  todaySeries,
  entry,
  maxLossPct,
}: {
  position: Position;
  accent: string;
  todaySeries: QuotePoint[];
  entry?: EntryDecision;
  maxLossPct?: number;
}) {
  const isShort = position.qty < 0;
  const pl = position.unrealized_pl_pct;
  const plColor = pl === null || pl === undefined || pl === 0 ? "var(--text-muted)" : pl > 0 ? "var(--accent-buy)" : "var(--accent-sell)";
  // Dollar P/L alongside the % — cost basis vs current market value. qty is
  // already signed (negative for a short), so this comes out correctly
  // signed for either side without a separate short-case formula.
  const plDollars =
    position.avg_entry_price != null && position.current_price != null
      ? (position.current_price - position.avg_entry_price) * position.qty
      : null;

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        padding: "14px 16px",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{position.symbol}</span>
          {isShort ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "2px 6px",
                borderRadius: 4,
                color: "var(--accent-short)",
                background: "var(--accent-short-dim)",
              }}
            >
              SHORT
            </span>
          ) : null}
          {getTickerName(position.symbol) ? (
            <span
              style={{
                fontSize: 12,
                color: "var(--text-faint)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {getTickerName(position.symbol)}
            </span>
          ) : null}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
          <Badge>{sectorOf(position.symbol)}</Badge>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{Math.abs(position.qty)} sh</span>
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 16px",
          marginTop: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>
            {isShort ? "SHORTED @" : "BOUGHT @"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtMoney(position.avg_entry_price)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>CURRENT</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtMoney(position.current_price)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>P/L</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: plColor }}>
            {pl == null ? "—" : `${pl >= 0 ? "+" : ""}${pl.toFixed(2)}%`}
            {plDollars != null ? (
              <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6 }}>
                ({plDollars >= 0 ? "+" : ""}
                {fmtMoney(plDollars)})
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>MARKET VALUE</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtMoney(position.market_value)}</div>
        </div>
      </div>

      <DaySparkline points={todaySeries} />

      {entry?.reasoning ? (
        <details style={{ marginTop: 10 }}>
          <summary
            style={{
              fontSize: 11,
              letterSpacing: "0.05em",
              color: "var(--text-faint)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            WHY THE AGENT {isShort ? "SHORTED" : "BOUGHT"} · {fmtTime(entry.created_at)}
          </summary>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--text-muted)",
              margin: "8px 0 0",
              borderLeft: "2px solid var(--border-hairline)",
              paddingLeft: 12,
            }}
          >
            {entry.reasoning}
            {entry.confidence ? (
              <span style={{ color: "var(--text-faint)" }}> — {entry.confidence} confidence at entry</span>
            ) : null}
          </p>
        </details>
      ) : null}

      {maxLossPct != null && pl != null && pl < 0 ? (
        <div style={{ marginTop: 12 }} title={`Code-enforced stop-loss backstop closes this position at -${(maxLossPct * 100).toFixed(0)}%`}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 3 }}>
            <span>DISTANCE TO STOP-LOSS BACKSTOP</span>
            <span>
              {pl.toFixed(1)}% / -{(maxLossPct * 100).toFixed(0)}%
            </span>
          </div>
          <MeterBar
            fraction={Math.abs(pl) / (maxLossPct * 100)}
            color={Math.abs(pl) / (maxLossPct * 100) > 0.75 ? "var(--accent-sell)" : "var(--accent-hold)"}
          />
        </div>
      ) : null}

      <div style={{ height: 3, borderRadius: 2, background: accent, opacity: 0.5, marginTop: 12 }} />
    </div>
  );
}

export default async function PositionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentMeta(id);
  if (!agent) notFound();

  let positions: Position[] = [];
  let openOrders: OpenOrder[] = [];
  let loadError: string | null = null;
  try {
    [positions, openOrders] = await Promise.all([getPositions(id), getOpenOrders(id)]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  // Gross exposure (sum of absolute values), not net — a short's market_value
  // is negative, and netting long/short together could understate total
  // exposure or even hit zero (hiding the pie chart) for a hedged portfolio.
  const totalMarketValue = positions.reduce((sum, p) => sum + Math.abs(p.market_value ?? 0), 0);
  const snapshotAt = positions[0]?.snapshot_at;

  const entryBySymbol = await getEntryDecisions(
    id,
    positions.map((p) => p.symbol)
  );

  const todaySeriesBySymbol: Record<string, QuotePoint[]> = {};
  if (positions.length > 0) {
    const results = await Promise.all(
      positions.map(async (p) => {
        try {
          return [p.symbol, await fetchTodaySeries(p.symbol)] as const;
        } catch {
          // One symbol's chart data being unavailable shouldn't take down
          // the rest of the page — just show that card without a sparkline.
          return [p.symbol, [] as QuotePoint[]] as const;
        }
      })
    );
    for (const [symbol, series] of results) todaySeriesBySymbol[symbol] = series;
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.description}</div>
      </div>

      <AgentSubNav id={id} accent={agent.accent} active="positions" />

      {loadError ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Couldn&apos;t load positions: {loadError}</div>
      ) : positions.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "30px 0" }}>
          No open positions right now. Either nothing&apos;s been bought yet, or every order placed so far is
          still pending and hasn&apos;t filled — check the log for pending orders.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
              fontSize: 12,
              color: "var(--text-faint)",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <span>
              {positions.length} position{positions.length === 1 ? "" : "s"} · {fmtMoney(totalMarketValue)} total
              exposure
            </span>
            {snapshotAt ? (
              <span>
                as of{" "}
                {new Date(snapshotAt).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                ET
              </span>
            ) : null}
          </div>

          <AllocationView positions={positions} totalMarketValue={totalMarketValue} accent={agent.accent} />

          <SectorBreakdown positions={positions} totalMarketValue={totalMarketValue} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {positions.map((p) => (
              <PositionCard
                key={p.id}
                position={p}
                accent={agent.accent}
                todaySeries={todaySeriesBySymbol[p.symbol] || []}
                entry={entryBySymbol[p.symbol]}
                maxLossPct={agent.maxPositionLossPct}
              />
            ))}
          </div>
        </>
      )}

      <OpenOrdersSection orders={openOrders} accent={agent.accent} />
    </div>
  );
}

// Exposure per correlation bucket (lib/sectors.ts — same buckets the trading
// agent's sector-concentration cap uses), so "diversified across 8 tickers
// that are all one crypto bet" is visible at a glance.
function SectorBreakdown({ positions, totalMarketValue }: { positions: Position[]; totalMarketValue: number }) {
  if (positions.length < 2 || totalMarketValue <= 0) return null;
  const bySector = new Map<string, number>();
  for (const p of positions) {
    const s = sectorOf(p.symbol);
    bySector.set(s, (bySector.get(s) ?? 0) + Math.abs(p.market_value ?? 0));
  }
  const rows = [...bySector.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        background: "var(--bg-surface)",
        padding: "12px 16px",
        marginBottom: 16,
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      {rows.map(([sector, value]) => (
        <span key={sector} style={{ fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{sector}</span>{" "}
          {((value / totalMarketValue) * 100).toFixed(0)}%
        </span>
      ))}
    </div>
  );
}

// The agent's currently open (unfilled) orders — mostly GTC limit orders it
// placed as price targets. These reserve shares/cash while they sit, and
// until agent_open_orders existed they were invisible outside the run log.
function OpenOrdersSection({ orders, accent }: { orders: OpenOrder[]; accent: string }) {
  if (orders.length === 0) return null;
  const snapshotAt = orders[0].snapshot_at;
  return (
    <>
      <SectionHeader>
        Open (unfilled) orders · {orders.length} · as of{" "}
        {new Date(snapshotAt).toLocaleString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}{" "}
        ET
      </SectionHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {orders.map((o) => (
          <div
            key={o.id}
            className="card"
            style={{
              border: "1px solid var(--border-hairline)",
              borderRadius: 10,
              background: "var(--bg-surface)",
              padding: "10px 14px",
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              flexWrap: "wrap",
              fontSize: 13,
            }}
          >
            <Badge tone={o.side === "buy" ? "buy" : "sell"}>
              {o.side ?? "?"} {o.order_type ?? ""}
            </Badge>
            <span style={{ fontWeight: 700 }}>{o.symbol}</span>
            {o.qty != null ? <span style={{ color: "var(--text-muted)" }}>{o.qty} sh</span> : null}
            {o.notional != null ? <span style={{ color: "var(--text-muted)" }}>{fmtMoney(o.notional)}</span> : null}
            {o.limit_price != null ? (
              <span style={{ color: accent }}>limit {fmtMoney(o.limit_price)}</span>
            ) : null}
            {o.age_minutes != null ? (
              <span style={{ marginLeft: "auto", fontSize: 11, color: o.age_minutes > 480 ? "var(--accent-hold)" : "var(--text-faint)" }}>
                working {o.age_minutes < 60 ? `${Math.round(o.age_minutes)}m` : `${(o.age_minutes / 60).toFixed(1)}h`}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
