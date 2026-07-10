// Server-only push config — only ever imported by route handlers (app/api/**),
// never by a "use client" component, so this never reaches the browser bundle.
//
// VAPID keys and NOTIFY_SECRET must be set as server-only Vercel env vars
// (no NEXT_PUBLIC_ prefix). They used to be hardcoded here, which meant
// anyone reading this public repo could read NOTIFY_SECRET and send fake
// push notifications to every subscribed device. Rotate all three values
// when moving them to env vars — the old hardcoded values are permanently
// exposed in git history and must be treated as burned.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Set it as a server-only environment variable in Vercel.`);
  return value;
}

// Not evaluated at module load (Next.js imports route modules during build
// to collect page data, which would throw here before any request ever
// comes in) — call this inside the request handler instead.
export function requireNotifySecret(): string {
  return requireEnv("NOTIFY_SECRET");
}

export async function sendToAllSubscriptions(title: string, body: string, url = "/") {
  const webpush = (await import("web-push")).default;
  const { adminGetAllSubscriptions, adminDeleteSubscription } = await import("./supabase-admin");

  // Public half of the VAPID keypair — not a secret, matches NEXT_PUBLIC_VAPID_KEY
  // in app/notify-bell.tsx, which browsers already receive on every subscribe call.
  const vapidPublicKey =
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_KEY ||
    "BG8jAKUkVgj3wjjLHulPx_zfYVt4HXDscODCK0x6gOGy6HLFxHAgMOH5Ip5Qa0Jq5bbDQ0Tg_XvVX6LG0Zcj8K0";
  const vapidPrivateKey = requireEnv("VAPID_PRIVATE_KEY");
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:plutus@trading-agent-dashboard.vercel.app";
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({ title, body, url });

  const subs = await adminGetAllSubscriptions();
  let sent = 0;
  let pruned = 0;
  const errors: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (e: unknown) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminDeleteSubscription(sub.endpoint).catch(() => {});
          pruned++;
        } else {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    })
  );

  return { subscriberCount: subs.length, sent, pruned, errors };
}
