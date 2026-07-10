"use client";

import { usePathname } from "next/navigation";

// Re-keying on pathname forces React to remount this div on every route
// change, which restarts the CSS animation — a cheap, dependency-free way
// to get a "the page just arrived" feel without the View Transitions API
// (which Turbopack/Next 16 here doesn't yet support cleanly for app router).
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="page-fade-in">{children}</div>;
}
