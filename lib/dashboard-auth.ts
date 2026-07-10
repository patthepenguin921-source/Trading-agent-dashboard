"use client";

// There's no login system on this dashboard — it's a single-owner tool.
// Writes that matter (rewriting a live trading agent's system prompt) are
// gated by a shared secret the owner enters once per browser and which is
// then sent as a header to the write API routes. Set DASHBOARD_WRITE_SECRET
// in Vercel to whatever value you want the owner to know.
const STORAGE_KEY = "dashboardWriteKey";

export function getDashboardKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function promptForDashboardKey(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.prompt("Enter the dashboard write key to save changes:");
  if (value) window.localStorage.setItem(STORAGE_KEY, value);
  return value;
}

export function clearDashboardKey(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
