import { notFound } from "next/navigation";
import { AGENTS, getEquitySeries, getLatestSnapshot, getRuns, isAgentId, performance } from "../../../lib/data";
import EquityChart, { toReturnPoints } from "../../equity-chart";
import { DecisionRow, pct, tone, usd, when } from "../../ui";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAgentId(id)) notFound();
  const agent = AGENTS[id];
  const [series, snap, runs] = await Promise.all([getEquitySeries(id), getLatestSnapshot(id), getRuns(id, 25)]);
  const perf = performance(series);
  const pts = toReturnPoints(series);
  const positions = [...(snap?.positions ?? [])].sort((a, b) => Math.abs(b.market_value) - Math.abs(a.market_value));
  const equity = snap?.equity ?? null;

  return (
    <>
      <section className="hero">
        <h1 style={{ color: agent.color }}>{agent.name}</h1>
        <p className="muted">{agent.blurb}</p>
      </section>

      <section className="stats">
        <div className="card"><span className="muted small">Equity</span><div className="big mono">{usd(equity)}</div></div>
        <div className="card"><span className="muted small">Return</span><div className={`big mono ${tone(perf.returnPct)}`}>{pct(perf.returnPct)}</div></div>
        <div className="card"><span className="muted small">SPY same period</span><div className="big mono">{pct(perf.spyPct)}</div></div>
        <div className="card"><span className="muted small">Cash</span><div className="big mono">{usd(snap?.cash ?? null)}</div></div>
      </section>

      <section className="card">
        <h3>Return since start</h3>
        <EquityChart lines={[
          { label: agent.name, color: agent.color, points: pts.mine },
          { label: "SPY", color: "var(--spy)", points: pts.spy, dashed: true },
        ]} />
      </section>

      <section className="card">
        <h3>Positions <span className="muted small">as of {when(snap?.taken_at)}</span></h3>
        {positions.length === 0 ? <div className="empty">No open positions.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>Price</th><th>P/L</th><th>Weight</th></tr></thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol}>
                    <td className="mono"><strong>{p.symbol}</strong></td>
                    <td>{p.qty > 0 ? "long" : <span className="short">short</span>}</td>
                    <td className="mono">{Math.abs(p.qty)}</td>
                    <td className="mono">{usd(p.avg_entry_price, 2)}</td>
                    <td className="mono">{usd(p.current_price, 2)}</td>
                    <td className={`mono ${tone(p.unrealized_plpc)}`}>{pct(p.unrealized_plpc)}</td>
                    <td className="mono">{equity ? `${((Math.abs(p.market_value) / equity) * 100).toFixed(1)}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3>Runs</h3>
        {runs.length === 0 && <div className="card empty">No runs yet.</div>}
        {runs.map((r) => (
          <article key={r.id} className="card run">
            <div className="row">
              <strong>{when(r.run_at)}</strong>
              <span className="muted small">{r.trigger} · {r.model}</span>
              {r.summary?.dry_run && <span className="status status-dry_run">dry run</span>}
              <span className="spacer" />
              <span className="mono muted">{usd(r.equity)}</span>
            </div>
            {r.summary?.error && <p className="note">⚠ {r.summary.error}</p>}
            {r.market_view && <p>{r.market_view}</p>}
            {r.summary?.journal && (
              <details><summary className="muted small">Journal</summary><p className="journal">{r.summary.journal}</p></details>
            )}
            {r.pt_decisions.length > 0 ? (
              <ul className="decisions">{r.pt_decisions.map((d) => <DecisionRow key={d.id} d={d} />)}</ul>
            ) : <p className="muted small">No trades this run.</p>}
          </article>
        ))}
      </section>
    </>
  );
}
