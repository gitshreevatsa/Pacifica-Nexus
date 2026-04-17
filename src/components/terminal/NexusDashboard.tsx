/**
 * NexusDashboard.tsx
 * Glassmorphic three-column terminal layout.
 * Left: Alpha Feed · Center: Chart + Arb/Markets/Trades (resizable) · Right: Risk Guard
 * Between main & footer: Portfolio Summary Bar
 * Bottom: Quick Order Bar
 */

"use client";

import { Suspense, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import SessionBar from "@/components/terminal/SessionBar";
import QuickOrderBar from "@/components/terminal/QuickOrderBar";
import PortfolioSummaryBar from "@/components/terminal/PortfolioSummaryBar";
import { KillSwitchBanner } from "@/components/terminal/KillSwitchBanner";
import { useToastStore } from "@/stores/toastStore";

const AlphaFeed    = dynamic(() => import("@/components/terminal/AlphaFeed"),    { ssr: false, loading: () => <PanelSkeleton rows={6} /> });
const PriceChart   = dynamic(() => import("@/components/terminal/PriceChart"),   { ssr: false, loading: () => <div className="flex-1 animate-pulse rounded-2xl" style={{ background: "rgba(255,255,255,0.02)" }} /> });
const ArbScanner   = dynamic(() => import("@/components/terminal/ArbScanner"),   { ssr: false, loading: () => <PanelSkeleton rows={3} /> });
const RiskGuard    = dynamic(() => import("@/components/terminal/RiskGuard"),    { ssr: false, loading: () => <PanelSkeleton rows={4} /> });
const TradeLog     = dynamic(() => import("@/components/terminal/TradeLog"),     { ssr: false, loading: () => <PanelSkeleton rows={4} /> });
const MarketScanner = dynamic(() => import("@/components/terminal/MarketScanner"), { ssr: false, loading: () => <PanelSkeleton rows={6} /> });
const TpSlManager  = dynamic(() => import("@/components/terminal/TpSlManager"),  { ssr: false, loading: () => <PanelSkeleton rows={4} /> });

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 rounded-xl animate-pulse"
          style={{ background: "rgba(255,255,255,0.04)", animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}

// ─── Global error/info toast ──────────────────────────────────────────────────

function GlobalToast() {
  const { message, variant, clear } = useToastStore();
  if (!message) return null;

  const bg =
    variant === "error"
      ? "rgba(220,38,38,0.85)"
      : variant === "success"
      ? "rgba(22,163,74,0.85)"
      : "rgba(30,40,70,0.92)";

  return (
    <div
      onClick={clear}
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: bg,
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        padding: "10px 20px",
        color: "#fff",
        fontSize: 13,
        fontWeight: 500,
        zIndex: 9999,
        cursor: "pointer",
        maxWidth: 480,
        textAlign: "center",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      {message}
    </div>
  );
}

type CenterTab = "arb" | "markets" | "trades" | "tpsl";

function CenterTabBar({
  active,
  onChange,
}: {
  active: CenterTab;
  onChange: (t: CenterTab) => void;
}) {
  const tabs: { id: CenterTab; label: string }[] = [
    { id: "arb",     label: "Arbitrage Scanner" },
    { id: "markets", label: "Market Scanner"    },
    { id: "trades",  label: "Trade Log"         },
    { id: "tpsl",    label: "TP / SL"           },
  ];

  return (
    <div className="flex items-center gap-1 px-3 pt-2 pb-0 shrink-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={
            active === t.id
              ? "market-tab-selected text-[11px] font-semibold px-3 py-1 rounded-lg"
              : "market-tab text-[11px] font-semibold px-3 py-1 rounded-lg"
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Draggable divider ────────────────────────────────────────────────────────

const DIVIDER_H   = 8;   // px
const MIN_PANEL_H = 80;  // px — minimum height for either panel

interface DividerProps {
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove:  (e: React.PointerEvent) => void;
  onDragEnd:   () => void;
  isDragging:  boolean;
}

function ResizeDivider({ onDragStart, onDragMove, onDragEnd, isDragging }: DividerProps) {
  return (
    <div
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      className="shrink-0 flex items-center justify-center group select-none"
      style={{
        height: DIVIDER_H,
        cursor: "ns-resize",
        zIndex: 10,
      }}
    >
      <div
        className="rounded-full transition-all duration-150"
        style={{
          width:      isDragging ? 48 : 32,
          height:     isDragging ? 3 : 2,
          background: isDragging
            ? "rgba(0,98,255,0.7)"
            : "rgba(255,255,255,0.1)",
          boxShadow: isDragging ? "0 0 8px rgba(0,98,255,0.4)" : undefined,
        }}
      />
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function NexusDashboard() {
  const [centerTab,  setCenterTab]  = useState<CenterTab>("arb");
  const [chartFrac,  setChartFrac]  = useState(0.58); // 0–1 fraction of center column
  const [isDragging, setIsDragging] = useState(false);

  const centerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ active: false, startY: 0, startFrac: 0.58 });

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { active: true, startY: e.clientY, startFrac: chartFrac };
    setIsDragging(true);
  }, [chartFrac]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active || !centerRef.current) return;
    const totalH    = centerRef.current.offsetHeight - DIVIDER_H;
    const deltaFrac = (e.clientY - dragState.current.startY) / totalH;
    const minFrac   = MIN_PANEL_H / totalH;
    const maxFrac   = 1 - minFrac;
    setChartFrac(Math.min(maxFrac, Math.max(minFrac, dragState.current.startFrac + deltaFrac)));
  }, []);

  const handleDragEnd = useCallback(() => {
    dragState.current.active = false;
    setIsDragging(false);
  }, []);

  return (
    <div className="flex flex-col h-screen" style={{ background: "#050505" }}>
      <SessionBar />
      <KillSwitchBanner />

      <main className="flex-1 grid grid-cols-[380px_1fr_340px] gap-2.5 p-2.5 overflow-hidden min-h-0">
        {/* Left — Alpha Feed */}
        <div className="glass-panel border-none overflow-hidden flex flex-col min-h-0">
          <Suspense fallback={<PanelSkeleton rows={6} />}>
            <AlphaFeed />
          </Suspense>
        </div>

        {/* Center — Chart + tabs (resizable) */}
        <div
          ref={centerRef}
          className="flex flex-col overflow-hidden min-h-0"
          style={{ userSelect: isDragging ? "none" : undefined }}
        >
          {/* Chart panel — height driven by chartFrac */}
          <div
            className="glass-panel border-none flex flex-col min-h-0"
            style={{ flex: `${chartFrac} 0 0`, overflow: "clip" }}
          >
            <Suspense fallback={<div className="flex-1 animate-pulse" style={{ background: "rgba(255,255,255,0.02)" }} />}>
              <PriceChart />
            </Suspense>
          </div>

          {/* Drag handle */}
          <ResizeDivider
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            isDragging={isDragging}
          />

          {/* Bottom panel — Arb Scanner / Market Scanner / Trade Log */}
          <div
            className="glass-panel border-none flex flex-col min-h-0"
            style={{ flex: `${1 - chartFrac} 0 0`, overflow: "hidden" }}
          >
            <CenterTabBar active={centerTab} onChange={setCenterTab} />

            {centerTab === "arb" && (
              <Suspense fallback={<PanelSkeleton rows={3} />}>
                <ArbScanner />
              </Suspense>
            )}
            {centerTab === "markets" && (
              <Suspense fallback={<PanelSkeleton rows={6} />}>
                <MarketScanner />
              </Suspense>
            )}
            {centerTab === "trades" && (
              <Suspense fallback={<PanelSkeleton rows={4} />}>
                <TradeLog />
              </Suspense>
            )}
            {centerTab === "tpsl" && (
              <Suspense fallback={<PanelSkeleton rows={4} />}>
                <TpSlManager />
              </Suspense>
            )}
          </div>
        </div>

        {/* Right — Risk Guard */}
        <div className="glass-panel border-none overflow-hidden flex flex-col min-h-0">
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <RiskGuard />
          </Suspense>
        </div>
      </main>

      {/* Portfolio summary strip */}
      <PortfolioSummaryBar />

      {/* Bottom — Quick Order Bar */}
      <QuickOrderBar />

      {/* Global error / success toasts from mutation onError handlers */}
      <GlobalToast />
    </div>
  );
}
