"use client";

import { ScrollText, Wallet, ArrowRightLeft, FileText, GraduationCap } from "lucide-react";
import SlidingTabs from "./sliding-tabs";

export default function AgentSubNav({
  id,
  accent,
  active,
}: {
  id: string;
  accent: string;
  active: "log" | "positions" | "trades" | "brief" | "reports";
}) {
  const tabs = [
    { key: "log", label: "Log", href: `/agent/${id}`, icon: ScrollText },
    { key: "positions", label: "Positions", href: `/agent/${id}/positions`, icon: Wallet },
    { key: "trades", label: "Trades", href: `/agent/${id}/trades`, icon: ArrowRightLeft },
    { key: "brief", label: "Brief", href: `/agent/${id}/instructions`, icon: FileText },
    { key: "reports", label: "Learning", href: `/agent/${id}/reports`, icon: GraduationCap },
  ];
  return (
    <SlidingTabs
      tabs={tabs.map((t) => ({ ...t, title: t.label }))}
      activeKey={active}
      indicatorColor={accent}
      collapseLabels
      style={{ marginBottom: 20 }}
    />
  );
}
