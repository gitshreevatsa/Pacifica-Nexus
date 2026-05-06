"use client";

/**
 * LiqMap — Market-wide estimated liquidation zone heatmap.
 *
 * Works without the user having open positions.
 * Uses OI + assumed leverage distribution to estimate where
 * mass liquidations would cluster at each price level.
 *
 * Formula:
 *   For leverage N, liq price is ~1/N away from entry.
 *   If market = $100 at 10× leverage → longs liq near $90, shorts near $110.
 */

import { useState, useMemo } from "react";
import { usePacifica } from "@/hooks/usePacifica";
import { formatUSD, cn } from "@/lib/utils";
import type { Position } from "@/types";

// ─── Leverage distribution ─────────────────────────────────────────────────────
// Rough empirical weights for how OI is distributed across leverage levels.

const BUCKETS = [
  { leverage: 2,   weight: 0.04 },
  { leverage: 3,   weight: 0.06 },
  { leverage: 5,   weight: 0.14 },
  { leverage: 10,  weight: 0.32 },
  { leverage: 20,  weight: 0.24 },
  { leverage: 50,  weight: 0.14 },
  { leverage: 100, weight: 0.06 },
];

interface LiqZone {
  price: number;
  distPct: number;        // signed % from current price (negative = below)
  estimatedUsd: number;   // estimated OI at risk
  leverage: number;
  liquidates: "LONG" | "SHORT";
}

function buildZones(markPrice: number, openInterest: number): LiqZone[] {
  const zones: LiqZone[] = [];
  for (const b of BUCKETS) {
    const frac = 1 / b.leverage;
    const half = openInterest * b.weight * 0.5; // 50/50 long-short assumption
    zones.push(
      {
        price: markPrice * (1 - frac),
        distPct: -frac * 100,
        estimatedUsd: half,
        leverage: b.leverage,
        liquidates: "LONG",
      },
      {
        price: markPrice * (1 + frac),
        distPct: frac * 100,
        estimatedUsd: half,
        leverage: b.leverage,
        liquidates: "SHORT",
      }
    );
  }
  // Reverse so biggest distance is at top (furthest shorts) → current price → closest longs
  return zones.sort((a, b) => b.distPct - a.distPct);
}

// ─── Row ───────────────────────────────────────────────────────────────────────

function ZoneRow({
  zone,
  maxUsd,
  userPosition,
}: {
  zone: LiqZone;
  maxUsd: number;
  userPosition?: Position;
}) {
  const isLong = zone.liquidates === "LONG";
  const barPct = Math.min((zone.estimatedUsd / maxUsd) * 100, 100);

  // Highlight if this zone is close to the user's own liq price
  const isUserLiq =
    userPosition &&
    userPosition.liquidationPrice > 0 &&
    Math.abs((userPosition.liquidationPrice - zone.price) / zone.price) < 0.015;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-[3px] text-[10px] font-mono rounded transition-colors",
        isUserLiq && "ring-1 ring-yellow-500/40"
      )}
      style={{ background: isUserLiq ? "rgba(234,179,8,0.07)" : undefined }}
    >
      {/* Side badge */}
      <span
        className="w-10 shrink-0 text-right font-semibold"
        style={{ color: isLong ? "#FF3B5C" : "#00FF87" }}
      >
        {isLong ? "LONG" : "SHORT"}
      </span>

      {/* Price */}
      <span className="w-[76px] shrink-0 text-slate-300">{formatUSD(zone.price)}</span>

      {/* Distance */}
      <span
        className="w-10 shrink-0"
        style={{ color: isLong ? "#FF3B5C" : "#00FF87" }}
      >
        {zone.distPct > 0 ? "+" : ""}
        {zone.distPct.toFixed(1)}%
      </span>

      {/* Bar */}
      <div
        className="flex-1 h-3.5 rounded overflow-hidden relative"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <div
          className="h-full rounded"
          style={{
            width: `${barPct}%`,
            background: isLong
              ? "linear-gradient(90deg, rgba(255,59,92,0.6), rgba(255,59,92,0.25))"
              : "linear-gradient(90deg, rgba(0,255,135,0.5), rgba(0,255,135,0.15))",
          }}
        />
        {isUserLiq && (
          <span className="absolute right-1.5 inset-y-0 flex items-center text-[9px] text-yellow-400 font-bold">
            ← your liq
          </span>
        )}
      </div>

      {/* Leverage */}
      <span className="w-10 shrink-0 text-right text-slate-500">{zone.leverage}×</span>

      {/* Est. OI */}
      <span className="w-16 shrink-0 text-right text-slate-600">
        {zone.estimatedUsd >= 1_000_000
          ? `$${(zone.estimatedUsd / 1_000_000).toFixed(1)}M`
          : zone.estimatedUsd >= 1_000
          ? `$${(zone.estimatedUsd / 1_000).toFixed(1)}K`
          : `$${zone.estimatedUsd.toFixed(0)}`}
      </span>
    </div>
  );
}

// ─── Current price separator ───────────────────────────────────────────────────

function NowRow({ price }: { price: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-mono">
      <span className="w-10 shrink-0" />
      <span className="w-[76px] shrink-0 text-white font-bold">{formatUSD(price)}</span>
      <span className="w-10 shrink-0 text-blue-400 font-semibold">NOW</span>
      <div className="flex-1 flex items-center">
        <div className="flex-1 h-px" style={{ background: "rgba(0,98,255,0.5)" }} />
        <div
          className="w-1.5 h-1.5 rounded-full mx-1"
          style={{ background: "#0062FF" }}
        />
        <div className="flex-1 h-px" style={{ background: "rgba(0,98,255,0.5)" }} />
      </div>
      <span className="w-10 shrink-0" />
      <span className="w-16 shrink-0" />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function LiqMap() {
  const { markets, positions } = usePacifica();
  const [selectedSymbol, setSelectedSymbol] = useState("SOL");

  const market = markets.find((m) => m.symbol === selectedSymbol);
  const userPosition = positions.find((p) => p.symbol === selectedSymbol);

  const zones = useMemo(
    () =>
      market ? buildZones(market.markPrice, market.openInterest) : [],
    [market]
  );

  const maxUsd = useMemo(
    () => Math.max(...zones.map((z) => z.estimatedUsd), 1),
    [zones]
  );

  // Split zones into above (shorts liq) and below (longs liq) current price
  const above = zones.filter((z) => z.distPct > 0);
  const below = zones.filter((z) => z.distPct < 0);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          Liq Map
        </span>

        <select
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          className="text-[11px] font-mono text-white rounded-lg px-2 py-0.5 focus:outline-none"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          {markets.map((m) => (
            <option key={m.symbol} value={m.symbol} style={{ background: "#0a0a0f" }}>
              {m.symbol}
            </option>
          ))}
        </select>

        {market && (
          <span className="text-[10px] font-mono text-slate-500">
            OI{" "}
            <span className="text-slate-300">{formatUSD(market.openInterest)}</span>
          </span>
        )}

        <span className="ml-auto text-[9px] font-mono text-slate-700">
          estimated · 50/50 L/S split assumed
        </span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 py-1 text-[9px] font-mono text-slate-600 uppercase tracking-wider shrink-0">
        <span className="w-10 shrink-0 text-right">side</span>
        <span className="w-[76px] shrink-0">liq price</span>
        <span className="w-10 shrink-0">dist</span>
        <span className="flex-1">estimated volume</span>
        <span className="w-10 shrink-0 text-right">lev</span>
        <span className="w-16 shrink-0 text-right">OI est.</span>
      </div>

      {/* Zones */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {!market ? (
          <div className="px-3 py-4 text-[11px] font-mono text-slate-600">
            Loading market data…
          </div>
        ) : (
          <>
            {/* SHORT liq zones (above current price) */}
            {above.map((z, i) => (
              <ZoneRow key={`above-${i}`} zone={z} maxUsd={maxUsd} userPosition={userPosition} />
            ))}

            {/* Current price */}
            <NowRow price={market.markPrice} />

            {/* LONG liq zones (below current price) */}
            {below.map((z, i) => (
              <ZoneRow key={`below-${i}`} zone={z} maxUsd={maxUsd} userPosition={userPosition} />
            ))}
          </>
        )}
      </div>

      {/* Footer note */}
      <div
        className="px-3 py-1.5 text-[9px] font-mono text-slate-700 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        Estimates based on OI × assumed leverage distribution (2×–100×). Bars show relative size — open a position to see your liq highlighted.
        On the chart: blue dashed = your entry · red dashed = your liq.
      </div>
    </div>
  );
}
