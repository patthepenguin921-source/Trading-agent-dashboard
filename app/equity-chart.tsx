// Server-rendered SVG: % return since each agent's first snapshot, plus SPY.
type Pt = { t: number; v: number };
export type Line = { label: string; color: string; points: Pt[]; dashed?: boolean };

export default function EquityChart({ lines, height = 260 }: { lines: Line[]; height?: number }) {
  const W = 800, H = height, pad = { l: 48, r: 16, t: 16, b: 28 };
  const all = lines.flatMap((l) => l.points);
  if (all.length < 2) {
    return <div className="empty">The chart appears once snapshots start coming in (every 15 min during market hours).</div>;
  }
  const tMin = Math.min(...all.map((p) => p.t)), tMax = Math.max(...all.map((p) => p.t));
  let vMin = Math.min(0, ...all.map((p) => p.v)), vMax = Math.max(0, ...all.map((p) => p.v));
  if (vMax - vMin < 1) { vMax += 0.5; vMin -= 0.5; }
  const x = (t: number) => pad.l + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - vMin) / (vMax - vMin)) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: 5 }, (_, i) => vMin + ((vMax - vMin) * i) / 4);
  const dates = Array.from({ length: 4 }, (_, i) => tMin + ((tMax - tMin) * i) / 3);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Return since start">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={Math.abs(v) < 1e-9 ? "zero" : "grid"} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis">{v.toFixed(1)}%</text>
          </g>
        ))}
        {dates.map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="axis">
            {new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
          </text>
        ))}
        {lines.filter((l) => l.points.length > 1).map((l) => (
          <polyline key={l.label} fill="none" stroke={l.color} strokeWidth={2.2}
            strokeDasharray={l.dashed ? "5 5" : undefined} strokeLinejoin="round"
            points={l.points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} />
        ))}
      </svg>
      <figcaption className="legend">
        {lines.map((l) => {
          const last = l.points[l.points.length - 1];
          return (
            <span key={l.label}><i style={{ background: l.color }} />{l.label}{last ? ` ${last.v > 0 ? "+" : ""}${last.v.toFixed(2)}%` : ""}</span>
          );
        })}
      </figcaption>
    </figure>
  );
}

export function toReturnPoints(series: { taken_at: string; equity: number; spy_price: number | null }[]) {
  if (series.length === 0) return { mine: [], spy: [] };
  const base = Number(series[0].equity);
  const spyBase = Number(series.find((s) => s.spy_price)?.spy_price ?? 0);
  // Downsample to <= 400 points so the SVG stays light.
  const step = Math.max(1, Math.ceil(series.length / 400));
  const picked = series.filter((_, i) => i % step === 0 || i === series.length - 1);
  return {
    mine: picked.map((s) => ({ t: Date.parse(s.taken_at), v: (Number(s.equity) / base - 1) * 100 })),
    spy: spyBase
      ? picked.filter((s) => s.spy_price).map((s) => ({ t: Date.parse(s.taken_at), v: (Number(s.spy_price) / spyBase - 1) * 100 }))
      : [],
  };
}
