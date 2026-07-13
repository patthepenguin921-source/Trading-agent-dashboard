"use client";

import { useState } from "react";
import Link from "next/link";

// Sortable cross-agent scoreboard. Rows are fully computed server-side
// (page.tsx) — this component only sorts and renders them.

export type LeaderboardRow = {
  id: string;
  label: string;
  accent: string;
  returnPct: number | null;
  todayPct: number | null;
  sharpe: number | null;
  profitFactor: number | null;
  winRate: number | null;
  maxDrawdownPct: number;
  closedTrades: number;
};

type SortKey = keyof Omit<LeaderboardRow, "id" | "label" | "accent">;

const COLUMNS: { key: SortKey; label: string; fmt: (r: LeaderboardRow) => string; color?: (r: LeaderboardRow) => string | undefined }[] = [
  {
    key: "returnPct",
    label: "Return",
    fmt: (r) => (r.returnPct == null ? "—" : `${r.returnPct >= 0 ? "+" : ""}${r.returnPct.toFixed(2)}%`),
    color: (r) => (r.returnPct == null || r.returnPct === 0 ? undefined : r.returnPct > 0 ? "var(--accent-buy)" : "var(--accent-sell)"),
  },
  {
    key: "todayPct",
    label: "Today",
    fmt: (r) => (r.todayPct == null ? "—" : `${r.todayPct >= 0 ? "+" : ""}${r.todayPct.toFixed(2)}%`),
    color: (r) => (r.todayPct == null || r.todayPct === 0 ? undefined : r.todayPct > 0 ? "var(--accent-buy)" : "var(--accent-sell)"),
  },
  { key: "sharpe", label: "Sharpe", fmt: (r) => (r.sharpe == null ? "—" : r.sharpe.toFixed(2)) },
  {
    key: "profitFactor",
    label: "P. factor",
    fmt: (r) => (r.profitFactor == null ? "—" : r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2)),
    color: (r) => (r.profitFactor == null ? undefined : r.profitFactor >= 1 ? "var(--accent-buy)" : "var(--accent-sell)"),
  },
  { key: "winRate", label: "Win rate", fmt: (r) => (r.winRate == null ? "—" : `${r.winRate.toFixed(0)}%`) },
  {
    key: "maxDrawdownPct",
    label: "Max DD",
    fmt: (r) => `${r.maxDrawdownPct.toFixed(2)}%`,
    color: () => "var(--accent-sell)",
  },
  { key: "closedTrades", label: "Closed", fmt: (r) => String(r.closedTrades) },
];

export default function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("returnPct");
  const [asc, setAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of direction
    if (bv == null) return -1;
    return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        background: "var(--bg-surface)",
        padding: "6px 0",
        marginBottom: 24,
        overflowX: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)", fontWeight: 600, padding: "8px 14px" }}>
              AGENT
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                style={{
                  textAlign: "right",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  color: c.key === sortKey ? "var(--text-primary)" : "var(--text-faint)",
                  fontWeight: 600,
                  padding: "8px 14px",
                  cursor: "pointer",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
                title="Click to sort"
              >
                {c.label.toUpperCase()}
                {c.key === sortKey ? (asc ? " ↑" : " ↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id} style={{ borderTop: "1px solid var(--border-hairline)" }}>
              <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-faint)", marginRight: 8 }}>{i + 1}</span>
                <Link href={`/agent/${r.id}`} style={{ color: r.accent, fontWeight: 700, textDecoration: "none" }}>
                  {r.label}
                </Link>
              </td>
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: "right",
                    padding: "9px 14px",
                    fontWeight: c.key === sortKey ? 700 : 500,
                    color: c.color?.(r) ?? "var(--text-primary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.fmt(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
