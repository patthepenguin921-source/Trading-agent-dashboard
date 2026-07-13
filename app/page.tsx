import Link from "next/link";
import {
  getRuns,
  getAccountState,
  getRecentDecisions,
  type Run,
  type AccountState,
  type RecentDecision,
} from "../lib/supabase";
import { getAllAgents, type AgentMeta } from "../lib/agents";
import { fmtMoney, fmtTime, isSameEtDay, tradeCount, actionBadge } from "./run-helpers";
import EquityRefresher from "./equity-refresher";
import AnimatedNumber from "./animated-number";
import RangeSparkline from "./range-sparkline";
import { Badge, Card, PnlText, SectionHeader, StatTile, relativeTime } from "./ui";
import { filterEquityAnomalies } from "./compare/compare-helpers";

type AgentData = {
  agent: AgentMeta;
  runs: Run[];
  accountState: AccountState | null;
  loadError: string | null;
};

// ── Per-agent derived numbers, shared by the hero strip and the cards ──────

function deriveAgent(d: AgentData) {
  const { agent, runs, accountState } = d;
  if (runs.length === 0) return null;
  const chronological = [...runs].reverse();
  const latest = runs[0];
  const oldest = runs[runs.length - 1];
  const scale = agent.displayScale ?? 1;
  const equity = (accountState?.equity ?? latest.account_equity ?? null) !== null
    ? (accountState?.equity ?? latest.account_equity)! * scale
    : null;
  const baseline = oldest.account_equity !== null ? oldest.account_equity! * scale : null;
  const pnl = equity !== null && baseline !== null ? equity - baseline : null;
  const pnlPct = pnl !== null && baseline ? (pnl / baseline) * 100 : null;

  const todayRuns = runs.filter((r) => isSameEtDay(r.run_at, latest.run_at));
  const tradesToday = todayRuns.reduce((sum, r) => sum + tradeCount(r), 0);
  // Day baseline: today's first equity reading (chronological scan).
  const todayFirst = chronological.find(
    (r) => r.account_equity != null && isSameEtDay(r.run_at, latest.run_at)
  );
  const dayPct =
    equity !== null && todayFirst?.account_equity
      ? ((equity - todayFirst.account_equity * scale) / (todayFirst.account_equity * scale)) * 100
      : null;

  // Closed-trade win rate straight from the runs' embedded decisions.
  const closed = runs
    .flatMap((r) => r.trading_agent_decisions || [])
    .filter((x) => (x.action === "sell" || x.action === "cover") && x.order_id && x.realized_pnl_pct != null);
  const winRate = closed.length
    ? (closed.filter((x) => Number(x.realized_pnl_pct) > 0).length / closed.length) * 100
    : null;

  const equitySeries = chronological.map((r) => r.account_equity).filter((v): v is number => v !== null);
  const now = Date.now();
  const cutoff = (days: number) => now - days * 86400_000;
  const seriesSince = (t: number) =>
    chronological
      .filter((r) => new Date(r.run_at).getTime() >= t && r.account_equity != null)
      .map((r) => r.account_equity as number);

  const minsSinceLastRun = (now - new Date(latest.run_at).getTime()) / 60000;

  return {
    equity,
    baseline,
    pnl,
    pnlPct,
    dayPct,
    tradesToday,
    winRate,
    closedTrades: closed.length,
    openPositions: accountState?.num_open_positions ?? latest.num_open_positions ?? 0,
    equitySeries,
    daySeries: seriesSince(cutoff(1)),
    weekSeries: seriesSince(cutoff(7)),
    latest,
    minsSinceLastRun,
    balanceAsOf: accountState?.updated_at ?? latest.run_at,
  };
}

type Derived = NonNullable<ReturnType<typeof deriveAgent>>;

// ── Portfolio hero ──────────────────────────────────────────────────────────

function PortfolioHero({ items }: { items: { agent: AgentMeta; d: Derived }[] }) {
  if (items.length === 0) return null;
  const withEquity = items.filter((x) => x.d.equity !== null && x.d.baseline !== null);
  const totalEquity = withEquity.reduce((s, x) => s + (x.d.equity as number), 0);
  const totalBaseline = withEquity.reduce((s, x) => s + (x.d.baseline as number), 0);
  const totalPnl = totalEquity - totalBaseline;
  const totalPnlPct = totalBaseline ? (totalPnl / totalBaseline) * 100 : null;
  const tradesToday = items.reduce((s, x) => s + x.d.tradesToday, 0);
  const openPositions = items.reduce((s, x) => s + x.d.openPositions, 0);

  const byDay = items.filter((x) => x.d.dayPct !== null).sort((a, b) => (b.d.dayPct as number) - (a.d.dayPct as number));
  const best = byDay[0];
  const worst = byDay[byDay.length - 1];

  return (
    <Card style={{ marginBottom: 20 }} padding="18px 20px">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 16,
        }}
      >
        <StatTile
          label="Combined equity"
          value={<AnimatedNumber value={totalEquity} />}
          sub={`across ${withEquity.length} agents`}
        />
        <StatTile
          label="Combined P/L"
          value={
            <>
              <PnlText value={totalPnl} kind="money" />
              {totalPnlPct !== null ? (
                <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6, color: "var(--text-muted)" }}>
                  ({totalPnlPct >= 0 ? "+" : ""}
                  {totalPnlPct.toFixed(2)}%)
                </span>
              ) : null}
            </>
          }
          sub="since each agent's first log"
        />
        <StatTile label="Open positions" value={String(openPositions)} />
        <StatTile label="Trades today" value={String(tradesToday)} />
        {best && best.d.dayPct !== null ? (
          <StatTile
            label="Best today"
            value={
              <span style={{ color: best.agent.accent }}>
                {best.agent.label} <PnlText value={best.d.dayPct} />
              </span>
            }
          />
        ) : null}
        {worst && worst !== best && worst.d.dayPct !== null ? (
          <StatTile
            label="Worst today"
            value={
              <span style={{ color: worst.agent.accent }}>
                {worst.agent.label} <PnlText value={worst.d.dayPct} />
              </span>
            }
          />
        ) : null}
      </div>
    </Card>
  );
}

// ── Activity feed ───────────────────────────────────────────────────────────

function ActivityFeed({
  decisions,
  agentsById,
}: {
  decisions: RecentDecision[];
  agentsById: Record<string, AgentMeta>;
}) {
  if (decisions.length === 0) return null;
  return (
    <>
      <SectionHeader>Latest activity — all agents</SectionHeader>
      <Card padding="6px 0" style={{ marginBottom: 8 }}>
        {decisions.map((dec, i) => {
          const agent = agentsById[dec.agent_id];
          return (
            <div
              key={dec.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "9px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--border-hairline)",
                fontSize: 13,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: agent?.accent ?? "var(--text-faint)",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
                title={agent?.label ?? dec.agent_id}
              />
              {actionBadge(dec.action, true)}
              <Link
                href={`/agent/${dec.agent_id}/trades`}
                style={{ fontWeight: 700, textDecoration: "none", color: "var(--text-primary)" }}
              >
                {dec.symbol}
              </Link>
              {dec.realized_pnl_pct != null ? <PnlText value={Number(dec.realized_pnl_pct)} /> : null}
              <span
                style={{
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                  flex: 1,
                }}
                title={dec.reasoning ?? undefined}
              >
                {dec.reasoning}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}>
                {relativeTime(dec.created_at)}
              </span>
            </div>
          );
        })}
      </Card>
    </>
  );
}

// ── Agent cards ─────────────────────────────────────────────────────────────

// Past this many minutes without any logged run, something is likely wrong
// with the cron/trigger pipeline — every agent logs at least an idle
// check-in every ~15 min while markets are open, and Eris does 24/7.
const STALE_RUN_MINUTES = 90;

function AgentCard({
  agent,
  data,
  staggerIndex,
}: {
  agent: AgentMeta;
  data: AgentData;
  staggerIndex: number;
}) {
  const staggerStyle = { ["--stagger-i" as string]: staggerIndex } as React.CSSProperties;
  const d = deriveAgent(data);

  if (data.loadError) {
    return (
      <Card style={{ ...staggerStyle }} padding={18}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ color: "var(--accent-sell)", fontSize: 13, marginTop: 10 }}>
          Couldn&apos;t load: {data.loadError}
        </div>
      </Card>
    );
  }

  if (!d) {
    return (
      <Card style={{ ...staggerStyle }} padding={18}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>{agent.tagline}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 16 }}>No runs logged yet.</div>
        <Link
          href={`/agent/${agent.id}`}
          style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "none", display: "inline-block", marginTop: 14 }}
        >
          view log →
        </Link>
      </Card>
    );
  }

  const stale = d.minsSinceLastRun > STALE_RUN_MINUTES;

  return (
    <Link
      href={`/agent/${agent.id}`}
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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {d.latest.error ? <Badge tone="sell">last run failed</Badge> : null}
          {stale ? (
            <Badge tone="hold" title={`No run logged for ${Math.round(d.minsSinceLastRun)} minutes — the trigger pipeline may be stuck`}>
              stale · {Math.round(d.minsSinceLastRun / 60)}h
            </Badge>
          ) : null}
          {agent.tradesCrypto ? (
            <Badge color="var(--accent-eris)" title="Crypto trades 24/7 — this agent runs a crypto-only decision cycle outside market hours too">
              24/7 crypto
            </Badge>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>
            <AnimatedNumber value={d.equity} />
          </div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>
            {d.pnl === null ? (
              <span style={{ color: "var(--text-faint)" }}>—</span>
            ) : (
              <>
                <PnlText value={d.pnl} kind="money" />
                {d.pnlPct !== null ? (
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    ({d.pnlPct >= 0 ? "+" : ""}
                    {d.pnlPct.toFixed(2)}%) since first log
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>
        <RangeSparkline
          color={agent.accent}
          staggerIndex={staggerIndex}
          ranges={[
            { key: "1d", label: "1d", values: d.daySeries },
            { key: "1w", label: "1w", values: d.weekSeries },
            { key: "all", label: "all", values: d.equitySeries },
          ]}
        />
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
        <span>{d.openPositions} open</span>
        <span>
          {d.tradesToday} trade{d.tradesToday === 1 ? "" : "s"} today
        </span>
        {d.dayPct !== null ? (
          <span>
            today <PnlText value={d.dayPct} style={{ fontWeight: 500 }} />
          </span>
        ) : null}
        {d.winRate !== null ? (
          <span title={`${d.closedTrades} closed trades`}>{d.winRate.toFixed(0)}% win rate</span>
        ) : null}
        <span style={{ marginLeft: "auto", color: "var(--text-faint)" }}>as of {fmtTime(d.balanceAsOf)}</span>
      </div>

      {d.latest.overall_reasoning ? (
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
          {d.latest.overall_reasoning}
        </p>
      ) : null}
    </Link>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const agents = await getAllAgents();
  const [results, recentDecisions] = await Promise.all([
    Promise.all(
      agents.map(async (agent): Promise<AgentData> => {
        try {
          const [runs, accountState] = await Promise.all([
            getRuns(500, undefined, agent.id),
            getAccountState(agent.id).catch(() => null),
          ]);
          return { agent, runs: filterEquityAnomalies(runs), accountState, loadError: null };
        } catch (e) {
          return { agent, runs: [], accountState: null, loadError: e instanceof Error ? e.message : "Unknown error" };
        }
      })
    ),
    getRecentDecisions(12),
  ]);

  const agentsById = Object.fromEntries(agents.map((a) => [a.id, a]));
  const heroItems = results
    .map((r) => ({ agent: r.agent, d: deriveAgent(r) }))
    .filter((x): x is { agent: AgentMeta; d: Derived } => x.d !== null);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
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

      <PortfolioHero items={heroItems} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {results.map((data, i) => (
          <AgentCard key={data.agent.id} agent={data.agent} data={data} staggerIndex={i} />
        ))}
      </div>

      <ActivityFeed decisions={recentDecisions} agentsById={agentsById} />
    </div>
  );
}
