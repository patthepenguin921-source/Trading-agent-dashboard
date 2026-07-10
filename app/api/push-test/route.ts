import { NextResponse } from "next/server";
import { sendToAllSubscriptions } from "../../../lib/push-server";

// No shared-secret check here — this is meant to be called from the dashboard
// itself (the bell button) so Carter can confirm push actually works
// end-to-end. /api/notify (used by the trading agent) is the one that's
// gated by the secret header.
export async function POST() {
  try {
    const result = await sendToAllSubscriptions(
      "Trading Agents",
      "Test notification — if you got this, push is working. 🟢",
      "/"
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
