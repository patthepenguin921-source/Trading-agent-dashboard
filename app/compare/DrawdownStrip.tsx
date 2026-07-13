// Small-multiple drawdown charts: per agent, % below the running equity
// peak over its whole history (0 = at a new high). Kept as separate small
// charts rather than a mode inside the main comparison chart — drawdown
// lines from four agents overlap illegibly, and small multiples make the
// shape of each agent's pain obvious. Server component, plain SVG.

import type { Run } from "../../lib/supabase";
import type { AgentMeta } from "../../lib/agents";

function drawdownSeries(runs: Run[]): number[] {
  const equity = [...runs]
    .reverse()
    .map((r) => r.account_equity)
    .filter((v): v is number => v != null);
  let peak = -Infinity;
  return equity.map((e) => {
    peak = Math.max(peak, e);
    return peak > 0 ? ((e - peak) / peak) * 100 : 0;
  });
}

function MiniDrawdown({ agent, values }: { agent: AgentMeta; values: number[] }) {
  const w = 220;
  const h = 56;
  const min = Math.min(-0.5, ...values); // never a zero-height axis
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * w;
  const y = (v: number) => (v / min) * (h - 2) + 1; // 0 at top, deepest at bottom
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `0,1 ${points} ${w},1`;
  const worst = Math.min(...values, 0);
  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        background: "var(--bg-surface)",
        padding: "12px 14px",
        flex: "1 1 220px",
        minWidth: 200,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: agent.accent }}>{agent.label}</span>
        <span style={{ fontSize: 11, color: "var(--accent-sell)" }} title="Deepest peak-to-trough drawdown">
          worst {worst.toFixed(2)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 56 }}>
        <polygon points={area} fill="var(--accent-sell-dim)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent-sell)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export default function DrawdownStrip({
  agents,
  runsByAgent,
}: {
  agents: AgentMeta[];
  runsByAgent: Record<string, Run[]>;
}) {
  const items = agents
    .map((agent) => ({ agent, values: drawdownSeries(runsByAgent[agent.id] ?? []) }))
    .filter((x) => x.values.length >= 3);
  if (items.length === 0) return null;
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: "0.05em", color: "var(--text-faint)", margin: "0 0 10px" }}>
        DRAWDOWN — % BELOW RUNNING EQUITY PEAK (WHOLE HISTORY)
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {items.map(({ agent, values }) => (
          <MiniDrawdown key={agent.id} agent={agent} values={values} />
        ))}
      </div>
    </>
  );
}
