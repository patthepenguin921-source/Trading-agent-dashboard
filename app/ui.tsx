// Shared presentational primitives — the small set of visual patterns that
// were previously re-implemented inline on every page (bordered surface,
// labeled stat, colored chip, section heading, signed P/L text). Server-
// component friendly: no state, no handlers, so any page can use these
// without becoming a client component. Styling stays on the CSS variables
// defined in globals.css — this file adds no new design language, it just
// makes the existing one reusable.

import type { CSSProperties, ReactNode } from "react";

export function Card({
  children,
  padding = "16px 18px",
  style,
}: {
  children: ReactNode;
  padding?: string | number;
  style?: CSSProperties;
}) {
  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        background: "var(--bg-surface)",
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--text-faint)",
        margin: "26px 0 12px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 3 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || "var(--text-primary)" }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

// Colored chip. `tone` picks one of the semantic accent pairs from
// globals.css; pass `color` for an agent accent or anything custom.
export function Badge({
  children,
  tone,
  color,
  title,
}: {
  children: ReactNode;
  tone?: "buy" | "sell" | "hold" | "short";
  color?: string;
  title?: string;
}) {
  const fg = color || (tone ? `var(--accent-${tone})` : "var(--text-muted)");
  const bg = color
    ? `color-mix(in srgb, ${color} 12%, transparent)`
    : tone
      ? `var(--accent-${tone}-dim)`
      : "var(--bg-surface-2)";
  return (
    <span
      title={title}
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: 4,
        color: fg,
        background: bg,
        whiteSpace: "nowrap",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

// Signed percentage or dollar figure with the standard green/red/neutral
// coloring. Every page had its own copy of this ternary.
export function PnlText({
  value,
  kind = "pct",
  digits = 2,
  style,
}: {
  value: number | null | undefined;
  kind?: "pct" | "money";
  digits?: number;
  style?: CSSProperties;
}) {
  if (value == null) return <span style={{ color: "var(--text-faint)", ...style }}>—</span>;
  const color = value === 0 ? "var(--text-muted)" : value > 0 ? "var(--accent-buy)" : "var(--accent-sell)";
  const text =
    kind === "pct"
      ? `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`
      : `${value >= 0 ? "+" : ""}${value.toLocaleString("en-US", { style: "currency", currency: "USD" })}`;
  return <span style={{ color, fontWeight: 600, ...style }}>{text}</span>;
}

// Thin horizontal meter (used for stop-loss distance, allocation shares…).
// `fraction` is 0..1; overflow clamps.
export function MeterBar({
  fraction,
  color,
  height = 4,
  title,
}: {
  fraction: number;
  color: string;
  height?: number;
  title?: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div
      title={title}
      style={{
        height,
        borderRadius: height,
        background: "var(--bg-surface-2)",
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: height, background: color }} />
    </div>
  );
}

export function relativeTime(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
