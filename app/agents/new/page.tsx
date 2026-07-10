"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDashboardKey, promptForDashboardKey, clearDashboardKey } from "../../../lib/dashboard-auth";

const RISK_LEVELS = ["conservative", "balanced", "aggressive"] as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint ? <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-hairline)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
};

export default function NewAgentPage() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [tagline, setTagline] = useState("");
  const [riskLevel, setRiskLevel] = useState<(typeof RISK_LEVELS)[number]>("balanced");
  const [universe, setUniverse] = useState("");
  const [positionSizeMin, setPositionSizeMin] = useState("4");
  const [positionSizeMax, setPositionSizeMax] = useState("15");
  const [maxNewBuys, setMaxNewBuys] = useState("2");
  const [minCashBuffer, setMinCashBuffer] = useState("0");
  const [newsRefreshMinutes, setNewsRefreshMinutes] = useState("60");
  const [accentColor, setAccentColor] = useState("#fb923c");
  const [instructions, setInstructions] = useState("");

  const [alpacaApiKey, setAlpacaApiKey] = useState("");
  const [alpacaSecretKey, setAlpacaSecretKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiApiKey2, setGeminiApiKey2] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");

  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const universeList = universe
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    let dashboardKey = getDashboardKey();
    if (!dashboardKey) dashboardKey = promptForDashboardKey();
    if (!dashboardKey) {
      setStatus("error");
      setErrorMsg("Dashboard write key is required to create an agent.");
      return;
    }

    try {
      const res = await fetch("/api/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dashboard-key": dashboardKey },
        body: JSON.stringify({
          id: id.trim().toLowerCase(),
          label: label.trim(),
          tagline: tagline.trim() || undefined,
          universe: universeList,
          riskLevel,
          maxNewBuysPerRun: Number(maxNewBuys),
          positionSizePctMin: Number(positionSizeMin) / 100,
          positionSizePctMax: Number(positionSizeMax) / 100,
          minCashBufferPct: Number(minCashBuffer) / 100,
          newsRefreshMinutes: Number(newsRefreshMinutes),
          accentColor,
          instructions: instructions.trim(),
          alpacaApiKey: alpacaApiKey.trim(),
          alpacaSecretKey: alpacaSecretKey.trim(),
          geminiApiKey: geminiApiKey.trim(),
          geminiApiKey2: geminiApiKey2.trim() || undefined,
          groqApiKey: groqApiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          // Cached key in this browser is wrong — clear it so the next
          // submit attempt re-prompts instead of silently reusing it.
          clearDashboardKey();
          setErrorMsg("Wrong dashboard write key — try submitting again to re-enter it.");
        } else {
          setErrorMsg(data.error || `Request failed (${res.status})`);
        }
        setStatus("error");
        return;
      }
      router.push(`/agent/${data.id}`);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Add an agent</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
          Creates a new paper-trading agent: its own Alpaca account, its own GitHub Actions secrets, and the
          same 15-min trading / 1-min snapshot schedule Plutus and Helios already run on.
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          className="card"
          style={{
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: 18,
            background: "var(--bg-surface)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 14 }}>
            BASICS
          </div>

          <Field label="Agent ID" hint="lowercase, letters/digits/underscores only, e.g. 'atlas' — used in URLs and as the GitHub secret suffix">
            <input
              style={inputStyle}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="atlas"
              required
              pattern="[a-z][a-z0-9_]{1,19}"
            />
          </Field>

          <Field label="Display label">
            <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Atlas" required />
          </Field>

          <Field label="Tagline" hint="short, shows under the label on cards — optional">
            <input
              style={inputStyle}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. momentum, short horizon"
            />
          </Field>

          <Field label="Risk level">
            <select style={inputStyle} value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}>
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Accent color" hint="used for charts/highlights for this agent">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              style={{ width: 60, height: 36, border: "1px solid var(--border-hairline)", borderRadius: 8, background: "transparent" }}
            />
          </Field>

          <Field label="Universe" hint="comma-separated tickers, e.g. AAPL, MSFT, VTI">
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
              required
            />
          </Field>
        </div>

        <div
          className="card"
          style={{
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: 18,
            background: "var(--bg-surface)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 14 }}>
            RISK PARAMETERS
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Position size min (%)" hint="of equity per buy">
              <input
                type="number"
                style={inputStyle}
                value={positionSizeMin}
                onChange={(e) => setPositionSizeMin(e.target.value)}
                min={0.1}
                max={50}
                step={0.5}
                required
              />
            </Field>
            <Field label="Position size max (%)" hint="of equity per buy">
              <input
                type="number"
                style={inputStyle}
                value={positionSizeMax}
                onChange={(e) => setPositionSizeMax(e.target.value)}
                min={0.1}
                max={50}
                step={0.5}
                required
              />
            </Field>
            <Field label="Max new buys per run">
              <input
                type="number"
                style={inputStyle}
                value={maxNewBuys}
                onChange={(e) => setMaxNewBuys(e.target.value)}
                min={1}
                max={10}
                step={1}
              />
            </Field>
            <Field label="Min cash buffer (%)" hint="0 = no hard floor">
              <input
                type="number"
                style={inputStyle}
                value={minCashBuffer}
                onChange={(e) => setMinCashBuffer(e.target.value)}
                min={0}
                max={90}
                step={1}
              />
            </Field>
            <Field label="News refresh (minutes)">
              <input
                type="number"
                style={inputStyle}
                value={newsRefreshMinutes}
                onChange={(e) => setNewsRefreshMinutes(e.target.value)}
                min={15}
                step={15}
              />
            </Field>
          </div>
        </div>

        <div
          className="card"
          style={{
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: 18,
            background: "var(--bg-surface)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 14 }}>
            TRADING GUIDELINE / PERSONALITY
          </div>
          <Field
            label="Instructions"
            hint="Free text — philosophy, what to prioritize or avoid, tone. This is the agent's system prompt; the structured risk parameters above are enforced separately in code."
          >
            <textarea
              style={{ ...inputStyle, minHeight: 200, resize: "vertical", lineHeight: 1.5 }}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              required
              placeholder="e.g. You're a momentum-driven trader focused on short-term price action..."
            />
          </Field>
        </div>

        <div
          className="card"
          style={{
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: 18,
            background: "var(--bg-surface)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 6 }}>
            API KEYS
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 14 }}>
            Sent once to create this agent&apos;s GitHub Actions secrets, then discarded — never stored in
            Supabase or anywhere in this app.
          </div>

          <Field label="Alpaca API key (paper trading)">
            <input style={inputStyle} type="password" value={alpacaApiKey} onChange={(e) => setAlpacaApiKey(e.target.value)} required />
          </Field>
          <Field label="Alpaca secret key">
            <input style={inputStyle} type="password" value={alpacaSecretKey} onChange={(e) => setAlpacaSecretKey(e.target.value)} required />
          </Field>
          <Field label="Gemini API key">
            <input style={inputStyle} type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} required />
          </Field>
          <Field label="Gemini API key 2" hint="optional fallback key, used if the first hits a quota limit">
            <input style={inputStyle} type="password" value={geminiApiKey2} onChange={(e) => setGeminiApiKey2(e.target.value)} />
          </Field>
          <Field label="Groq API key" hint="optional">
            <input style={inputStyle} type="password" value={groqApiKey} onChange={(e) => setGroqApiKey(e.target.value)} />
          </Field>
        </div>

        {status === "error" ? (
          <div style={{ color: "var(--accent-sell)", fontSize: 13, marginBottom: 14 }}>{errorMsg}</div>
        ) : null}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="btn-primary"
          style={{
            background: accentColor,
            color: "#0a0c10",
            padding: "11px 20px",
            borderRadius: 8,
            fontWeight: 600,
            opacity: status === "submitting" ? 0.6 : 1,
            width: "100%",
          }}
        >
          {status === "submitting" ? "Creating agent..." : "Create agent"}
        </button>
      </form>
    </div>
  );
}
