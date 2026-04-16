/**
 * useOrderbookStream.ts
 *
 * Subscribes to the Pacifica orderbook channel via the shared singleton WS
 * (pacifica-ws.ts). No second connection — reuses the existing socket.
 *
 * Updates every ~250 ms. Computes bid/ask imbalance from top-20 levels.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { ensureConnected, onMessage, onConnect, wsSend } from "@/lib/pacifica-ws";

const TOP_N = 20;

interface Level { a: string; n: number; p: string }

function sumVolume(levels: Level[]): number {
  return levels.slice(0, TOP_N).reduce((s, l) => s + parseFloat(l.a || "0"), 0);
}

function parseLevels(data: unknown): { bids: Level[]; asks: Level[] } | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // Actual Pacifica format: { s: "SOL", l: [[bids], [asks]] }
  if (Array.isArray(obj.l) && obj.l.length >= 2) {
    const [bids, asks] = obj.l as [Level[], Level[]];
    if (Array.isArray(bids) && Array.isArray(asks)) return { bids, asks };
  }
  // Fallback: { bids: [...], asks: [...] }
  if (Array.isArray(obj.bids) && Array.isArray(obj.asks)) {
    return { bids: obj.bids as Level[], asks: obj.asks as Level[] };
  }
  // Fallback: [[bids], [asks]] directly
  if (Array.isArray(data) && data.length >= 2) {
    const [bids, asks] = data as [Level[], Level[]];
    if (Array.isArray(bids) && Array.isArray(asks)) return { bids, asks };
  }
  return null;
}

export interface OrderbookSnapshot {
  bidVolume:   number;
  askVolume:   number;
  /** -1 … +1 (negative = ask heavy, positive = bid heavy) */
  imbalance:   number;
}

export function useOrderbookStream(symbol: string): OrderbookSnapshot {
  const [snapshot, setSnapshot] = useState<OrderbookSnapshot>({
    bidVolume: 0, askVolume: 0, imbalance: 0,
  });

  // Strip -PERP suffix — orderbook uses base symbol e.g. "SOL"
  const baseSymbol = symbol.replace(/-PERP$/i, "").toUpperCase();
  const baseRef = useRef(baseSymbol);
  useEffect(() => { baseRef.current = baseSymbol; }, [baseSymbol]);

  useEffect(() => {
    if (!symbol) return;

    ensureConnected();

    const subscribe = () => {
      // Try both known subscription formats
      wsSend({ method: "subscribe", source: "book", symbol: baseRef.current, agg_level: 100 });
      wsSend({ method: "subscribe", params: { source: "book", symbol: baseRef.current, agg_level: 100 } });
    };

    // Subscribe now + on every reconnect
    subscribe();
    const unsubConnect = onConnect(subscribe);

    const unsubMsg = onMessage((raw) => {
      const msg = raw as Record<string, unknown>;
      if (!msg) return;

      const isBook = msg.channel === "book" || msg.source === "book" || msg.type === "book";
      if (!isBook) return;

      const dataObj = msg.data as Record<string, unknown> | undefined;
      const msgSymbol = ((dataObj?.s ?? dataObj?.symbol ?? msg.symbol ?? "") as string).toUpperCase();
      if (msgSymbol && msgSymbol !== baseRef.current) return;

      const parsed = parseLevels(dataObj ?? msg);
      if (!parsed) return;

      const bidVolume = sumVolume(parsed.bids);
      const askVolume = sumVolume(parsed.asks);
      const total     = bidVolume + askVolume;
      const imbalance = total > 0 ? (bidVolume - askVolume) / total : 0;

      setSnapshot({ bidVolume, askVolume, imbalance });
    });

    return () => {
      unsubConnect();
      unsubMsg();
    };
  }, [baseSymbol, symbol]);

  return snapshot;
}
