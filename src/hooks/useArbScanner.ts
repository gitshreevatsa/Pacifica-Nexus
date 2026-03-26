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

/**
 * Spot mint addresses for every token likely to be listed on Pacifica.
 * Key = base symbol (uppercase, no -PERP).
 * Auto-discovery: fetchArbData pulls ALL Pacifica markets and joins against this map —
 * so any new listing Pacifica adds is picked up automatically as long as its mint is here.
 */
const SPOT_MINT: Record<string, string> = {
  // ── Majors ──────────────────────────────────────────────────────────────────
  SOL:     "So11111111111111111111111111111111111111112",
  BTC:     "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ5P",  // wBTC (Portal)
  ETH:     "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",  // wETH (Portal)

  // ── Solana ecosystem ─────────────────────────────────────────────────────────
  JTO:     "jtojtomepa8bdiya1GFtu1hZ3UGxmkKmxiqYCCCGwwpGXk",
  JUP:     "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  RAY:     "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  PYTH:    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  ORCA:    "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1Adventure",
  MNGO:    "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac",
  MSOL:    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  BSOL:    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",

  // ── Memecoins ────────────────────────────────────────────────────────────────
  WIF:     "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  BONK:    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  POPCAT:  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  MOODENG: "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzc3eu",
  PENGU:   "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
  BOME:    "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82",
  TRUMP:   "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
  MELANIA: "FUAfBo2jgks6gB4Z4LfZkqSZgzNucisEHqnNebaRxM1P",
  FARTCOIN:"9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",

  // ── Cross-chain wrapped ───────────────────────────────────────────────────────
  W:       "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ",  // Wormhole
  RENDER:  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
  DRIFT:   "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",
  ZEUS:    "ZEUS1aR7aX8DFFJf5QjWj2ftDDdNTroMNGo8YoQm3Gq",
  CLOUD:   "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu",
  MEW:     "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
  PONKE:   "5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK31CR8Ada",
  GIGA:    "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9",
};

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
  const markets = await getPacificaClient().getMarkets();

  // Build the set of (market, perpSymbol, spotMint) tuples for every Pacifica
  // market we have a spot mint for. Pacifica may return "SOL" or "SOL-PERP".
  const toScan: Array<{ market: Market; perpSymbol: string; spotMint: string }> = [];
  for (const market of markets) {
    const baseSymbol = market.symbol.replace(/-PERP$/i, "").toUpperCase();
    const spotMint   = SPOT_MINT[baseSymbol];
    if (!spotMint) continue;
    const perpSymbol = baseSymbol + "-PERP";
    toScan.push({ market, perpSymbol, spotMint });
  }

  if (toScan.length === 0) return { snapshots: [], opportunities: [] };

  // Fetch all needed spot mints in one Jupiter call
  const uniqueMints = [...new Set(toScan.map((t) => t.spotMint))];
  const spotPrices  = await fetchJupiterPrices(uniqueMints);

  const snapshots:     FundingSnapshot[]  = [];
  const opportunities: ArbOpportunity[]   = [];

  for (const { market, perpSymbol, spotMint } of toScan) {
    const spotPrice = spotPrices[spotMint];
    if (!spotPrice) continue;

    const snap = buildSnapshot(market, spotPrice, perpSymbol);
    const opp  = scoreOpportunity(snap);
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
