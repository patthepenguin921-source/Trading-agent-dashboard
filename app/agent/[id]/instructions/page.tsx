"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getInstructions } from "../../../../lib/supabase";
import { getAgentMeta, type AgentMeta } from "../../../../lib/agents";
import { getDashboardKey, promptForDashboardKey, clearDashboardKey } from "../../../../lib/dashboard-auth";
import AgentSubNav from "../../../agent-sub-nav";

async function saveInstructions(agentId: string, content: string): Promise<void> {
  let key = getDashboardKey();
  if (!key) key = promptForDashboardKey();
  if (!key) throw new Error("Dashboard write key is required to save.");

  const res = await fetch("/api/instructions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-dashboard-key": key },
    body: JSON.stringify({ agentId, content }),
  });
  if (res.status === 401) {
    // Whatever's cached in this browser is wrong (typo, stale value from
    // before Vercel had DASHBOARD_WRITE_SECRET set, etc.) — clear it so the
    // next save attempt re-prompts instead of silently retrying the same
    // wrong value forever.
    clearDashboardKey();
    throw new Error("Wrong dashboard write key — try saving again to re-enter it.");
  }
  if (!res.ok) throw new Error(`Failed to save instructions: ${res.status}`);
}

export default function AgentInstructionsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  // undefined = still resolving which agent this is, null = no such agent
  const [agent, setAgent] = useState<AgentMeta | null | undefined>(undefined);

  const [content, setContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAgentMeta(id).then((a) => {
      if (!cancelled) setAgent(a);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!agent) return;
    getInstructions(agent.id)
      .then((row) => {
        setContent(row.content);
        setUpdatedAt(row.updated_at);
        setStatus("ready");
      })
      .catch((e) => {
        setErrorMsg(e instanceof Error ? e.message : "Unknown error");
        setStatus("error");
      });
  }, [agent]);

  async function handleSave() {
    if (!agent) return;
    setStatus("saving");
    try {
      await saveInstructions(agent.id, content);
      setUpdatedAt(new Date().toISOString());
      setStatus("saved");
      setTimeout(() => setStatus("ready"), 2000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  if (agent === undefined) {
    return <div style={{ color: "var(--text-faint)", fontSize: 13 }}>loading...</div>;
  }

  if (agent === null) {
    return <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Unknown agent &quot;{id}&quot;.</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.description}</div>
      </div>

      <AgentSubNav id={agent.id} accent={agent.accent} active="brief" />

      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 640 }}>
        This is {agent.label}&apos;s system prompt — its trading philosophy, what it should prioritize or
        avoid, and any lessons learned. It&apos;s read fresh on every run, so changes here take effect on
        the next scheduled run, no redeploy needed.
      </p>

      {status === "loading" ? (
        <div style={{ color: "var(--text-faint)", fontSize: 13, marginTop: 20 }}>loading...</div>
      ) : status === "error" && !content ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13, marginTop: 20 }}>
          Couldn&apos;t load instructions: {errorMsg}
        </div>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="input"
            style={{
              width: "100%",
              minHeight: 480,
              marginTop: 16,
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-hairline)",
              borderRadius: 8,
              padding: 16,
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
            <button
              onClick={handleSave}
              disabled={status === "saving"}
              className="btn-primary"
              style={{
                background: agent.accent,
                color: "#0a0c10",
                padding: "9px 18px",
                opacity: status === "saving" ? 0.6 : 1,
              }}
            >
              {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Save changes"}
            </button>

            {status === "error" && content ? (
              <span style={{ fontSize: 12, color: "var(--accent-sell)" }}>Save failed: {errorMsg}</span>
            ) : updatedAt ? (
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                last updated {new Date(updatedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
