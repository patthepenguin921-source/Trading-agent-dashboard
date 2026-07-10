import { NextRequest, NextResponse } from "next/server";
import { adminSaveSubscription } from "../../../lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Malformed subscription" }, { status: 400 });
    }
    await adminSaveSubscription(endpoint, keys.p256dh, keys.auth);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
