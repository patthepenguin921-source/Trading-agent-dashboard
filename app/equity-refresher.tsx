"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://edmysxanjsskjrdfkmaw.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_mPf4oJ538gA3mlpLihNSvA_Dtz45_Hj";

// Snapshot workflow IDs — one per agent. Calling trigger_github_workflow
// for each fires a fresh Alpaca → Supabase sync before the page re-reads.
const SNAPSHOT_WORKFLOW_IDS = [
  "304206099", // Plutus
  "304206098", // Helios
  "305027996", // Hermes
  "306359323", // Eris
];

// How long to wait for GitHub Actions to pull from Alpaca and write to
// Supabase before we refresh the page. Snapshot jobs typically complete
// in 15-20s; 25s gives comfortable margin.
const SYNC_WAIT_MS = 25_000;

async function triggerSnapshots(): Promise<void> {
  await Promise.all(
    SNAPSHOT_WORKFLOW_IDS.map((id) =>
      fetch(`${SUPABASE_URL}/rest/v1/rpc/trigger_github_workflow`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workflow_id: id }),
      })
    )
  );
}

export default function EquityRefresher() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");
  const [countdown, setCountdown] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    if (state === "syncing") return;
    setState("syncing");
    setCountdown(Math.ceil(SYNC_WAIT_MS / 1000));

    // Tick the countdown every second
    countRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countRef.current) clearInterval(countRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    try {
      await triggerSnapshots();
    } catch {
      // Non-fatal — still do the page refresh after the wait
    }

    // Wait for snapshots to complete, then re-read from Supabase
    setTimeout(() => {
      if (countRef.current) clearInterval(countRef.current);
      router.refresh();
      setLastRefreshed(new Date());
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    }, SYNC_WAIT_MS);
  }

  // Auto-refresh every 60s while the tab is open (just a page re-read,
  // not a full Alpaca sync — snapshot crons already keep Supabase fresh)
  useEffect(() => {
    autoRef.current = setInterval(() => {
      router.refresh();
      setLastRefreshed(new Date());
    }, 60_000);
    return () => {
      if (autoRef.current) clearInterval(autoRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, []);

  const timeStr = lastRefreshed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const isSyncing = state === "syncing";
  const isDone = state === "done";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
        {isSyncing
          ? `syncing with Alpaca… ${countdown}s`
          : isDone
          ? "updated ✓"
          : `updated ${timeStr}`}
      </span>
      <button
        onClick={refresh}
        disabled={isSyncing}
        title="Pull fresh equity from Alpaca and refresh"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "var(--bg-surface-2)",
          border: "1px solid var(--border-hairline)",
          borderRadius: 999,
          padding: "4px 10px",
          cursor: isSyncing ? "not-allowed" : "pointer",
          color: isDone ? "var(--accent-buy)" : "var(--text-muted)",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          opacity: isSyncing ? 0.6 : 1,
          transition: "color 0.15s var(--ease), opacity 0.15s var(--ease)",
        }}
      >
        <RefreshCw
          size={12}
          strokeWidth={2.5}
          style={{
            animation: isSyncing ? "spin 1s linear infinite" : "none",
          }}
        />
        {isSyncing ? "Syncing…" : "Refresh"}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
