/**
 * Unit tests for src/lib/trading-math.ts
 *
 * All functions are pure — no mocking required.
 */

import { describe, it, expect } from "vitest";
import {
  snapAmount,
  parseLotSizeError,
  computeLiqPrice,
  distToLiq,
  bracketSide,
  isTp,
  isSl,
  trailSlPrice,
  slNeedsUpdate,
  annualizedFundingRate,
  calcBasisPct,
  yieldScore,
  spreadRisk,
  arbRiskScore,
  arbRecommendation,
} from "@/lib/trading-math";
import type { PacificaOrder } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOrder(
  price: string,
  side: "bid" | "ask",
  reduceOnly: boolean
): PacificaOrder {
  return {
    order_id: 1,
    client_order_id: "test-1",
    symbol: "SOL-PERP",
    side,
    price,
    initial_amount: "1",
    filled_amount: "0",
    cancelled_amount: "0",
    stop_price: null,
    order_type: "limit",
    stop_parent_order_id: null,
    reduce_only: reduceOnly,
    created_at: 0,
    updated_at: 0,
  } as unknown as PacificaOrder;
}

// ─── snapAmount ───────────────────────────────────────────────────────────────

describe("snapAmount", () => {
  it("snaps to nearest integer lot (lotSize = 1)", () => {
    expect(snapAmount(1.6, 1)).toBe("2");
    expect(snapAmount(1.4, 1)).toBe("1");
  });

  it("snaps to decimal lot (lotSize = 0.1)", () => {
    expect(snapAmount(1.234, 0.1)).toBe("1.2");
    expect(snapAmount(1.25, 0.1)).toBe("1.3"); // rounds half-up
  });

  it("snaps to small lot (lotSize = 0.01)", () => {
    expect(snapAmount(0.056, 0.01)).toBe("0.06");
  });

  it("rounds exact multiples unchanged", () => {
    expect(snapAmount(5, 1)).toBe("5");
    expect(snapAmount(0.5, 0.1)).toBe("0.5");
  });

  it("throws when size rounds to zero", () => {
    expect(() => snapAmount(0.001, 1)).toThrow(/below minimum lot size/);
    expect(() => snapAmount(0, 1)).toThrow(/below minimum lot size/);
  });

  it("throws with lot size in message so caller can parse it", () => {
    expect(() => snapAmount(0.001, 0.1)).toThrow(/0\.1/);
  });
});

// ─── parseLotSizeError ────────────────────────────────────────────────────────

describe("parseLotSizeError", () => {
  it("extracts integer lot size from Pacifica error message", () => {
    const err = new Error("[400] amount is not a multiple of lot size 1");
    expect(parseLotSizeError(err)).toBe(1);
  });

  it("extracts decimal lot size", () => {
    const err = new Error("lot size 0.01");
    expect(parseLotSizeError(err)).toBe(0.01);
  });

  it("returns null for unrelated errors", () => {
    expect(parseLotSizeError(new Error("Insufficient margin"))).toBeNull();
    expect(parseLotSizeError("something else")).toBeNull();
  });

  it("handles non-Error values", () => {
    expect(parseLotSizeError("lot size 5")).toBe(5);
    expect(parseLotSizeError(null)).toBeNull();
  });
});

// ─── computeLiqPrice ─────────────────────────────────────────────────────────

describe("computeLiqPrice", () => {
  it("LONG liq is below entry price", () => {
    const liq = computeLiqPrice("LONG", 100, 10);
    expect(liq).toBeLessThan(100);
  });

  it("SHORT liq is above entry price", () => {
    const liq = computeLiqPrice("SHORT", 100, 10);
    expect(liq).toBeGreaterThan(100);
  });

  it("higher leverage → liq price closer to entry (LONG)", () => {
    const liq10x  = computeLiqPrice("LONG", 100, 10);
    const liq20x  = computeLiqPrice("LONG", 100, 20);
    // 20x liquidates closer to entry
    expect(liq20x).toBeGreaterThan(liq10x);
  });

  it("LONG 10x entry=100 → liq ~90.5 (formula: 100*(1-0.1+0.005))", () => {
    expect(computeLiqPrice("LONG", 100, 10)).toBeCloseTo(90.5, 5);
  });

  it("SHORT 10x entry=100 → liq ~109.5 (formula: 100*(1+0.1-0.005))", () => {
    expect(computeLiqPrice("SHORT", 100, 10)).toBeCloseTo(109.5, 5);
  });

  it("returns 0 for zero or negative leverage (guard)", () => {
    expect(computeLiqPrice("LONG", 100, 0)).toBe(0);
    expect(computeLiqPrice("LONG", 100, -1)).toBe(0);
  });

  it("custom mmr shifts liq price", () => {
    const defaultMmr = computeLiqPrice("LONG", 100, 10, 0.005);
    const higherMmr  = computeLiqPrice("LONG", 100, 10, 0.01);
    // Higher maintenance margin → liq price is closer to entry (higher for LONG)
    expect(higherMmr).toBeGreaterThan(defaultMmr);
  });
});

// ─── distToLiq ────────────────────────────────────────────────────────────────

describe("distToLiq", () => {
  it("returns absolute percentage distance", () => {
    expect(distToLiq(90, 100)).toBeCloseTo(10, 5);
    expect(distToLiq(110, 100)).toBeCloseTo(10, 5);
  });

  it("returns 100 when mark price is zero (guard)", () => {
    expect(distToLiq(90, 0)).toBe(100);
  });

  it("distance < 10 flags at-risk (regression check)", () => {
    expect(distToLiq(95, 100)).toBeLessThan(10);
    expect(distToLiq(89, 100)).toBeGreaterThan(10);
  });
});

// ─── bracketSide ─────────────────────────────────────────────────────────────

describe("bracketSide", () => {
  it("LONG positions → bracket orders on ask side", () => {
    expect(bracketSide("LONG")).toBe("ask");
  });

  it("SHORT positions → bracket orders on bid side", () => {
    expect(bracketSide("SHORT")).toBe("bid");
  });
});

// ─── isTp ────────────────────────────────────────────────────────────────────

describe("isTp", () => {
  it("LONG: reduce-only ask above entry = TP", () => {
    const order = makeOrder("110", "ask", true);
    expect(isTp(order, "LONG", 100)).toBe(true);
  });

  it("LONG: reduce-only ask at entry is NOT a TP (SL boundary)", () => {
    const order = makeOrder("100", "ask", true);
    expect(isTp(order, "LONG", 100)).toBe(false);
  });

  it("LONG: reduce-only ask below entry is NOT a TP", () => {
    const order = makeOrder("90", "ask", true);
    expect(isTp(order, "LONG", 100)).toBe(false);
  });

  it("LONG: non-reduce-only order is never a TP", () => {
    const order = makeOrder("110", "ask", false);
    expect(isTp(order, "LONG", 100)).toBe(false);
  });

  it("LONG: wrong side (bid) is never a TP", () => {
    const order = makeOrder("110", "bid", true);
    expect(isTp(order, "LONG", 100)).toBe(false);
  });

  it("SHORT: reduce-only bid below entry = TP", () => {
    const order = makeOrder("90", "bid", true);
    expect(isTp(order, "SHORT", 100)).toBe(true);
  });

  it("SHORT: reduce-only bid above entry is NOT a TP", () => {
    const order = makeOrder("110", "bid", true);
    expect(isTp(order, "SHORT", 100)).toBe(false);
  });
});

// ─── isSl ────────────────────────────────────────────────────────────────────

describe("isSl", () => {
  it("LONG: reduce-only ask at entry = SL (breakeven stop)", () => {
    const order = makeOrder("100", "ask", true);
    expect(isSl(order, "LONG", 100)).toBe(true);
  });

  it("LONG: reduce-only ask below entry = SL", () => {
    const order = makeOrder("90", "ask", true);
    expect(isSl(order, "LONG", 100)).toBe(true);
  });

  it("LONG: reduce-only ask above entry is NOT an SL (that's a TP)", () => {
    const order = makeOrder("110", "ask", true);
    expect(isSl(order, "LONG", 100)).toBe(false);
  });

  it("SHORT: reduce-only bid at or above entry = SL", () => {
    const atEntry = makeOrder("100", "bid", true);
    const above   = makeOrder("110", "bid", true);
    expect(isSl(atEntry, "SHORT", 100)).toBe(true);
    expect(isSl(above,   "SHORT", 100)).toBe(true);
  });

  it("SHORT: reduce-only bid below entry is NOT an SL (that's a TP)", () => {
    const order = makeOrder("90", "bid", true);
    expect(isSl(order, "SHORT", 100)).toBe(false);
  });

  it("isTp and isSl are mutually exclusive for the same order", () => {
    const order = makeOrder("110", "ask", true);
    // LONG position: 110 > 100 → TP=true, SL=false
    expect(isTp(order, "LONG", 100)).toBe(true);
    expect(isSl(order, "LONG", 100)).toBe(false);
  });
});

// ─── trailSlPrice ─────────────────────────────────────────────────────────────

describe("trailSlPrice", () => {
  it("LONG: SL is below the watermark by trailPct", () => {
    expect(trailSlPrice("LONG", 100, 5)).toBeCloseTo(95, 5);
  });

  it("SHORT: SL is above the watermark by trailPct", () => {
    expect(trailSlPrice("SHORT", 100, 5)).toBeCloseTo(105, 5);
  });

  it("larger trail % → SL further from watermark", () => {
    const sl2 = trailSlPrice("LONG", 100, 2);
    const sl5 = trailSlPrice("LONG", 100, 5);
    expect(sl5).toBeLessThan(sl2);
  });

  it("zero trail % → SL equals watermark", () => {
    expect(trailSlPrice("LONG",  100, 0)).toBe(100);
    expect(trailSlPrice("SHORT", 100, 0)).toBe(100);
  });
});

// ─── slNeedsUpdate ────────────────────────────────────────────────────────────

describe("slNeedsUpdate", () => {
  it("always needs update when no previous SL exists", () => {
    expect(slNeedsUpdate(95, undefined)).toBe(true);
  });

  it("no update needed when movement is ≤ 0.1%", () => {
    // 0.05% change from 100 → 100.05
    expect(slNeedsUpdate(100.05, 100)).toBe(false);
  });

  it("update needed when movement > 0.1%", () => {
    // 0.2% change
    expect(slNeedsUpdate(100.2, 100)).toBe(true);
    expect(slNeedsUpdate(99.8, 100)).toBe(true);
  });

  it("exact 0.1% boundary: just over triggers update", () => {
    expect(slNeedsUpdate(100.11, 100)).toBe(true);
    expect(slNeedsUpdate(100.10, 100)).toBe(false);
  });
});

// ─── annualizedFundingRate ────────────────────────────────────────────────────

describe("annualizedFundingRate", () => {
  it("annualizes an hourly rate correctly (×24×365×100 for %)", () => {
    // 0.01% per hour = 0.0001 decimal
    expect(annualizedFundingRate(0.0001)).toBeCloseTo(0.0001 * 24 * 365 * 100, 6);
  });

  it("zero rate → zero annualized", () => {
    expect(annualizedFundingRate(0)).toBe(0);
  });

  it("negative rate (backwardation) stays negative", () => {
    expect(annualizedFundingRate(-0.0001)).toBeLessThan(0);
  });
});

// ─── calcBasisPct ─────────────────────────────────────────────────────────────

describe("calcBasisPct", () => {
  it("positive basis = contango (perp > spot)", () => {
    expect(calcBasisPct(102, 100)).toBeCloseTo(2, 5);
  });

  it("negative basis = backwardation (perp < spot)", () => {
    expect(calcBasisPct(98, 100)).toBeCloseTo(-2, 5);
  });

  it("zero spot price returns 0 (guard against division by zero)", () => {
    expect(calcBasisPct(100, 0)).toBe(0);
  });
});

// ─── yieldScore ───────────────────────────────────────────────────────────────

describe("yieldScore", () => {
  it("zero yield → score 0", () => {
    expect(yieldScore(0)).toBe(0);
  });

  it("100% annualized → score 1.0 (saturation)", () => {
    expect(yieldScore(100)).toBe(1);
  });

  it("saturates at 1.0 for yields above 100%", () => {
    expect(yieldScore(200)).toBe(1);
    expect(yieldScore(9999)).toBe(1);
  });

  it("50% yield → score 0.5", () => {
    expect(yieldScore(50)).toBeCloseTo(0.5, 5);
  });
});

// ─── spreadRisk ───────────────────────────────────────────────────────────────

describe("spreadRisk", () => {
  it("zero basis → risk 0", () => {
    expect(spreadRisk(0)).toBe(0);
  });

  it("2% basis → risk 1.0 (saturated)", () => {
    expect(spreadRisk(2)).toBe(1);
    expect(spreadRisk(-2)).toBe(1);
  });

  it("1% basis → risk 0.5", () => {
    expect(spreadRisk(1)).toBeCloseTo(0.5, 5);
  });

  it("saturates at 1.0 for basis > 2%", () => {
    expect(spreadRisk(5)).toBe(1);
    expect(spreadRisk(-10)).toBe(1);
  });
});

// ─── arbRiskScore ─────────────────────────────────────────────────────────────

describe("arbRiskScore", () => {
  it("perfect yield, zero spread → lowest risk score", () => {
    // 1 - 1*0.6 + 0*0.4 = 0.4 → 40
    expect(arbRiskScore(1, 0)).toBe(40);
  });

  it("zero yield, max spread → highest risk score", () => {
    // 1 - 0*0.6 + 1*0.4 = 1.4 → 140
    expect(arbRiskScore(0, 1)).toBe(140);
  });

  it("typical low-yield, low-spread → moderate risk", () => {
    const ys = yieldScore(20);  // 0.2
    const sr = spreadRisk(0.5); // 0.25
    const score = arbRiskScore(ys, sr);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(140);
  });

  it("result is always an integer (Math.round)", () => {
    const score = arbRiskScore(0.333, 0.666);
    expect(Number.isInteger(score)).toBe(true);
  });
});

// ─── arbRecommendation ───────────────────────────────────────────────────────

describe("arbRecommendation", () => {
  it("high yield + low risk → OPEN", () => {
    expect(arbRecommendation(20, 50)).toBe("OPEN");
  });

  it("high yield but risky → MONITOR (not OPEN)", () => {
    expect(arbRecommendation(20, 65)).toBe("MONITOR");
  });

  it("moderate yield (8-15%) → MONITOR regardless of risk", () => {
    expect(arbRecommendation(10, 30)).toBe("MONITOR");
    expect(arbRecommendation(10, 80)).toBe("MONITOR");
  });

  it("low yield → AVOID", () => {
    expect(arbRecommendation(5, 30)).toBe("AVOID");
    expect(arbRecommendation(0, 0)).toBe("AVOID");
  });

  it("exactly at threshold boundary: 15% yield + risk 59 → OPEN", () => {
    expect(arbRecommendation(15, 59)).toBe("OPEN");
  });

  it("exactly at threshold boundary: 15% yield + risk 60 → MONITOR", () => {
    expect(arbRecommendation(15, 60)).toBe("MONITOR");
  });

  it("custom minYieldThreshold is respected", () => {
    expect(arbRecommendation(10, 50, 10)).toBe("OPEN");
    expect(arbRecommendation(10, 50, 20)).toBe("MONITOR");
  });
});
