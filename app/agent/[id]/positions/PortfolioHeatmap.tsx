import type { Position } from "../../../../lib/supabase";
import { fmtMoney } from "../../../run-helpers";
import { getTickerName } from "../../../../lib/ticker-names";

type SizedItem = { symbol: string; value: number };
type Rect = SizedItem & { x: number; y: number; w: number; h: number };

// Recursive halving treemap: split the sorted-by-value list into two
// roughly value-equal halves, lay them side by side (or stacked) along
// whichever axis is currently longer, and recurse. Simpler than a fully
// squarified treemap but avoids sliver tiles for the handful of holdings
// a single agent typically carries, with no risk of an infinite-recursion
// or division-by-zero edge case a general squarify implementation invites.
function layoutTreemap(items: SizedItem[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], x, y, w, h }];

  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];

  const half = total / 2;
  let cumulative = 0;
  let splitIndex = 1;
  for (let i = 0; i < items.length; i++) {
    cumulative += items[i].value;
    if (cumulative >= half) {
      splitIndex = i + 1;
      break;
    }
  }
  splitIndex = Math.min(Math.max(splitIndex, 1), items.length - 1);

  const groupA = items.slice(0, splitIndex);
  const groupB = items.slice(splitIndex);
  const fracA = groupA.reduce((s, i) => s + i.value, 0) / total;

  if (w >= h) {
    const wA = w * fracA;
    return [...layoutTreemap(groupA, x, y, wA, h), ...layoutTreemap(groupB, x + wA, y, w - wA, h)];
  }
  const hA = h * fracA;
  return [...layoutTreemap(groupA, x, y, w, hA), ...layoutTreemap(groupB, x, y + hA, w, h - hA)];
}

// How big a move (in % unrealized P/L) counts as "fully saturated" color —
// tiles beyond this just clamp to the same max tint rather than going
// unreadably dark/neon.
const INTENSITY_CAP_PCT = 8;

function tileColor(pct: number | null | undefined): string {
  const base = "var(--bg-surface-2)";
  if (pct == null || Number.isNaN(pct) || pct === 0) return base;
  const accent = pct > 0 ? "var(--accent-buy)" : "var(--accent-sell)";
  const intensity = Math.min(Math.abs(pct) / INTENSITY_CAP_PCT, 1);
  const mixPct = 20 + intensity * 60;
  return `color-mix(in srgb, ${accent} ${mixPct}%, ${base})`;
}

export function PortfolioHeatmap({ positions, totalMarketValue }: { positions: Position[]; totalMarketValue: number }) {
  if (positions.length === 0 || totalMarketValue <= 0) return null;

  // Biggest holdings first — same ordering convention as the pie chart's
  // legend, and it keeps the treemap split stable (ties don't shuffle tiles).
  const sized = positions
    .map((p) => ({ symbol: p.symbol, value: Math.abs(p.market_value ?? 0), position: p }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const positionBySymbol = Object.fromEntries(sized.map((i) => [i.symbol, i.position]));
  const tiles = layoutTreemap(
    sized.map(({ symbol, value }) => ({ symbol, value })),
    0,
    0,
    100,
    100
  );

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        padding: 18,
        background: "var(--bg-surface)",
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 12 }}>
        HOLDINGS SIZED BY EXPOSURE, TINTED BY UNREALIZED P/L
      </div>
      <div style={{ position: "relative", width: "100%", paddingBottom: "42%" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexWrap: "wrap" }}>
          {tiles.map((t) => {
            const position = positionBySymbol[t.symbol];
            const pct = position.unrealized_pl_pct;
            const plLabel = pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
            const plDollars =
              position.avg_entry_price != null && position.current_price != null
                ? (position.current_price - position.avg_entry_price) * position.qty
                : null;
            const sizePct = (Math.abs(position.market_value ?? 0) / totalMarketValue) * 100;
            const tickerName = getTickerName(t.symbol);
            const showLabel = t.w >= 10 && t.h >= 14;

            return (
              <div
                key={t.symbol}
                className="heatmap-tile"
                style={{
                  position: "absolute",
                  left: `${t.x}%`,
                  top: `${t.y}%`,
                  width: `${t.w}%`,
                  height: `${t.h}%`,
                  background: tileColor(pct),
                  border: "2px solid var(--bg-surface)",
                  boxSizing: "border-box",
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: 2,
                  }}
                >
                  {showLabel ? (
                    <>
                      <span
                        style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
                      >
                        {t.symbol}
                      </span>
                      <span
                        style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)", textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
                      >
                        {plLabel}
                      </span>
                    </>
                  ) : null}
                </div>

                <div className="heatmap-tooltip">
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {t.symbol}
                    {position.qty < 0 ? (
                      <span style={{ color: "var(--accent-short, var(--accent-sell))", fontWeight: 600 }}> · SHORT</span>
                    ) : null}
                    {tickerName ? <span style={{ fontWeight: 400, color: "var(--text-faint)" }}> · {tickerName}</span> : null}
                  </div>
                  <div>P/L: {plLabel}{plDollars != null ? ` (${plDollars >= 0 ? "+" : ""}${fmtMoney(plDollars)})` : ""}</div>
                  <div>Value: {fmtMoney(position.market_value)} · {sizePct.toFixed(1)}% of book</div>
                  <div>{Math.abs(position.qty)} sh @ {fmtMoney(position.avg_entry_price)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
