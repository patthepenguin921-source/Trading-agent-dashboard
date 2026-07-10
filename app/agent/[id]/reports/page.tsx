import { notFound } from "next/navigation";
import {
  getDailyReports,
  getWeeklyReports,
  type DailyReport,
  type WeeklyReport,
} from "../../../../lib/supabase";
import { getAgentMeta } from "../../../../lib/agents";
import { fmtStatPct } from "../../../../lib/analytics";
import AgentSubNav from "../../../agent-sub-nav";

// report_date / week_ending are plain YYYY-MM-DD dates with no time
// component — parse as UTC midnight so formatting never shifts the day
// depending on the viewer's timezone.
function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: color || "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

type MissedItem = { symbol: string; pct_change?: number; week_pct_change?: number; reasoning_given?: string };

function MissedList({ title, items }: { title: string; items: MissedItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.04em", color: "var(--text-faint)", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((m, i) => (
          <div
            key={`${m.symbol}-${i}`}
            style={{
              fontSize: 12.5,
              color: "var(--text-muted)",
              borderLeft: "2px solid var(--accent-hold)",
              paddingLeft: 10,
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{m.symbol}</span>{" "}
            <span style={{ color: "var(--accent-buy)" }}>
              {fmtStatPct(m.pct_change ?? m.week_pct_change ?? null)}
            </span>
            {m.reasoning_given ? <span> — &quot;{m.reasoning_given}&quot;</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyReportCard({ report, accent }: { report: DailyReport; accent: string }) {
  const hasClosed = report.closed_trades > 0;
  const missed = report.missed_opportunities || [];

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        padding: "14px 16px",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{fmtDate(report.report_date)}</span>
        {!hasClosed ? <span style={{ fontSize: 11, color: "var(--text-faint)" }}>no closed trades</span> : null}
      </div>

      {hasClosed ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px 12px", marginTop: 12 }}>
          <StatChip label="WIN RATE" value={report.win_rate_pct != null ? `${report.win_rate_pct.toFixed(0)}%` : "—"} />
          <StatChip label="CLOSED" value={`${report.wins}W / ${report.losses}L`} />
          <StatChip label="AVG WIN" value={fmtStatPct(report.avg_win_pct)} color="var(--accent-buy)" />
          <StatChip label="AVG LOSS" value={fmtStatPct(report.avg_loss_pct)} color="var(--accent-sell)" />
        </div>
      ) : null}

      <MissedList title="MISSED (informational only — not a standing lesson)" items={missed} />

      {report.recap_text ? (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 11, letterSpacing: "0.05em", color: "var(--text-faint)", cursor: "pointer" }}>
            FULL RECAP
          </summary>
          <p
            style={{
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "var(--text-muted)",
              margin: "8px 0 0",
              borderLeft: "2px solid var(--border-hairline)",
              paddingLeft: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {report.recap_text}
          </p>
        </details>
      ) : null}

      <div style={{ height: 3, borderRadius: 2, background: accent, opacity: 0.35, marginTop: 12 }} />
    </div>
  );
}

function WeeklyReportCard({ report, accent }: { report: WeeklyReport; accent: string }) {
  const s = report.summary || {};
  const missed = report.missed_opportunities || {};
  const lessons = report.lessons_added || [];
  const bestSymbols = s.best_symbols || [];
  const worstSymbols = s.worst_symbols || [];

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 10,
        padding: "14px 16px",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Week ending {fmtDate(report.week_ending)}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px 12px", marginTop: 12 }}>
        <StatChip label="WIN RATE" value={s.win_rate_pct != null ? `${s.win_rate_pct.toFixed(0)}%` : "—"} />
        <StatChip label="CLOSED" value={`${s.wins ?? 0}W / ${s.losses ?? 0}L`} />
        <StatChip label="AVG WIN" value={fmtStatPct(s.avg_win_pct ?? null)} color="var(--accent-buy)" />
        <StatChip label="AVG LOSS" value={fmtStatPct(s.avg_loss_pct ?? null)} color="var(--accent-sell)" />
      </div>

      {lessons.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.04em", color: accent, marginBottom: 6, fontWeight: 700 }}>
            ADDED TO STANDING INSTRUCTIONS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lessons.map((l, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12.5,
                  color: "var(--text-primary)",
                  borderLeft: `2px solid ${accent}`,
                  paddingLeft: 10,
                  lineHeight: 1.5,
                }}
              >
                {l}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-faint)" }}>
          No new lesson this week — nothing statistically meaningful in the data.
        </div>
      )}

      <MissedList title="PASSED ON, GAINED ANYWAY" items={missed.passed_on_and_gained || []} />
      <MissedList title="NEVER CONSIDERED, GAINED ANYWAY" items={missed.never_considered_and_gained || []} />

      {bestSymbols.length > 0 || worstSymbols.length > 0 ? (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 11, letterSpacing: "0.05em", color: "var(--text-faint)", cursor: "pointer" }}>
            BEST / WORST SYMBOLS THIS WEEK
          </summary>
          <div
            style={{
              marginTop: 8,
              fontSize: 12.5,
              color: "var(--text-muted)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {bestSymbols
              .slice()
              .reverse()
              .map(([sym, pnl]) => (
                <div key={`best-${sym}`}>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{sym}</span>{" "}
                  <span style={{ color: "var(--accent-buy)" }}>{fmtStatPct(pnl)}</span>
                </div>
              ))}
            {worstSymbols.map(([sym, pnl]) => (
              <div key={`worst-${sym}`}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{sym}</span>{" "}
                <span style={{ color: "var(--accent-sell)" }}>{fmtStatPct(pnl)}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div style={{ height: 3, borderRadius: 2, background: accent, opacity: 0.5, marginTop: 12 }} />
    </div>
  );
}

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentMeta(id);
  if (!agent) notFound();

  let dailyReports: DailyReport[] = [];
  let weeklyReports: WeeklyReport[] = [];
  let loadError: string | null = null;
  try {
    [dailyReports, weeklyReports] = await Promise.all([getDailyReports(id), getWeeklyReports(id)]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.description}</div>
      </div>

      <AgentSubNav id={id} accent={agent.accent} active="reports" />

      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 640, marginBottom: 20 }}>
        What {agent.label} actually learned from its own gains and losses — a quick, informational recap every
        morning, and a deeper, data-grounded review every Sunday that&apos;s the only one that permanently updates
        its standing instructions.
      </p>

      {loadError ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Couldn&apos;t load reports: {loadError}</div>
      ) : (
        <>
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.06em",
                color: "var(--text-faint)",
                marginBottom: 10,
                fontFamily: "var(--font-mono)",
              }}
            >
              WEEKLY
            </div>
            {weeklyReports.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                No weekly review yet — runs every Sunday after market close.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {weeklyReports.map((r) => (
                  <WeeklyReportCard key={r.id} report={r} accent={agent.accent} />
                ))}
              </div>
            )}
          </div>

          <div>
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.06em",
                color: "var(--text-faint)",
                marginBottom: 10,
                fontFamily: "var(--font-mono)",
              }}
            >
              DAILY
            </div>
            {dailyReports.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                No daily recap yet — runs each morning before the market opens.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {dailyReports.map((r) => (
                  <DailyReportCard key={r.id} report={r} accent={agent.accent} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
