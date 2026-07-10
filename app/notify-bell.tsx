"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, X } from "lucide-react";

// Public VAPID key — this one is meant to be public, it's sent to the browser
// as part of every subscribe call. NEXT_PUBLIC_VAPID_KEY can override it if
// ever set in Vercel; this fallback keeps it working without that.
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_KEY ||
  "BG8jAKUkVgj3wjjLHulPx_zfYVt4HXDscODCK0x6gOGy6HLFxHAgMOH5Ip5Qa0Jq5bbDQ0Tg_XvVX6LG0Zcj8K0";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "checking" | "unsupported" | "off" | "denied" | "on" | "busy";

export default function NotifyBell() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    async function check() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? "on" : "off");
      } catch {
        setStatus("off");
      }
    }
    check();
  }, []);

  async function enable() {
    setStatus("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const key = sub.toJSON();
      await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key),
      });
      await reg.showNotification("Trading Agents", {
        body: "Notifications enabled — you'll hear about trades and errors here.",
        icon: "/icon-192.png",
      });
      setStatus("on");
    } catch (e) {
      console.error("Failed to enable notifications:", e);
      setStatus("off");
    }
  }

  async function disable() {
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push-unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      console.error("Failed to disable notifications:", e);
      setStatus("on");
    }
  }

  async function sendTest() {
    await fetch("/api/push-test", { method: "POST" });
  }

  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: "0.03em",
    padding: "6px 10px",
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  if (status === "checking" || status === "unsupported") return null;

  if (status === "denied") {
    return (
      <span className="btn" style={{ ...baseStyle, color: "var(--text-faint)", cursor: "default" }} title="Blocked in browser settings">
        <BellOff size={14} strokeWidth={2.25} />
        blocked
      </span>
    );
  }

  if (status === "on") {
    return (
      <span style={{ display: "flex", gap: 6 }}>
        <button className="btn" onClick={sendTest} style={{ ...baseStyle, color: "var(--accent-buy)" }} title="Send a test notification">
          <BellRing size={14} strokeWidth={2.25} />
          on
        </button>
        <button className="btn" onClick={disable} style={{ ...baseStyle, color: "var(--text-faint)", padding: "6px 8px" }} title="Turn off notifications">
          <X size={14} strokeWidth={2.25} />
        </button>
      </span>
    );
  }

  return (
    <button className="btn" onClick={enable} disabled={status === "busy"} style={{ ...baseStyle, color: "var(--text-muted)" }}>
      <Bell size={14} strokeWidth={2.25} />
      {status === "busy" ? "..." : "enable alerts"}
    </button>
  );
}
