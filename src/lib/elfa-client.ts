/**
 * elfa-client.ts
 * Client-side wrapper for Elfa AI v2 — calls our /api/elfa proxy route.
 * The actual ELFA_AI_API_KEY lives server-side only and never reaches the browser.
 *
 * Real Elfa v2 endpoints used:
 *   GET /v2/aggregations/trending-tokens  — trending tokens by mention volume
 *   GET /v2/data/top-mentions             — high-engagement posts for a keyword
 */

import type { TrendingToken, ElfaMention, WhaleSentiment } from "@/types";

// ─── Proxy fetch ──────────────────────────────────────────────────────────────

async function elfaGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL("/api/elfa", window.location.origin);
  url.searchParams.set("path", path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`[Elfa] ${res.status}: ${err.error ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Raw Elfa v2 response shapes ──────────────────────────────────────────────

interface ElfaTrendingRaw {
  token?: string;
  symbol?: string;
  name?: string;
  current_count?: number;   // Elfa v2 actual field name
  previous_count?: number;
  change_percent?: number;
  [key: string]: unknown;
}

interface ElfaMentionRaw {
  id?: string;
  username?: string;
  author_username?: string;     // alternate field name
  text?: string;
  content?: string;             // alternate field name
  like_count?: number;
  repost_count?: number;
  view_count?: number;
  created_at?: string | number;
}

interface ElfaMentionsResponse {
  success: boolean;
  data: { list?: ElfaMentionRaw[] } | ElfaMentionRaw[];
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeTrending(raw: ElfaTrendingRaw, index: number): TrendingToken {
  const rawSymbol = raw.token ?? raw.symbol ?? raw.name ?? `TOKEN_${index}`;
  const symbol = String(rawSymbol).replace(/^\$/, "").toUpperCase();
  const mentionCount = Number(raw.current_count ?? 0);
  const change = Number(raw.change_percent ?? raw.change ?? 0);
  const sentiment: WhaleSentiment =
    change > 10 ? "BULLISH" : change < -10 ? "BEARISH" : "NEUTRAL";

  return {
    id: `trending-${symbol}-${index}`,
    symbol,
    mentionCount,
    changePercent: change,
    sentiment,
    timestamp: Date.now(),
  };
}

function normalizeMention(raw: ElfaMentionRaw, index: number): ElfaMention {
  const ts = raw.created_at
    ? typeof raw.created_at === "number"
      ? raw.created_at
      : new Date(raw.created_at).getTime()
    : Date.now();

  return {
    id: raw.id ?? `mention-${index}`,
    author: raw.username ?? raw.author_username ?? "unknown",
    text: raw.text ?? raw.content ?? "",
    likeCount: raw.like_count ?? 0,
    repostCount: raw.repost_count ?? 0,
    viewCount: raw.view_count ?? 0,
    timestamp: ts,
  };
}

// ─── Simple TTL cache ─────────────────────────────────────────────────────────
// Shared across all callers (AlphaFeed, useWhaleStream, MarketAssistant, etc.)
// so the same data is never fetched twice within the TTL window.

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cachedGet<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.data as T;
  const data = await fetcher();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const TRENDING_TTL = 2 * 60 * 1000;   // 2 min — same result for all callers
const MENTIONS_TTL = 3 * 60 * 1000;   // 3 min per symbol

/**
 * Trending tokens by social mention volume.
 * Elfa v2: GET /v2/aggregations/trending-tokens
 * Cached for 2 minutes so concurrent callers share one request.
 */
export async function getTrendingTokens(
  timeWindow: "1h" | "24h" | "7d" = "24h",
  limit = 15
): Promise<TrendingToken[]> {
  return cachedGet(`trending-${timeWindow}`, TRENDING_TTL, async () => {
    const raw = await elfaGet<unknown>("/v2/aggregations/trending-tokens", {
      timeWindow,
      pageSize: String(50), // always fetch max so slice works for any limit
      page: "1",
    });
    return extractList(raw).map(normalizeTrending);
  }).then((list) => list.slice(0, limit));
}

/**
 * Recursively tries to find an array of token-like objects from
 * whatever shape the Elfa API returns.
 */
function extractList(raw: unknown): ElfaTrendingRaw[] {
  if (Array.isArray(raw)) return raw as ElfaTrendingRaw[];

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // { data: [...] }
    if (Array.isArray(obj.data)) return obj.data as ElfaTrendingRaw[];
    // { data: { tokens: [...] } }
    if (obj.data && typeof obj.data === "object") {
      const inner = obj.data as Record<string, unknown>;
      if (Array.isArray(inner.tokens)) return inner.tokens as ElfaTrendingRaw[];
      if (Array.isArray(inner.list))   return inner.list as ElfaTrendingRaw[];
      if (Array.isArray(inner.data))   return inner.data as ElfaTrendingRaw[];
    }
    // { tokens: [...] } at top level
    if (Array.isArray(obj.tokens)) return obj.tokens as ElfaTrendingRaw[];
    if (Array.isArray(obj.list))   return obj.list as ElfaTrendingRaw[];
  }

  console.warn("[Elfa] Unexpected response shape — could not find token list:", raw);
  return [];
}

/**
 * High-engagement mentions for a token keyword.
 * Elfa v2: GET /v2/data/top-mentions
 * Cached per keyword for 3 minutes.
 */
export async function getTopMentions(
  keyword: string,
  limit = 5
): Promise<ElfaMention[]> {
  return cachedGet(`mentions-${keyword}`, MENTIONS_TTL, async () => {
    const raw = await elfaGet<ElfaMentionsResponse>("/v2/data/top-mentions", {
      keywords: keyword,
      limit: String(10),
      minEngagement: "50",
    });
    const list: ElfaMentionRaw[] = Array.isArray(raw.data)
      ? raw.data
      : (raw.data as { list?: ElfaMentionRaw[] }).list ?? [];
    return list.map(normalizeMention);
  }).then((list) => list.slice(0, limit));
}
