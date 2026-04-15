/**
 * PortfolioSummaryBar.tsx
 * Slim session-performance strip rendered between the main panels and the Quick Order Bar.
 * Shows: Open PnL · Equity · Session trades · Opens · Closes/De-risks · Est. fees paid.
 */

"use client";

import { useMemo } from "react";
import { usePacifica } from "@/hooks/usePacifica";
import { useTradeLogStore } from "@/stores/tradeLogStore";
import { cn, formatUSD } from "@/lib/utils";

// Average Pacifica taker fee (~0.05 %)
const TAKER_FEE_RATE = 0.0005;

function Divider() {
  return (
    <div
      className="w-px h-3 shrink-0"
      style={{ background: "rgba(255,255,255,0.07)" }}
    />
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">{label}</span>
      <span className={cn("text-[11px] font-mono font-semibold", color ?? "text-slate-300")}>
        {value}
      </span>
    </div>
  );
}

export default function PortfolioSummaryBar() {
  const { accountHealth } = usePacifica();
  const { entries } = useTradeLogStore();

  const stats = useMemo(() => {
    const opens   = entries.filter((e) => e.type === "OPEN").length;
    const closes  = entries.filter((e) => e.type === "CLOSE").length;
    const derisks = entries.filter((e) => e.type === "DE-RISK").length;
    const totalNotional = entries.reduce((s, e) => s + e.notional, 0);
    const estimatedFees = totalNotional * TAKER_FEE_RATE;
    return { total: entries.length, opens, closes, derisks, estimatedFees };
  }, [entries]);

  // Nothing to show before any data arrives
  if (!accountHealth && entries.length === 0) return null;

  const pnl    = accountHealth?.unrealizedPnl ?? null;
  const equity = accountHealth?.equity ?? null;

  return (
    <div
      className="shrink-0 flex items-center gap-4 px-5 py-1.5 overflow-x-auto custom-scrollbar"
      style={{
        background:   "rgba(255,255,255,0.015)",
        borderTop:    "1px solid rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span className="text-[9px] font-mono text-slate-700 uppercase tracking-widest shrink-0">
        Session
      </span>

      <Divider />

      {/* Live account stats */}
      {pnl !== null && (
        <Stat
          label="Open PnL"
          value={`${pnl >= 0 ? "+" : ""}${formatUSD(pnl)}`}
          color={pnl >= 0 ? "text-neon-green" : "text-danger"}
        />
      )}
      {equity !== null && (
        <Stat label="Equity" value={formatUSD(equity)} color="text-white" />
      )}

      {entries.length > 0 && (
        <>
          <Divider />

          {/* Trade counts */}
          <Stat label="Trades"   value={String(stats.total)}   color="text-slate-300" />
          <Stat label="Opens"    value={String(stats.opens)}   color="text-neon-green/80" />
          {stats.closes > 0 && (
            <Stat label="Closes"  value={String(stats.closes)}  color="text-slate-400" />
          )}
          {stats.derisks > 0 && (
            <Stat label="De-risks" value={String(stats.derisks)} color="text-warning" />
          )}

          <Divider />

          {/* Fees */}
          {stats.estimatedFees > 0 && (
            <Stat
              label="Est. Fees"
              value={`-${formatUSD(stats.estimatedFees)}`}
              color="text-warning"
            />
          )}
        </>
      )}
    </div>
  );
}
