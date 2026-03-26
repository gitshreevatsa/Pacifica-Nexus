/**
 * NexusDashboard.tsx
 * Glassmorphic three-column terminal layout.
 * Left: Alpha Feed · Center: Chart + Arb Scanner · Right: Risk Guard
 */

"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import SessionBar from "@/components/terminal/SessionBar";

const AlphaFeed  = dynamic(() => import("@/components/terminal/AlphaFeed"),  { ssr: false, loading: () => <PanelSkeleton rows={6} /> });
const PriceChart = dynamic(() => import("@/components/terminal/PriceChart"), { ssr: false, loading: () => <div className="flex-1 animate-pulse rounded-2xl" style={{ background: "rgba(255,255,255,0.02)" }} /> });
const ArbScanner = dynamic(() => import("@/components/terminal/ArbScanner"), { ssr: false, loading: () => <PanelSkeleton rows={3} /> });
const RiskGuard  = dynamic(() => import("@/components/terminal/RiskGuard"),  { ssr: false, loading: () => <PanelSkeleton rows={4} /> });

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

export default function NexusDashboard() {
  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "#050505" }}
    >
      <SessionBar />

      <main className="flex-1 grid grid-cols-[380px_1fr_340px] gap-2.5 p-2.5 overflow-hidden min-h-0">
        {/* Left — Alpha Feed */}
        <div className="glass-panel border-none overflow-hidden flex flex-col min-h-0">
          <Suspense fallback={<PanelSkeleton rows={6} />}>
            <AlphaFeed />
          </Suspense>
        </div>

        {/* Center — Chart + Arb Scanner */}
        <div className="border-none flex flex-col gap-2.5 overflow-hidden min-h-0">
          <div className="glass-panel border-none flex-[2] min-h-0 flex flex-col" style={{ overflow: "clip" }}>
            <Suspense fallback={<div className="flex-1 animate-pulse" style={{ background: "rgba(255,255,255,0.02)" }} />}>
              <PriceChart />
            </Suspense>
          </div>
          <div className="glass-panel border-none flex-[1] min-h-0 max-h-[45%] overflow-hidden flex flex-col">
            <Suspense fallback={<PanelSkeleton rows={3} />}>
              <ArbScanner />
            </Suspense>
          </div>
        </div>

        {/* Right — Risk Guard */}
        <div className="glass-panel border-none overflow-hidden flex flex-col min-h-0">
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <RiskGuard />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
