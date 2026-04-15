// ─── API-level types (match Pacifica REST API exactly) ────────────────────────

/** Pacifica uses "bid" = Long, "ask" = Short */
export type PacificaSide = "bid" | "ask";

/** Human-readable direction for UI */
export type Direction = "LONG" | "SHORT";

export type TIF = "GTC" | "IOC" | "ALO" | "TOB";
export type OrderType =
  | "limit"
  | "market"
  | "stop_limit"
  | "stop_market"
  | "take_profit_limit"
  | "stop_loss_limit"
  | "take_profit_market"
  | "stop_loss_market";

export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled" | "rejected";
export type PositionStatus = "OPEN" | "CLOSED";

// ─── Market & Prices ──────────────────────────────────────────────────────────

/** From GET /api/v1/info */
export interface MarketInfo {
  symbol: string;
  tick_size: string;
  min_tick: string;
  max_tick: string;
  lot_size: string;
  max_leverage: number;
  isolated_only: boolean;
  min_order_size: string;      // USD
  max_order_size: string;      // USD
  funding_rate: string;        // previous epoch
  next_funding_rate: string;
  created_at: number;
}

/** From GET /api/v1/info/prices (also WS prices channel) */
export interface MarketPrice {
  symbol: string;
  funding: string;             // past epoch rate
  mark: string;
  mid: string;
  next_funding: string;
  open_interest: string;       // USD
  oracle: string;
  timestamp: number;
  volume_24h: string;
  yesterday_price: string;
}

/** Merged view for UI (info + prices combined) */
export interface Market {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;         // hourly, numeric (e.g. 0.0000125)
  nextFundingRate: number;
  openInterest: number;
  volume24h: number;
  priceChange24h: number;      // % vs yesterday
  maxLeverage: number;
  minOrderSize: number;        // USD
  lotSize: number;             // minimum tradeable increment in base units
}

/** GET /api/v1/kline */
export interface Kline {
  t: number;   // candle open time ms
  T: number;   // candle close time ms
  s: string;   // symbol
  i: string;   // interval
  o: string;   // open
  c: string;   // close
  h: string;   // high
  l: string;   // low
  v: string;   // volume
  n: number;   // number of trades
}

// ─── Account ──────────────────────────────────────────────────────────────────

/** From GET /api/v1/account?account= */
export interface PacificaAccount {
  balance: string;
  fee_level: number;
  maker_fee: string;
  taker_fee: string;
  account_equity: string;
  available_to_spend: string;
  available_to_withdraw: string;
  pending_balance: string;
  total_margin_used: string;
  cross_mmr: string;           // cross maintenance margin required
  positions_count: number;
  orders_count: number;
  stop_orders_count: number;
  updated_at: number;
}

/** Normalized account health for UI */
export interface AccountHealth {
  equity: number;
  availableMargin: number;
  usedMargin: number;
  marginRatio: number;         // usedMargin / equity, 0-1
  unrealizedPnl: number;
  walletBalance: number;
}

// ─── Positions ────────────────────────────────────────────────────────────────

/** From GET /api/v1/positions?account= */
export interface PacificaPosition {
  symbol: string;
  side: PacificaSide;          // "bid" = long, "ask" = short
  amount: string;
  entry_price: string;
  margin: string;              // isolated margin only
  funding: string;             // cumulative funding paid
  isolated: boolean;
  created_at: number;
  updated_at: number;
}

/** Normalized position for UI (with computed fields) */
export interface Position {
  id: string;                  // `${symbol}-${side}` synthetic key
  symbol: string;
  side: Direction;
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;    // computed client-side
  unrealizedPnl: number;       // computed: (markPrice - entryPrice) * size (adjusted for side)
  fundingPaid: number;
  margin: number;
  isolated: boolean;
  leverage: number;
  status: PositionStatus;
  openedAt: number;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/** POST body for /api/v1/orders/create_market */
export interface CreateMarketOrderPayload {
  account: string;
  agent_wallet: string;
  signature: string;
  timestamp: number;
  expiry_window?: number;
  symbol: string;
  amount: string;
  side: PacificaSide;
  slippage_percent: string;    // e.g. "0.5" = 0.5%
  reduce_only: boolean;
  client_order_id?: string;
  builder_code?: string;
}

/** POST body for /api/v1/orders/create (limit) */
export interface CreateLimitOrderPayload {
  account: string;
  agent_wallet: string;
  signature: string;
  timestamp: number;
  expiry_window?: number;
  symbol: string;
  price: string;
  amount: string;
  side: PacificaSide;
  tif: TIF;
  reduce_only: boolean;
  client_order_id?: string;
  builder_code?: string;
}

/** From GET /api/v1/orders?account= */
export interface PacificaOrder {
  order_id: number;
  client_order_id: string;
  symbol: string;
  side: PacificaSide;
  price: string;
  initial_amount: string;
  filled_amount: string;
  cancelled_amount: string;
  stop_price: string | null;
  order_type: OrderType;
  stop_parent_order_id: number | null;
  reduce_only: boolean;
  created_at: number;
  updated_at: number;
}

// ─── Sub-accounts ─────────────────────────────────────────────────────────────

export interface SubAccount {
  address: string;
  main_account: string;
  created_at: number;
}

// ─── Agent Keys ───────────────────────────────────────────────────────────────

export interface AgentKeyBinding {
  agentPublicKey: string;
  mainWalletAddress: string;
  boundAt: number;
}

// ─── Builder Program ──────────────────────────────────────────────────────────

export const BUILDER_CODE = "POINTPULSE";

// ─── Elfa AI / Social Data ────────────────────────────────────────────────────

export type WhaleSentiment = "BULLISH" | "BEARISH" | "NEUTRAL";

/** Trending token from Elfa v2 /aggregations/trending-tokens */
export interface TrendingToken {
  id: string;            // synthetic: symbol
  symbol: string;        // e.g. "SOL" ($ stripped)
  mentionCount: number;
  changePercent: number; // % change in mention volume
  sentiment: WhaleSentiment;
  timestamp: number;
}

/** Top mention from Elfa v2 /data/top-mentions */
export interface ElfaMention {
  id: string;
  author: string;
  text: string;
  likeCount: number;
  repostCount: number;
  viewCount: number;
  timestamp: number;
}

export interface SocialSignal {
  id: string;
  asset: string;
  sentiment: WhaleSentiment;
  score: number;
  mentionCount: number;
  influencerCount: number;
  source: "twitter" | "telegram" | "discord";
  timestamp: number;
}

// Legacy alias kept for ArbScanner type compat
export interface SmartMoneyFlow {
  asset: string;
  netFlow: number;
  whaleCount: number;
  topToken: TrendingToken;
  socialScore: number;
}

// ─── Arb Scanner ──────────────────────────────────────────────────────────────

export interface FundingSnapshot {
  market: string;
  perpSymbol: string;
  spotSymbol: string;
  fundingRate: number;
  annualizedRate: number;
  spotPrice: number;
  perpPrice: number;
  basis: number;
  basisPct: number;
  direction: "CONTANGO" | "BACKWARDATION";
  updatedAt: number;
}

export interface ArbOpportunity {
  market: string;
  annualizedYield: number;
  fundingRate: number;
  basis: number;
  riskScore: number;
  recommendation: "OPEN" | "MONITOR" | "AVOID";
}

// ─── Dual-Signal Discovery Engine ────────────────────────────────────────────

/** A large on-chain trade detected via Pacifica WebSocket ($10k+ notional) */
export interface WhaleEvent {
  id: string;
  symbol: string;           // e.g. "SOL"
  side: Direction;          // LONG = buy, SHORT = sell
  size: number;             // contract units
  price: number;            // fill price USD
  notional: number;         // size * price
  timestamp: number;
}

/** Normalized social signal from Elfa AI with derived scores */
export interface AlphaSocialSignal {
  symbol: string;
  mentionCount: number;
  changePercent: number;
  sentiment: WhaleSentiment;
  /** 0-100: mapped from changePercent, clamped */
  sentimentScore: number;
  /** 0-100: mention count normalised vs 1 000 mentions ceiling */
  volumeScore: number;
  fetchedAt: number;        // for TTL check
}

/** Both social + whale signals aligned for the same symbol */
export interface VerifiedAlpha {
  id: string;
  symbol: string;
  social: AlphaSocialSignal;
  whale: WhaleEvent;
  /** Direction agreed on by both signals */
  direction: Direction;
  /** Composite confidence 0-100 */
  confidence: number;
  verifiedAt: number;
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

export interface WsPricesPayload {
  channel: "prices";
  data: MarketPrice[];
}

export interface WsOrderUpdatePayload {
  channel: "account_order_updates";
  data: Array<{
    i: number;       // order ID
    s: string;       // symbol
    d: PacificaSide;
    p: string;       // avg fill price
    a: string;       // original amount
    f: string;       // filled amount
    os: OrderStatus;
    ot: string;      // order type
    ct: number;      // created_at
    ut: number;      // updated_at
  }>;
}
