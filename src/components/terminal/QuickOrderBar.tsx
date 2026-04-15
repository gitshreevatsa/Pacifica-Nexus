/**
 * QuickOrderBar.tsx
 * Persistent bottom strip for manual one-click market orders.
 * Symbol selector · Long/Short toggle · Size input · Fire button
 */

"use client";

import { useState, useCallback } from "react";
import { Zap, ChevronDown } from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import { cn, formatUSD } from "@/lib/utils";
import TradeConfirmModal from "@/components/terminal/TradeConfirmModal";

export default function QuickOrderBar() {
  const { markets, markPrices, openPosition, keyStored, walletAddress } = usePacifica();

  const [symbol, setSymbol]     = useState<string>("");
  const [side, setSide]         = useState<"LONG" | "SHORT">("LONG");
  const [showConfirm, setShowConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [trading, setTrading]   = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3_000);
  }, []);

  const activeSymbol = symbol || markets[0]?.symbol || "";
  const markPrice    = markPrices[activeSymbol] ?? 0;

  const handleFire = useCallback(() => {
    if (!keyStored)     { showToast("Authorize Agent Key first (top bar)."); return; }
    if (!walletAddress) { showToast("Connect your wallet first."); return; }
    if (!activeSymbol)  { showToast("No markets loaded yet."); return; }
    setShowConfirm(true);
  }, [keyStored, walletAddress, activeSymbol, showToast]);

  const handleConfirm = useCallback(async (units: number) => {
    setShowConfirm(false);
    setTrading(true);
    try {
      await openPosition({ symbol: activeSymbol, side, size: units });
      showToast(`${side} ${activeSymbol} opened ✓`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Order failed");
    } finally {
      setTrading(false);
    }
  }, [openPosition, activeSymbol, side, showToast]);

  return (
    <>
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-2"
        style={{
          background: "rgba(255,255,255,0.02)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Label */}
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest shrink-0">
          Quick Order
        </span>

        <div className="w-px h-4 shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />

        {/* Symbol selector */}
        <div className="relative shrink-0">
          <select
            value={activeSymbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="appearance-none text-[11px] font-mono font-semibold text-white bg-transparent pr-5 pl-1 py-0.5 cursor-pointer focus:outline-none"
            style={{ minWidth: 80 }}
          >
            {markets.map((m) => (
              <option key={m.symbol} value={m.symbol} style={{ background: "#0a0a0a" }}>
                {m.symbol.replace("-PERP", "")}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
        </div>

        {/* Mark price */}
        {markPrice > 0 && (
          <span className="text-[10px] font-mono text-slate-500 shrink-0">
            {formatUSD(markPrice)}
          </span>
        )}

        <div className="w-px h-4 shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />

        {/* Long / Short toggle */}
        <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            onClick={() => setSide("LONG")}
            className={cn(
              "px-3 py-1 text-[11px] font-semibold transition-colors",
              side === "LONG"
                ? "bg-neon-green/20 text-neon-green"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            Long
          </button>
          <button
            onClick={() => setSide("SHORT")}
            className={cn(
              "px-3 py-1 text-[11px] font-semibold transition-colors",
              side === "SHORT"
                ? "bg-danger/20 text-danger"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            Short
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Toast */}
        {toastMsg && (
          <span className="text-[10px] font-mono text-slate-400 animate-fade-in">
            {toastMsg}
          </span>
        )}

        {/* Fire button */}
        <button
          onClick={handleFire}
          disabled={trading || markets.length === 0}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all shrink-0",
            side === "LONG"
              ? "bg-neon-green/15 hover:bg-neon-green/25 text-neon-green border border-neon-green/30"
              : "bg-danger/15 hover:bg-danger/25 text-danger border border-danger/30",
            (trading || markets.length === 0) && "opacity-40 cursor-not-allowed"
          )}
        >
          <Zap className="w-3 h-3" />
          {trading ? "Placing…" : `${side === "LONG" ? "Long" : "Short"} ${activeSymbol.replace("-PERP", "")}`}
        </button>
      </div>

      {showConfirm && (
        <TradeConfirmModal
          symbol={activeSymbol}
          side={side}
          markPrice={markPrice}
          description={`Manual ${side.toLowerCase()} order on ${activeSymbol.replace("-PERP", "")} via Quick Order bar.`}
          onConfirm={handleConfirm}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
