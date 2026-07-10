"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { DualReturnChart, type ChartMode } from "./DualReturnChartClient";

// The chart's Since-first-log / Since-day-open tabs used to be state private
// to the chart, so the stats rendered below it were stuck showing all-time
// numbers whichever tab was active. This wrapper owns the mode instead and
// swaps between two server-rendered sections in step with the tabs — the
// day tab shows what happened that day, the all-time tab shows everything.
// Both sections arrive fully rendered from the server; the client only
// picks which one is visible.
type ChartProps = Omit<ComponentProps<typeof DualReturnChart>, "mode" | "onModeChange">;

export default function ChartModeView({
  chartProps,
  chartHeader,
  belowAlltime,
  belowDaily,
}: {
  chartProps: ChartProps;
  // Rendered inside the chart card, above the chart (the compare page's legend row).
  chartHeader?: ReactNode;
  belowAlltime?: ReactNode;
  // Day-scoped version of the section below the chart. Falls back to
  // belowAlltime when absent (e.g. no day with data yet).
  belowDaily?: ReactNode;
}) {
  const [mode, setMode] = useState<ChartMode>("alltime");
  return (
    <>
      <div
        className="card"
        style={{
          border: "1px solid var(--border-hairline)",
          borderRadius: 12,
          padding: 18,
          background: "var(--bg-surface)",
          marginBottom: 20,
        }}
      >
        {chartHeader}
        <DualReturnChart {...chartProps} mode={mode} onModeChange={setMode} />
      </div>
      {mode === "daily" ? (belowDaily ?? belowAlltime) : belowAlltime}
    </>
  );
}
