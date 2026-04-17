/**
 * trading-math.ts
 *
 * Pure functions for all trading-critical calculations.
 * No React, no I/O — safe to import in unit tests without any mocking.
 *
 * Sources consolidated here:
 *   pacifica-client.ts  → snapAmount, parseLotSizeError, computeLiqPrice
 *   TpSlManager.tsx     → bracketSide, isTp, isSl, trailSlPrice, slNeedsUpdate
 *   RiskGuard.tsx       → distToLiq
 *   useArbScanner.ts    → annualizedFundingRate, basisPct, yieldScore,
 *                         spreadRisk, arbRiskScore, arbRecommendation
 */

import type { Direction, PacificaOrder } from "@/types";

// ─── Lot-size snapping ────────────────────────────────────────────────────────

/**
 * Snap a size to the nearest lot-size multiple, formatted as a string.
 * Throws if the rounded result is zero (input smaller than half a lot).
 *
 * @example snapAmount(1.234, 0.1) → "1.2"
 * @example snapAmount(0.001, 0.1) → throws
 */
export function snapAmount(size: number, lotSize: number): string {
  const snapped = Math.round(size / lotSize) * lotSize;
  if (snapped <= 0) {
    throw new Error(
      `Size ${size} is below minimum lot size ${lotSize}. Enter at least ${lotSize} units.`
    );
  }
  const decimals =
    lotSize >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(lotSize)));
  return snapped.toFixed(Math.min(decimals, 8));
}

/**
 * Extract the corrected lot size from a Pacifica "not a multiple of lot size X" error.
 * Returns null if the error message is not a lot-size rejection.
 */
export function parseLotSizeError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/lot size (\d+\.?\d*)/i);
  return match ? parseFloat(match[1]) : null;
}

// ─── Liquidation price ────────────────────────────────────────────────────────

/**
 * Simplified cross-margin liquidation price estimate.
 *
 * LONG:  entryPrice × (1 − 1/leverage + mmr)
 * SHORT: entryPrice × (1 + 1/leverage − mmr)
 *
 * @param mmr Maintenance margin rate (default 0.5%)
 */
export function computeLiqPrice(
  side: Direction,
  entryPrice: number,
  leverage: number,
  mmr = 0.005
): number {
  if (leverage <= 0) return 0;
  return side === "LONG"
    ? entryPrice * (1 - 1 / leverage + mmr)
    : entryPrice * (1 + 1 / leverage - mmr);
}

/**
 * Distance from mark price to liquidation, expressed as a percentage of
 * mark price (always ≥ 0).  Values below 10 are considered "at risk".
 */
export function distToLiq(liquidationPrice: number, markPrice: number): number {
  if (markPrice <= 0) return 100;
  return Math.abs(((liquidationPrice - markPrice) / markPrice) * 100);
}

// ─── Bracket order classification ─────────────────────────────────────────────

/**
 * For a given position side, bracket (TP/SL) orders live on the opposite
 * Pacifica side ("bid" for LONG positions, "ask" for SHORT positions).
 */
export function bracketSide(positionSide: Direction): "bid" | "ask" {
  return positionSide === "LONG" ? "ask" : "bid";
}

/**
 * Returns true if `order` is a take-profit for the given position.
 * A TP is reduce-only, on the opposite side, with a price that profits:
 *   - LONG TP: order price > entry (sell higher)
 *   - SHORT TP: order price < entry (buy back lower)
 */
export function isTp(
  order: PacificaOrder,
  side: Direction,
  entryPrice: number
): boolean {
  const price = parseFloat(order.price);
  return (
    order.reduce_only &&
    order.side === bracketSide(side) &&
    (side === "LONG" ? price > entryPrice : price < entryPrice)
  );
}

/**
 * Returns true if `order` is a stop-loss for the given position.
 * An SL is reduce-only, on the opposite side, with a price that stops out:
 *   - LONG SL: order price ≤ entry (sell at or below entry)
 *   - SHORT SL: order price ≥ entry (buy back at or above entry)
 */
export function isSl(
  order: PacificaOrder,
  side: Direction,
  entryPrice: number
): boolean {
  const price = parseFloat(order.price);
  return (
    order.reduce_only &&
    order.side === bracketSide(side) &&
    (side === "LONG" ? price <= entryPrice : price >= entryPrice)
  );
}

// ─── Trailing stop ────────────────────────────────────────────────────────────

/**
 * Compute the new SL price from a (potentially updated) watermark and a
 * trailing percentage.
 *
 * LONG:  watermark × (1 − trailPct/100)  — price drops below the peak
 * SHORT: watermark × (1 + trailPct/100)  — price rises above the trough
 */
export function trailSlPrice(
  side: Direction,
  watermark: number,
  trailPct: number
): number {
  return side === "LONG"
    ? watermark * (1 - trailPct / 100)
    : watermark * (1 + trailPct / 100);
}

/**
 * Returns true if the new SL price has moved more than 0.1% from the last
 * placed SL price (i.e. it's worth re-placing the order).
 */
export function slNeedsUpdate(
  newSlPrice: number,
  prevSlPrice: number | undefined
): boolean {
  if (prevSlPrice === undefined) return true;
  return Math.abs((newSlPrice - prevSlPrice) / prevSlPrice) > 0.001;
}

// ─── Arb / funding-rate math ──────────────────────────────────────────────────

/**
 * Convert an hourly funding rate (decimal) to an annualised percentage.
 *
 * @example annualizedFundingRate(0.0001) → 0.876  (% per year)
 */
export function annualizedFundingRate(hourlyRate: number): number {
  return hourlyRate * 24 * 365 * 100;
}

/**
 * Basis as a percentage of the spot price.
 * Positive = contango (perp > spot), negative = backwardation.
 */
export function calcBasisPct(markPrice: number, spotPrice: number): number {
  if (spotPrice <= 0) return 0;
  return ((markPrice - spotPrice) / spotPrice) * 100;
}

/**
 * Normalised yield score in [0, 1].
 * Saturates at 100% annualised yield.
 */
export function yieldScore(annualizedRate: number): number {
  return Math.min(annualizedRate / 100, 1);
}

/**
 * Normalised spread risk in [0, 1].
 * A basis gap > 2% of spot is considered fully risky (score = 1).
 */
export function spreadRisk(basisPctValue: number): number {
  return Math.min(Math.abs(basisPctValue) / 2, 1);
}

/**
 * Composite risk score 0–100.  Higher = riskier.
 *
 * Formula: round((1 − yieldScore×0.6 + spreadRisk×0.4) × 100)
 */
export function arbRiskScore(ys: number, sr: number): number {
  return Math.round((1 - ys * 0.6 + sr * 0.4) * 100);
}

export type ArbRecommendation = "OPEN" | "MONITOR" | "AVOID";

/**
 * Trade recommendation based on annualized yield and composite risk score.
 *
 * OPEN    — yield ≥ minYieldThreshold AND risk < 60
 * MONITOR — yield ≥ 8%
 * AVOID   — everything else
 */
export function arbRecommendation(
  annualizedRate: number,
  riskScore: number,
  minYieldThreshold = 15
): ArbRecommendation {
  if (annualizedRate >= minYieldThreshold && riskScore < 60) return "OPEN";
  if (annualizedRate >= 8) return "MONITOR";
  return "AVOID";
}
