"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// Filter bar for the run log. All state lives in the URL so filtered views
// are shareable/bookmarkable and the page itself stays a server component —
// this component just reads/writes searchParams.

function chip(active: boolean, accent: string) {
  return {
    fontSize: 12,
    padding: "5px 12px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? `color-mix(in srgb, ${accent} 30%, var(--border-hairline))` : "var(--border-hairline)"}`,
    color: active ? accent : "var(--text-muted)",
    background: active ? `color-mix(in srgb, ${accent} 10%, transparent)` : "transparent",
    fontFamily: "var(--font-mono)",
    whiteSpace: "nowrap" as const,
  };
}

export default function LogFilterBar({ agentId, accent }: { agentId: string; accent: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") || "all"; // all | trades | errors | offhours
  const symbol = params.get("symbol") || "";
  const confidence = params.get("confidence") || "";
  const [symbolInput, setSymbolInput] = useState(symbol);

  function apply(next: Record<string, string>) {
    const merged = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    merged.delete("show"); // reset pagination when filters change
    router.replace(`/agent/${agentId}?${merged.toString()}`, { scroll: false });
  }

  const views = [
    { key: "all", label: "all runs" },
    { key: "trades", label: "trades" },
    { key: "offhours", label: "off-hours" },
    { key: "errors", label: "errors" },
  ];

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      {views.map((v) => (
        <button key={v.key} style={chip(view === v.key, accent)} onClick={() => apply({ view: v.key === "all" ? "" : v.key })}>
          {v.label}
        </button>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ symbol: symbolInput.trim().toUpperCase() });
        }}
        style={{ display: "inline-flex" }}
      >
        <input
          className="input"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="symbol…"
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            padding: "5px 12px",
            borderRadius: 999,
            border: "1px solid var(--border-hairline)",
            background: "transparent",
            color: "var(--text-primary)",
            width: 92,
          }}
        />
      </form>
      {symbol ? (
        <button style={chip(true, accent)} onClick={() => { setSymbolInput(""); apply({ symbol: "" }); }}>
          {symbol} ✕
        </button>
      ) : null}
      <select
        value={confidence}
        onChange={(e) => apply({ confidence: e.target.value })}
        style={{
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          padding: "5px 10px",
          borderRadius: 999,
          border: "1px solid var(--border-hairline)",
          background: "var(--bg-surface)",
          color: confidence ? accent : "var(--text-muted)",
        }}
      >
        <option value="">any confidence</option>
        <option value="high">high</option>
        <option value="medium">medium</option>
        <option value="low">low</option>
      </select>
    </div>
  );
}
