import { NextRequest, NextResponse } from "next/server";
import { adminSaveSubscription, adminUpdateSubscriptionPrefs, type NotifyPrefs } from "../../../lib/supabase-admin";

function sanitizePrefs(raw: unknown): NotifyPrefs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  return {
    trades: p.trades !== false,
    failures: p.failures !== false,
    risk: p.risk !== false,
    other: p.other !== false,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, keys } = body;
    const prefs = sanitizePrefs(body.prefs);
    if (!endpoint) {
      return NextResponse.json({ error: "Malformed subscription" }, { status: 400 });
    }
    // Prefs-only update for an already-registered device (the bell
    // popover's checkboxes) — no p256dh/auth needed.
    if (!keys?.p256dh || !keys?.auth) {
      if (!prefs) return NextResponse.json({ error: "Malformed subscription" }, { status: 400 });
      await adminUpdateSubscriptionPrefs(endpoint, prefs);
      return NextResponse.json({ ok: true });
    }
    await adminSaveSubscription(endpoint, keys.p256dh, keys.auth, prefs);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
