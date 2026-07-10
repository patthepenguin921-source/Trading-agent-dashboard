"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

export type SlidingTab = {
  key: string;
  label: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  // When set, tabs render as real links (prefetch, open-in-new-tab all work)
  // and a drag-snap navigates. Without it, selection is reported via onSelect.
  href?: string;
  title?: string;
};

// Container padding — the pill insets by this on all sides.
const PAD = 4;
// Finger movement (px) before a press becomes a drag instead of a tap.
const DRAG_THRESHOLD = 6;

// Segmented pill nav with equal-width tabs and a draggable indicator: tap a
// tab like always, or press anywhere on the bar and slide — the pill tracks
// the pointer 1:1, then snaps to the nearest tab on release and selects it.
// Tabs sit on grid tracks (minmax(0, 1fr)) so every tab is exactly the same
// width no matter how long its label is — flex:1 couldn't shrink a tab below
// its label's width, which left the tabs visibly uneven.
export default function SlidingTabs({
  tabs,
  activeKey,
  indicatorColor,
  activeTextColor = "#0a0c10",
  onSelect,
  compact = false,
  collapseLabels = false,
  style,
}: {
  tabs: SlidingTab[];
  activeKey: string;
  indicatorColor: string;
  activeTextColor?: string;
  onSelect?: (key: string) => void;
  // Smaller type/padding, and the bar hugs its content instead of stretching.
  compact?: boolean;
  // Hide text labels on narrow screens (icons stay) — see .sliding-tab-label.
  collapseLabels?: boolean;
  style?: CSSProperties;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<(HTMLElement | null)[]>([]);

  // Where a drag-release optimistically moved the pill, until the real
  // activeKey catches up (instant for onSelect, a navigation later for hrefs).
  const [optimisticIndex, setOptimisticIndex] = useState<number | null>(null);
  const propIndex = Math.max(0, tabs.findIndex((t) => t.key === activeKey));
  const activeIndex = optimisticIndex ?? propIndex;
  useEffect(() => setOptimisticIndex(null), [activeKey]);

  const [indicator, setIndicator] = useState<{ x: number; width: number } | null>(null);
  // Pointer x in container coordinates while dragging, null otherwise.
  const [dragX, setDragX] = useState<number | null>(null);
  const pressRef = useRef<{ id: number; startX: number; dragging: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  // Exact geometry from rects (offsetLeft's origin is inconsistent across
  // border/padding combinations): x is relative to the container's padding
  // edge, the same origin `left: 0` resolves to for the absolute pill.
  function tabGeometry(i: number) {
    const container = containerRef.current;
    const el = tabRefs.current[i];
    if (!container || !el) return null;
    const cRect = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return { x: rect.left - cRect.left - container.clientLeft, width: rect.width };
  }

  useLayoutEffect(() => {
    const g = tabGeometry(activeIndex);
    if (g) setIndicator(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, tabs.length]);

  useEffect(() => {
    function measure() {
      const g = tabGeometry(activeIndex);
      if (g) setIndicator(g);
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, tabs.length]);

  function pointerToContainerX(e: ReactPointerEvent) {
    const container = containerRef.current!;
    const cRect = container.getBoundingClientRect();
    return e.clientX - cRect.left - container.clientLeft;
  }

  function nearestIndex(x: number) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < tabs.length; i++) {
      const g = tabGeometry(i);
      if (!g) continue;
      const d = Math.abs(g.x + g.width / 2 - x);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    return best;
  }

  // Haptic ticks on devices that support it (progressive enhancement — the
  // Vibration API is a no-op elsewhere): a light tick as the dragged pill
  // crosses onto each tab, a firmer one when it snaps.
  const lastTickRef = useRef<number | null>(null);

  function commit(index: number) {
    const tab = tabs[index];
    if (!tab) return;
    navigator.vibrate?.(10);
    setOptimisticIndex(index);
    if (tab.href) {
      if (index !== propIndex) router.push(tab.href);
    } else {
      onSelect?.(tab.key);
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressRef.current = { id: e.pointerId, startX: e.clientX, dragging: false };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const press = pressRef.current;
    if (!press || e.pointerId !== press.id) return;
    if (!press.dragging) {
      if (Math.abs(e.clientX - press.startX) < DRAG_THRESHOLD) return;
      press.dragging = true;
      // Capture only once it's a real drag, so plain taps stay native clicks.
      containerRef.current?.setPointerCapture(e.pointerId);
      lastTickRef.current = null;
    }
    const x = pointerToContainerX(e);
    const near = nearestIndex(x);
    if (lastTickRef.current !== null && lastTickRef.current !== near) navigator.vibrate?.(4);
    lastTickRef.current = near;
    setDragX(x);
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const press = pressRef.current;
    if (!press || e.pointerId !== press.id) return;
    pressRef.current = null;
    if (!press.dragging) return;
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    // Swallow the click the browser synthesizes after this pointerup.
    suppressClickRef.current = true;
    setTimeout(() => (suppressClickRef.current = false), 0);
    if (!cancelled) commit(nearestIndex(pointerToContainerX(e)));
    setDragX(null);
  }

  function onClickCapture(e: ReactMouseEvent) {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // While dragging: pill centers under the finger, clamped to the tab row,
  // and whichever tab it's nearest lights up as the would-be selection.
  const dragging = dragX !== null;
  let indicatorX = indicator?.x ?? 0;
  if (dragging && indicator) {
    const first = tabGeometry(0);
    const last = tabGeometry(tabs.length - 1);
    if (first && last) {
      indicatorX = Math.min(Math.max(dragX! - indicator.width / 2, first.x), last.x);
    }
  }
  const highlightIndex = dragging ? nearestIndex(dragX!) : activeIndex;

  const fontSize = compact ? 11 : 12.5;
  const tabPadding = compact ? "5px 10px" : "8px 4px";

  return (
    <div
      ref={containerRef}
      data-sliding-tabs=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      onClickCapture={onClickCapture}
      style={{
        position: "relative",
        display: compact ? "inline-grid" : "grid",
        ...(compact
          ? { gridAutoFlow: "column", gridAutoColumns: "1fr" }
          : { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }),
        gap: 4,
        padding: PAD,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-hairline)",
        borderRadius: 999,
        touchAction: "pan-y",
        userSelect: "none",
        WebkitUserSelect: "none",
        ...style,
      }}
    >
      {indicator ? (
        <div
          className="subnav-indicator"
          style={{
            transform: `translateX(${indicatorX}px)`,
            width: indicator.width,
            background: indicatorColor,
            ...(dragging ? { transition: "none" } : null),
          }}
        />
      ) : null}

      {tabs.map((tab, i) => {
        const isLit = i === highlightIndex;
        const inner = (
          <>
            {tab.icon ? <tab.icon size={compact ? 12 : 13} strokeWidth={2.25} /> : null}
            <span className={collapseLabels ? "sliding-tab-label" : undefined}>{tab.label}</span>
          </>
        );
        const tabStyle: CSSProperties = {
          position: "relative",
          zIndex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          whiteSpace: "nowrap",
          textAlign: "center",
          textDecoration: "none",
          fontFamily: "var(--font-mono)",
          fontSize,
          letterSpacing: "0.02em",
          padding: tabPadding,
          borderRadius: 999,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: isLit ? activeTextColor : "var(--text-muted)",
          fontWeight: isLit ? 600 : 400,
          transition: "color 0.18s var(--ease)",
        };
        const ref = (el: HTMLElement | null) => {
          tabRefs.current[i] = el;
        };
        return tab.href ? (
          <Link
            key={tab.key}
            ref={ref as (el: HTMLAnchorElement | null) => void}
            href={tab.href}
            title={tab.title}
            draggable={false}
            style={tabStyle}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={tab.key}
            ref={ref as (el: HTMLButtonElement | null) => void}
            type="button"
            title={tab.title}
            onClick={() => commit(i)}
            style={tabStyle}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
