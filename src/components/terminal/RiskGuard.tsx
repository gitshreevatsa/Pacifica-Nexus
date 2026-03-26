/**
 * RiskGuard.tsx – Right panel
 * Account health + liquidation risk monitor.
 * "De-Risk" button trims 25% of any endangered position.
 */

"use client";

import { useState, useCallback } from "react";
import { Shield, AlertTriangle, TrendingDown, Activity } from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import type { Position, AccountHealth } from "@/types";
import { cn, formatUSD, formatPct } from "@/lib/utils";

// ─── Health Gauge ─────────────────────────────────────────────────────────────

function HealthGauge({ marginRatio }: { marginRatio: number }) {
  const pct = Math.min(Math.max(marginRatio * 100, 0), 100);
  const colorClass =
    pct > 60 ? "stroke-danger text-danger" :
    pct > 30 ? "stroke-warning text-warning" :
    "stroke-neon-green text-neon-green";

  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="80" height="80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-surface-border" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className={colorClass}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className={cn("text-sm font-bold font-mono", colorClass.split(" ")[1])}>{pct.toFixed(0)}%</p>
        <p className="text-[8px] text-slate-500 uppercase">Used</p>
      </div>
    </div>
  );
}

// ─── Account stats ────────────────────────────────────────────────────────────

function AccountStats({ health }: { health: AccountHealth }) {
  const stats = [
    { label: "Equity", value: formatUSD(health.equity), color: "text-white" },
    { label: "Available", value: formatUSD(health.availableMargin), color: "text-neon-green" },
    { label: "Used Margin", value: formatUSD(health.usedMargin), color: "text-slate-300" },
    {
      label: "Unreal. PnL",
      value: `${health.unrealizedPnl >= 0 ? "+" : ""}${formatUSD(health.unrealizedPnl)}`,
      color: health.unrealizedPnl >= 0 ? "text-neon-green" : "text-danger",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="bg-surface-overlay rounded-lg p-2.5">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
          <p className={cn("text-sm font-mono font-bold", color)}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Position row ─────────────────────────────────────────────────────────────

function PositionRow({
  position,
  onDeRisk,
  isDeRisking,
}: {
  position: Position;
  onDeRisk: (p: Position) => void;
  isDeRisking: boolean;
}) {
  const isLong = position.side === "LONG";
  const distToLiq =
    position.markPrice > 0
      ? Math.abs(((position.liquidationPrice - position.markPrice) / position.markPrice) * 100)
      : 100;
  const isAtRisk = distToLiq < 10;

  return (
    <div className={cn(
      "rounded-lg border p-3 transition-all",
      isAtRisk ? "border-danger/50 bg-danger/5" : "border-surface-border bg-surface-raised"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isAtRisk && <AlertTriangle className="w-3 h-3 text-danger shrink-0" />}
          <span className="text-xs font-semibold text-white">{position.symbol}</span>
          <span className={cn(
            "text-[10px] font-mono px-1.5 rounded",
            isLong ? "bg-neon-green/10 text-neon-green" : "bg-danger/10 text-danger"
          )}>
            {position.side}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{position.size} units</span>
        </div>
        <span className={cn(
          "text-xs font-mono font-semibold",
          position.unrealizedPnl >= 0 ? "text-neon-green" : "text-danger"
        )}>
          {position.unrealizedPnl >= 0 ? "+" : ""}{formatUSD(position.unrealizedPnl)}
        </span>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-3 gap-1 text-[10px] mb-2">
        {[
          { label: "Entry", val: formatUSD(position.entryPrice) },
          { label: "Mark", val: formatUSD(position.markPrice) },
          { label: "Liq.", val: formatUSD(position.liquidationPrice), danger: isAtRisk },
        ].map(({ label, val, danger }) => (
          <div key={label}>
            <p className="text-slate-500">{label}</p>
            <p className={cn("font-mono", danger ? "text-danger font-bold" : "text-slate-300")}>{val}</p>
          </div>
        ))}
      </div>

      {/* Distance-to-liq bar */}
      <div className="mb-2.5">
        <div className="flex justify-between text-[9px] text-slate-500 mb-1">
          <span>Dist. to Liq.</span>
          <span className={cn(isAtRisk ? "text-danger font-semibold" : "text-slate-400")}>
            {distToLiq.toFixed(1)}%
          </span>
        </div>
        <div className="h-1 bg-surface-border rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all",
              isAtRisk ? "bg-danger" : distToLiq < 25 ? "bg-warning" : "bg-neon-green"
            )}
            style={{ width: `${Math.min(distToLiq, 100)}%` }}
          />
        </div>
      </div>

      {/* De-Risk button */}
      <button
        onClick={() => onDeRisk(position)}
        disabled={isDeRisking}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-semibold border transition-all",
          isAtRisk
            ? "border-danger/60 text-danger hover:bg-danger/10 hover:shadow-danger"
            : "border-surface-border text-slate-400 hover:border-warning/50 hover:text-warning",
          isDeRisking && "opacity-50 cursor-not-allowed"
        )}
      >
        <TrendingDown className="w-3 h-3" />
        {isDeRisking ? "De-Risking…" : "De-Risk 25%"}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RiskGuard() {
  const { positions, accountHealth, deRisk25Pct, keyStored, walletAddress } = usePacifica();
  const [deRiskingId, setDeRiskingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3_000);
  }, []);

  const handleDeRisk = useCallback(async (position: Position) => {
    if (!keyStored) { showToast("Paste your Agent Key in the top bar first."); return; }
    if (!walletAddress) { showToast("Connect your wallet (top bar) first."); return; }
    setDeRiskingId(position.id);
    try {
      await deRisk25Pct(position);
      showToast(`Trimmed 25% of ${position.symbol} ✓`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "De-risk failed");
    } finally {
      setDeRiskingId(null);
    }
  }, [keyStored, walletAddress, deRisk25Pct, showToast]);

  const openPositions = positions.filter((p) => p.status === "OPEN");
  const atRiskCount = openPositions.filter((p) => {
    const dist = p.markPrice > 0
      ? Math.abs(((p.liquidationPrice - p.markPrice) / p.markPrice) * 100) : 100;
    return dist < 10;
  }).length;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className={cn("w-4 h-4", atRiskCount > 0 ? "text-danger" : "text-neon-green")} />
            <h2 className="text-sm font-semibold text-white">Risk Guard</h2>
            {atRiskCount > 0 && (
              <span className="text-[10px] bg-danger text-white px-1.5 py-0.5 rounded-full font-bold">
                {atRiskCount} at risk
              </span>
            )}
          </div>
          <Activity className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Your account health &amp; open positions. <span className="text-warning">De-Risk 25%</span> closes a quarter of a position to reduce liquidation risk.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
        {/* Health Gauge */}
        {accountHealth ? (
          <div className="pt-3">
            <div className="flex items-center gap-4 mb-3">
              <HealthGauge marginRatio={accountHealth.marginRatio} />
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Account Status</p>
                <p className={cn("text-sm font-semibold mt-0.5",
                  accountHealth.marginRatio > 0.8 ? "text-danger" :
                  accountHealth.marginRatio > 0.5 ? "text-warning" : "text-neon-green"
                )}>
                  {accountHealth.marginRatio > 0.8 ? "⚠ Critical" :
                   accountHealth.marginRatio > 0.5 ? "Caution" : "Healthy"}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Margin used {formatPct(accountHealth.marginRatio)}
                </p>
              </div>
            </div>
            <AccountStats health={accountHealth} />
          </div>
        ) : (
          <div className="pt-3 space-y-2">
            <div className="h-20 bg-surface-raised rounded-lg animate-pulse" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 bg-surface-raised rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* Positions list */}
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
          Open Positions ({openPositions.length})
        </p>

        {openPositions.length === 0 && (
          <p className="text-center text-slate-600 text-xs py-6">No open positions.</p>
        )}

        <div className="space-y-2">
          {openPositions.map((position) => (
            <PositionRow
              key={position.id}
              position={position}
              onDeRisk={handleDeRisk}
              isDeRisking={deRiskingId === position.id}
            />
          ))}
        </div>
      </div>

      {toastMsg && (
        <div className="absolute bottom-4 left-4 right-4 bg-surface-overlay border border-electric/30 text-white text-xs rounded-lg px-3 py-2 animate-slide-up z-50 font-mono">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
