// Daily-return calendar: one row per agent, one cell per trading day,
// colored by that day's % change (last equity reading of the day vs the
// prior day's last). Server component — pure SVG-free markup, tooltips via
// title attributes. Answers "which days were good/bad, and did the agents
// have them together?" at a glance.

import type { Run } from "../../lib/supabase";
import type { AgentMeta } from "../../lib/agents";

function dailyCloses(runs: Run[]): Map<string, number> {
  const lastByDate = new Map<string, number>();
  for (const r of [...runs].reverse()) {
    if (r.account_equity != null) lastByDate.set(r.run_at.slice(0, 10), r.account_equity);
  }
  return lastByDate;
}

// Green/red intensity scaled to ±2% (a big day for a diversified paper
// account); beyond that it just saturates.
function cellColor(pct: number | null): string {
  if (pct == null) return "var(--bg-surface-2)";
  const t = Math.max(-1, Math.min(1, pct / 2));
  if (t >= 0) return `color-mix(in srgb, var(--accent-buy) ${Math.round(12 + t * 78)}%, var(--bg-surface-2))`;
  return `color-mix(in srgb, var(--accent-sell) ${Math.round(12 + -t * 78)}%, var(--bg-surface-2))`;
}

export default function CalendarHeatmap({
  agents,
  runsByAgent,
}: {
  agents: AgentMeta[];
  runsByAgent: Record<string, Run[]>;
}) {
  const allDates = new Set<string>();
  const closesByAgent: Record<string, Map<string, number>> = {};
  for (const agent of agents) {
    const closes = dailyCloses(runsByAgent[agent.id] ?? []);
    closesByAgent[agent.id] = closes;
    for (const d of closes.keys()) allDates.add(d);
  }
  const dates = [...allDates].sort();
  if (dates.length < 3) return null;

  // Daily % change per agent per date (vs the previous date that agent has
  // a close for — weekends/holidays just don't produce cells).
  const pctByAgent: Record<string, Map<string, number>> = {};
  for (const agent of agents) {
    const closes = closesByAgent[agent.id];
    const pcts = new Map<string, number>();
    let prev: number | null = null;
    for (const d of dates) {
      const close = closes.get(d);
      if (close == null) continue;
      if (prev != null && prev > 0) pcts.set(d, ((close - prev) / prev) * 100);
      prev = close;
    }
    pctByAgent[agent.id] = pcts;
  }

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        background: "var(--bg-surface)",
        padding: "14px 16px",
        marginBottom: 24,
        overflowX: "auto",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 10 }}>
        DAILY RETURNS — EACH CELL IS ONE DAY&apos;S % CHANGE
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 4, columnGap: 10, minWidth: dates.length * 16 + 80 }}>
        {agents.map((agent) => (
          <div key={agent.id} style={{ display: "contents" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: agent.accent, alignSelf: "center", whiteSpace: "nowrap" }}>
              {agent.label}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {dates.map((d) => {
                const pct = pctByAgent[agent.id].get(d) ?? null;
                return (
                  <div
                    key={d}
                    title={`${agent.label} · ${d}: ${pct == null ? "no data" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}`}
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: 3,
                      background: cellColor(pct),
                      flexShrink: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {/* Date axis: first day of each month + the last date, as sparse labels */}
        <div />
        <div style={{ display: "flex", gap: 3 }}>
          {dates.map((d, i) => {
            const isMonthStart = i === 0 || d.slice(0, 7) !== dates[i - 1].slice(0, 7);
            return (
              <div key={d} style={{ width: 13, flexShrink: 0, fontSize: 9, color: "var(--text-faint)", overflow: "visible", whiteSpace: "nowrap" }}>
                {isMonthStart ? d.slice(5) : ""}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
