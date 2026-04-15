/**
 * pacifica-client.ts
 *
 * Wraps the Pacifica REST API with correct signing.
 * Every order auto-includes builder_code: "POINTPULSE".
 *
 * GET  endpoints → no auth required.
 * POST endpoints → buildSignedBody() with agent keypair.
 *
 * Builder approval flow (one-time per user):
 *   1. Check if user has approved POINTPULSE → GET /account/builder_codes/approvals
 *   2. If not → POST /account/builder_codes/approve (signed by agent key)
 *   3. After approval, all orders include builder_code: "POINTPULSE"
 */

import { buildSignedBody, compact, type AgentKeypair } from "@/lib/signing";
import bs58 from "bs58";
import type {
  MarketInfo,
  MarketPrice,
  Market,
  Kline,
  PacificaAccount,
  AccountHealth,
  PacificaPosition,
  Position,
  PacificaOrder,
  PacificaSide,
  TIF,
} from "@/types";
import { BUILDER_CODE } from "@/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_PACIFICA_API_URL ?? "https://api.pacifica.fi/api/v1";

const DEFAULT_SLIPPAGE  = "0.5";   // 0.5% slippage on market orders
const BUILDER_MAX_FEE   = "0.001"; // user approves up to 0.1% builder fee

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    // Pacifica uses several error field names depending on the endpoint
    const rawMsg: unknown =
      json?.error ?? json?.message ?? json?.detail ?? json?.msg;
    const msg = rawMsg
      ? String(rawMsg)
      : res.status === 400
      ? "Bad request — check signature, builder code approval, and order size."
      : res.status === 401 || res.status === 403
      ? "Unauthorized — agent key may be unregistered or expired."
      : JSON.stringify(json);
    console.error(`[Pacifica ${res.status}] ${path}`, json);
    throw new Error(`[${res.status}] ${msg}`);
  }
  // Some endpoints return { success: false, error: "..." } with HTTP 200
  if (json && typeof json === "object" && json.success === false) {
    const msg = json.error ?? json.message ?? "Request failed";
    console.error(`[Pacifica] ${path} returned success:false`, json);
    throw new Error(`Pacifica error: ${msg}`);
  }
  return json as T;
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  params && Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`[Pacifica ${res.status}] ${JSON.stringify(err)}`);
  }
  const json = await res.json();
  // Some endpoints wrap in { success, data }, others return data directly
  return (json.success !== undefined ? json.data : json) as T;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Data normalizers ─────────────────────────────────────────────────────────

function mergeMarket(info: MarketInfo, price: MarketPrice): Market {
  const markPrice      = parseFloat(price.mark);
  const yesterdayPrice = parseFloat(price.yesterday_price);
  const priceChange24h =
    yesterdayPrice > 0 ? ((markPrice - yesterdayPrice) / yesterdayPrice) * 100 : 0;

  return {
    symbol:          info.symbol,
    markPrice,
    indexPrice:      parseFloat(price.oracle),
    fundingRate:     parseFloat(price.funding),
    nextFundingRate: parseFloat(price.next_funding),
    openInterest:    parseFloat(price.open_interest),
    volume24h:       parseFloat(price.volume_24h),
    priceChange24h,
    maxLeverage:     info.max_leverage,
    minOrderSize:    parseFloat(info.min_order_size),
    lotSize:         parseFloat(info.lot_size) || 0.01,
  };
}

/** Liquidation price — simplified cross-margin estimate. */
function computeLiqPrice(
  side: "LONG" | "SHORT",
  entryPrice: number,
  leverage: number,
  mmr = 0.005
): number {
  if (leverage <= 0) return 0;
  return side === "LONG"
    ? entryPrice * (1 - 1 / leverage + mmr)
    : entryPrice * (1 + 1 / leverage - mmr);
}

export function normalizePosition(
  raw: PacificaPosition,
  markPrices: Record<string, number>,
  leverage = 10
): Position {
  const side       = raw.side === "bid" ? "LONG" : "SHORT";
  const size       = parseFloat(raw.amount);
  const entryPrice = parseFloat(raw.entry_price);
  const markPrice  = markPrices[raw.symbol] ?? entryPrice;
  const pnlSign    = side === "LONG" ? 1 : -1;

  return {
    id:               `${raw.symbol}-${raw.side}`,
    symbol:           raw.symbol,
    side,
    size,
    entryPrice,
    markPrice,
    liquidationPrice: computeLiqPrice(side, entryPrice, leverage),
    unrealizedPnl:    (markPrice - entryPrice) * size * pnlSign,
    fundingPaid:      parseFloat(raw.funding),
    margin:           parseFloat(raw.margin),
    isolated:         raw.isolated,
    leverage,
    status:           "OPEN",
    openedAt:         raw.created_at,
  };
}

function normalizeHealth(raw: PacificaAccount): AccountHealth {
  const equity    = parseFloat(raw.account_equity);
  const usedMargin = parseFloat(raw.total_margin_used);
  const balance   = parseFloat(raw.balance);

  return {
    equity,
    availableMargin: parseFloat(raw.available_to_spend),
    usedMargin,
    marginRatio:     equity > 0 ? usedMargin / equity : 0,
    unrealizedPnl:   equity - balance,
    walletBalance:   balance,
  };
}

// ─── PacificaClient ───────────────────────────────────────────────────────────

export interface OrderParams {
  symbol:      string;
  side:        "LONG" | "SHORT";
  size:        number;
  price?:      number;
  tif?:        TIF;
  reduceOnly?: boolean;
  slippage?:   string;
  lotSize?:    number;   // snap size to this before sending
}

/**
 * Snap a size to the nearest lot-size multiple, formatted as a string.
 * Throws if the result is zero (input smaller than half a lot).
 */
function snapAmount(size: number, lotSize: number): string {
  const snapped = Math.round(size / lotSize) * lotSize;
  if (snapped <= 0) {
    throw new Error(`Size ${size} is below minimum lot size ${lotSize}. Enter at least ${lotSize} units.`);
  }
  const decimals = lotSize >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(lotSize)));
  return snapped.toFixed(Math.min(decimals, 8));
}

/**
 * Extract lot size from a Pacifica "not a multiple of lot size X" error message.
 * Returns null if the error isn't a lot-size rejection.
 */
function parseLotSizeError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/lot size (\d+\.?\d*)/i);
  return match ? parseFloat(match[1]) : null;
}

export class PacificaClient {
  private mainWallet:   string = "";
  private agentKeypair: AgentKeypair | null = null;

  setMainWallet(address: string)        { this.mainWallet   = address; }
  setAgentKeypair(kp: AgentKeypair)     { this.agentKeypair = kp; }
  clearAgentKeypair()                   { this.agentKeypair = null; }

  get hasAgent(): boolean {
    return !!this.agentKeypair && !!this.mainWallet;
  }

  private signed(
    type: string,
    operationData: Record<string, unknown>
  ) {
    if (!this.agentKeypair || !this.mainWallet) {
      throw new Error(
        "No agent key. Create one at app.pacifica.fi/apikey and paste it in the terminal."
      );
    }
    return buildSignedBody(
      type,
      operationData,
      this.mainWallet,
      this.agentKeypair.privateKey,
      this.agentKeypair.publicKey   // agent_wallet field
    );
  }

  // ── Public market data (no auth) ───────────────────────────────────────────

  async getMarketInfo(): Promise<MarketInfo[]> {
    return get<MarketInfo[]>("/info");
  }

  async getPrices(): Promise<MarketPrice[]> {
    return get<MarketPrice[]>("/info/prices");
  }

  async getMarkets(): Promise<Market[]> {
    const [infos, prices] = await Promise.all([
      this.getMarketInfo(),
      this.getPrices(),
    ]);
    const priceMap = Object.fromEntries(prices.map((p) => [p.symbol, p]));
    return infos
      .filter((i) => priceMap[i.symbol])
      .map((i) => mergeMarket(i, priceMap[i.symbol]));
  }

  async getKlines(
    symbol: string,
    interval: string,
    startTime: number,
    endTime?: number
  ): Promise<Kline[]> {
    const params: Record<string, string> = { symbol, interval, start_time: String(startTime) };
    if (endTime) params.end_time = String(endTime);
    return get<Kline[]>("/kline", params);
  }

  // ── Account (GET, no auth needed) ──────────────────────────────────────────

  async getAccount(address?: string): Promise<AccountHealth> {
    const addr = address ?? this.mainWallet;
    if (!addr) throw new Error("No wallet address");
    const raw = await get<PacificaAccount>("/account", { account: addr });
    return normalizeHealth(raw);
  }

  async getPositions(
    markPrices: Record<string, number>,
    leverage = 10,
    address?: string
  ): Promise<Position[]> {
    const addr = address ?? this.mainWallet;
    if (!addr) throw new Error("No wallet address");
    // /positions returns { data: [...], last_order_id } not wrapped in success
    const resp = await apiFetch<{ data: PacificaPosition[] }>(`/positions?account=${addr}`);
    const raw: PacificaPosition[] = resp.data ?? (resp as unknown as PacificaPosition[]);
    return Array.isArray(raw)
      ? raw.map((p) => normalizePosition(p, markPrices, leverage))
      : [];
  }

  async getOpenOrders(address?: string): Promise<PacificaOrder[]> {
    const addr = address ?? this.mainWallet;
    if (!addr) throw new Error("No wallet address");
    return get<PacificaOrder[]>("/orders", { account: addr });
  }

  // ── Agent key registration ─────────────────────────────────────────────────

  /**
   * Check if the current agent key is already bound to the main wallet.
   * No listing endpoint exists — we use sessionStorage to remember past binds.
   */
  isAgentKeyRegistered(): boolean {
    const addr        = this.mainWallet;
    const agentPubKey = this.agentKeypair?.publicKey;
    if (!addr || !agentPubKey || typeof window === "undefined") return false;
    return sessionStorage.getItem(`pacifica_bound_${addr}_${agentPubKey}`) === "1";
  }

  /** Mark agent key as bound in sessionStorage so banner doesn't re-appear. */
  markAgentKeyBound(): void {
    const addr        = this.mainWallet;
    const agentPubKey = this.agentKeypair?.publicKey;
    if (!addr || !agentPubKey || typeof window === "undefined") return;
    sessionStorage.setItem(`pacifica_bound_${addr}_${agentPubKey}`, "1");
  }

  /**
   * Bind the current agent key to the main wallet.
   * Main wallet signs the message. Endpoint: POST /agent/bind
   * Type: "bind_agent_wallet"
   * Docs: https://docs.pacifica.fi/api-documentation/api/signing/api-agent-keys
   */
  async registerAgentKey(
    signMessage: (msg: Uint8Array) => Promise<Uint8Array>
  ): Promise<{ success: boolean }> {
    if (!this.mainWallet) throw new Error("No wallet connected");
    if (!this.agentKeypair) throw new Error("No agent key loaded");

    const timestamp    = Date.now();
    const expiryWindow = 30_000;
    const agentPubKey  = this.agentKeypair.publicKey;

    // Signed by MAIN wallet (agent isn't trusted yet)
    const toSign = compact({
      type:          "bind_agent_wallet",
      timestamp,
      expiry_window: expiryWindow,
      data:          { agent_wallet: agentPubKey },
    });

    const sigBytes  = await signMessage(new TextEncoder().encode(toSign));
    const signature = bs58.encode(sigBytes);

    const body = {
      account:      this.mainWallet,
      agent_wallet: agentPubKey,
      signature,
      timestamp,
      expiry_window: expiryWindow,
    };

    const result = await post<{ success: boolean }>("/agent/bind", body);
    this.markAgentKeyBound();
    return result;
  }

  // ── Builder Code approval ──────────────────────────────────────────────────

  /**
   * Check if this wallet has already approved POINTPULSE.
   * GET /account/builder_codes/approvals — no signing needed.
   */
  async hasApprovedBuilderCode(address?: string): Promise<boolean> {
    const addr = address ?? this.mainWallet;
    if (!addr) return false;
    try {
      const approvals = await get<Array<{ builder_code: string }>>(
        "/account/builder_codes/approvals",
        { account: addr }
      );
      return Array.isArray(approvals) &&
        approvals.some((a) => a.builder_code === BUILDER_CODE);
    } catch {
      return false;
    }
  }

  /**
   * One-time: user approves POINTPULSE builder code.
   * Docs specify agent_wallet: null — the MAIN wallet must sign this, not the agent.
   * Accepts a signMessage callback from the Solana Wallet Adapter (triggers one wallet popup).
   * POST /account/builder_codes/approve
   */
  async approveBuilderCode(
    signMessage: (msg: Uint8Array) => Promise<Uint8Array>
  ): Promise<{ success: boolean }> {
    if (!this.mainWallet) throw new Error("No wallet connected");

    const timestamp    = Date.now();
    const expiryWindow = 30_000;

    // Build the message to sign (same format as all other requests)
    const toSign = compact({
      type:          "approve_builder_code",
      timestamp,
      expiry_window: expiryWindow,
      data: {
        builder_code: BUILDER_CODE,
        max_fee_rate: BUILDER_MAX_FEE,
      },
    });

    const sigBytes = await signMessage(new TextEncoder().encode(toSign));
    const signature = bs58.encode(sigBytes);

    const body = {
      account:        this.mainWallet,
      agent_wallet:   null,          // docs: null = main wallet signed
      signature,
      timestamp,
      expiry_window:  expiryWindow,
      builder_code:   BUILDER_CODE,
      max_fee_rate:   BUILDER_MAX_FEE,
    };

    return post<{ success: boolean }>("/account/builder_codes/approve", body);
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /** Market order — POST /orders/create_market */
  async createMarketOrder(params: OrderParams): Promise<{ order_id: number }> {
    const side: PacificaSide = params.side === "LONG" ? "bid" : "ask";

    const attempt = (lotSize: number) => {
      const amount = snapAmount(params.size, lotSize);
      // Only include reduce_only when true — including false causes signature mismatch.
      const data: Record<string, unknown> = {
        symbol:           params.symbol,
        amount,
        side,
        slippage_percent: params.slippage ?? DEFAULT_SLIPPAGE,
        builder_code:     BUILDER_CODE,
      };
      if (params.reduceOnly) data.reduce_only = true;
      console.debug("[Pacifica] createMarketOrder →", { symbol: params.symbol, side, amount, lotSize });
      return post<{ order_id: number }>("/orders/create_market", this.signed("create_market_order", data));
    };

    try {
      return await attempt(params.lotSize ?? 0.01);
    } catch (e) {
      // Auto-correct lot size from server error message and retry once
      const serverLotSize = parseLotSizeError(e);
      if (serverLotSize) {
        console.debug("[Pacifica] Retrying market order with server lot size:", serverLotSize);
        return attempt(serverLotSize);
      }
      throw e;
    }
  }

  /** Limit order — POST /orders/create */
  async createLimitOrder(params: OrderParams): Promise<{ order_id: number }> {
    if (!params.price) throw new Error("Price required for limit orders");
    const side: PacificaSide = params.side === "LONG" ? "bid" : "ask";

    const attempt = (lotSize: number) => {
      const amount = snapAmount(params.size, lotSize);
      const data: Record<string, unknown> = {
        symbol:       params.symbol,
        price:        String(parseFloat(params.price!.toFixed(2))),
        amount,
        side,
        tif:          params.tif ?? "GTC",
        builder_code: BUILDER_CODE,
      };
      if (params.reduceOnly) data.reduce_only = true;
      console.debug("[Pacifica] createLimitOrder →", { symbol: params.symbol, side, amount, price: params.price, lotSize });
      return post<{ order_id: number }>("/orders/create", this.signed("create_order", data));
    };

    try {
      return await attempt(params.lotSize ?? 0.01);
    } catch (e) {
      const serverLotSize = parseLotSizeError(e);
      if (serverLotSize) {
        console.debug("[Pacifica] Retrying limit order with server lot size:", serverLotSize);
        return attempt(serverLotSize);
      }
      throw e;
    }
  }

  /** Close position = reduce-only order on the opposite side */
  async closePosition(
    symbol: string,
    side: "LONG" | "SHORT",
    size: number
  ): Promise<{ order_id: number }> {
    return this.createMarketOrder({
      symbol,
      side:       side === "LONG" ? "SHORT" : "LONG",
      size,
      reduceOnly: true,
    });
  }

  /** Cancel a single order — POST /orders/cancel */
  async cancelOrder(symbol: string, orderId: number): Promise<{ success: boolean }> {
    const body = this.signed("cancel_order", { symbol, order_id: orderId });
    return post<{ success: boolean }>("/orders/cancel", body);
  }

  /** Cancel all orders — POST /orders/cancel_all */
  async cancelAllOrders(symbol?: string): Promise<{ cancelled_count: number }> {
    const payload = symbol
      ? { all_symbols: false, symbol, exclude_reduce_only: false }
      : { all_symbols: true,  exclude_reduce_only: false };
    const body = this.signed("cancel_all_orders", payload);
    return post<{ cancelled_count: number }>("/orders/cancel_all", body);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: PacificaClient | null = null;

export function getPacificaClient(): PacificaClient {
  if (!_client) _client = new PacificaClient();
  return _client;
}
