/**
 * NexusDashboard.tsx
 * Three-column terminal layout (client component).
 * Left: Alpha Feed · Center: Chart + Arb Scanner · Right: Risk Guard
 */

"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import SessionBar from "@/components/terminal/SessionBar";

// No SSR — all panels use browser APIs (WebSocket, canvas, sessionStorage)
const AlphaFeed  = dynamic(() => import("@/components/terminal/AlphaFeed"),  { ssr: false, loading: () => <PanelSkeleton rows={6} /> });
const PriceChart = dynamic(() => import("@/components/terminal/PriceChart"), { ssr: false, loading: () => <div className="flex-1 bg-surface-raised animate-pulse rounded-lg" /> });
const ArbScanner = dynamic(() => import("@/components/terminal/ArbScanner"), { ssr: false, loading: () => <PanelSkeleton rows={3} /> });
const RiskGuard  = dynamic(() => import("@/components/terminal/RiskGuard"),  { ssr: false, loading: () => <PanelSkeleton rows={4} /> });

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 bg-surface-raised rounded-lg animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-midnight border border-surface-border rounded-xl overflow-hidden flex flex-col ${className}`}>
      {children}
    </div>
  );
}

export default function NexusDashboard() {
  return (
    <div className="flex flex-col h-screen bg-[#050811]">
      <SessionBar />

      <main className="flex-1 grid grid-cols-[320px_1fr_340px] gap-2 p-2 overflow-hidden min-h-0">
        {/* Left — Whale Shadow */}
        <Panel>
          <Suspense fallback={<PanelSkeleton rows={6} />}>
            <AlphaFeed />
          </Suspense>
        </Panel>

        {/* Center — Chart + Arb Scanner */}
        <div className="flex flex-col gap-2 overflow-hidden min-h-0">
          <Panel className="flex-[2] min-h-0">
            <Suspense fallback={<div className="flex-1 bg-surface-raised animate-pulse" />}>
              <PriceChart />
            </Suspense>
          </Panel>
          <Panel className="flex-[1] min-h-0 max-h-[45%]">
            <Suspense fallback={<PanelSkeleton rows={3} />}>
              <ArbScanner />
            </Suspense>
          </Panel>
        </div>

        {/* Right — Risk Guard */}
        <Panel>
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <RiskGuard />
          </Suspense>
        </Panel>
      </main>
    </div>
  );
}
