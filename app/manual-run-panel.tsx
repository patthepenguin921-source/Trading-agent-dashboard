"use client";

import { useState } from "react";
import { Zap } from "lucide-react";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://edmysxanjsskjrdfkmaw.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_mPf4oJ538gA3mlpLihNSvA_Dtz45_Hj";

// Workflow ID for "Manual Full Agent Run"
const MANUAL_WORKFLOW_ID = "303579993";

type Mode = "run" | "premarket";

export default function ManualRunPanel({
  agentId,
  accent,
}: {
  agentId: string;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("premarket");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleRun() {
    setStatus("running");
    setErrorMsg("");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/trigger_manual_agent_run`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflow_id: MANUAL_WORKFLOW_ID,
          agent_id: agentId,
          mode,
          extra_context: prompt.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setStatus("done");
      setPrompt("");
      // Reset to idle after 4s
      setTimeout(() => setStatus("idle"), 4000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 6000);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 0",
          color: open ? accent : "var(--text-muted)",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.03em",
          transition: "color 0.15s var(--ease)",
        }}
      >
        <Zap size={12} strokeWidth={2.5} />
        {open ? "close manual run" : "manual run"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            padding: "14px 16px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Mode selector */}
          <div style={{ display: "flex", gap: 6 }}>
            {(["premarket", "run"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "1px solid",
                  borderColor: mode === m ? accent : "var(--border-hairline)",
                  background: mode === m ? `${accent}18` : "transparent",
                  color: mode === m ? accent : "var(--text-muted)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  transition: "all 0.15s var(--ease)",
                }}
              >
                {m === "premarket" ? "pre-market (queue buy)" : "force run"}
              </button>
            ))}
          </div>

          {/* Prompt textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Optional — extra context for ${agentId} this run only.\ne.g. "Focus on semiconductor names, CPI data came in hot today."`}
            rows={3}
            style={{
              width: "100%",
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border-hairline)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "var(--text-primary)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          {/* Submit */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={handleRun}
              disabled={status === "running"}
              style={{
                padding: "7px 18px",
                borderRadius: 999,
                border: "none",
                background: status === "done" ? "var(--accent-buy)" : accent,
                color: "#000",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 700,
                cursor: status === "running" ? "not-allowed" : "pointer",
                opacity: status === "running" ? 0.6 : 1,
                transition: "all 0.15s var(--ease)",
              }}
            >
              {status === "running"
                ? "triggering…"
                : status === "done"
                ? "✓ triggered"
                : "Run now"}
            </button>
            {status === "error" && (
              <span style={{ fontSize: 12, color: "var(--accent-sell)" }}>
                {errorMsg}
              </span>
            )}
            {status === "idle" && (
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                {mode === "premarket"
                  ? "Places day orders that fill at open"
                  : "Forces a live decision run now"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
