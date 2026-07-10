"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ArrowLeftRight, Zap, ShieldCheck, Bot, Coins, Rocket, type LucideIcon } from "lucide-react";
import NotifyBell from "./notify-bell";
import type { AgentMeta } from "../lib/agents";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string; icon: LucideIcon; accent?: string; match: (p: string) => boolean };

const AGENT_ICONS: Record<string, LucideIcon> = { plutus: Zap, helios: ShieldCheck, hermes: Coins, eris: Rocket };

function buildItems(agents: AgentMeta[]): NavItem[] {
  return [
    { href: "/", label: "Overview", icon: LayoutGrid, match: (p) => p === "/" },
    { href: "/compare", label: "Compare", icon: ArrowLeftRight, match: (p) => p === "/compare" },
    ...agents.map((agent) => ({
      href: `/agent/${agent.id}`,
      label: agent.label,
      icon: AGENT_ICONS[agent.id] || Bot,
      accent: agent.accent,
      match: (p: string) => p.startsWith(`/agent/${agent.id}`),
    })),
  ];
}

function isMarketOpenNow(): boolean {
  const now = new Date();
  const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = nyTime.getDay(); // 0=Sun, 6=Sat
  const mins = nyTime.getHours() * 60 + nyTime.getMinutes();
  return day >= 1 && day <= 5 && mins >= 570 && mins < 960; // 9:30–16:00 ET
}

export default function Nav({ agents }: { agents: AgentMeta[] }) {
  const pathname = usePathname();
  const items = buildItems(agents);
  const [marketOpen, setMarketOpen] = useState<boolean | null>(null);

  useEffect(() => {
    setMarketOpen(isMarketOpenNow());
    const id = setInterval(() => setMarketOpen(isMarketOpenNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          padding: "16px 20px",
          background: "color-mix(in srgb, var(--bg-base) 88%, transparent)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-hairline)",
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/icon-192.png" alt="" width={28} height={28} style={{ borderRadius: 7, flexShrink: 0 }} />
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                }}
              >
                Trading Agents
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                {/* "paper · sim" badge chip */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "var(--text-faint)",
                    border: "1px solid var(--border-hairline)",
                    borderRadius: 4,
                    padding: "1px 5px",
                    lineHeight: 1.6,
                  }}
                >
                  paper · sim
                </div>
                {/* Market status — suppressed until hydrated to avoid SSR mismatch */}
                {marketOpen !== null && (
                  <>
                    <style>{`@keyframes mkt-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                        color: marketOpen ? "var(--accent-buy)" : "var(--text-faint)",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: marketOpen ? "var(--accent-buy)" : "var(--text-faint)",
                          animation: marketOpen ? "mkt-pulse 2s ease-in-out infinite" : "none",
                        }}
                      />
                      {marketOpen ? "open" : "closed"}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Desktop/tablet nav — hidden on phones in favor of the bottom tab bar. */}
            <nav className="desktop-nav" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {items.map((item) => {
                const isActive = item.match(pathname);
                const accent = item.accent;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      textDecoration: "none",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                      letterSpacing: "0.02em",
                      padding: "7px 12px",
                      borderRadius: 999,
                      color: isActive ? (accent || "var(--text-primary)") : "var(--text-muted)",
                      background: isActive
                        ? accent
                          ? `color-mix(in srgb, ${accent} 10%, var(--bg-surface-2))`
                          : "var(--bg-surface-2)"
                        : "transparent",
                      border: isActive
                        ? accent
                          ? `1px solid color-mix(in srgb, ${accent} 28%, var(--border-hairline))`
                          : "1px solid var(--border-hairline)"
                        : "1px solid transparent",
                      transition: "background 0.15s var(--ease), color 0.15s var(--ease), border-color 0.15s var(--ease)",
                    }}
                  >
                    <item.icon size={14} strokeWidth={2.25} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <NotifyBell />
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — fixed, app-like, replaces the desktop nav row
          below the 520px breakpoint (see .mobile-tabbar in globals.css). */}
      <nav className="mobile-tabbar">
        {items.map((item) => {
          const isActive = item.match(pathname);
          const color = isActive ? item.accent || "var(--accent-focus)" : "var(--text-faint)";
          return (
            <Link key={item.href} href={item.href} className="mobile-tabbar-item" style={{ color }}>
              <item.icon
                size={20}
                strokeWidth={2.25}
                style={{ transform: isActive ? "translateY(-1px) scale(1.05)" : "none", transition: "transform 0.18s var(--ease)" }}
              />
              <span style={{ fontSize: 10.5, letterSpacing: "0.01em" }}>{item.label}</span>
              {isActive ? <span className="mobile-tabbar-dot" style={{ background: color }} /> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
