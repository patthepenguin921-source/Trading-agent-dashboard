// Skeleton loading screens (shimmer placeholders mirroring each page's real
// layout) shown by Next.js loading.tsx boundaries during server renders —
// tab taps and card clicks paint structure immediately instead of holding
// the old page. Shimmer is pure CSS (.skeleton in globals.css) and goes
// static under prefers-reduced-motion.

function Bone({ w, h, r = 6, style }: { w: number | string; h: number; r?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

function CardShell({ children, height }: { children?: React.ReactNode; height?: number }) {
  return (
    <div
      style={{
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        padding: 18,
        background: "var(--bg-surface)",
        height,
      }}
    >
      {children}
    </div>
  );
}

// Overview: grid of agent cards (title, tagline, big number, sparkline, meta row).
export function OverviewSkeleton() {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <Bone w="min(540px, 70%)" h={34} />
        <Bone w={90} h={30} r={999} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <CardShell key={i}>
            <Bone w={90} h={18} />
            <Bone w={150} h={11} style={{ marginTop: 8 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18 }}>
              <div>
                <Bone w={120} h={24} />
                <Bone w={160} h={12} style={{ marginTop: 6 }} />
              </div>
              <Bone w={96} h={32} r={4} />
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
              <Bone w={50} h={11} />
              <Bone w={80} h={11} />
              <Bone w={110} h={11} />
            </div>
          </CardShell>
        ))}
      </div>
    </div>
  );
}

// Per-agent pages: header, sub-nav pill bar, then a chart-sized card and rows.
export function AgentPageSkeleton() {
  return (
    <div>
      <Bone w={110} h={20} />
      <Bone w={210} h={11} style={{ marginTop: 6, marginBottom: 16 }} />
      <Bone w="100%" h={42} r={999} style={{ marginBottom: 20 }} />
      <CardShell height={320}>
        <Bone w={200} h={24} r={999} />
        <Bone w="100%" h={230} style={{ marginTop: 20 }} />
      </CardShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {[0, 1, 2].map((i) => (
          <CardShell key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <Bone w={80} h={14} />
              <Bone w={120} h={12} />
            </div>
            <Bone w="85%" h={12} style={{ marginTop: 12 }} />
            <Bone w="60%" h={12} style={{ marginTop: 8 }} />
          </CardShell>
        ))}
      </div>
    </div>
  );
}

// Compare: legend chips, chart card, then the per-agent stat columns.
export function CompareSkeleton() {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Bone w={180} h={26} r={999} />
      </div>
      <CardShell height={380}>
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <Bone key={i} w={70} h={12} />
          ))}
        </div>
        <Bone w={200} h={24} r={999} />
        <Bone w="100%" h={250} style={{ marginTop: 20 }} />
      </CardShell>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, minWidth: 240 }}>
            <CardShell>
              <Bone w={90} h={16} />
              <Bone w={150} h={11} style={{ marginTop: 8, marginBottom: 14 }} />
              {[0, 1, 2, 3, 4].map((j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0" }}>
                  <Bone w={90} h={11} />
                  <Bone w={60} h={11} />
                </div>
              ))}
            </CardShell>
          </div>
        ))}
      </div>
    </div>
  );
}
