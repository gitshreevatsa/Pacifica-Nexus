"use client";

/**
 * TradeConfirmModal.tsx
 * Confirmation dialog before any trade fires.
 * User enters an amount in units (lot-size multiples of 0.01).
 * USD notional is shown below as reference.
 */

import { useState } from "react";
import { X, TrendingUp, TrendingDown, ExternalLink, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TradeConfirmProps {
  symbol: string;
  side: "LONG" | "SHORT";
  markPrice: number;
  lotSize?: number;          // default 0.01
  /** Minimum USD notional from market info — blocks confirm if below */
  minOrderSize?: number;
  description?: string;
  /** If set, opens Jupiter in a new tab on confirm */
  jupiterUrl?: string;
  onConfirm: (units: number) => void;
  onCancel: () => void;
  isExecuting?: boolean;
}

const PRESET_UNITS = [0.01, 0.1, 1, 10];

/** Round to nearest lot-size multiple, avoiding float weirdness. */
function snapToLot(value: number, lotSize: number): number {
  return Math.round(value / lotSize) * lotSize;
}

export default function TradeConfirmModal({
  symbol, side, markPrice, lotSize = 0.01, minOrderSize = 0, description, jupiterUrl, onConfirm, onCancel, isExecuting,
}: TradeConfirmProps) {
  const [unitInput, setUnitInput] = useState(String(PRESET_UNITS[1])); // default 0.1
  const isLong = side === "LONG";

  const rawUnits   = parseFloat(unitInput) || 0;
  const units      = snapToLot(Math.max(0, rawUnits), lotSize);
  const usdValue   = markPrice > 0 ? units * markPrice : 0;
  const belowMin   = minOrderSize > 0 && usdValue > 0 && usdValue < minOrderSize;
  const valid      = units >= lotSize && !belowMin;

  const handleConfirm = () => {
    if (!valid) return;
    if (jupiterUrl) window.open(jupiterUrl, "_blank", "noopener,noreferrer");
    onConfirm(units);
  };

  const handleBlur = () => {
    // snap displayed value on blur
    if (rawUnits > 0) setUnitInput(String(snapToLot(rawUnits, lotSize)));
  };

  const selectPreset = (amt: number) => setUnitInput(String(amt));

  const isSelected = (amt: number) => parseFloat(unitInput) === amt;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div className="rounded-2xl w-full max-w-sm animate-fade-in" style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(24px)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-sm font-bold text-white">Confirm Trade</h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Direction badge */}
          <div
            className="rounded-xl p-3 flex items-center gap-3"
            style={isLong
              ? { background: "rgba(0,255,135,0.05)" }
              : { background: "rgba(255,59,92,0.05)" }
            }
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: isLong ? "rgba(0,255,135,0.12)" : "rgba(255,59,92,0.12)" }}
            >
              {isLong
                ? <TrendingUp className="w-4 h-4 text-neon-green" />
                : <TrendingDown className="w-4 h-4 text-danger" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{symbol} · {isLong ? "Long" : "Short"}</p>
              <p className="text-[10px] text-slate-500 font-mono">
                Mark price: ${markPrice > 0 ? markPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
              </p>
            </div>
          </div>

          {/* Unit amount input */}
          <div>
            <label className="term-label block mb-2">
              Amount ({symbol})
            </label>

            {/* Preset buttons */}
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {PRESET_UNITS.map((amt) => (
                <button key={amt}
                  onClick={() => selectPreset(amt)}
                  className="py-1.5 rounded-lg text-xs font-bold transition-all duration-150"
                  style={isSelected(amt)
                    ? { background: "rgba(0,98,255,0.25)", color: "#4d8fff" }
                    : { background: "rgba(255,255,255,0.06)", color: "#64748b" }
                  }
                >
                  {amt}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="relative">
              <input
                type="number"
                min={lotSize}
                step={lotSize}
                value={unitInput}
                onChange={(e) => setUnitInput(e.target.value)}
                onBlur={handleBlur}
                placeholder={`Min ${lotSize}`}
                className="w-full text-white text-sm font-mono rounded-lg px-3 pr-14 py-2 focus:outline-none placeholder:text-slate-600"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">
                {symbol}
              </span>
            </div>

            {/* USD notional */}
            {units > 0 && markPrice > 0 && (
              <p className={cn("text-[11px] mt-1.5 font-mono", belowMin ? "text-danger" : "text-slate-400")}>
                ≈ <span className={cn("font-semibold", belowMin ? "text-danger" : "text-white")}>
                  ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>{" "}
                <span className="text-slate-600">notional at current price</span>
                {belowMin && (
                  <span className="block text-danger mt-0.5">
                    Min order size is ${minOrderSize.toLocaleString()} — increase units above
                  </span>
                )}
              </p>
            )}
            {units > 0 && units < lotSize && (
              <p className="text-[11px] text-danger mt-1.5 font-mono">
                Min lot size: {lotSize} {symbol}
              </p>
            )}
          </div>

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
              <strong className="text-slate-400">Market order</strong> — executes immediately at current price. No undo.
              Your account needs sufficient margin on Pacifica.
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
            style={isLong
              ? { background: "#00ff87" }
              : { background: "#ff3b5c" }
            }
          >
            {isExecuting
              ? "Executing…"
              : jupiterUrl
              ? `Confirm ${units} ${symbol} + Jupiter →`
              : `Confirm ${units} ${symbol} ${isLong ? "Long" : "Short"}`}
          </button>
        </div>

      </div>
    </div>
  );
}
