import Link from "next/link";
import { AGENTS, type AgentId, getEquitySeries, getLastRun, getRecentTrades, performance } from "../lib/data";
import EquityChart, { toReturnPoints } from "./equity-chart";
import { DecisionRow, pct, tone, usd, when } from "./ui";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const ids = Object.keys(AGENTS) as AgentId[];
  const [series, lastRuns, trades] = await Promise.all([
    Promise.all(ids.map((id) => getEquitySeries(id))),
    Promise.all(ids.map((id) => getLastRun(id))),
    getRecentTrades(15),
  ]);
  const perf = ids.map((_, i) => performance(series[i]));
  const points = ids.map((_, i) => toReturnPoints(series[i]));
  const spy = points.find((p) => p.spy.length > 1)?.spy ?? [];

  const [a, m] = perf;
  const lead = a.returnPct != null && m.returnPct != null ? a.returnPct - m.returnPct : null;

  return (
    <>
      <section className="hero">
        <h1>Can Claude beat a monkey with a dartboard?</h1>
        {lead == null ? (
          <p className="muted">Waiting for the first snapshots from both accounts.</p>
        ) : (
          <p>
            The Analyst is <strong className={tone(lead)}>{lead >= 0 ? "ahead" : "behind"} by {Math.abs(lead).toFixed(2)} pts</strong>
            {a.since && <span className="muted"> since {when(a.since)}</span>}.
          </p>
        )}
      </section>

      <section className="cards">
        {ids.map((id, i) => (
          <Link key={id} href={`/agent/${id}`} className={`card agent-card ${id}`}>
            <div className="card-top">
              <h2>{AGENTS[id].name}</h2>
              <span className="muted small">{AGENTS[id].blurb}</span>
            </div>
            <div className="big mono">{usd(perf[i].equity)}</div>
            <div className="row">
              <span className={tone(perf[i].returnPct)}>{pct(perf[i].returnPct)}</span>
              <span className="muted">SPY {pct(perf[i].spyPct)}</span>
            </div>
            <div className="muted small">
              Last run: {when(lastRuns[i]?.run_at)}
              {lastRuns[i]?.summary?.error && <span className="down"> · error</span>}
            </div>
          </Link>
        ))}
      </section>

      <section className="card">
        <h3>Return since start</h3>
        <EquityChart
          lines={[
            { label: "Analyst", color: "var(--analyst)", points: points[0].mine },
            { label: "Monkey", color: "var(--monkey)", points: points[1].mine },
            { label: "SPY", color: "var(--spy)", points: spy, dashed: true },
          ]}
        />
      </section>

      <section className="card">
        <h3>Latest trades</h3>
        {trades.length === 0 ? <div className="empty">No trades yet.</div> : (
          <ul className="decisions">{trades.map((d) => <DecisionRow key={d.id} d={d} showAgent />)}</ul>
        )}
      </section>
    </>
  );
}
