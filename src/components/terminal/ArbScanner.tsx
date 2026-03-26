/**
 * ArbScanner.tsx – Center panel (below chart)
 * Funding rate vs Jupiter spot → Annualized Basis Yield.
 * "Open Hedge" = Short Perp on Pacifica (POINTPULSE) + instruction to long spot on Jupiter.
 */

"use client";

import { useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Zap, RefreshCw, Info, AlertCircle } from "lucide-react";
import { useArbScanner } from "@/hooks/useArbScanner";
import { usePacifica } from "@/hooks/usePacifica";
import type { FundingSnapshot, ArbOpportunity } from "@/types";
import { cn, formatUSD } from "@/lib/utils";
import TradeConfirmModal from "@/components/terminal/TradeConfirmModal";

/** Jupiter swap URL: buy TOKEN with USDC */
function jupiterUrl(symbol: string) {
  return `https://jup.ag/swap/USDC-${symbol}`;
}

// ─── Recommendation badge ─────────────────────────────────────────────────────

function RecBadge({ rec }: { rec: ArbOpportunity["recommendation"] }) {
  const map = {
    OPEN:    "bg-neon-green/10 text-neon-green border-neon-green/30",
    MONITOR: "bg-warning/10 text-warning border-warning/30",
    AVOID:   "bg-slate-500/10 text-slate-400 border-slate-500/30",
  };
  const labels = { OPEN: "Open Now", MONITOR: "Monitor", AVOID: "Avoid" };
  return (
    <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded border font-semibold", map[rec])}>
      {labels[rec]}
    </span>
  );
}

// ─── Arb row ──────────────────────────────────────────────────────────────────

function ArbRow({
  snapshot,
  opportunity,
  onHedge,
  isHedging,
}: {
  snapshot: FundingSnapshot;
  opportunity: ArbOpportunity;
  onHedge: (snap: FundingSnapshot) => void;
  isHedging: boolean;
}) {
  const isContango = snapshot.direction === "CONTANGO";
  const isPos = opportunity.annualizedYield > 0;

  return (
    <div className={cn(
      "rounded-lg border p-3 transition-all hover:border-electric/40",
      opportunity.recommendation === "OPEN"
        ? "border-neon-green/30 bg-neon-green/5"
        : "border-surface-border bg-surface-raised"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">{snapshot.perpSymbol}</span>
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-mono",
            isContango ? "bg-electric/10 text-electric-300" : "bg-warning/10 text-warning"
          )}>
            {snapshot.direction}
          </span>
        </div>
        <RecBadge rec={opportunity.recommendation} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <p className="text-[9px] text-slate-500 uppercase">Funding/h</p>
          <p className={cn("text-xs font-mono font-semibold",
            snapshot.fundingRate > 0 ? "text-neon-green" : "text-danger")}>
            {snapshot.fundingRate > 0 ? "+" : ""}{(snapshot.fundingRate * 100).toFixed(4)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-500 uppercase">Ann. Yield</p>
          <p className={cn("text-xs font-mono font-bold", isPos ? "text-neon-green" : "text-danger")}>
            {isPos ? "+" : ""}{opportunity.annualizedYield.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-500 uppercase">Basis</p>
          <p className={cn("text-xs font-mono", snapshot.basis > 0 ? "text-slate-300" : "text-warning")}>
            {snapshot.basis > 0 ? "+" : ""}{formatUSD(snapshot.basis)}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-500 uppercase">Risk</p>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex-1 h-1 bg-surface-border rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full",
                  opportunity.riskScore < 40 ? "bg-neon-green" :
                  opportunity.riskScore < 70 ? "bg-warning" : "bg-danger"
                )}
                style={{ width: `${opportunity.riskScore}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-slate-400">{opportunity.riskScore}</span>
          </div>
        </div>
      </div>

      {/* Spot vs Perp price bar */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-3 bg-surface-overlay rounded px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span>SPOT</span>
          <span className="font-mono text-slate-300">{formatUSD(snapshot.spotPrice)}</span>
        </div>
        <div className="flex items-center gap-1">
          {isContango ? (
            <TrendingUp className="w-3 h-3 text-electric-300" />
          ) : (
            <TrendingDown className="w-3 h-3 text-warning" />
          )}
          <span className={cn("font-mono", isContango ? "text-electric-300" : "text-warning")}>
            {snapshot.basisPct > 0 ? "+" : ""}{snapshot.basisPct.toFixed(3)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>PERP</span>
          <span className="font-mono text-slate-300">{formatUSD(snapshot.perpPrice)}</span>
        </div>
      </div>

      {/* Open Hedge button */}
      <button
        onClick={() => onHedge(snapshot)}
        disabled={isHedging || opportunity.recommendation === "AVOID"}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold border transition-all",
          opportunity.recommendation === "OPEN"
            ? "border-neon-green/50 text-neon-green hover:bg-neon-green/10 hover:shadow-neon"
            : opportunity.recommendation === "MONITOR"
            ? "border-warning/40 text-warning hover:bg-warning/10"
            : "border-surface-border text-slate-600 cursor-not-allowed",
          isHedging && "opacity-50 cursor-not-allowed"
        )}
      >
        <Zap className="w-3 h-3" />
        {isHedging ? "Executing…" :
         opportunity.recommendation === "AVOID" ? "Low Yield — Skip" :
         "Open Hedge (Short Perp / Long Spot)"}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ArbScanner() {
  const { snapshots, opportunities, topOpportunity, isLoading, error, refetch } = useArbScanner();
  const { openPosition, hasAgent, keyStored, walletAddress, markPrices, markets } = usePacifica();
  const [hedgingMarket, setHedgingMarket] = useState<string | null>(null);
  const [toastMsg, setToastMsg]           = useState<string | null>(null);
  const [pending, setPending]             = useState<FundingSnapshot | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4_000);
  }, []);

  const handleHedge = useCallback(
    (snap: FundingSnapshot) => {
      if (!keyStored) { showToast("Paste your Agent Key in the top bar first."); return; }
      if (!walletAddress) { showToast("Connect your wallet (top bar) before trading."); return; }
      setPending(snap); // show confirm modal
    },
    [keyStored, walletAddress, showToast]
  );

  const handleConfirmHedge = useCallback(async (units: number) => {
    if (!pending) return;
    const snap = pending;
    setPending(null);
    setHedgingMarket(snap.perpSymbol);
    try {
      await openPosition({ symbol: snap.perpSymbol.replace("-PERP", ""), side: "SHORT", size: units });
      showToast(`✓ Short opened on ${snap.perpSymbol}. Spot leg opening on Jupiter…`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Hedge failed");
    } finally {
      setHedgingMarket(null);
    }
  }, [pending, openPosition, showToast]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-electric animate-pulse-slow" />
          <h2 className="text-sm font-semibold text-white">Arb Scanner</h2>
          <span className="text-[10px] font-mono text-slate-500 bg-surface-overlay px-1.5 py-0.5 rounded">
            Cash &amp; Carry
          </span>
        </div>
        <div className="flex items-center gap-2">
          {topOpportunity && (
            <span className="text-[10px] font-mono text-neon-green bg-neon-green/10 px-2 py-0.5 rounded border border-neon-green/20">
              Best: {topOpportunity.annualizedYield.toFixed(1)}% APY
            </span>
          )}
          <button onClick={() => refetch()} className="text-slate-500 hover:text-electric transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Strategy explainer */}
      <div className="mx-4 mt-3 flex items-start gap-2 text-[10px] text-slate-500 bg-surface-overlay rounded-lg px-3 py-2 mb-3">
        <Info className="w-3 h-3 shrink-0 mt-0.5 text-electric-300" />
        <span>
          <span className="text-electric-300 font-semibold">Cash &amp; Carry:</span>{" "}
          Short perp on Pacifica + buy spot on Jupiter. You collect the funding rate paid by longs — market-neutral, no directional risk. <span className="text-warning">Ann. Yield</span> = hourly funding × 24h × 365.
        </span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 bg-surface-raised rounded-lg animate-pulse" />
        ))}

        {error && (
          <div className="flex flex-col gap-1 text-danger text-xs p-3 bg-danger/10 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">Failed to load market data</span>
            </div>
            <span className="text-danger/70 font-mono pl-6 break-all">
              {error instanceof Error ? error.message : String(error)}
            </span>
          </div>
        )}

        {!isLoading && !error && snapshots.length === 0 && (
          <p className="text-center text-slate-600 text-xs mt-8">No arb opportunities found.</p>
        )}

        {snapshots.map((snap) => {
          const opp = opportunities.find((o) => o.market === snap.perpSymbol);
          if (!opp) return null;
          return (
            <ArbRow
              key={snap.perpSymbol}
              snapshot={snap}
              opportunity={opp}
              onHedge={handleHedge}
              isHedging={hedgingMarket === snap.perpSymbol}
            />
          );
        })}
      </div>

      {toastMsg && (
        <div className="absolute bottom-4 left-4 right-4 bg-surface-overlay border border-electric/30 text-white text-xs rounded-lg px-3 py-2 animate-slide-up z-50 font-mono leading-relaxed">
          {toastMsg}
        </div>
      )}

      {pending && (
        <TradeConfirmModal
          symbol={pending.perpSymbol.replace("-PERP", "")}
          side="SHORT"
          markPrice={markPrices[pending.perpSymbol.replace("-PERP", "")] ?? markPrices[pending.perpSymbol] ?? 0}
          minOrderSize={markets.find(m => m.symbol === pending.perpSymbol.replace("-PERP", "") || m.symbol === pending.perpSymbol)?.minOrderSize ?? 0}
          description={`Short the ${pending.perpSymbol} perp on Pacifica to collect the ${(pending.fundingRate * 100).toFixed(4)}%/h funding rate (${opportunities.find(o => o.market === pending.perpSymbol)?.annualizedYield.toFixed(1) ?? "?"}% annualized). Jupiter will open so you can buy the same amount of spot to stay market-neutral.`}
          jupiterUrl={jupiterUrl(pending.perpSymbol.replace("-PERP", ""))}
          onConfirm={handleConfirmHedge}
          onCancel={() => setPending(null)}
          isExecuting={hedgingMarket === pending.perpSymbol}
        />
      )}
    </div>
  );
}
