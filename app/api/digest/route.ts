import { NextRequest, NextResponse } from "next/server";
import { getRuns, getAccountState } from "../../../lib/supabase";
import { getAllAgents } from "../../../lib/agents";
import { sendToAllSubscriptions } from "../../../lib/push-server";
import { isSameEtDay, tradeCount } from "../../run-helpers";

// Daily digest: one push notification after the close summarizing each
// agent's day — return, trades, equity. Triggered by the Vercel cron in
// vercel.json (21:05 UTC ≈ 4:05/5:05pm ET depending on DST).
//
// Auth follows this repo's existing "speed bump" model: if CRON_SECRET is
// set in Vercel env vars, the Authorization header Vercel sends must match;
// if it isn't set, the route stays open (worst case: someone triggers an
// extra digest push — no data exposure).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agents = await getAllAgents();
  const lines: string[] = [];

  for (const agent of agents) {
    try {
      const [runs, state] = await Promise.all([getRuns(300, undefined, agent.id), getAccountState(agent.id)]);
      if (runs.length === 0) continue;

      const latest = runs[0];
      const today = runs.filter((r) => isSameEtDay(r.run_at, latest.run_at));
      const trades = today.reduce((sum, r) => sum + tradeCount(r), 0);

      // Day return: first vs last equity reading among today's runs.
      const chronological = [...today].reverse();
      const first = chronological.find((r) => r.account_equity != null)?.account_equity ?? null;
      const last = state?.equity ?? latest.account_equity ?? null;
      const dayPct = first && last ? ((last - first) / first) * 100 : null;

      const pctStr = dayPct == null ? "—" : `${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}%`;
      lines.push(`${agent.label}: ${pctStr} today, ${trades} trade${trades === 1 ? "" : "s"}`);
    } catch {
      // One agent failing shouldn't kill the whole digest.
    }
  }

  if (lines.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no agent data" });
  }

  const result = await sendToAllSubscriptions("Daily agent digest", lines.join("\n"), "/compare");
  return NextResponse.json({ ok: true, lines, ...result });
}
