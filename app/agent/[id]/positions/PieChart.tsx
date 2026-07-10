import type { Position } from "../../../../lib/supabase";
import { fmtMoney } from "../../../run-helpers";
import { getTickerName } from "../../../../lib/ticker-names";

// Categorical palette, picked for mutual distinctiveness on the dark
// theme rather than tying to any single accent — there can be more
// holdings than the site has existing accent colors for. Cycles if a
// portfolio somehow exceeds its length.
const SLICE_COLORS = [
  "#34d399", // green
  "#fb7185", // rose
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#38bdf8", // sky
  "#f472b6", // pink
  "#facc15", // yellow
  "#4ade80", // mint
  "#fb923c", // orange
  "#c084fc", // purple
  "#2dd4bf", // teal
  "#94a3b8", // slate (fallback / "other")
];

type Slice = {
  symbol: string;
  marketValue: number;
  pct: number;
  color: string;
};

export function PortfolioPieChart({ positions, totalMarketValue }: { positions: Position[]; totalMarketValue: number }) {
  if (positions.length === 0 || totalMarketValue <= 0) return null;

  // getPositions() already orders by market_value.desc, so slices come out
  // biggest-first both in the ring (starting at 12 o'clock, clockwise) and
  // in the legend below it. Uses absolute value so a short (negative
  // market_value) still gets a normal positive-sized slice — this chart is
  // gross exposure by holding, not net direction (which the SHORT badge on
  // each position card already conveys).
  const slices: Slice[] = positions.map((p, i) => ({
    symbol: p.symbol,
    marketValue: Math.abs(p.market_value ?? 0),
    pct: (Math.abs(p.market_value ?? 0) / totalMarketValue) * 100,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 56;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;
  const arcs = slices.map((s) => {
    const len = (s.pct / 100) * circumference;
    const dashoffset = -cumulative;
    cumulative += len;
    return { ...s, len, dashoffset };
  });

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        padding: 18,
        background: "var(--bg-surface)",
        marginBottom: 16,
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {arcs.map((a) => (
              <circle
                key={a.symbol}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${a.len} ${circumference - a.len}`}
                strokeDashoffset={a.dashoffset}
              />
            ))}
          </g>
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>TOTAL</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{fmtMoney(totalMarketValue)}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 2 }}>
          ALLOCATION BY HOLDING
        </div>
        {arcs.map((a) => (
          <div key={a.symbol} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{a.symbol}</span>
            <span
              style={{
                color: "var(--text-faint)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}
            >
              {getTickerName(a.symbol) ?? ""}
            </span>
            <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{a.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
