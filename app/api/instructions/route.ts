import { NextRequest, NextResponse } from "next/server";
import { adminSaveInstructions } from "../../../lib/supabase-admin";

const ID_PATTERN = /^[a-z][a-z0-9_]{1,19}$/;

// Gated by a shared secret only the dashboard owner knows (set as
// DASHBOARD_WRITE_SECRET in Vercel, entered once in the browser — see
// lib/dashboard-auth.ts). Without this, anyone who found the committed
// Supabase URL/anon key could rewrite a live trading agent's system prompt.
export async function PATCH(req: NextRequest) {
  const key = req.headers.get("x-dashboard-key");
  if (!key || key !== process.env.DASHBOARD_WRITE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { agentId?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.agentId || !ID_PATTERN.test(body.agentId)) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }
  if (typeof body.content !== "string" || !body.content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    await adminSaveInstructions(body.agentId, body.content);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
