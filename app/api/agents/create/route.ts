import { NextRequest, NextResponse } from "next/server";
import { createAgentSecrets } from "../../../../lib/github-secrets";
import { SUPABASE_URL, SUPABASE_KEY } from "../../../../lib/supabase-config";

const ID_PATTERN = /^[a-z][a-z0-9_]{1,19}$/;

// Every agent id that already has a workflow/secrets convention wired up.
// Posting one of these back through this endpoint would silently overwrite
// that agent's live brokerage/AI credentials with attacker-supplied values.
const RESERVED_IDS = new Set(["plutus", "helios", "hermes", "eris"]);

type CreateAgentBody = {
  id: string;
  label: string;
  tagline?: string;
  universe: string[];
  geminiModel?: string;
  riskLevel?: string;
  maxNewBuysPerRun?: number;
  positionSizePctMin: number;
  positionSizePctMax: number;
  minCashBufferPct?: number;
  newsRefreshMinutes?: number;
  accentColor?: string;
  instructions: string;
  alpacaApiKey: string;
  alpacaSecretKey: string;
  geminiApiKey: string;
  geminiApiKey2?: string;
  groqApiKey?: string;
};

export async function POST(req: NextRequest) {
  // This route writes GitHub Actions secrets (real brokerage/AI credentials)
  // and registers a live agent — it must not be reachable by anyone who
  // just finds the URL. Same shared-secret pattern as /api/notify and
  // /api/instructions.
  const key = req.headers.get("x-dashboard-key");
  if (!key || key !== process.env.DASHBOARD_WRITE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateAgentBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Defense-in-depth validation — register_agent() re-checks all of this
  // server-side in Postgres too, but failing fast here means a bad
  // request never even gets as far as creating GitHub secrets.
  if (!body.id || !ID_PATTERN.test(body.id)) {
    return NextResponse.json(
      { error: "Agent id must start with a lowercase letter, then 1-19 more lowercase letters/digits/underscores." },
      { status: 400 }
    );
  }
  if (RESERVED_IDS.has(body.id)) {
    return NextResponse.json({ error: `Agent id "${body.id}" is reserved.` }, { status: 400 });
  }
  if (!body.label?.trim()) {
    return NextResponse.json({ error: "Label is required." }, { status: 400 });
  }
  if (!Array.isArray(body.universe) || body.universe.length === 0) {
    return NextResponse.json({ error: "At least one symbol is required in the universe." }, { status: 400 });
  }
  if (!body.instructions?.trim()) {
    return NextResponse.json({ error: "Trading guideline / instructions text is required." }, { status: 400 });
  }
  if (
    !body.positionSizePctMin ||
    !body.positionSizePctMax ||
    body.positionSizePctMin <= 0 ||
    body.positionSizePctMax <= 0 ||
    body.positionSizePctMin > body.positionSizePctMax ||
    body.positionSizePctMax > 0.5
  ) {
    return NextResponse.json({ error: "Invalid position sizing range." }, { status: 400 });
  }
  if (!body.alpacaApiKey || !body.alpacaSecretKey || !body.geminiApiKey) {
    return NextResponse.json(
      { error: "Alpaca API key/secret and a Gemini API key are required." },
      { status: 400 }
    );
  }

  // GitHub secrets first: if this fails, nothing in Supabase has changed
  // yet, so there's no agent silently registered with no way to run.
  try {
    await createAgentSecrets(body.id, {
      alpacaApiKey: body.alpacaApiKey,
      alpacaSecretKey: body.alpacaSecretKey,
      geminiApiKey: body.geminiApiKey,
      geminiApiKey2: body.geminiApiKey2,
      groqApiKey: body.groqApiKey,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to create GitHub secrets: ${e instanceof Error ? e.message : "Unknown error"}` },
      { status: 502 }
    );
  }

  // Then register_agent() in Supabase — inserts the agents row + the
  // agent_instructions row, and schedules the two pg_cron jobs. By this
  // point the secrets already exist, so the very first scheduled run
  // (15 min away at most) has what it needs.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_agent`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_id: body.id,
      p_label: body.label,
      p_tagline: body.tagline || null,
      p_universe: body.universe,
      p_gemini_model: body.geminiModel || null,
      p_risk_level: body.riskLevel || null,
      p_max_new_buys_per_run: body.maxNewBuysPerRun ?? null,
      p_position_size_pct_min: body.positionSizePctMin,
      p_position_size_pct_max: body.positionSizePctMax,
      p_min_cash_buffer_pct: body.minCashBufferPct ?? null,
      p_news_refresh_minutes: body.newsRefreshMinutes ?? null,
      p_accent_color: body.accentColor || null,
      p_instructions: body.instructions,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      {
        error:
          `Agent secrets were created in GitHub, but registering the agent failed: ${errText}. ` +
          "The GitHub secrets for this agent id now exist unused — safe to leave, or delete them manually " +
          "from the repo's Settings \u2192 Secrets before retrying with a different id.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, id: body.id });
}
