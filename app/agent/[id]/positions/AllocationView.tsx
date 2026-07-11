"use client";

import { useState } from "react";
import type { Position } from "../../../../lib/supabase";
import { PortfolioPieChart } from "./PieChart";
import { PortfolioHeatmap } from "./PortfolioHeatmap";

export function AllocationView({
  positions,
  totalMarketValue,
  accent,
}: {
  positions: Position[];
  totalMarketValue: number;
  accent: string;
}) {
  const [mode, setMode] = useState<"pie" | "heatmap">("pie");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10 }}>
        {(["pie", "heatmap"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="btn"
            style={{
              cursor: "pointer",
              padding: "5px 12px",
              borderRadius: 999,
              color: mode === m ? accent : "var(--text-muted)",
              borderColor: mode === m ? accent : "var(--border-hairline)",
            }}
          >
            {m === "pie" ? "Pie" : "Heatmap"}
          </button>
        ))}
      </div>

      {mode === "pie" ? (
        <PortfolioPieChart positions={positions} totalMarketValue={totalMarketValue} />
      ) : (
        <PortfolioHeatmap positions={positions} totalMarketValue={totalMarketValue} />
      )}
    </div>
  );
}
