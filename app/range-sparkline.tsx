"use client";

import { useState } from "react";

// Agent-card sparkline with a range toggle (1D / 1W / all). The server
// component precomputes each range's equity series and passes them down;
// this stays a dumb client toggle with no data fetching of its own.
// Clicks stopPropagation/preventDefault because the whole card is a link.

export type SparkRange = { key: string; label: string; values: number[] };

export default function RangeSparkline({
  ranges,
  color,
  staggerIndex = 0,
}: {
  ranges: SparkRange[];
  color: string;
  staggerIndex?: number;
}) {
  const usable = ranges.filter((r) => r.values.length >= 2);
  const [active, setActive] = useState(usable.length ? usable[usable.length - 1].key : "");
  const current = usable.find((r) => r.key === active) ?? usable[usable.length - 1];

  if (!current) {
    return <div style={{ height: 48, fontSize: 11, color: "var(--text-faint)" }}>not enough data yet</div>;
  }

  const w = 100;
  const h = 32;
  const min = Math.min(...current.values);
  const max = Math.max(...current.values);
  const range = max - min || 1;
  const points = current.values
    .map((v, i) => {
      const x = (i / (current.values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = current.values[current.values.length - 1] >= current.values[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ display: "block", width: 96, height: 32 }}
      >
        <polyline
          key={current.key /* retrigger the draw-in when the range changes */}
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          className="sparkline-draw"
          style={{ ["--stagger-i" as string]: staggerIndex, opacity: rising ? 1 : 0.9 }}
        />
      </svg>
      {usable.length > 1 ? (
        <div style={{ display: "flex", gap: 2 }}>
          {usable.map((r) => (
            <button
              key={r.key}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActive(r.key);
              }}
              style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                color: r.key === current.key ? color : "var(--text-faint)",
                background:
                  r.key === current.key ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
