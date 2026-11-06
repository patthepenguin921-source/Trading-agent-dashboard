// Read-only Supabase access with the public anon key (RLS allows SELECT
// only). Tables are written by the Paper-trading-agent repo: see its
// supabase/schema.sql.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://edmysxanjsskjrdfkmaw.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_mPf4oJ538gA3mlpLihNSvA_Dtz45_Hj";

export const AGENTS = {
  analyst: { name: "The Analyst", blurb: "Claude researches, writes theses, and trades on them.", color: "var(--analyst)" },
  monkey: { name: "The Monkey", blurb: "Throws darts. No AI, no analysis, pure chance.", color: "var(--monkey)" },
} as const;
export type AgentId = keyof typeof AGENTS;
export const isAgentId = (x: string): x is AgentId => x in AGENTS;

async function get<T>(table: string, params: Record<string, string>, range?: [number, number]): Promise<T[]> {
  const qs = new URLSearchParams(params).toString();
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  if (range) headers.Range = `${range[0]}-${range[1]}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export type PositionRow = {
  symbol: string;
  qty: number;
  market_value: number;
  unrealized_plpc: number;
  avg_entry_price: number;
  current_price: number;
};

export type Snapshot = {
  agent_id: AgentId;
  taken_at: string;
  equity: number;
  cash: number | null;
  long_value: number | null;
  short_value: number | null;
  spy_price: number | null;
  positions: PositionRow[];
};

export type Decision = {
  id: number;
  run_id: number | null;
  agent_id: AgentId;
  created_at: string;
  symbol: string;
  action: "buy" | "sell" | "short" | "cover";
  size_pct: number | null;
  qty: number | null;
  fraction: number | null;
  est_price: number | null;
  confidence: number | null;
  thesis: string | null;
  exit_plan: string | null;
  status: string;
  note: string | null;
};

export type Run = {
  id: number;
  agent_id: AgentId;
  run_at: string;
  trigger: string | null;
  market_open: boolean | null;
  model: string | null;
  equity: number | null;
  market_view: string | null;
  summary: { journal?: string; seed?: number; error?: string; submitted?: number; rejected?: number; dry_run?: boolean };
  pt_decisions: Decision[];
};

/** Equity history (oldest first), paged past PostgREST's 1000-row cap. */
export async function getEquitySeries(agent: AgentId, maxRows = 20000) {
  const out: Pick<Snapshot, "taken_at" | "equity" | "spy_price">[] = [];
  for (let from = 0; from < maxRows; from += 1000) {
    const page = await get<Pick<Snapshot, "taken_at" | "equity" | "spy_price">>(
      "pt_snapshots",
      { agent_id: `eq.${agent}`, select: "taken_at,equity,spy_price", order: "taken_at.asc" },
      [from, from + 999],
    );
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

export async function getLatestSnapshot(agent: AgentId): Promise<Snapshot | null> {
  const rows = await get<Snapshot>("pt_snapshots", {
    agent_id: `eq.${agent}`, select: "*", order: "taken_at.desc", limit: "1",
  });
  return rows[0] ?? null;
}

export async function getRuns(agent: AgentId, limit = 20): Promise<Run[]> {
  return get<Run>("pt_runs", {
    agent_id: `eq.${agent}`, market_open: "eq.true", select: "*,pt_decisions(*)",
    order: "run_at.desc", limit: String(limit),
  });
}

export async function getLastRun(agent: AgentId): Promise<Run | null> {
  const rows = await get<Run>("pt_runs", {
    agent_id: `eq.${agent}`, select: "*,pt_decisions(*)", order: "run_at.desc", limit: "1",
  });
  return rows[0] ?? null;
}

export async function getRecentTrades(limit = 15): Promise<Decision[]> {
  return get<Decision>("pt_decisions", {
    status: "eq.submitted", select: "*", order: "created_at.desc", limit: String(limit),
  });
}

export type Performance = {
  equity: number | null;
  start: number | null;
  returnPct: number | null;
  spyPct: number | null;
  since: string | null;
};

export function performance(series: Pick<Snapshot, "taken_at" | "equity" | "spy_price">[]): Performance {
  if (series.length === 0) return { equity: null, start: null, returnPct: null, spyPct: null, since: null };
  const first = series[0];
  const last = series[series.length - 1];
  const firstSpy = series.find((s) => s.spy_price)?.spy_price ?? null;
  const lastSpy = [...series].reverse().find((s) => s.spy_price)?.spy_price ?? null;
  return {
    equity: Number(last.equity),
    start: Number(first.equity),
    returnPct: (Number(last.equity) / Number(first.equity) - 1) * 100,
    spyPct: firstSpy && lastSpy ? (Number(lastSpy) / Number(firstSpy) - 1) * 100 : null,
    since: first.taken_at,
  };
}
