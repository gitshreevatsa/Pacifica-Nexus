# Pacifica Nexus — Alpha Terminal

![Pacifica Nexus Terminal](public/image.png)

## What Is This?

Pacifica Nexus is a **professional trading terminal** built on top of the Pacifica Perpetual DEX on Solana. It is designed for traders who want more signal and less noise — combining real-time perpetual market data, large-trade whale detection, social trend analysis, automated funding-rate arbitrage discovery, and intelligent risk management into a single glassmorphic interface.

---

## Features

### Verified Alpha Feed (Left Panel)

- **Dual-Signal Engine**: Matches Elfa AI trending tokens (social layer) against Pacifica WebSocket whale trades (≥ $10,000 notional) in real time.
- A signal is marked **VERIFIED** only when both the social sentiment (BULLISH/BEARISH) and the whale trade direction (LONG/SHORT) agree on the same asset.
- Unverified social signals are shown below as pending — useful context even without whale confirmation.
- **Mirror Trade CTA**: One-click to open the same position as the whale, with a pre-filled confirmation modal.
- Confidence score (0–100) based on mention volume, sentiment strength, and whale size.

### Price Chart (Center — Top)

- Real-time candlestick chart powered by [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) with Pacifica kline data.
- Supports 1m, 5m, 15m, 1h, 4h, 1d intervals with automatic lookback windows.
- Searchable market tabs — all Pacifica perp markets, scrollable with live mark price and 24h change.
- Stats row: mark price, oracle price, funding rate, open interest, 24h volume.
- Mouse drag to pan, scroll to zoom, touch pinch supported.
- **Orderbook Imbalance Bar**: Live bid/ask pressure overlay at the bottom of the chart. Powered by the Pacifica WebSocket orderbook channel (top-20 levels, updates every ~250 ms). The red segment = ask volume share; green segment = bid volume share. A wide red bar means more sell-side liquidity; a wide green bar means more buy-side pressure.

### Arbitrage Scanner (Center — Bottom, "Arbitrage Scanner" Tab)

- **Cash & Carry Strategy**: Identifies funding rate arbitrage opportunities across all Pacifica markets.
- Compares Pacifica perpetual funding rates against Jupiter spot prices.
- Annualizes funding rates (`hourly rate × 24 × 365`) and scores each opportunity by yield and risk.
- Recommendations: **OPEN** (≥15% APY, low risk), **MONITOR** (≥8% APY), or **AVOID**.
- APY > 15% shown with neon green glow for instant visibility.
- One-click hedge: shorts the perp on Pacifica + opens Jupiter in a new tab for the spot leg.

### Market Scanner (Center — Bottom, "Market Scanner" Tab)

- Sortable table of all Pacifica markets with mark price, 24h change, funding rate, open interest, volume.
- Color-coded funding: green = positive (longs pay), red = negative (shorts pay).

### Trade Log (Center — Bottom, "Trade Log" Tab)

- Real-time feed of your filled orders and position changes.
- Timestamp, symbol, direction, size, and fill price for each event.

### Smart TP/SL Manager (Center — Bottom, "TP / SL" Tab)

- Per-position bracket order management: view and manage take-profit and stop-loss orders.
- **Trailing Stop**: Set a trail percentage — the SL automatically ratchets up (for longs) or down (for shorts) as the market moves in your favour. The trail fires a cancel + replace reduce-only limit order when the price moves beyond the watermark.
- **Breakeven Button**: Instantly moves your SL to your entry price, locking in a scratch trade.

### Risk Guard (Right Panel)

- Real-time account health with a 10-segment color-coded margin bar (green → amber → red).
- Per-position breakdown: entry price, mark price, liquidation price, unrealized P&L.
- Distance-to-liquidation progress bar with red glow when < 10% away.
- **Auto De-Risk**: Set a liquidation-distance threshold (e.g., 15%). When any position's distance to liq drops below it, a 25% reduce-only market order fires automatically. A "Set" button prevents accidental threshold changes — the rule only activates when you click Set or press Enter. Cooldown: 10 s per position to prevent runaway orders. Lot-size-aware: only fires if the calculated trim is ≥ 1 lot.
- **Margin Efficiency tab**: Per-position margin share bar (green < 40%, amber 40–60%, red > 60%), efficiency score (`|PnL| / margin × 100`), and plain-English recommendations for overconcentration.

### Quick Order Bar (Bottom)

- Always-visible fast-entry bar for any market.
- **Market / Limit toggle**: Switch between market orders and limit orders with a price input.
- **Size mode**: Enter size in USD (e.g., $100) or as a percentage of your available equity — automatically converted to the correct token quantity and snapped to lot size.
- **TP / SL inputs**: Collapsible row to attach take-profit and stop-loss to the order at creation time (bracket orders placed as reduce-only limits).
- **Keyboard shortcuts**: Press `B` to pre-fill Long, `S` to pre-fill Short, `Esc` to dismiss the confirmation modal.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js App Router                      │
│  app/layout.tsx → env.ts (Zod validation at boot)           │
│               → PrivyProvider → SolanaWalletProvider        │
│               → QueryProvider → NexusDashboard              │
└──────────┬──────────────────────────────────────────────────┘
           │
           ├── SessionBar (wallet + agent key management)
           │
           ├── AlphaFeed ← useWhaleStream
           │                  ├── Elfa AI REST (60s poll, 10min TTL)
           │                  └── Pacifica WS singleton (live, $10k+ filter)
           │
           ├── PriceChart ← usePacifica (markets)
           │              ← useOrderbookStream (WS singleton, 250ms)
           │                  └── Pacifica REST /kline (10–30s poll)
           │
           ├── ArbScanner ← useArbScanner
           │                  ├── Pacifica REST /info/prices (3s poll)
           │                  └── Jupiter Price API (3s poll)
           │
           ├── TpSlManager ← usePacifica + useTrailingStopStore
           │                  └── Trailing stop: cancel+replace SL on watermark
           │
           └── RiskGuard ← usePacifica
                              ├── /positions (3s poll)
                              ├── /account (5s poll)
                              ├── POST /orders/create_market (Auto De-Risk)
                              └── MarginEfficiency (per-pos margin share)
```

### Shared WebSocket Singleton

All real-time hooks (`useWhaleStream`, `useOrderbookStream`) share **one** WebSocket connection to `wss://ws.pacifica.fi/ws` via `src/lib/pacifica-ws.ts`. This prevents duplicate connections and handles reconnect with exponential backoff (2 s → 30 s max) and a 30 s ping heartbeat.

### Data Flow

**Authentication:**

```
User connects wallet → imports agent key (base58) + sets passphrase
  → keyVault.encryptKey() → AES-GCM encrypted blob saved to localStorage
  → decrypted private key held in memory (Zustand agentKeyStore.privateKey)
  → On page refresh: UnlockKeyModal prompts passphrase → decrypts into memory
  → registerAgentKey() signs once with main wallet → agent key authorized
  → approveBuilderCode() signs once → Pacifica-Nexus builder fee enabled
  → All future orders signed automatically by agent key (no popups)
```

**Trading:**

```
User clicks Confirm
  → buildSignedBody("create_market_order" | "create_order", payload, agentKeypair)
  → POST /orders/create_market or /orders/create
  → Response: { order_id }
  → React Query invalidates positions + orders + health → UI updates
```

**Bracket Orders (TP/SL):**

```
Main order confirmed → order_id returned
  → place TP: reduce-only limit at tpPrice (opposite side)
  → place SL: reduce-only limit at slPrice (opposite side)
```

**Whale Matching:**

```
Elfa API trending token → AlphaSocialSignal (sentimentScore, volumeScore)
Pacifica WS trade event → WhaleEvent if notional ≥ $10,000
tryMatch(): signal.direction === whale.side? → VerifiedAlpha (confidence score)
```

**Orderbook Imbalance:**

```
WS subscribe { source: "book", symbol, agg_level: 100 }
  → data.l = [[bids], [asks]] each level { a: amount, p: price, n: count }
  → bidVolume = sum top-20 bid amounts
  → askVolume = sum top-20 ask amounts
  → imbalance = (bidVolume - askVolume) / (bidVolume + askVolume)   [-1, +1]
  → bar width: ask = (1 - imbalance)/2 × 100%, bid = (1 + imbalance)/2 × 100%
```

---

## Tech Stack

| Layer            | Technology                                          |
| ---------------- | --------------------------------------------------- |
| Framework        | Next.js 16 (App Router, `force-dynamic`)            |
| UI               | React 18, Tailwind CSS 3, Lucide Icons              |
| Charts           | Lightweight Charts 4 (TradingView)                  |
| State / Fetching | TanStack React Query 5, Zustand                     |
| Wallet           | Solana Wallet Adapter (Phantom, MetaMask, Solflare) |
| Signing          | TweetNaCl + bs58 (agent keypair signing)            |
| Key Security     | Web Crypto API — AES-256-GCM + PBKDF2               |
| Env Validation   | Zod                                                 |
| Social Data      | Elfa AI v2 API                                      |
| Spot Prices      | Jupiter Price API v6 (key optional)                 |
| Perp Data        | Pacifica REST + WebSocket                           |

---

## Project Structure

```
├── app/
│   ├── layout.tsx          # Provider stack: Privy → Solana → Query
│   ├── page.tsx            # Entry: renders NexusDashboard
│   └── globals.css         # Glass panel, button, animation utilities
│
├── src/
│   ├── components/
│   │   ├── providers/
│   │   │   ├── PrivyProvider.tsx
│   │   │   ├── QueryProvider.tsx
│   │   │   └── SolanaWalletProvider.tsx
│   │   └── terminal/
│   │       ├── NexusDashboard.tsx    # Three-column grid layout, resizable divider
│   │       ├── SessionBar.tsx        # Header: wallet + agent key
│   │       ├── AlphaFeed.tsx         # Left: dual-signal alpha cards
│   │       ├── PriceChart.tsx        # Center top: candlestick + OB imbalance bar
│   │       ├── ArbScanner.tsx        # Center bottom tab: funding arb scanner
│   │       ├── MarketScanner.tsx     # Center bottom tab: market overview table
│   │       ├── TradeLog.tsx          # Center bottom tab: filled orders feed
│   │       ├── TpSlManager.tsx       # Center bottom tab: bracket + trailing stops
│   │       ├── RiskGuard.tsx         # Right: positions, auto de-risk, margin tab
│   │       ├── MarginEfficiency.tsx  # Per-position margin share + efficiency score
│   │       ├── QuickOrderBar.tsx     # Bottom: fast order entry with TP/SL + hotkeys
│   │       ├── TradeConfirmModal.tsx # Trade confirmation dialog (lot-size presets)
│   │       ├── UnlockKeyModal.tsx    # Session unlock: passphrase → decrypt vault
│   │       └── PortfolioSummaryBar.tsx
│   │
│   ├── hooks/
│   │   ├── usePacifica.ts        # Core: markets, positions, trading, auto de-risk
│   │   ├── useArbScanner.ts      # Funding rate vs spot arb engine
│   │   ├── useWhaleStream.ts     # Dual-signal: Elfa + WS whales (shared WS)
│   │   └── useOrderbookStream.ts # Live OB imbalance via shared WS singleton
│   │
│   ├── lib/
│   │   ├── pacifica-client.ts  # Pacifica REST API client (lot-size snapping, retry)
│   │   ├── pacifica-ws.ts      # Shared singleton WebSocket (reconnect + ping)
│   │   ├── elfa-client.ts      # Elfa AI API client
│   │   ├── signing.ts          # Agent key import, keypair signing (no storage)
│   │   ├── keyVault.ts         # Web Crypto AES-GCM encrypt/decrypt + PBKDF2
│   │   ├── env.ts              # Zod env schema — validates vars at server startup
│   │   ├── privy.ts            # Privy config
│   │   └── utils.ts            # formatUSD, formatPct, cn, truncateAddress
│   │
│   ├── stores/
│   │   ├── agentKeyStore.ts      # Zustand: in-memory keypair (no localStorage)
│   │   ├── toastStore.ts         # Zustand: global error/success toasts
│   │   └── trailingStopStore.ts  # Zustand: per-position trailing stop state
│   │
│   └── types/
│       └── index.ts            # All TypeScript types (Market includes lotSize)
│
├── public/
│   └── image.png              # Terminal screenshot
│
├── .env.local                 # Environment variables (see below)
├── tailwind.config.ts         # Custom colors, fonts, animations
└── next.config.ts             # Next.js config
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Solana wallet (Phantom recommended)
- A Pacifica account with an agent key (create at [app.pacifica.fi/apikey](https://app.pacifica.fi/apikey))
- Elfa AI API key (apply at [elfa.ai](https://elfa.ai))

### 1. Clone and Install

```bash
git clone https://github.com/gitshreevatsa/Pacifica-Nexus.git
cd Pacifica-Nexus
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root:

```env
# ─── Privy (Wallet Auth) ──────────────────────────────────────────────────────
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret          # server-only

# ─── Elfa AI (Social Signals) ────────────────────────────────────────────────
ELFA_AI_API_KEY=your_elfa_api_key               # server-only
NEXT_PUBLIC_ELFA_AI_BASE_URL=https://api.elfa.ai/v1

# ─── Pacifica DEX ────────────────────────────────────────────────────────────
NEXT_PUBLIC_PACIFICA_WS_URL=wss://ws.pacifica.fi/ws
NEXT_PUBLIC_PACIFICA_API_URL=https://api.pacifica.fi/api/v1

# ─── Jupiter (Spot Prices — API key optional) ────────────────────────────────
JUPITER_API_KEY=                                # optional, server-only
NEXT_PUBLIC_JUPITER_PRICE_API=https://price.jup.ag/v6/price

# ─── Builder Code (do not change) ────────────────────────────────────────────
NEXT_PUBLIC_BUILDER_CODE=POINTPULSE
```

| Variable                   | Required | Where to get it                                           |
| -------------------------- | -------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes      | [console.privy.io](https://console.privy.io) → Create App |
| `PRIVY_APP_SECRET`         | Yes      | Privy dashboard → API Keys (server-only)                  |
| `ELFA_AI_API_KEY`          | Yes      | [elfa.ai](https://elfa.ai) → API Access (server-only)     |
| `NEXT_PUBLIC_PACIFICA_*`   | Yes      | Fixed values — do not change                              |
| `JUPITER_API_KEY`          | No       | [jup.ag](https://jup.ag) — higher rate limits if set      |

> **Note:** `server-only` vars are used exclusively in Next.js API routes and never bundled into the client. The app validates all required vars at startup via Zod — it will refuse to start with a clear error message if any are missing

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Build for Production

```bash
npm run build
npm run start
```

---

## First-Time Setup (In-App)

When you first load the terminal:

1. **Connect Wallet** — Click "Connect Wallet" in the top bar. Select Phantom or your preferred wallet.

2. **Import Agent Key** — Click "Agent Key" in the top bar.
   - Go to [app.pacifica.fi/apikey](https://app.pacifica.fi/apikey)
   - Create a new agent key
   - Copy the **private key** (base58 format)
   - Paste it into the terminal modal and choose a **passphrase**
   - The key is encrypted (AES-GCM) before being stored — the raw private key never touches `localStorage`
   - On each new session (page refresh) you will be prompted for your passphrase to unlock the key into memory

3. **Authorize Agent Key** — A yellow banner will appear asking you to sign once with your main wallet. This registers your agent key with Pacifica (one-time).

4. **Approve Builder Code** — A blue banner will appear asking you to approve Pacifica-Nexus. Sign once. This enables trading rewards (one-time).

5. **You're live.** The terminal will begin loading your positions, account health, and market data.

---

## How to Use Each Panel

### Alpha Feed (Left)

- **Verified Alpha cards** at the top are the highest-confidence signals — both social + whale agree.
- **Social Signals** below show Elfa AI trending tokens. Green = bullish mentions growing, red = bearish.
- Click **Mirror Trade** on a Verified Alpha to open a pre-filled trade modal.
- Click **Long** or **Short** on any social card to open a position in that direction.

### Price Chart (Center Top)

- **Search** tokens in the search bar above the tabs.
- Click any **token tab** to switch markets.
- Use **interval buttons** (1m, 5m, 15m, 1h, 4h, 1d) on the right.
- **Drag** the chart to pan history. **Scroll** to zoom in/out.
- **Orderbook Imbalance Bar** at the bottom: red = ask pressure, green = bid pressure. Percentages show each side's share of the top-20 level volume. A 70% green / 30% red bar means bids are dominating — potential upward pressure.

### Arbitrage Scanner (Center Bottom — Arb tab)

- Markets are sorted by annualized yield.
- **APY > 15%** glows neon green — these are the best cash-and-carry opportunities.
- Click **Open Hedge** on any OPEN or MONITOR row.
- The confirmation modal shows the perp trade details. On confirm:
  - The short perp order is placed on Pacifica automatically.
  - Jupiter opens in a new tab so you can buy the spot leg manually.

### Smart TP/SL Manager (Center Bottom — TP / SL tab)

- Lists all open positions with their current bracket orders.
- **Trailing Stop**: Enable the toggle, enter a trail % (e.g., 2%), click Set. The system tracks the price watermark and automatically re-places the SL as the market moves in your favour.
- **Breakeven**: Moves the SL to your entry price with one click — zero risk from that point.

### Risk Guard (Right)

- The **margin bar** at the top shows your overall account health (green = safe, red = critical).
- Each open position shows entry, mark, and liquidation prices.
- The **Dist. to Liq.** bar shows how close you are to liquidation.
- Click **De-Risk 25%** on any position to automatically reduce it by 25% (reduce-only market order).
- **Auto De-Risk**: Enter a threshold distance (e.g., 15%), click **Set**. When any position's liq distance drops below the threshold, the terminal automatically trims 25% of that position. 10 s cooldown per position prevents repeated triggers.
- Switch to the **Margin** tab to see per-position margin share and efficiency scores.

### Quick Order Bar (Bottom)

- Select a symbol, choose Long or Short, set size, click Submit.
- **Market / Limit**: Toggle to limit mode and enter your target price.
- **% of Equity**: Toggle size mode to enter size as a percentage of your available equity.
- **TP / SL**: Expand the bracket row to attach take-profit and stop-loss prices.
- **Keyboard Shortcuts**: Press `B` anywhere to jump to Long, `S` to jump to Short, `Esc` to close the confirmation modal.

---

## API Reference

All Pacifica API calls go through `src/lib/pacifica-client.ts`.

### Public Endpoints (No Auth)

| Endpoint                  | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `GET /info`               | Market metadata (tick size, leverage, lot size)       |
| `GET /info/prices`        | Live mark prices, funding rates, open interest        |
| `GET /kline`              | Historical candle data                                |
| `GET /account?account=`   | Account equity and margin                             |
| `GET /positions?account=` | Open positions                                        |
| `GET /orders?account=`    | Open orders                                           |

### Authenticated Endpoints (Signed Requests)

| Endpoint                              | Signer      | Purpose                     |
| ------------------------------------- | ----------- | --------------------------- |
| `POST /agent/bind`                    | Main wallet | Register agent key (once)   |
| `POST /account/builder_codes/approve` | Main wallet | Approve builder code (once) |
| `POST /orders/create_market`          | Agent key   | Place market order          |
| `POST /orders/create`                 | Agent key   | Place limit or bracket order|
| `POST /orders/cancel`                 | Agent key   | Cancel order                |

Signed requests include: `type`, `main_wallet`, `agent_wallet`, `timestamp`, `expiry`, `signature` (Ed25519 over sorted JSON). The `reduce_only` field is always present in the signed body (as `true` or `false`) — the Pacifica API requires it in the payload for signature verification to pass.

### WebSocket (Shared Singleton — `pacifica-ws.ts`)

| Channel          | Subscribe payload                                                  | Purpose                         |
| ---------------- | ------------------------------------------------------------------ | ------------------------------- |
| `book`           | `{ method: "subscribe", source: "book", symbol, agg_level: 100 }` | Top-of-book levels every ~250ms |
| `trades`/`fills` | `{ method: "subscribe", params: { channel: "trades" } }`          | Public trade feed for whale detection |

---

## Key Design Decisions

**Encrypted Agent Key Vault**
Every order goes through the agent keypair. Users sign once to authorize the key, then trade without any wallet popups. The key is never stored in plaintext — it is encrypted with AES-256-GCM using a key derived from the user's passphrase (PBKDF2, 200k iterations). Only `{ciphertext, salt, iv}` are persisted to `localStorage`. The raw private key is held only in memory for the duration of the session and cleared on page refresh. On returning sessions, users unlock with their passphrase. The agent key can only trade — it cannot withdraw funds.

**Builder Code (POINTPULSE)**
Every market order includes `builder_code: "POINTPULSE"`. This enrolls users in Pacifica's builder rewards program. Approval is a one-time wallet signature.

**Dual-Signal Filter**
Social signals without whale confirmation are displayed but clearly marked as unverified. This prevents acting on pure social noise. A trade is only surfaced as "Verified Alpha" when at least one $10k+ on-chain trade confirms the social direction.

**Cash & Carry Neutrality**
The arb scanner only suggests market-neutral positions — short the perp (collect funding), long the spot (delta hedge). There is no directional exposure. Risk scores account for basis spread volatility.

**Shared WebSocket**
A single WS connection is created at module load and shared by all hooks. This ensures the orderbook subscription and the whale feed use the same socket, preventing browser connection limits from being hit and making reconnect logic centralized.

**Lot-Size Safety**
All order amounts are snapped to the market's `lot_size` before signing. If the API rejects an order with a lot-size error, the client parses the correct lot size from the error message and retries once automatically.

---

## Development Scripts

```bash
npm run dev          # Start local dev server (localhost:3000)
npm run build        # Production build
npm run start        # Run production build locally
npm run lint         # ESLint check
npm run type-check   # TypeScript check (no emit)
```

---

## Security

| Feature | Implementation |
| ------- | -------------- |
| Agent key at rest | AES-256-GCM encrypted, PBKDF2-derived key (200k iterations). Only `{ciphertext, salt, iv}` in `localStorage`. |
| Agent key in memory | Raw private key held only in Zustand state — cleared on page refresh or "Forget device". |
| HTTP security headers | `Content-Security-Policy-Report-Only`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` applied to all routes via `next.config.ts`. |
| Server secret protection | Elfa AI and Jupiter API keys only used in server-side API routes (`/api/elfa`, `/api/jupiter`) — never exposed to the client bundle. |
| Env validation | All required environment variables are validated at server startup with Zod. The app fails closed (clear error message) rather than silently misbehaving on bad config. |
| Jupiter API key | Optional — the Jupiter Price API works without a key (rate-limited). Only included in requests when `JUPITER_API_KEY` is set. |

---

## Environment Notes

- The app uses `export const dynamic = "force-dynamic"` on the page — this prevents static pre-rendering which would break Privy initialization.
- Agent keys are encrypted with AES-GCM before storage. On each new session, the unlock modal prompts for the passphrase — no need to re-paste the raw key.
- WebSocket reconnects with exponential backoff (2s → 30s max). Social signals and orderbook data continue working independently — if one subscription drops, it is re-sent on reconnect.
- All monetary values are in USD. Pacifica uses USDC as collateral.
- The `reduce_only` field is always included in signed payloads (as `true` or `false`) — the Pacifica API requires this field to be present for signature verification.

---

## License

Copyright (c) 2025 Pacifica-Nexus. All rights reserved.

This software and its source code are proprietary and confidential. No part of this codebase — including but not limited to the source code, architecture, algorithms, UI design, and data flows — may be copied, reproduced, distributed, modified, reverse-engineered, or used to create derivative works, in whole or in part, without the express prior written permission of the owner.

Unauthorized use, duplication, or distribution of this software is strictly prohibited and may result in severe civil and criminal penalties.
