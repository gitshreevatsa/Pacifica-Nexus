/**
 * useOIDelta.ts
 * Tracks open-interest snapshots and computes % change over 1h.
 * Snapshots are stored in a ref so they survive re-renders without
 * triggering additional renders themselves.
 */

"use client";

import { useRef, useEffect, useState } from "react";
import type { Market } from "@/types";

interface OISnapshot {
  oi: number;
  ts: number;
}

/** Returns a record of symbol → OI delta % over the last ~1 hour. */
export function useOIDelta(markets: Market[]): Record<string, number> {
  const historyRef = useRef<Map<string, OISnapshot[]>>(new Map());
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  useEffect(() => {
    if (markets.length === 0) return;

    const now = Date.now();
    const hist = historyRef.current;
    const KEEP_MS = 65 * 60 * 1_000; // keep 65 min of history

    // Append current OI snapshot for each market
    for (const m of markets) {
      const arr = hist.get(m.symbol) ?? [];
      arr.push({ oi: m.openInterest, ts: now });
      hist.set(m.symbol, arr.filter((s) => s.ts >= now - KEEP_MS));
    }

    // Compute 1h delta: compare current vs the oldest snapshot ≥ 60 min ago
    const TARGET_MS = 60 * 60 * 1_000;
    const result: Record<string, number> = {};

    for (const m of markets) {
      const arr = hist.get(m.symbol) ?? [];
      if (arr.length < 2) continue;

      // Find the snapshot closest to 1h ago
      const boundary = now - TARGET_MS;
      const baseline = arr.find((s) => s.ts >= boundary) ?? arr[0];
      if (baseline && baseline.oi > 0 && baseline.ts !== now) {
        result[m.symbol] = ((m.openInterest - baseline.oi) / baseline.oi) * 100;
      }
    }

    setDeltas(result);
  }, [markets]);

  return deltas;
}
