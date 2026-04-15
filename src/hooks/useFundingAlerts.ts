/**
 * useFundingAlerts.ts
 * Evaluates user-defined funding rate thresholds against live market data.
 * Returns a list of newly-fired alerts this session.
 */

"use client";

import { useEffect, useState } from "react";
import type { Market } from "@/types";
import { useFundingAlertStore } from "@/stores/fundingAlertStore";

export interface FiredAlert {
  id: string;
  symbol: string;
  threshold: number;
  direction: "above" | "below";
  actual: number;
  firedAt: number;
}

export function useFundingAlerts(markets: Market[]): FiredAlert[] {
  const { alerts, markTriggered } = useFundingAlertStore();
  const [fired, setFired] = useState<FiredAlert[]>([]);

  useEffect(() => {
    if (markets.length === 0 || alerts.length === 0) return;

    const marketMap: Record<string, Market> = {};
    for (const m of markets) {
      marketMap[m.symbol] = m;
      // Also index by bare symbol (without -PERP suffix)
      marketMap[m.symbol.replace("-PERP", "")] = m;
    }

    for (const alert of alerts) {
      if (alert.triggered) continue;

      const market = marketMap[alert.symbol] ?? marketMap[`${alert.symbol}-PERP`];
      if (!market) continue;

      const rate = market.fundingRate;
      const triggered =
        alert.direction === "above" ? rate >= alert.threshold : rate <= alert.threshold;

      if (triggered) {
        markTriggered(alert.id);
        setFired((prev) =>
          [
            ...prev,
            {
              id: alert.id,
              symbol: alert.symbol,
              threshold: alert.threshold,
              direction: alert.direction,
              actual: rate,
              firedAt: Date.now(),
            },
          ].slice(-20)
        );
      }
    }
  }, [markets, alerts, markTriggered]);

  return fired;
}
