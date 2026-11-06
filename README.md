# Analyst vs. Monkey: dashboard

Scoreboard for the [paper trading agent](https://github.com/patthepenguin921-source/Paper-trading-agent):
**The Analyst** (Claude) vs. **The Monkey** (random darts), each with its own Alpaca paper account.

- **Overview** (`/`): both accounts' equity, return since start vs. SPY, a combined return chart, and the latest trades.
- **Agent pages** (`/agent/analyst`, `/agent/monkey`): positions, every run's market view and journal,
  and every proposed trade with its thesis, exit plan, and whether the risk checks let it through.

Read-only: it reads the `pt_snapshots`, `pt_runs` and `pt_decisions` Supabase tables with the public
anon key (RLS grants SELECT only). All writing happens in the agent repo's GitHub Actions.

## Environment variables (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_KEY`: the publishable/anon key (never the service role key)

Both have built-in fallbacks for the life-dashboard project, so it works without them.
The old write/push-notification variables (`SUPABASE_SERVICE_ROLE_KEY`, `DASHBOARD_WRITE_SECRET`,
`NOTIFY_SECRET`, `VAPID_*`, `GITHUB_SECRETS_PAT`) are no longer used and can be deleted.

```bash
npm install && npm run dev
```
