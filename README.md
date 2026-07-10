# Agent Log

A small dashboard for the [paper trading agent](https://github.com/FlashedPepper76/Paper-trading-agent):

- **LOG** — every run the agent has made, in order, with its overall reasoning and a per-symbol
  breakdown (action, quantity, confidence, reasoning, and what actually happened with the order).
- **AGENT BRIEF** — the agent's standing instructions/system prompt. Edits here take effect on the
  next scheduled run automatically — no redeploy, no code change. This is the practical way to
  "talk to" the agent: it reads this file fresh every run.

Reads go straight to Supabase (the same `life-dashboard` project the trading agent logs to) using
the public anon key. Row-level security on those tables grants anon **read-only** access — the key
itself isn't a secret, so it must not be able to write anything.

Writes (agent instructions, push subscriptions, creating a new agent) go through Next.js API
routes using the Supabase **service role** key, which bypasses RLS. The routes that can mutate
live trading agents (`/api/instructions`, `/api/agents/create`) additionally require a
`x-dashboard-key` header matching `DASHBOARD_WRITE_SECRET` — there's no login system, so this is
a shared secret the dashboard owner enters once per browser (prompted automatically, stored in
localStorage).

## Environment variables (set in Vercel, server-only unless prefixed `NEXT_PUBLIC_`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_KEY` — the Supabase publishable/anon key, not the service role key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase project settings → API → service_role key. Never expose
  this with a `NEXT_PUBLIC_` prefix.
- `DASHBOARD_WRITE_SECRET` — any secret string; gates `/api/instructions` and `/api/agents/create`.
- `NOTIFY_SECRET` — shared secret the trading agent sends when posting to `/api/notify`. Must match
  the `NOTIFY_SECRET` GitHub Actions secret in the Paper-trading-agent repo — update both together
  when rotating.
- `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` — web push VAPID keypair. `VAPID_PUBLIC_KEY` may also be
  set as `NEXT_PUBLIC_VAPID_KEY` since the public half is sent to browsers anyway.
- `GITHUB_SECRETS_PAT` — fine-grained GitHub PAT scoped to Paper-trading-agent with "Secrets: Read
  and write", used by `/api/agents/create` to provision a new agent's credentials.

These used to include hardcoded fallback values for `NOTIFY_SECRET` and the VAPID keys committed
directly in `lib/push-server.ts`. That's no longer the case — those values are burned (permanently
exposed in git history) and must be rotated when setting the env vars.

## Local development

```
npm install
npm run dev
```

Create a `.env.local` with the variables above to run locally.
