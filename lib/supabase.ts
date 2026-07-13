import { SUPABASE_URL, SUPABASE_KEY } from "./supabase-config";

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

export type Decision = {
  id: number;
  run_id: number;
  symbol: string;
  action: string;
  qty: number | null;
  entry_price: number | null;
  exit_price: number | null;
  realized_pnl_pct: number | null;
  confidence: string | null;
  reasoning: string | null;
  order_id: string | null;
  order_status: string | null;
  created_at: string;
};

export type Position = {
  id: number;
  agent_id: string;
  symbol: string;
  qty: number;
  avg_entry_price: number | null;
  current_price: number | null;
  unrealized_pl_pct: number | null;
  market_value: number | null;
  snapshot_at: string;
};

export type AccountState = {
  agent_id: string;
  equity: number | null;
  cash: number | null;
  num_open_positions: number | null;
  updated_at: string;
};

export async function getAccountState(agentId: string): Promise<AccountState | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_account_state?agent_id=eq.${agentId}&select=*`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load account state: ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

export async function getPositions(agentId: string): Promise<Position[]> {
  const params = new URLSearchParams({
    agent_id: `eq.${agentId}`,
    select: "*",
    order: "market_value.desc",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_agent_positions?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load positions: ${res.status}`);
  return res.json();
}

export type Run = {
  id: number;
  agent_id: string;
  trigger: string | null;
  run_at: string;
  market_open: boolean | null;
  account_equity: number | null;
  account_cash: number | null;
  num_open_positions: number | null;
  overall_reasoning: string | null;
  model_used: string | null;
  error: string | null;
  news_context: string | null;
  trading_agent_decisions: Decision[];
};

export async function getRuns(limit = 500, before?: string, agentId?: string): Promise<Run[]> {
  const params = new URLSearchParams({
    select: "*,trading_agent_decisions(*)",
    order: "run_at.desc",
    limit: String(limit),
  });
  if (before) params.set("run_at", `lt.${before}`);
  if (agentId) params.set("agent_id", `eq.${agentId}`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_agent_runs?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load runs: ${res.status}`);
  return res.json();
}

export async function getLatestRun(agentId: string): Promise<Run | null> {
  const runs = await getRuns(1, undefined, agentId);
  return runs[0] ?? null;
}

// Provenance for the positions page: the most recent executed BUY or SHORT
// decision per symbol for this agent, i.e. "the run where the agent decided
// to open (or last add to) this position" — with its reasoning and timestamp.
export type EntryDecision = {
  symbol: string;
  action: string;
  reasoning: string | null;
  confidence: string | null;
  entry_price: number | null;
  created_at: string;
  run_id: number;
};

export async function getEntryDecisions(
  agentId: string,
  symbols: string[]
): Promise<Record<string, EntryDecision>> {
  if (symbols.length === 0) return {};
  const params = new URLSearchParams({
    select: "symbol,action,reasoning,confidence,entry_price,created_at,run_id,trading_agent_runs!inner(agent_id)",
    action: "in.(buy,short)",
    order_id: "not.is.null",
    symbol: `in.(${symbols.join(",")})`,
    "trading_agent_runs.agent_id": `eq.${agentId}`,
    order: "created_at.desc",
    limit: "200",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_agent_decisions?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return {}; // provenance is additive — never break the page over it
  const rows: EntryDecision[] = await res.json();
  const bySymbol: Record<string, EntryDecision> = {};
  for (const row of rows) {
    if (!bySymbol[row.symbol]) bySymbol[row.symbol] = row; // newest first
  }
  return bySymbol;
}

// Closed-trade ledger for the Trades tab: every executed sell/cover with a
// realized P/L, newest first. Includes the code-enforced stop-loss backstop
// closes (they log as sells/covers too, with reasoning saying so).
export type ClosedTrade = {
  id: number;
  symbol: string;
  action: string; // "sell" closed a long, "cover" closed a short
  qty: number | null;
  exit_price: number | null;
  realized_pnl_pct: number;
  confidence: string | null;
  reasoning: string | null;
  order_status: string | null;
  created_at: string;
};

export async function getClosedTrades(agentId: string, limit = 300): Promise<ClosedTrade[]> {
  const params = new URLSearchParams({
    agent_id: `eq.${agentId}`,
    action: "in.(sell,cover)",
    order_id: "not.is.null",
    realized_pnl_pct: "not.is.null",
    select: "id,symbol,action,qty,exit_price,realized_pnl_pct,confidence,reasoning,order_status,created_at",
    order: "created_at.desc",
    limit: String(limit),
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_agent_decisions?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load closed trades: ${res.status}`);
  return res.json();
}

export async function getInstructions(agentId: string): Promise<{ content: string; updated_at: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_instructions?agent_id=eq.${agentId}&select=content,updated_at`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load instructions: ${res.status}`);
  const rows = await res.json();
  return rows[0];
}

// Writes to agent_instructions and agent_push_subscriptions are no longer
// done with the anon key (RLS is read-only for anon on both tables) — see
// lib/supabase-admin.ts, which uses the service role key from server-only
// API routes: app/api/instructions, app/api/push-subscribe, app/api/push-unsubscribe.

// Daily and weekly learning reports — written by ai_agent.py's pre-market
// review (daily) and scripts/lessons_learned.py (weekly) in the trading
// agent repo. See that repo's ai_agent._build_daily_report and
// lessons_learned._summarize/_missed_opportunities for how these are built.

export type DailyMissedOpportunity = { symbol: string; pct_change: number };

export type DailyReport = {
  id: number;
  agent_id: string;
  report_date: string; // YYYY-MM-DD
  closed_trades: number;
  wins: number;
  losses: number;
  win_rate_pct: number | null;
  avg_win_pct: number | null;
  avg_loss_pct: number | null;
  missed_opportunities: DailyMissedOpportunity[] | null;
  recap_text: string | null;
  created_at: string;
};

export async function getDailyReports(agentId: string, limit = 14): Promise<DailyReport[]> {
  const params = new URLSearchParams({
    agent_id: `eq.${agentId}`,
    select: "*",
    order: "report_date.desc",
    limit: String(limit),
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_daily_reports?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load daily reports: ${res.status}`);
  return res.json();
}

export type WeeklyPnlBreakdown = Record<
  string,
  { closed_trades: number; win_rate_pct: number; avg_win_pct: number | null; avg_loss_pct: number | null }
>;

export type WeeklySummary = {
  runs?: number;
  errors?: number;
  equity_start?: number | null;
  equity_end?: number | null;
  trade_attempts?: number;
  executed_trades?: number;
  closed_trades?: number;
  wins?: number;
  losses?: number;
  win_rate_pct?: number | null;
  avg_win_pct?: number | null;
  avg_loss_pct?: number | null;
  by_confidence?: WeeklyPnlBreakdown;
  by_action?: WeeklyPnlBreakdown;
  worst_symbols?: [string, number][];
  best_symbols?: [string, number][];
};

export type WeeklyMissedOpportunities = {
  passed_on_and_gained?: { symbol: string; week_pct_change: number; reasoning_given?: string }[];
  never_considered_and_gained?: { symbol: string; week_pct_change: number }[];
};

export type WeeklyReport = {
  id: number;
  agent_id: string;
  week_ending: string; // YYYY-MM-DD
  summary: WeeklySummary | null;
  missed_opportunities: WeeklyMissedOpportunities | null;
  lessons_added: string[];
  created_at: string;
};

export async function getWeeklyReports(agentId: string, limit = 12): Promise<WeeklyReport[]> {
  const params = new URLSearchParams({
    agent_id: `eq.${agentId}`,
    select: "*",
    order: "week_ending.desc",
    limit: String(limit),
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_weekly_reports?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load weekly reports: ${res.status}`);
  return res.json();
}

// Open (unfilled) orders — snapshot written by the trading agent's
// store._log_open_orders() at the end of every decision run. These are the
// GTC limit orders the agent is actively managing; they reserve shares and
// cash while pending, which is why they're worth surfacing.
export type OpenOrder = {
  id: number;
  agent_id: string;
  symbol: string;
  side: string | null;       // buy | sell
  order_type: string | null; // market | limit
  qty: number | null;
  notional: number | null;
  limit_price: number | null;
  age_minutes: number | null; // as of snapshot_at
  snapshot_at: string;
};

export async function getOpenOrders(agentId: string): Promise<OpenOrder[]> {
  const params = new URLSearchParams({
    agent_id: `eq.${agentId}`,
    select: "*",
    order: "symbol.asc",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_open_orders?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return []; // additive info — never break the page over it
  return res.json();
}

// The agent's latest news/sentiment briefing (agent_news_context) — the
// exact text fed into its decision prompt, refreshed on the agent's own
// news_refresh_minutes cadence. updated_at drives the staleness warning.
export type NewsContext = { content: string; updated_at: string };

export async function getNewsContext(agentId: string): Promise<NewsContext | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_news_context?agent_id=eq.${agentId}&select=content,updated_at`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

// Cross-agent activity feed for the overview page: the most recent executed
// decisions (any agent), newest first. trading_agent_decisions carries
// agent_id directly, so no join through runs is needed.
export type RecentDecision = {
  id: number;
  agent_id: string;
  symbol: string;
  action: string;
  qty: number | null;
  realized_pnl_pct: number | null;
  confidence: string | null;
  reasoning: string | null;
  created_at: string;
};

export async function getRecentDecisions(limit = 14): Promise<RecentDecision[]> {
  const params = new URLSearchParams({
    order_id: "not.is.null",
    action: "in.(buy,sell,short,cover)",
    select: "id,agent_id,symbol,action,qty,realized_pnl_pct,confidence,reasoning,created_at",
    order: "created_at.desc",
    limit: String(limit),
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_agent_decisions?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

// Benchmark (VTI/SPY/QQQ) price data — written by the Python snapshot every
// minute (Plutus only) via Alpaca's data API; read here by the compare page.
// This avoids external API calls from Vercel which are blocked for stooq/Yahoo.
export type BenchmarkPrice = { date: string; close: number };

export async function getBenchmarkPrices(
  symbol: string,
  fromDate: string  // YYYY-MM-DD inclusive
): Promise<BenchmarkPrice[]> {
  // Query on price_time (the new PK) so intraday rows are returned alongside
  // daily ones. price_time >= midnight on fromDate captures everything that day.
  const params = new URLSearchParams({
    symbol: `eq.${symbol}`,
    price_time: `gte.${fromDate}T00:00:00Z`,
    select: "price_time,close",
    order: "price_time.asc",
    limit: "5000", // plenty for any date range the compare page needs
  });
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/benchmark_prices?${params.toString()}`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load benchmark prices: ${res.status}`);
  const rows: { price_time: string; close: number }[] = await res.json();
  return rows.map((r) => ({ date: r.price_time, close: r.close }));
}
