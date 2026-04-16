"use client";

/**
 * TradeConfirmModal.tsx
 * Confirmation dialog before any trade fires.
 * User enters an amount in units (lot-size multiples of 0.01).
 * USD notional, est. fee, est. liq price, TP/SL summary shown below as reference.
 */

import { useState } from "react";
import { X, TrendingUp, TrendingDown, ExternalLink, AlertTriangle, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TradeConfirmProps {
  symbol: string;
  side: "LONG" | "SHORT";
  markPrice: number;
  lotSize?: number;
  minOrderSize?: number;
  description?: string;
  jupiterUrl?: string;
  orderType?: "market" | "limit";
  limitPrice?: number;
  tpPrice?: number;
  slPrice?: number;
  /** Pre-populated size in USD */
  defaultUsd?: number;
  onConfirm: (units: number) => void;
  onCancel: () => void;
  isExecuting?: boolean;
}

const TAKER_FEE_PCT = 0.0005; // 0.05% taker fee (standard for Pacifica perps)
const DEFAULT_LEVERAGE = 10;
const MMR = 0.005;

const USD_PRESETS = [10, 50, 100, 500];

function snapToLot(value: number, lotSize: number): number {
  return Math.round(value / lotSize) * lotSize;
}

function estimateLiqPrice(side: "LONG" | "SHORT", entryPrice: number): number {
  if (entryPrice <= 0) return 0;
  return side === "LONG"
    ? entryPrice * (1 - 1 / DEFAULT_LEVERAGE + MMR)
    : entryPrice * (1 + 1 / DEFAULT_LEVERAGE - MMR);
}

export default function TradeConfirmModal({
  symbol, side, markPrice, lotSize = 0.01, minOrderSize = 0, description, jupiterUrl,
  orderType = "market", limitPrice, tpPrice, slPrice, defaultUsd,
  onConfirm, onCancel, isExecuting,
}: TradeConfirmProps) {
  const initUsd = defaultUsd != null && defaultUsd > 0 ? String(defaultUsd) : "100";

  const [usdInput, setUsdInput] = useState(initUsd);
  const isLong = side === "LONG";

  const execPrice = orderType === "limit" && limitPrice && limitPrice > 0 ? limitPrice : markPrice;

  // Convert USD → token units, snapped to lot size
  const rawUsd  = parseFloat(usdInput) || 0;
  const units   = execPrice > 0 ? snapToLot(rawUsd / execPrice, lotSize) : 0;
  const usdValue = units * execPrice;

  const belowMin = minOrderSize > 0 && rawUsd > 0 && rawUsd < minOrderSize;
  const valid    = units >= lotSize && execPrice > 0 && !belowMin;

  const estFee      = rawUsd * TAKER_FEE_PCT;
  const estLiqPrice = estimateLiqPrice(side, execPrice > 0 ? execPrice : markPrice);

  const handleConfirm = () => {
    if (!valid) return;
    if (jupiterUrl) window.open(jupiterUrl, "_blank", "noopener,noreferrer");
    onConfirm(units);
  };

  const selectPreset = (amt: number) => setUsdInput(String(amt));
  const isSelected   = (amt: number) => parseFloat(usdInput) === amt;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div className="rounded-2xl w-full max-w-sm animate-fade-in" style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(24px)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">Confirm Trade</h3>
            {orderType === "limit" && (
              <span className="text-[10px] font-mono text-electric-300">Limit Order</span>
            )}
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Direction badge */}
          <div
            className="rounded-xl p-3 flex items-center gap-3"
            style={isLong ? { background: "rgba(0,255,135,0.05)" } : { background: "rgba(255,59,92,0.05)" }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: isLong ? "rgba(0,255,135,0.12)" : "rgba(255,59,92,0.12)" }}
            >
              {isLong ? <TrendingUp className="w-4 h-4 text-neon-green" /> : <TrendingDown className="w-4 h-4 text-danger" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{symbol} · {isLong ? "Long" : "Short"}</p>
              <p className="text-[10px] text-slate-500 font-mono">
                {orderType === "limit" && limitPrice
                  ? `Limit: $${limitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : `Mark: $${markPrice > 0 ? markPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}`}
              </p>
            </div>
          </div>

          {/* USD amount input */}
          <div>
            <label className="term-label block mb-2">Size (USD)</label>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {USD_PRESETS.map((amt) => (
                <button key={amt}
                  onClick={() => selectPreset(amt)}
                  className="py-1.5 rounded-lg text-xs font-bold transition-all duration-150"
                  style={isSelected(amt)
                    ? { background: "rgba(0,98,255,0.25)", color: "#4d8fff" }
                    : { background: "rgba(255,255,255,0.06)", color: "#64748b" }}
                >
                  ${amt}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                min={1}
                step={1}
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
                placeholder="100"
                className="w-full text-white text-sm font-mono rounded-lg px-3 pr-10 py-2 focus:outline-none placeholder:text-slate-600"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">USD</span>
            </div>
            {units > 0 && execPrice > 0 && (
              <p className="text-[11px] mt-1.5 font-mono text-slate-400">
                ≈ <span className="font-semibold text-white">{units}</span>{" "}
                <span className="text-slate-600">{symbol.replace("-PERP", "")} tokens · ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} notional</span>
              </p>
            )}
            {rawUsd > 0 && units < lotSize && execPrice > 0 && (
              <p className="text-[11px] text-danger mt-1.5 font-mono">
                Too small — min lot is {lotSize} tokens (≈${(lotSize * execPrice).toFixed(2)})
              </p>
            )}
            {belowMin && (
              <p className="text-[11px] text-danger mt-1.5 font-mono">Min order size is ${minOrderSize.toLocaleString()}</p>
            )}
          </div>

          {/* Order details grid */}
          {units > 0 && execPrice > 0 && (
            <div className="rounded-xl p-3 space-y-1.5" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Order Details</p>

              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Est. Fee (0.05%)</span>
                <span className="font-mono text-warning">${estFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
              </div>

              {estLiqPrice > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Est. Liq. Price <span className="text-slate-600">(10x)</span></span>
                  <span className="font-mono text-danger">${estLiqPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}

              {tpPrice && tpPrice > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1"><Target className="w-3 h-3" /> Take Profit</span>
                  <span className="font-mono text-neon-green">${tpPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}

              {slPrice && slPrice > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1"><Target className="w-3 h-3 text-danger" /> Stop Loss</span>
                  <span className="font-mono text-danger">${slPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          )}

          {description && (
            <p className="text-[11px] text-slate-500 leading-relaxed">{description}</p>
          )}

          {jupiterUrl && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(0,98,255,0.06)" }}>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#4d8fff" }} />
              <p className="text-[11px] leading-relaxed" style={{ color: "#4d8fff" }}>
                Jupiter will open in a new tab so you can buy the spot {symbol} leg.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2 text-[10px] text-slate-500">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-warning" />
            <span>
              <strong className="text-slate-400">{orderType === "limit" ? "Limit order" : "Market order"}</strong>
              {orderType === "limit"
                ? " — fills when market reaches your limit price. May not fill immediately."
                : " — executes immediately at current price. No undo."}
              {" "}Your account needs sufficient margin on Pacifica.
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onCancel}
            className="flex-1 text-slate-400 hover:text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={!valid || isExecuting}
            className={cn(
              "flex-1 text-sm font-bold py-2.5 rounded-xl transition-all duration-150 disabled:opacity-40",
              isExecuting ? "btn-scanning" : "",
              isLong ? "text-midnight" : "text-white"
            )}
            style={isLong ? { background: "#00ff87" } : { background: "#ff3b5c" }}
          >
            {isExecuting
              ? "Executing…"
              : jupiterUrl
              ? `Confirm $${rawUsd} + Jupiter →`
              : `Confirm $${rawUsd} ${isLong ? "Long" : "Short"}`}
          </button>
        </div>

      </div>
    </div>
  );
}
