/**
 * useWhaleStream.ts
 *
 * Dual-Signal Discovery Engine:
 *  1. Social layer  — Elfa AI trending tokens, cached 10 min (TTL).
 *  2. Whale layer   — Pacifica WebSocket public fills, filtered by $10 k+ notional.
 *  3. Matcher       — When both signals agree on the same symbol → VerifiedAlpha.
 *
 * The hook is fully resilient: if the WS never connects or no whale trades
 * arrive, social signals still surface; verified alpha is just empty.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getTrendingTokens } from "@/lib/elfa-client";
import {
  ensureConnected,
  onMessage,
  onConnect,
  wsSend,
} from "@/lib/pacifica-ws";
import type {
  AlphaSocialSignal,
  WhaleEvent,
  VerifiedAlpha,
  Direction,
  WhaleSentiment,
} from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const WHALE_THRESHOLD_USD = 10_000;
const SOCIAL_TTL_MS = 10 * 60 * 1000;
const SOCIAL_REFRESH_MS = 5 * 60 * 1000;
const MAX_VERIFIED = 20;
const MAX_WHALE_EVENTS = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map changePercent → 0-100 sentiment score (capped ±50 %) */
function toSentimentScore(change: number): number {
  return Math.max(0, Math.min(100, Math.round(50 + change)));
}

/** Map mentionCount → 0-100 volume score (1 000 mentions = 100) */
function toVolumeScore(count: number): number {
  return Math.min(100, Math.round((count / 1_000) * 100));
}

function normaliseSocialSignal(t: {
  symbol: string;
  mentionCount: number;
  changePercent: number;
  sentiment: WhaleSentiment;
}): AlphaSocialSignal {
  return {
    symbol: t.symbol,
    mentionCount: t.mentionCount,
    changePercent: t.changePercent,
    sentiment: t.sentiment,
    sentimentScore: toSentimentScore(t.changePercent),
    volumeScore: toVolumeScore(t.mentionCount),
    fetchedAt: Date.now(),
  };
}

/** Direction implied by social sentiment */
function socialDirection(s: AlphaSocialSignal): Direction | null {
  if (s.sentiment === "BULLISH") return "LONG";
  if (s.sentiment === "BEARISH") return "SHORT";
  return null; // NEUTRAL — skip matching
}

/** Composite confidence: average of sentiment + volume + agreement bonus */
function computeConfidence(
  social: AlphaSocialSignal,
  _whale: WhaleEvent,
): number {
  const base = Math.round((social.sentimentScore + social.volumeScore) / 2);
  // agreement bonus: whale direction matches sentiment → +10
  return Math.min(100, base + 10);
}

// ─── WS raw shape ─────────────────────────────────────────────────────────────

/**
 * Pacifica public fill / trade message (best-effort — docs are sparse).
 * We attempt two channel names ("trades" and "fills") and accept either.
 */
interface WsRawTrade {
  s?: string; // symbol
  d?: string; // side: "bid" | "ask"
  p?: string; // price
  a?: string; // amount / size
  t?: number; // timestamp ms
  // alternate field names seen on some perp DEXes
  symbol?: string;
  side?: string;
  price?: string;
  size?: string;
  qty?: string;
  ts?: number;
}

interface WsMessage {
  channel?: string;
  type?: string;
  data?: unknown;
  method?: string;
}

function parseWsTradeEvent(msg: WsMessage): WhaleEvent | null {
  const isTradeChannel =
    msg.channel === "trades" ||
    msg.channel === "fills" ||
    msg.channel === "all_trades" ||
    msg.type === "trade";

  if (!isTradeChannel || !msg.data) return null;

  const items: WsRawTrade[] = Array.isArray(msg.data)
    ? msg.data
    : [msg.data as WsRawTrade];

  // Return the first item that passes the whale threshold
  for (const raw of items) {
    const symbol = raw.symbol ?? raw.s;
    if (!symbol) continue;

    const price = parseFloat(raw.price ?? raw.p ?? "0");
    const size = parseFloat(raw.size ?? raw.qty ?? raw.a ?? "0");
    if (!price || !size) continue;

    const notional = price * size;
    if (notional < WHALE_THRESHOLD_USD) continue;

    const rawSide = raw.side ?? raw.d ?? "";
    const side: Direction =
      rawSide === "bid" || rawSide === "buy" || rawSide === "LONG"
        ? "LONG"
        : "SHORT";

    return {
      id: `whale-${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: symbol.replace(/-PERP$/i, "").toUpperCase(),
      side,
      size,
      price,
      notional,
      timestamp: raw.t ?? raw.ts ?? Date.now(),
    };
  }
  return null;
}

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface UseWhaleStreamReturn {
  /** Tokens with both social + whale signals aligned */
  verifiedAlphas: VerifiedAlpha[];
  /** All live social signals (some may not have whale confirmation yet) */
  socialSignals: AlphaSocialSignal[];
  /** Recent whale events regardless of social match */
  whaleEvents: WhaleEvent[];
  isWsConnected: boolean;
  isSocialLoading: boolean;
  socialError: Error | null;
  /** Force a social signal refresh */
  refreshSocial: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWhaleStream(): UseWhaleStreamReturn {
  const [socialSignals, setSocialSignals] = useState<AlphaSocialSignal[]>([]);
  const [whaleEvents, setWhaleEvents] = useState<WhaleEvent[]>([]);
  const [verifiedAlphas, setVerifiedAlphas] = useState<VerifiedAlpha[]>([]);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(true);
  const [socialError, setSocialError] = useState<Error | null>(null);
  const [socialRefreshTick, setSocialRefreshTick] = useState(0);

  // Refs so callbacks always see latest state without stale closures
  const socialRef = useRef<AlphaSocialSignal[]>([]);
  const whaleRef = useRef<WhaleEvent[]>([]);
  const verifiedRef = useRef<VerifiedAlpha[]>([]);

  // ── Social data ───────────────────────────────────────────────────────────

  const refreshSocial = useCallback(() => {
    setSocialRefreshTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsSocialLoading(true);
    setSocialError(null);

    getTrendingTokens("24h", 20)
      .then((tokens) => {
        if (cancelled) return;
        const signals = tokens.map(normaliseSocialSignal);
        socialRef.current = signals;
        setSocialSignals(signals);
        setIsSocialLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSocialError(err instanceof Error ? err : new Error(String(err)));
        setIsSocialLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [socialRefreshTick]);

  // Auto-refresh social every minute
  useEffect(() => {
    const id = setInterval(refreshSocial, SOCIAL_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshSocial]);

  // Evict stale social signals (older than TTL)
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const fresh = socialRef.current.filter(
        (s) => now - s.fetchedAt < SOCIAL_TTL_MS,
      );
      if (fresh.length !== socialRef.current.length) {
        socialRef.current = fresh;
        setSocialSignals(fresh);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Matcher ───────────────────────────────────────────────────────────────

  const tryMatch = useCallback((event: WhaleEvent) => {
    const social = socialRef.current.find((s) => s.symbol === event.symbol);
    if (!social) return;

    const dir = socialDirection(social);
    if (!dir || dir !== event.side) return; // must agree on direction

    const existing = verifiedRef.current.find((v) => v.symbol === event.symbol);
    // Deduplicate: if we already have one for this symbol, only update if newer confidence
    const confidence = computeConfidence(social, event);
    if (existing && existing.confidence >= confidence) return;

    const verified: VerifiedAlpha = {
      id: `va-${event.symbol}-${Date.now()}`,
      symbol: event.symbol,
      social,
      whale: event,
      direction: dir,
      confidence,
      verifiedAt: Date.now(),
    };

    verifiedRef.current = [
      verified,
      ...verifiedRef.current.filter((v) => v.symbol !== event.symbol),
    ].slice(0, MAX_VERIFIED);

    setVerifiedAlphas([...verifiedRef.current]);
  }, []);

  // ── WebSocket (shared singleton) ──────────────────────────────────────────

  useEffect(() => {
    ensureConnected();

    const sendTradeSubs = () => {
      ["trades", "fills", "all_trades"].forEach((ch) =>
        wsSend({ method: "subscribe", params: { channel: ch } }),
      );
    };

    // Re-subscribe on every reconnect + fire now if already open
    const unsubConnect = onConnect(() => {
      setIsWsConnected(true);
      sendTradeSubs();
    });

    const unsubMsg = onMessage((raw) => {
      const msg = raw as WsMessage;
      if (!msg) return;
      if (msg.channel === "pong" || msg.method === "pong") return;

      const event = parseWsTradeEvent(msg);
      if (!event) return;

      whaleRef.current = [event, ...whaleRef.current].slice(
        0,
        MAX_WHALE_EVENTS,
      );
      setWhaleEvents([...whaleRef.current]);
      tryMatch(event);
    });

    return () => {
      unsubConnect();
      unsubMsg();
      setIsWsConnected(false);
    };
  }, [tryMatch]);

  return {
    verifiedAlphas,
    socialSignals,
    whaleEvents,
    isWsConnected,
    isSocialLoading,
    socialError,
    refreshSocial,
  };
}
