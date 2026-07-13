// Server-only Supabase client using the service role key, which bypasses
// RLS. Only ever imported from app/api/** route handlers — never from a
// "use client" component. Writes to agent_instructions and
// agent_push_subscriptions go through here because RLS grants anon
// (the publicly-committed key) read-only access to those tables.
import { SUPABASE_URL } from "./supabase-config";

function adminHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Set it as a server-only environment variable in Vercel " +
        "(Supabase project settings -> API -> service_role key). Never expose it with a NEXT_PUBLIC_ prefix."
    );
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function adminSaveInstructions(agentId: string, content: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_instructions?agent_id=eq.${agentId}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Failed to save instructions: ${res.status}`);
}

export type NotifyPrefs = { trades: boolean; failures: boolean; risk: boolean; other: boolean };

export async function adminSaveSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  prefs?: NotifyPrefs
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_push_subscriptions`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(prefs ? { endpoint, p256dh, auth, prefs } : { endpoint, p256dh, auth }),
  });
  if (!res.ok) throw new Error(`Failed to save subscription: ${res.status}`);
}

// Update just the prefs on an existing subscription (the bell popover's
// checkboxes) without needing the p256dh/auth keys re-sent.
export async function adminUpdateSubscriptionPrefs(endpoint: string, prefs: NotifyPrefs): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: "PATCH", headers: adminHeaders(), body: JSON.stringify({ prefs }) }
  );
  if (!res.ok) throw new Error(`Failed to update subscription prefs: ${res.status}`);
}

export async function adminDeleteSubscription(endpoint: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok) throw new Error(`Failed to delete subscription: ${res.status}`);
}

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string; prefs: NotifyPrefs | null };

export async function adminGetAllSubscriptions(): Promise<PushSubscriptionRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_push_subscriptions?select=endpoint,p256dh,auth,prefs`,
    { headers: adminHeaders(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load subscriptions: ${res.status}`);
  return res.json();
}
