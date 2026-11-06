import type { Decision } from "../lib/data";

export const usd = (n: number | null | undefined, digits = 0) =>
  n == null ? "-" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });

export const pct = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n) ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const tone = (n: number | null | undefined) => (n == null ? "" : n > 0 ? "up" : n < 0 ? "down" : "");

export function when(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }) + " ET";
}

export function ActionPill({ action }: { action: Decision["action"] }) {
  return <span className={`pill pill-${action}`}>{action}</span>;
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{status.replace("_", " ")}</span>;
}

export function DecisionRow({ d, showAgent = false }: { d: Decision; showAgent?: boolean }) {
  const amount = d.action === "sell" || d.action === "cover"
    ? (d.fraction != null && d.fraction < 0.999 ? `${Math.round(d.fraction * 100)}% of position` : "entire position")
    : d.qty ? `${d.qty} sh${d.size_pct ? ` · ${d.size_pct}%` : ""}` : d.size_pct ? `${d.size_pct}%` : "";
  return (
    <li className="decision">
      <div className="decision-head">
        <ActionPill action={d.action} />
        <strong className="mono">{d.symbol}</strong>
        <span className="muted">{amount}</span>
        {d.confidence != null && <span className="muted">conf {Math.round(Number(d.confidence) * 100)}%</span>}
        {showAgent && <span className={`agent-tag ${d.agent_id}`}>{d.agent_id}</span>}
        <span className="spacer" />
        <StatusPill status={d.status} />
      </div>
      {d.thesis && <p className="thesis">{d.thesis}</p>}
      {d.exit_plan && <p className="muted small">Exit plan: {d.exit_plan}</p>}
      {d.note && <p className="note small">{d.note}</p>}
    </li>
  );
}
