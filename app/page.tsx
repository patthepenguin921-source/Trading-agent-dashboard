import Link from "next/link";
import { getRuns, getAccountState, type Run, type AccountState } from "../lib/supabase";
import { getAllAgents, type AgentMeta } from "../lib/agents";
import { fmtMoney, fmtTime, isSameEtDay, tradeCount } from "./run-helpers";
import EquityRefresher from "./equity-refresher";
import AnimatedNumber from "./animated-number";
import { filterEquityAnomalies } from "./compare/compare-helpers";

function Sparkline({ values, color, staggerIndex = 0 }: { values: number[]; color: string; staggerIndex?: number }) {
  if (values.length < 2) {
    return <div style={{ height: 32, fontSize: 11, color: "var(--text-faint)" }}>not enough data yet</div>;
  }
  const w = 100;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: "block", width: 96, height: 32, flexShrink: 0 }}
    >
      {/* pathLength=1 normalizes stroke-dasharray/offset to 0–1 regardless of
          actual on-screen length, so the CSS draw-in keyframe works for any
          series without per-instance math. */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className="sparkline-draw"
        style={{ ["--stagger-i" as string]: staggerIndex }}
      />
    </svg>
  );
}

function AgentCard({
  agent,
  runs,
  accountState,
  loadError,
  staggerIndex,
}: {
  agent: AgentMeta;
  runs: Run[];
  accountState: AccountState | null;
  loadError: string | null;
  staggerIndex: number;
}) {
  const id = agent.id;
  const staggerStyle = { ["--stagger-i" as string]: staggerIndex } as React.CSSProperties;

  if (loadError) {
    return (
      <div
        className="card stagger-item"
        style={{
          border: "1px solid var(--border-hairline)",
          borderRadius: 12,
          padding: 18,
          background: "var(--bg-surface)",
          ...staggerStyle,
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ color: "var(--accent-sell)", fontSize: 13, marginTop: 10 }}>
          Couldn&apos;t load: {loadError}
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div
        className="card stagger-item"
        style={{
          border: "1px solid var(--border-hairline)",
          borderRadius: 12,
          padding: 18,
          background: "var(--bg-surface)",
          ...staggerStyle,
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>{agent.tagline}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 16 }}>No runs logged yet.</div>
        <Link
          href={`/agent/${id}`}
          style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "none", display: "inline-block", marginTop: 14 }}
        >
          view log →
        </Link>
      </div>
    );
  }

  // Supabase returns newest-first; reverse for the sparkline's left-to-right reading.
  const chronological = [...runs].reverse();
  const latest = runs[0];
  const oldest = runs[runs.length - 1];
  const scale = agent.displayScale ?? 1;
  const rawEquity = accountState?.equity ?? latest.account_equity ?? null;
  const equity = rawEquity !== null ? rawEquity * scale : null;
  const openPositions = accountState?.num_open_positions ?? latest.num_open_positions ?? 0;
  const rawBaseline = oldest.account_equity ?? null;
  const baseline = rawBaseline !== null ? rawBaseline * scale : null;
  const pnl = equity !== null && baseline !== null ? equity - baseline : null;
  const pnlPct = pnl !== null && baseline ? (pnl / baseline) * 100 : null;
  const pnlColor = pnl === null || pnl === 0 ? "var(--text-primary)" : pnl > 0 ? "var(--accent-buy)" : "var(--accent-sell)";
  const today = runs.filter((r) => isSameEtDay(r.run_at, latest.run_at));
  const tradesToday = today.reduce((sum, r) => sum + tradeCount(r), 0);
  const equitySeries = chronological.map((r) => r.account_equity).filter((v): v is number => v !== null);

  return (
    <Link
      href={`/agent/${id}`}
      className="card stagger-item"
      style={{
        textDecoration: "none",
        display: "block",
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        padding: 18,
        background: "var(--bg-surface)",
        ...staggerStyle,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: agent.accent }}>
            {agent.label}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.tagline}</div>
        </div>
        {latest.error ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent-sell)",
              background: "var(--accent-sell-dim)",
              borderRadius: 4,
              padding: "2px 7px",
              whiteSpace: "nowrap",
            }}
          >
            last run failed
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>
            <AnimatedNumber value={equity} />
          </div>
          <div style={{ fontSize: 12.5, color: pnlColor, marginTop: 2 }}>
            {pnl === null ? (
              "—"
            ) : (
              <>
                <AnimatedNumber value={pnl} kind="signedMoney" />
                {pnlPct !== null ? ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)` : ""} since first log
              </>
            )}
          </div>
        </div>
        <Sparkline values={equitySeries} color={agent.accent} staggerIndex={staggerIndex} />
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 16, fontSize: 12, color: "var(--text-muted)" }}>
        <span>{openPositions} open</span>
        <span>{tradesToday} trade{tradesToday === 1 ? "" : "s"} today</span>
        <span>balance as of {fmtTime(accountState?.updated_at ?? latest.run_at)}</span>
      </div>

      {latest.overall_reasoning ? (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--text-muted)",
            marginTop: 12,
            marginBottom: 0,
            borderLeft: "2px solid var(--border-hairline)",
            paddingLeft: 10,
          }}
        >
          {latest.overall_reasoning}
        </p>
      ) : null}
    </Link>
  );
}

export default async function OverviewPage() {
  const agents = await getAllAgents();
  const results = await Promise.all(
    agents.map(async (agent) => {
      try {
        const [runs, accountState] = await Promise.all([
          getRuns(500, undefined, agent.id),
          getAccountState(agent.id).catch(() => null),
        ]);
        return { agent, runs: filterEquityAnomalies(runs), accountState, loadError: null as string | null };
      } catch (e) {
        return { agent, runs: [] as Run[], accountState: null as AccountState | null, loadError: e instanceof Error ? e.message : "Unknown error" };
      }
    })
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 540, margin: 0 }}>
          Autonomous agents, separate philosophies, same infrastructure — separate paper brokerage accounts so
          none of their trades affect each other. Tap any card for its full log and reasoning.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <EquityRefresher />
          <Link
            href="/agents/new"
            className="btn"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
              borderRadius: 999,
              padding: "7px 14px",
              whiteSpace: "nowrap",
              textDecoration: "none",
            }}
          >
            + Add agent
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {results.map(({ agent, runs, accountState, loadError }, i) => (
          <AgentCard key={agent.id} agent={agent} runs={runs} accountState={accountState} loadError={loadError} staggerIndex={i} />
        ))}
      </div>
    </div>
  );
}
