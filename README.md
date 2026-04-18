# Pacifica Nexus

![Pacifica Nexus Terminal](public/image.png)

A trading terminal for the [Pacifica](https://pacifica.fi) perpetual DEX on Solana. Built for the Pacifica hackathon.

Combines real-time perp market data, on-chain whale trade detection, Elfa AI social signals, funding rate arbitrage, and risk management in one interface.

---

## What it does

- **Alpha Feed** — matches Elfa AI trending tokens against Pacifica whale trades (≥$10k notional). A signal is only shown as "Verified" when the social direction and on-chain trade direction agree on the same asset.
- **Price Chart** — candlestick chart with live orderbook imbalance bar (top-20 bid/ask levels, ~250ms updates). Supports 1m/5m/15m/1h/4h/1d intervals.
- **Arb Scanner** — cash-and-carry funding rate arbitrage across all Pacifica markets. Annualizes funding rates and scores each opportunity. One-click to short the perp; opens Jupiter in a new tab for the spot leg.
- **Risk Guard** — per-position liquidation distance, auto de-risk (fires a 25% reduce-only order when liq distance drops below a configurable threshold), margin efficiency breakdown.
- **TP/SL Manager** — bracket order management with trailing stops (cancel+replace on watermark) and breakeven button.
- **Quick Order Bar** — market/limit orders with optional TP/SL, size in USD or % of equity, keyboard shortcuts (B/S/Esc).

---

## Tech stack

| Layer | |
|---|---|
| Framework | Next.js 16, App Router |
| UI | React 18, Tailwind CSS 3, Lucide |
| Charts | Lightweight Charts 4 (TradingView) |
| State / Data | TanStack Query 5, Zustand |
| Wallet | Privy + Solana Wallet Adapter |
| Signing | TweetNaCl + bs58 (Ed25519 agent key) |
| Key security | Web Crypto API — AES-256-GCM + PBKDF2 |
| Env validation | Zod |
| Social data | Elfa AI v2 |
| Spot prices | Jupiter Price API v6 |
| Error tracking | Sentry (`@sentry/nextjs`) |
| Tests | Vitest (unit), Playwright (E2E) |
| CI | GitHub Actions |

---

## Getting started

### Prerequisites

- Node.js 18+
- A Solana wallet (Phantom, Backpack, etc.)
- A Pacifica account with an agent key — create one at [app.pacifica.fi/apikey](https://app.pacifica.fi/apikey)
- Elfa AI API key — [elfa.ai](https://elfa.ai)
- A Privy app — [console.privy.io](https://console.privy.io)

### Install

```bash
git clone https://github.com/gitshreevatsa/Pacifica-Nexus.git
cd Pacifica-Nexus
npm install
```

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```env
# Privy
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_SECRET=

# Elfa AI (server-only)
ELFA_AI_API_KEY=
NEXT_PUBLIC_ELFA_AI_BASE_URL=https://api.elfa.ai/v1

# Pacifica
NEXT_PUBLIC_PACIFICA_WS_URL=wss://ws.pacifica.fi/ws
NEXT_PUBLIC_PACIFICA_API_URL=https://api.pacifica.fi/api/v1

# Jupiter (API key optional — works without it at lower rate limits)
NEXT_PUBLIC_JUPITER_PRICE_API=https://price.jup.ag/v6/price
JUPITER_API_KEY=

# Builder code — do not change
NEXT_PUBLIC_BUILDER_CODE=POINTPULSE

# Sentry (optional — errors are silently dropped if not set)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# Kill switch (see Ops section below)
NEXT_PUBLIC_KILL_SWITCH=
NEXT_PUBLIC_KILL_SWITCH_REASON=
KILL_SWITCH=
KILL_SWITCH_REASON=
```

All required vars are validated at boot via Zod — the app will fail with a clear error rather than starting with broken config.

### Run

```bash
npm run dev       # http://localhost:3000
npm run build     # production build
npm run start     # serve production build
```

---

## First-time setup (in-app)

1. **Connect wallet** — Phantom or any supported Solana wallet via Privy.
2. **Import agent key** — go to [app.pacifica.fi/apikey](https://app.pacifica.fi/apikey), create an agent key, paste the base58 private key into the modal, set a passphrase. The key is encrypted (AES-256-GCM) before storage — the raw private key never touches localStorage. On each new session you'll be prompted for the passphrase.
3. **Authorize agent key** — sign once with your main wallet to register the agent key with Pacifica.
4. **Approve builder code** — sign once to enable trading rewards (POINTPULSE).

After that, all orders are signed by the agent key automatically — no wallet popups per trade.

---

## Architecture

```
app/layout.tsx → PrivyProvider → SolanaWalletProvider → QueryProvider → NexusDashboard
                                                                              │
                    ┌─────────────────────────────────────────────────────────┤
                    │                                                         │
              SessionBar                                               Three-column layout
              (wallet, agent key,                                      │
               remote kill switch poll,                          AlphaFeed │ PriceChart │ RiskGuard
               WS lifecycle sync)                                     │         │              │
                                                               useWhaleStream  usePacifica  usePacifica
                                                               (Elfa + WS)     useOrderbook  (positions)
```

### WebSocket

All real-time hooks share one WebSocket connection (`src/lib/pacifica-ws.ts`). Reconnects with exponential backoff (2s → 30s) and a 30s ping heartbeat. Stale feed detection triggers a UI banner if no message arrives in 60s.

### Order lifecycle

Orders go through a client-side state machine: `submitting → accepted → partially_filled / filled / cancelled / rejected / expired / cancel_pending / failed_reconcile`. The lifecycle store fills the gap between submission and the first REST poll, so the UI shows immediate status without waiting for polling.

### Kill switch

Two layers:

1. **Client boot** (`NEXT_PUBLIC_KILL_SWITCH=true`) — halts trading at page load. Requires a redeploy.
2. **Remote server-side** (`KILL_SWITCH=true`) — the app polls `GET /api/kill-switch` every 30 seconds. Change the env var in your deployment dashboard; takes effect within 30 seconds, no redeploy needed.

---

## Security

| | |
|---|---|
| Agent key at rest | AES-256-GCM, PBKDF2-derived key (200k iterations). Only `{ciphertext, salt, iv}` in localStorage. |
| Agent key in memory | Raw private key held only in Zustand — cleared on refresh or "Forget device". |
| CSP | `Content-Security-Policy` header enforced on all routes. `unsafe-eval` excluded from production builds. |
| Security headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` on all routes. |
| Server secrets | Elfa AI and Privy server keys only used in `/api/*` routes — never in the client bundle. |
| Signed payloads | All trading requests are Ed25519-signed by the agent key with a timestamp and expiry window. `reduce_only` is always present in the signed body — Pacifica requires it for signature verification. |

---

## Testing

```bash
npm test              # Vitest unit tests (171 tests)
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E (requires dev/prod server)
npm run type-check    # tsc --noEmit
npm run lint          # ESLint
```

Unit tests cover: `trading-math`, `keyVault`, `featureFlags`, `orderLifecycleStore`, `killSwitchStore`, `tradeLogStore`.

E2E tests cover (without a real wallet): market data loading, key vault unlock/wipe flow, kill switch API endpoint, API error resilience (500s don't crash the page, fail-open on kill switch errors).

Order placement, cancel, and close E2E tests require a funded staging wallet and are documented in `e2e/orders.spec.ts` as `test.skip`.

---

## CI

GitHub Actions runs on every push to main and on PRs:

1. **Lint & type-check** — ESLint + `tsc --noEmit`
2. **Unit tests** — Vitest, uploads coverage artifact
3. **Build** — `next build` (needs lint + unit tests to pass first)
4. **E2E smoke tests** — Playwright against the production build

Set these four as required status checks in GitHub → Settings → Branches → branch protection for `main`.

---

## Ops

### Halting trading in production (no deploy needed)

In your deployment dashboard (Vercel / Railway), set:
```
KILL_SWITCH=true
KILL_SWITCH_REASON=Exchange maintenance until 15:00 UTC
```

All connected clients will halt trading within 30 seconds. To re-enable, remove or set `KILL_SWITCH=false`.

### Monitoring (Sentry)

Set `NEXT_PUBLIC_SENTRY_DSN` to your Sentry project DSN. Errors are captured automatically. Custom events:
- `trackOrderFailed` — fires on any order error with symbol/side/orderType context
- `trackUnlockFailed` — escalates to a Sentry issue after 3 failed passphrase attempts
- `trackOrderPlaced` — breadcrumb on successful order

Recommended alerts in Sentry: order_failed spike (>5 in 5 min), new issue type.

---

## Project structure

```
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       ├── kill-switch/route.ts   # Remote kill switch endpoint
│       ├── elfa/route.ts          # Elfa AI proxy (keeps key server-side)
│       └── jupiter/route.ts       # Jupiter price proxy
│
├── src/
│   ├── components/terminal/
│   │   ├── NexusDashboard.tsx
│   │   ├── SessionBar.tsx
│   │   ├── AlphaFeed.tsx
│   │   ├── PriceChart.tsx
│   │   ├── ArbScanner.tsx
│   │   ├── MarketScanner.tsx
│   │   ├── TradeLog.tsx
│   │   ├── TpSlManager.tsx
│   │   ├── RiskGuard.tsx
│   │   ├── QuickOrderBar.tsx
│   │   ├── TradeConfirmModal.tsx
│   │   ├── UnlockKeyModal.tsx
│   │   ├── KillSwitchBanner.tsx
│   │   ├── StaleFeedBanner.tsx
│   │   └── OrderStatusBadge.tsx
│   │
│   ├── hooks/
│   │   ├── usePacifica.ts
│   │   ├── useArbScanner.ts
│   │   ├── useWhaleStream.ts
│   │   ├── useOrderbookStream.ts
│   │   ├── useWsStatus.ts
│   │   ├── useOrderLifecycleSync.ts
│   │   ├── useRemoteKillSwitch.ts
│   │   └── useFundingAlerts.ts
│   │
│   ├── lib/
│   │   ├── pacifica-client.ts
│   │   ├── pacifica-ws.ts
│   │   ├── elfa-client.ts
│   │   ├── signing.ts
│   │   ├── keyVault.ts
│   │   ├── trading-math.ts
│   │   ├── featureFlags.ts
│   │   ├── telemetry.ts
│   │   ├── env.ts
│   │   └── utils.ts
│   │
│   ├── stores/
│   │   ├── agentKeyStore.ts
│   │   ├── killSwitchStore.ts
│   │   ├── orderLifecycleStore.ts
│   │   ├── tradeLogStore.ts
│   │   ├── toastStore.ts
│   │   ├── fundingAlertStore.ts
│   │   └── trailingStopStore.ts
│   │
│   ├── __tests__/
│   │   ├── trading-math.test.ts
│   │   ├── keyVault.test.ts
│   │   ├── orderLifecycle.test.ts
│   │   ├── killSwitch.test.ts
│   │   ├── featureFlags.test.ts
│   │   └── tradeLog.test.ts
│   │
│   └── types/index.ts
│
├── e2e/
│   ├── key-vault.spec.ts
│   ├── orders.spec.ts
│   ├── kill-switch.spec.ts
│   ├── error-surface.spec.ts
│   └── helpers/api-mocks.ts
│
├── .github/workflows/ci.yml
├── STAGING_RUNBOOK.md
├── next.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## License

Copyright (c) 2025 Pacifica-Nexus. All rights reserved. Unauthorized use or distribution prohibited.
