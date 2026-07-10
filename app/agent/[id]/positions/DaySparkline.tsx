import type { QuotePoint } from "../../../../lib/quotes";

export function DaySparkline({ points }: { points: QuotePoint[] }) {
  if (points.length < 2) {
    return (
      <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 10 }}>
        No intraday data yet today.
      </div>
    );
  }

  const w = 300;
  const h = 36;
  const pad = 2;

  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const dayPct = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
  const color = dayPct >= 0 ? "var(--accent-buy)" : "var(--accent-sell)";

  const toX = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const toY = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const path = points.map((p, i) => `${toX(i).toFixed(1)},${toY(p.close).toFixed(1)}`).join(" ");

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 9, letterSpacing: "0.06em", color: "var(--text-faint)" }}>TODAY · 5-MIN</span>
        <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: "var(--font-mono)" }}>
          {dayPct >= 0 ? "+" : ""}
          {dayPct.toFixed(2)}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: 30, display: "block" }}
        preserveAspectRatio="none"
      >
        <polyline
          points={path}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
