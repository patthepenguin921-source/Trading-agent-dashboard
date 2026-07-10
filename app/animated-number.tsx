"use client";

import { useEffect, useRef, useState } from "react";

// Robinhood-style live number: when the value changes (the dashboard
// re-reads Supabase every 60s via EquityRefresher), the figure rolls from
// the old value to the new one and flashes green/red for the direction of
// the move, then settles back to its normal color. First mount renders
// instantly — animation only ever marks a *change*, never entry.
//
// Formatting is declarative (kind) rather than a formatter prop because
// this renders inside server components, which can't pass functions.

const ROLL_MS = 650;
const FLASH_MS = 900;

function fmt(kind: "money" | "signedMoney", n: number): string {
  const money = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (kind === "signedMoney") return `${n < 0 ? "-" : "+"}${money}`;
  return n < 0 ? `-${money}` : money;
}

export default function AnimatedNumber({
  value,
  kind = "money",
}: {
  value: number | null;
  kind?: "money" | "signedMoney";
}) {
  const [display, setDisplay] = useState<number | null>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef<number | null>(value);
  const rafRef = useRef<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (value === null || prev === null || prev === value) {
      setDisplay(value);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    setFlash(value > prev ? "up" : "down");
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), FLASH_MS);

    const start = performance.now();
    const from = prev;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    []
  );

  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        color: flash === "up" ? "var(--accent-buy)" : flash === "down" ? "var(--accent-sell)" : undefined,
        transition: "color 0.4s var(--ease)",
      }}
    >
      {display === null ? "—" : fmt(kind, display)}
    </span>
  );
}
