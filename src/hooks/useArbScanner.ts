/**
 * useArbScanner.ts
 * Compares Pacifica Funding Rates vs Jupiter Spot prices.
 * Calculates Annualized Basis Yield for the Cash-and-Carry arb.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { getPacificaClient } from "@/lib/pacifica-client";
import type { FundingSnapshot, ArbOpportunity, Market } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const JUPITER_PRICE_API =
  process.env.NEXT_PUBLIC_JUPITER_PRICE_API ?? "https://price.jup.ag/v6/price";

/** Minimum annualized yield (%) to flag as actionable. */
const MIN_YIELD_THRESHOLD = 15;

/** Markets to scan. Extend as Pacifica lists more assets. */
const SCAN_MARKETS = [
  { perpSymbol: "SOL-PERP",  spotMint: "So11111111111111111111111111111111111111112" },
  { perpSymbol: "BTC-PERP",  spotMint: "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ5P" },
  { perpSymbol: "ETH-PERP",  spotMint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs" },
  { perpSymbol: "JTO-PERP",  spotMint: "jtojtomepa8bdiya1GFtu1hZ3UGxmkKmxiqYCCCGwwpGXk" },
  { perpSymbol: "JUP-PERP",  spotMint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
];

// ─── Jupiter Price Fetcher ────────────────────────────────────────────────────

interface JupiterPriceResponse {
  data: Record<string, { id: string; mintSymbol: string; vsToken: string; price: number }>;
}

async function fetchJupiterPrices(
  mints: string[]
): Promise<Record<string, number>> {
  try {
    const ids = mints.join(",");
    const res = await fetch(`${JUPITER_PRICE_API}?ids=${ids}&vsToken=USDC`);
    if (!res.ok) return getMockSpotPrices();
    const json: JupiterPriceResponse = await res.json();
    const prices = Object.fromEntries(
      Object.entries(json.data ?? {}).map(([mint, v]) => [mint, v.price])
    );
    // Fall back to mock if we got an empty map
    return Object.keys(prices).length > 0 ? prices : getMockSpotPrices();
  } catch {
    return getMockSpotPrices();
  }
}

/** Mock spot prices for local dev before Jupiter API is wired. */
function getMockSpotPrices(): Record<string, number> {
  return {
    So11111111111111111111111111111111111111112: 155.42,
    "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ5P": 62_480,
    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": 3_410,
    jtojtomepa8bdiya1GFtu1hZ3UGxmkKmxiqYCCCGwwpGXk: 2.84,
    JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 0.87,
  };
}

// ─── Snapshot Builder ─────────────────────────────────────────────────────────

function buildSnapshot(
  market: Market,
  spotPrice: number,
  perpSymbol: string
): FundingSnapshot {
  // Funding rate from Pacifica is hourly → annualize: rate * 24h * 365d
  const annualizedRate = market.fundingRate * 24 * 365 * 100; // in %
  const basis = market.markPrice - spotPrice;
  const basisPct = spotPrice > 0 ? (basis / spotPrice) * 100 : 0;

  return {
    market: perpSymbol,
    perpSymbol,
    spotSymbol: perpSymbol.replace("-PERP", "/USDC"),
    fundingRate: market.fundingRate,
    annualizedRate,
    spotPrice,
    perpPrice: market.markPrice,
    basis,
    basisPct,
    direction: basis >= 0 ? "CONTANGO" : "BACKWARDATION",
    updatedAt: Date.now(),
  };
}

function scoreOpportunity(snap: FundingSnapshot): ArbOpportunity {
  // Higher yield + lower basis gap = safer arb
  const yieldScore = Math.min(snap.annualizedRate / 100, 1); // normalize to 0-1
  const spreadRisk = Math.min(Math.abs(snap.basisPct) / 2, 1); // > 2% spread = risky

  // Risk: 0 = safe, 100 = very risky
  const riskScore = Math.round((1 - yieldScore * 0.6 + spreadRisk * 0.4) * 100);

  const recommendation: ArbOpportunity["recommendation"] =
    snap.annualizedRate >= MIN_YIELD_THRESHOLD && riskScore < 60
      ? "OPEN"
      : snap.annualizedRate >= 8
      ? "MONITOR"
      : "AVOID";

  return {
    market: snap.perpSymbol,
    annualizedYield: snap.annualizedRate,
    fundingRate: snap.fundingRate,
    basis: snap.basis,
    riskScore,
    recommendation,
  };
}

// ─── Composite Query ──────────────────────────────────────────────────────────

async function fetchArbData(): Promise<{
  snapshots: FundingSnapshot[];
  opportunities: ArbOpportunity[];
}> {
  const [markets, spotPrices] = await Promise.all([
    getPacificaClient().getMarkets(),
    fetchJupiterPrices(SCAN_MARKETS.map((m) => m.spotMint)),
  ]);

  const snapshots: FundingSnapshot[] = [];
  const opportunities: ArbOpportunity[] = [];

  for (const { perpSymbol, spotMint } of SCAN_MARKETS) {
    // Pacifica may return "SOL" or "SOL-PERP" — try both
    const baseSymbol = perpSymbol.replace("-PERP", "");
    const market = markets.find(
      (m) => m.symbol === perpSymbol || m.symbol === baseSymbol
    );
    const spotPrice = spotPrices[spotMint];

    if (!market || !spotPrice) continue;

    const snap = buildSnapshot(market, spotPrice, perpSymbol);
    const opp = scoreOpportunity(snap);

    snapshots.push(snap);
    opportunities.push(opp);
  }

  // Sort by annualized yield descending
  snapshots.sort((a, b) => b.annualizedRate - a.annualizedRate);
  opportunities.sort((a, b) => b.annualizedYield - a.annualizedYield);

  return { snapshots, opportunities };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseArbScannerReturn {
  snapshots: FundingSnapshot[];
  opportunities: ArbOpportunity[];
  topOpportunity: ArbOpportunity | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useArbScanner(): UseArbScannerReturn {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["arb-scanner"],
    queryFn: fetchArbData,
    refetchInterval: 3_000, // match Pacifica oracle cadence
    staleTime: 2_000,
    retry: 2,
  });

  const snapshots = data?.snapshots ?? [];
  const opportunities = data?.opportunities ?? [];
  const topOpportunity =
    opportunities.find((o) => o.recommendation === "OPEN") ?? null;

  return {
    snapshots,
    opportunities,
    topOpportunity,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
