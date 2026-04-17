"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Zap, ChevronDown, Settings2, X } from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import { cn, formatUSD } from "@/lib/utils";
import type { Direction } from "@/types";
import { useToast } from "@/hooks/useToast";
import TradeConfirmModal from "@/components/terminal/TradeConfirmModal";

export default function QuickOrderBar() {
  const {
    markets, markPrices, openPosition, keyStored, walletAddress, accountHealth,
    isOpenPending, tradingHalted,
  } = usePacifica();

  const [symbol, setSymbol]           = useState<string>("");
  const [side, setSide]               = useState<Direction>("LONG");
  const [orderType, setOrderType]     = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice]   = useState<string>("");
  const [sizeMode, setSizeMode]       = useState<"usd" | "pct">("usd");
  const [sizeInput, setSizeInput]     = useState<string>("");
  const [tpPrice, setTpPrice]         = useState<string>("");
  const [slPrice, setSlPrice]         = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [toastMsg, showToast]           = useToast();

  const activeSymbol = symbol || markets[0]?.symbol || "";
  const activeMarket = markets.find((m) => m.symbol === activeSymbol);
  const markPrice    = markPrices[activeSymbol] ?? 0;
  const marketLotSize = activeMarket?.lotSize ?? 0.01;
  const equity       = accountHealth?.equity ?? 0;

  // Compute suggested USD size (passed to modal as defaultUsd)
  const computedUsd = useMemo(() => {
    if (sizeMode === "usd") return parseFloat(sizeInput) || 0;
    // pct mode: % of equity in USD
    const pct = parseFloat(sizeInput) || 0;
    if (equity > 0 && pct > 0) return equity * (pct / 100);
    return 0;
  }, [sizeMode, sizeInput, equity]);

  // Keyboard shortcuts: B = Long, S = Short, Escape = close modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "b" || e.key === "B") setSide("LONG");
      if (e.key === "s" || e.key === "S") setSide("SHORT");
      if (e.key === "Escape") setShowConfirm(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleFire = useCallback(() => {
    if (!keyStored)     { showToast("Authorize Agent Key first (top bar)."); return; }
    if (!walletAddress) { showToast("Connect your wallet first."); return; }
    if (!activeSymbol)  { showToast("No markets loaded yet."); return; }
    setShowConfirm(true);
  }, [keyStored, walletAddress, activeSymbol, showToast]);

  const handleConfirm = useCallback(async (units: number) => {
    setShowConfirm(false);
    try {
      const tp = parseFloat(tpPrice) || undefined;
      const sl = parseFloat(slPrice) || undefined;
      const lp = orderType === "limit" ? (parseFloat(limitPrice) || undefined) : undefined;
      await openPosition({ symbol: activeSymbol, side, size: units, orderType, price: lp, tpPrice: tp, slPrice: sl });
      const extras = [tp ? `TP@${tp}` : "", sl ? `SL@${sl}` : ""].filter(Boolean).join(" ");
      showToast(`${side} ${activeSymbol} opened ✓${extras ? ` · ${extras}` : ""}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Order failed");
    }
  }, [openPosition, activeSymbol, side, orderType, limitPrice, tpPrice, slPrice, showToast]);

  const hasTpSl = parseFloat(tpPrice) > 0 || parseFloat(slPrice) > 0;

  return (
    <>
      <div
        className="shrink-0"
        style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {/* ── Main row ── */}
        <div className="flex items-center gap-3 px-4 py-2 flex-wrap">
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

          {/* Market / Limit toggle */}
          <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["market", "limit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-semibold transition-colors capitalize",
                  orderType === t ? "bg-electric/20 text-electric-300" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Limit price input */}
          {orderType === "limit" && (
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={markPrice > 0 ? markPrice.toFixed(2) : "Price…"}
              className="w-24 text-[11px] font-mono text-white rounded-lg px-2 py-1 focus:outline-none placeholder:text-slate-600 shrink-0"
              style={{ background: "rgba(255,255,255,0.06)" }}
            />
          )}

          <div className="w-px h-4 shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />

          {/* Long / Short toggle */}
          <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={() => setSide("LONG")}
              className={cn(
                "px-3 py-1 text-[11px] font-semibold transition-colors",
                side === "LONG" ? "bg-neon-green/20 text-neon-green" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Long
            </button>
            <button
              onClick={() => setSide("SHORT")}
              className={cn(
                "px-3 py-1 text-[11px] font-semibold transition-colors",
                side === "SHORT" ? "bg-danger/20 text-danger" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Short
            </button>
          </div>

          <div className="w-px h-4 shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />

          {/* Size input + equity % toggle */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="relative">
              <input
                type="number"
                value={sizeInput}
                onChange={(e) => setSizeInput(e.target.value)}
                placeholder={sizeMode === "pct" ? "% equity" : "USD"}
                className="w-20 text-[11px] font-mono text-white rounded-lg px-2 py-1 pr-5 focus:outline-none placeholder:text-slate-600"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-slate-500 pointer-events-none">
                {sizeMode === "pct" ? "%" : "$"}
              </span>
            </div>
            <button
              onClick={() => { setSizeMode((m) => (m === "usd" ? "pct" : "usd")); setSizeInput(""); }}
              className={cn(
                "text-[9px] font-mono px-1.5 py-1 rounded transition-colors shrink-0",
                sizeMode === "pct" ? "bg-electric/20 text-electric-300" : "bg-white/5 text-slate-500 hover:text-slate-300"
              )}
              title={sizeMode === "pct" ? `≈ $${computedUsd > 0 ? computedUsd.toFixed(2) : "—"} — click for manual USD` : "Click to size by % of equity"}
            >
              {sizeMode === "pct" ? (computedUsd > 0 ? `≈$${computedUsd.toFixed(0)}` : "%→$") : "%"}
            </button>
          </div>

          {/* TP/SL toggle */}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              "p-1.5 rounded transition-colors shrink-0",
              showAdvanced || hasTpSl ? "bg-warning/10 text-warning" : "bg-white/5 text-slate-500 hover:text-slate-300"
            )}
            title="Take Profit / Stop Loss"
          >
            <Settings2 className="w-3 h-3" />
          </button>

          {/* Hotkey hint */}
          <span className="hidden lg:inline text-[9px] font-mono text-slate-700 shrink-0" title="Keyboard: B=Long · S=Short · Esc=cancel">
            B/S
          </span>

          <div className="flex-1" />

          {/* Toast */}
          {toastMsg && (
            <span className="text-[10px] font-mono text-slate-400 animate-fade-in shrink-0">
              {toastMsg}
            </span>
          )}

          {/* Fire button — disabled while a submission is in-flight or trading is halted */}
          <button
            onClick={handleFire}
            disabled={isOpenPending || tradingHalted || markets.length === 0}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all shrink-0",
              side === "LONG"
                ? "bg-neon-green/15 hover:bg-neon-green/25 text-neon-green border border-neon-green/30"
                : "bg-danger/15 hover:bg-danger/25 text-danger border border-danger/30",
              (isOpenPending || tradingHalted || markets.length === 0) && "opacity-40 cursor-not-allowed"
            )}
          >
            <Zap className="w-3 h-3" />
            {isOpenPending
              ? "Placing…"
              : tradingHalted
              ? "Halted"
              : `${side === "LONG" ? "Long" : "Short"} ${activeSymbol.replace("-PERP", "")}`}
          </button>
        </div>

        {/* ── TP / SL row ── */}
        {showAdvanced && (
          <div
            className="flex items-center gap-3 px-4 py-2 flex-wrap"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest shrink-0">TP / SL</span>
            <div className="w-px h-4 shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />

            {/* Take profit */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-mono font-semibold text-neon-green/70">TP</span>
              <input
                type="number"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="Take profit price"
                className="w-32 text-[11px] font-mono text-white rounded-lg px-2 py-1 focus:outline-none placeholder:text-slate-600"
                style={{ background: "rgba(0,255,135,0.05)", border: "1px solid rgba(0,255,135,0.15)" }}
              />
              {tpPrice && (
                <button onClick={() => setTpPrice("")} className="text-slate-500 hover:text-white">
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            {/* Stop loss */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-mono font-semibold text-danger/70">SL</span>
              <input
                type="number"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="Stop loss price"
                className="w-32 text-[11px] font-mono text-white rounded-lg px-2 py-1 focus:outline-none placeholder:text-slate-600"
                style={{ background: "rgba(255,59,92,0.05)", border: "1px solid rgba(255,59,92,0.15)" }}
              />
              {slPrice && (
                <button onClick={() => setSlPrice("")} className="text-slate-500 hover:text-white">
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            <span className="text-[9px] font-mono text-slate-600">
              Placed as reduce-only limit orders after position opens.
            </span>
          </div>
        )}
      </div>

      {showConfirm && (
        <TradeConfirmModal
          symbol={activeSymbol}
          side={side}
          markPrice={markPrice}
          lotSize={marketLotSize}
          orderType={orderType}
          limitPrice={orderType === "limit" ? (parseFloat(limitPrice) || undefined) : undefined}
          tpPrice={parseFloat(tpPrice) || undefined}
          slPrice={parseFloat(slPrice) || undefined}
          defaultUsd={computedUsd > 0 ? computedUsd : undefined}
          description={`Manual ${side.toLowerCase()} ${orderType} order on ${activeSymbol.replace("-PERP", "")} via Quick Order bar.`}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
