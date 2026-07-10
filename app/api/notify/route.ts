import { NextRequest, NextResponse } from "next/server";
import { requireNotifySecret, sendToAllSubscriptions } from "../../../lib/push-server";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-notify-key");
  let expected: string;
  try {
    expected = requireNotifySecret();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!key || key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; body?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await sendToAllSubscriptions(body.title || "Trading Agent", body.body || "", body.url || "/");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

