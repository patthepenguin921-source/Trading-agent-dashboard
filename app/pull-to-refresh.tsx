"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// App-style pull-to-refresh for the PWA: from the top of the page, pull
// down and a refresh chip follows the finger with resistance; past the
// threshold it ticks (haptic where supported), and on release the page
// re-reads from Supabase (router.refresh — same soft refresh the 60s
// auto-refresher does). Touch-only by design; desktop has the Refresh
// button and browser reload.

const THRESHOLD = 72; // pull distance (post-resistance px) that arms a refresh
const RESISTANCE = 2.2;

export default function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const state = useRef<{ startY: number; startX: number; active: boolean; armed: boolean } | null>(null);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || refreshing) return;
      const t = e.touches[0];
      state.current = { startY: t.clientY, startX: t.clientX, active: false, armed: false };
    }

    function onTouchMove(e: TouchEvent) {
      const s = state.current;
      if (!s || refreshing) return;
      const t = e.touches[0];
      const dy = t.clientY - s.startY;
      const dx = t.clientX - s.startX;
      if (!s.active) {
        // Only a clearly-vertical downward pull from the very top counts;
        // sideways swipes (tab pill drags, chart scrubs) stay untouched.
        if (dy < 10 || Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dx) > 10 || dy < -10) state.current = null;
          return;
        }
        s.active = true;
      }
      const dist = Math.max(0, dy / RESISTANCE);
      if (dist >= THRESHOLD && !s.armed) {
        s.armed = true;
        navigator.vibrate?.(10);
      } else if (dist < THRESHOLD && s.armed) {
        s.armed = false;
      }
      setPull(dist);
    }

    function onTouchEnd() {
      const s = state.current;
      state.current = null;
      if (!s || !s.active) return;
      if (s.armed && !refreshing) {
        setRefreshing(true);
        setPull(THRESHOLD * 0.75);
        // Full reload, not router.refresh(): matches the native
        // pull-to-refresh gesture this replaces in standalone PWA mode, and
        // refresh()'s soft re-render provably doesn't commit on the agent
        // routes (refetch fires, fresh payload arrives, DOM never updates —
        // while the same call works on /). Deferred a beat so the chip's
        // "Refreshing…" state paints before the navigation starts.
        setTimeout(() => window.location.reload(), 300);
      } else {
        setPull(0);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [refreshing, router]);

  const visible = pull > 4 || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 30,
        pointerEvents: "none",
        transform: `translateY(${visible ? 10 + pull * 0.4 : -48}px)`,
        transition: pull > 0 && !refreshing ? "none" : "transform 0.25s var(--ease-out)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-hairline)",
          borderRadius: 999,
          padding: "7px 14px",
          fontSize: 11.5,
          fontFamily: "var(--font-mono)",
          color: progress >= 1 || refreshing ? "var(--accent-buy)" : "var(--text-muted)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          opacity: visible ? 1 : 0,
          transition: "color 0.15s var(--ease), opacity 0.2s var(--ease)",
        }}
      >
        <RefreshCw
          size={13}
          strokeWidth={2.5}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            animation: refreshing ? "spin 0.9s linear infinite" : "none",
            transition: refreshing ? "none" : "transform 0.05s linear",
          }}
        />
        {refreshing ? "Refreshing…" : progress >= 1 ? "Release to refresh" : "Pull to refresh"}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
