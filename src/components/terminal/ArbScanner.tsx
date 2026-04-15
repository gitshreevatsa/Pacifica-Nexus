/**
 * ArbScanner.tsx – Center panel (below chart)
 * Funding rate vs Jupiter spot → Annualized Basis Yield.
 * "Open Hedge" = Short Perp on Pacifica (POINTPULSE) + instruction to long spot on Jupiter.
 */

"use client";

import { useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Zap, RefreshCw, AlertCircle } from "lucide-react";
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
    OPEN:    "bg-neon-green/10 text-neon-green",
    MONITOR: "bg-warning/10 text-warning",
    AVOID:   "bg-white/5 text-slate-500",
  };
  const labels = { OPEN: "Open Now", MONITOR: "Monitor", AVOID: "Avoid" };
  return (
    <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded font-semibold", map[rec])}>
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
  const isHighYield = opportunity.annualizedYield > 15;
  const isOpen = opportunity.recommendation === "OPEN";

  return (
    <div
      className="rounded-xl p-3 transition-all duration-150"
      style={{
        background: isOpen ? "rgba(0,255,135,0.04)" : "rgba(255,255,255,0.02)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">{snapshot.perpSymbol}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={isContango
              ? { background: "rgba(0,98,255,0.1)", color: "#4d8fff" }
              : { background: "rgba(255,184,0,0.1)", color: "#ffb800" }
            }
          >
            {snapshot.direction}
          </span>
        </div>
        <RecBadge rec={opportunity.recommendation} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <p className="term-label mb-0.5">Funding/h</p>
          <p className={cn("text-xs font-mono font-semibold",
            snapshot.fundingRate > 0 ? "text-neon-green" : "text-danger")}>
            {snapshot.fundingRate > 0 ? "+" : ""}{(snapshot.fundingRate * 100).toFixed(4)}%
          </p>
        </div>
        <div>
          <p className="term-label mb-0.5">Ann. Yield</p>
          <p className={cn(
            "text-xs font-mono font-bold",
            isHighYield ? "apy-glow" : isPos ? "text-neon-green" : "text-danger"
          )}>
            {isPos ? "+" : ""}{opportunity.annualizedYield.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="term-label mb-0.5">Basis</p>
          <p className={cn("text-xs font-mono", snapshot.basis > 0 ? "text-slate-300" : "text-warning")}>
            {snapshot.basis > 0 ? "+" : ""}{formatUSD(snapshot.basis)}
          </p>
        </div>
        <div>
          <p className="term-label mb-0.5">Risk</p>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
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
      <div
        className="flex items-center justify-between text-[10px] text-slate-500 mb-3 rounded-lg px-2 py-1.5"
        style={{ background: "rgba(255,255,255,0.03)" }}
      >
        <div className="flex items-center gap-2">
          <span>SPOT</span>
          <span className="font-mono text-slate-300">{formatUSD(snapshot.spotPrice)}</span>
        </div>
        <div className="flex items-center gap-1">
          {isContango ? (
            <TrendingUp className="w-3 h-3" style={{ color: "#4d8fff" }} />
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
          "w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold",
          opportunity.recommendation === "OPEN" ? "btn-ghost-blue" :
          opportunity.recommendation === "MONITOR" ? "btn-ghost-warning" :
          "btn-ghost-neutral cursor-not-allowed opacity-40",
          isHedging ? "btn-scanning opacity-60 cursor-not-allowed" : ""
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
      setPending(snap);
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
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse" />
          <h2 className="text-sm font-semibold text-white">Arbitrage Scanner</h2>
          <span
            className="text-[10px] font-mono text-slate-500 px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            Cash &amp; Carry
          </span>
        </div>
        <div className="flex items-center gap-2">
          {topOpportunity && (
            <span className={cn(
              "text-[10px] font-mono px-2 py-0.5 rounded",
              topOpportunity.annualizedYield > 15
                ? "apy-glow bg-neon-green/10"
                : "text-neon-green bg-neon-green/5"
            )}>
              Best: {topOpportunity.annualizedYield.toFixed(1)}% APY
            </span>
          )}
          <button onClick={() => refetch()} className="text-slate-500 hover:text-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Strategy hint — compact */}
      <p className="px-4 pb-2 text-[10px] text-slate-600">
        Short perp + long spot · collect funding · market-neutral.
        <span className="text-electric-300 ml-1">Ann. Yield = funding/h × 8760.</span>
      </p>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
        ))}

        {error && (
          <div
            className="flex flex-col gap-1 text-xs p-3 rounded-xl"
            style={{ background: "rgba(255,59,92,0.06)" }}
          >
            <div className="flex items-center gap-2 text-danger">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">Failed to load market data</span>
            </div>
            <span className="font-mono text-xs pl-6 break-all" style={{ color: "rgba(255,59,92,0.7)" }}>
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
        <div
          className="absolute bottom-4 left-4 right-4 text-white text-xs rounded-xl px-3 py-2 animate-slide-up z-50 font-mono"
          style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}
        >
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
