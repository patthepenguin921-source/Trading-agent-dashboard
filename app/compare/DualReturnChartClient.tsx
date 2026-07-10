"use client";

import { useState } from "react";
import type { DailyAxis, PctSeriesPoint } from "./compare-helpers";
import { fmtPct, fmtShortDate } from "./compare-helpers";
import SlidingTabs from "../sliding-tabs";

// Time-of-day label in ET — the timezone every agent's trading day is
// defined in (schedule.py's market_phase uses ET boundaries).
function fmtTimeET(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

type ChartSeries = {
  id: string;
  label: string;
  color: string;
  points: PctSeriesPoint[];
  dashed?: boolean;
};

// One index/benchmark line (VTI, SPY, QQQ, ...). `series`/`seriesDaily` mirror
// the agent series shape: an all-time series and an optional "since day open"
// variant (latest day only, time-of-day xFrac) used by the daily mode tab.
export type BenchmarkDef = {
  id: string;
  label: string;
  color: string;
  series: PctSeriesPoint[];
  seriesDaily?: PctSeriesPoint[];
};

export type ChartMode = "alltime" | "daily";

export function DualReturnChart({
  seriesByAgent,
  agentIds,
  colors,
  labels,
  benchmarks = [],
  daySlots,
  seriesByAgentDaily,
  dailyAxis,
  mode: modeProp,
  onModeChange,
}: {
  seriesByAgent: Record<string, PctSeriesPoint[]>;
  agentIds: string[];
  colors: Record<string, string>;
  labels: Record<string, string>;
  benchmarks?: BenchmarkDef[];
  daySlots?: string[];
  seriesByAgentDaily?: Record<string, PctSeriesPoint[]>;
  // Time window of the single day shown by the "Since day open" tab —
  // drives that mode's time-of-day x-axis and the date chip next to the tabs.
  dailyAxis?: DailyAxis;
  // Optionally controlled (see ChartModeView): a parent that also needs to
  // know the active mode — to swap the stats below the chart in step with
  // the tabs — passes both. Omit both and the chart manages its own state,
  // exactly as before.
  mode?: ChartMode;
  onModeChange?: (mode: ChartMode) => void;
}) {
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);
  const [internalMode, setInternalMode] = useState<ChartMode>("alltime");
  const mode = modeProp ?? internalMode;
  const setMode = (m: ChartMode) => {
    if (modeProp === undefined) setInternalMode(m);
    onModeChange?.(m);
  };

  // Pick the active series set based on mode. In daily mode a missing daily
  // series means "nothing to draw" (handled by the empty state below) — never
  // silently fall back to the all-time series under a "Since day open" label.
  const activeSeriesByAgent = mode === "daily" ? (seriesByAgentDaily ?? {}) : seriesByAgent;

  const allSeries: ChartSeries[] = agentIds.map((id) => ({
    id,
    label: labels[id] ?? id,
    color: colors[id],
    points: activeSeriesByAgent[id] || [],
  }));
  for (const b of benchmarks) {
    const points = mode === "daily" ? (b.seriesDaily ?? []) : b.series;
    if (points && points.length >= 2) {
      allSeries.push({
        id: `__benchmark_${b.id}`,
        label: b.label,
        color: b.color,
        points,
        dashed: true,
      });
    }
  }

  const hasEnoughData = allSeries.some((s) => s.points.length >= 2);

  const w = 640;
  const h = 280;
  const padLeft = 44;
  const padRight = 8;
  const padTop = 12;
  const padBottom = 32;  // slightly taller to fit date labels + tick marks
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const allValues = allSeries.flatMap((s) => s.points.map((p) => p.pct));
  const rawMin = Math.min(0, ...allValues);
  const rawMax = Math.max(0, ...allValues);
  const pad = Math.max((rawMax - rawMin) * 0.08, 0.5);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const y = (v: number) => padTop + plotH - ((v - min) / range) * plotH;
  const x = (xFrac: number) => padLeft + xFrac * plotW;

  // Every series carries its own xFrac (0..1) computed upstream — run-index
  // fraction for agents, calendar-time fraction for the benchmark — so the
  // renderer doesn't need to know which kind of series it's drawing.
  const linesBySeries = allSeries.map((s) => ({
    ...s,
    polyline: s.points.map((p) => `${x(p.xFrac).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" "),
  }));

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => min + (range * i) / (yTickCount - 1));

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const frac = (relX - padLeft) / plotW;
    setHoverFrac(Math.max(0, Math.min(1, frac)));
  }

  // Touch scrubbing (the Robinhood gesture): capture the pointer on touch so
  // dragging a finger across the plot moves the crosshair instead of
  // scrolling the page — touch-action: none on the overlay rect makes the
  // browser hand us the gesture. The readout clears on lift; mouse hover
  // behaves exactly as before.
  function handleDown(e: React.PointerEvent<SVGRectElement>) {
    if (e.pointerType !== "mouse") {
      e.currentTarget.setPointerCapture(e.pointerId);
      handleMove(e);
    }
  }

  function handleUp(e: React.PointerEvent<SVGRectElement>) {
    if (e.pointerType !== "mouse") setHoverFrac(null);
  }

  // For a given hover fraction, find the point in this series whose xFrac
  // is closest — works regardless of how that series is spaced internally.
  function nearestPoint(points: PctSeriesPoint[]) {
    if (points.length === 0 || hoverFrac == null) return null;
    let best = points[0];
    let bestDist = Math.abs(best.xFrac - hoverFrac);
    for (const p of points) {
      const d = Math.abs(p.xFrac - hoverFrac);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }

  const MODE_TABS: { key: ChartMode; label: string; desc: string }[] = [
    { key: "alltime", label: "Since first log",  desc: "Cumulative % from each agent\'s very first run" },
    { key: "daily",   label: "Since day open",   desc: "% return from the latest day\'s opening — that one day only, on a time-of-day axis" },
  ];

  // Tabs render even when the active mode has no drawable data — otherwise
  // switching into an empty mode would remove the tabs and strand the user.
  // Same sliding-pill control as the agent sub-nav: tap, or drag the pill
  // between the two modes and it snaps on release.
  const tabsRow = (
    <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
      <SlidingTabs
        tabs={MODE_TABS.map(({ key, label, desc }) => ({ key, label, title: desc }))}
        activeKey={mode}
        indicatorColor="var(--accent-focus)"
        activeTextColor="var(--bg-base)"
        compact
        onSelect={(key) => {
          setMode(key as ChartMode);
          setHoverFrac(null);
        }}
      />
      {mode === "daily" && dailyAxis ? (
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-faint)", marginLeft: 4 }}>
          {fmtShortDate(dailyAxis.dateStr)} · times ET
        </span>
      ) : null}
    </div>
  );

  if (!hasEnoughData) {
    return (
      <div>
        {tabsRow}
        <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "12px 0" }}>
          {mode === "daily"
            ? "No readings logged yet for the latest day — check back once today's runs start."
            : "Not enough history yet for a comparison chart."}
        </div>
      </div>
    );
  }

  return (
    <div>
      {tabsRow}
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        // pan-y: vertical swipes still scroll the page, but horizontal touch
        // moves stay ours for scrubbing. Must live on the SVG root — Chromium
        // ignores touch-action on inner SVG elements and pointercancels the
        // scrub as soon as it decides the finger is scrolling.
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible", touchAction: "pan-y" }}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              x2={w - padRight}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border-hairline)"
              strokeWidth={1}
              strokeDasharray={Math.abs(v) < 1e-9 ? undefined : "2,4"}
              opacity={Math.abs(v) < 1e-9 ? 1 : 0.5}
            />
            <text
              x={padLeft - 8}
              y={y(v)}
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--text-faint)"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {v >= 0 ? "+" : ""}
              {v.toFixed(1)}%
            </text>
          </g>
        ))}

        {linesBySeries.map(({ id, polyline, color, dashed }) => (
          <polyline
            key={id}
            points={polyline}
            fill="none"
            stroke={color}
            strokeWidth={dashed ? 1.75 : 2.5}
            strokeDasharray={dashed ? "5,4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            className="chart-line-draw"
          />
        ))}

        {hoverFrac != null && (
          <line
            x1={x(hoverFrac)}
            x2={x(hoverFrac)}
            y1={padTop}
            y2={padTop + plotH}
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="3,3"
            className="chart-cursor-fade"
          />
        )}

        {hoverFrac != null &&
          linesBySeries.map(({ id, points, color }) => {
            const p = nearestPoint(points);
            if (!p) return null;
            return (
              <circle key={id} cx={x(p.xFrac)} cy={y(p.pct)} r={3.5} fill={color} stroke="var(--bg-surface)" strokeWidth={1.5} className="chart-dot-pop" />
            );
          })}

        {/* X-axis labels.
            Daily mode (dailyAxis prop): the chart spans one single day, so the
            axis is time-of-day — 5 evenly spaced ET clock times across the
            day's first-to-last reading window.
            Day-slot mode (daySlots prop): one centered label per calendar day at
            (i + 0.5) / n. Slot-boundary tick marks at i / n separate the days.
            Fallback: 5 evenly-spaced nearest-point labels (pre-day-slot behaviour). */}
        {(() => {
          if (mode === "daily" && dailyAxis) {
            return [0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const ms = dailyAxis.startMs + frac * (dailyAxis.endMs - dailyAxis.startMs);
              const xPos = x(frac);
              const anchor = frac === 0 ? "start" : frac === 1 ? "end" : "middle";
              return (
                <g key={frac}>
                  <line x1={xPos} x2={xPos} y1={padTop + plotH} y2={padTop + plotH + 5}
                    stroke="var(--border-hairline)" strokeWidth={1} />
                  <text x={xPos} y={h - 5} fontSize={9} fontFamily="var(--font-mono)"
                    fill="var(--text-faint)" textAnchor={anchor}>
                    {fmtTimeET(ms)}
                  </text>
                </g>
              );
            });
          }

          if (daySlots && daySlots.length >= 2) {
            const n = daySlots.length;
            const firstYear = new Date(daySlots[0] + "T12:00:00Z").getFullYear();
            const lastYear  = new Date(daySlots[n - 1] + "T12:00:00Z").getFullYear();
            const showYear  = firstYear !== lastYear;
            // When there are many slots, only show ~5 evenly-spaced labels so
            // they don't overlap. Always include first and last slot.
            const maxLabels = 5;
            const labelSlots = new Set<number>(
              n <= maxLabels
                ? daySlots.map((_, i) => i)
                : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)))
            );
            return daySlots.map((dateStr, i) => {
              const showLabel = labelSlots.has(i);
              const d      = new Date(dateStr + "T12:00:00Z");
              const midX   = x((i + 0.5) / n);
              const leftX  = x(i / n);
              const base   = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const label  = base + (showYear && (i === 0 || d.getFullYear() !== firstYear)
                ? " '" + String(d.getFullYear()).slice(2) : "");
              const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
              return (
                <g key={dateStr}>
                  {i > 0 && (
                    <line x1={leftX} x2={leftX} y1={padTop + plotH} y2={padTop + plotH + 5}
                      stroke="var(--border-hairline)" strokeWidth={1} opacity={0.4} />
                  )}
                  {showLabel && (
                    <text x={midX} y={h - 5} fontSize={9} fontFamily="var(--font-mono)"
                      fill="var(--text-faint)" textAnchor={anchor}>
                      {label}
                    </text>
                  )}
                </g>
              );
            });
          }

          // Fallback: use nearest-point approach when no daySlots provided.
          // Picks whichever series (agent or benchmark) has the most points
          // as the reference for date labels.
          const refPts = linesBySeries.reduce(
            (best, s) => (s.points.length > best.points.length ? s : best),
            linesBySeries[0]
          ).points;
          if (!refPts || refPts.length < 2) return null;
          const firstYear = new Date(refPts[0].runAt).getFullYear();
          const lastYear  = new Date(refPts[refPts.length - 1].runAt).getFullYear();
          const showYear  = firstYear !== lastYear;
          function nearestDate(frac: number): string {
            let best = refPts[0];
            let bestDist = Math.abs(best.xFrac - frac);
            for (const p of refPts) {
              const d = Math.abs(p.xFrac - frac);
              if (d < bestDist) { best = p; bestDist = d; }
            }
            return best.runAt.slice(0, 10);
          }
          function fmtTick(iso: string, frac: number): string {
            const d = new Date(iso + "T12:00:00Z");
            const base = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            if (showYear && (frac === 0 || d.getFullYear() !== firstYear)) {
              return base + " '" + String(d.getFullYear()).slice(2);
            }
            return base;
          }
          return [0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const iso  = nearestDate(frac);
            const xPos = x(frac);
            const anchor = frac === 0 ? "start" : frac === 1 ? "end" : "middle";
            return (
              <g key={frac}>
                <line x1={xPos} x2={xPos} y1={padTop + plotH} y2={padTop + plotH + 5}
                  stroke="var(--border-hairline)" strokeWidth={1} />
                <text x={xPos} y={h - 5} fontSize={9} fontFamily="var(--font-mono)"
                  fill="var(--text-faint)" textAnchor={anchor}>
                  {fmtTick(iso, frac)}
                </text>
              </g>
            );
          });
        })()}

        <rect
          x={padLeft}
          y={padTop}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerLeave={() => setHoverFrac(null)}
        />
      </svg>

      {hoverFrac != null ? (
        <div
          className="chart-tooltip-pop"
          style={{
            position: "absolute",
            top: 4,
            right: 0,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            minWidth: 150,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {linesBySeries.map(({ id, label, color, points }) => {
            const p = nearestPoint(points);
            return (
              <div key={id} style={{ padding: "2px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
                    {label}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: !p ? "var(--text-faint)" : p.pct >= 0 ? "var(--accent-buy)" : "var(--accent-sell)",
                    }}
                  >
                    {p ? fmtPct(p.pct) : "—"}
                  </span>
                </div>
                {p ? (
                  <div style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                    {mode === "daily" && p.runAt.includes("T")
                      ? fmtTimeET(Date.parse(p.runAt)) + " ET"
                      : fmtShortDate(p.runAt.slice(0, 10))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
    </div>
  );
}
