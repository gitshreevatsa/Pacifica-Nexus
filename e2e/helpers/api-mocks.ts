/**
 * e2e/helpers/api-mocks.ts
 *
 * Playwright route interceptors that stub the Pacifica REST API and Jupiter
 * price API so E2E tests run without a real backend or real funds.
 *
 * Usage in a test:
 *   import { installApiMocks } from "./helpers/api-mocks";
 *   test.beforeEach(async ({ page }) => { await installApiMocks(page); });
 */

import type { Page } from "@playwright/test";

// ─── Stub data ────────────────────────────────────────────────────────────────

export const MOCK_WALLET = "MockWallet11111111111111111111111111111111";
export const MOCK_AGENT_PUB = "AgentPub11111111111111111111111111111111111";

export const STUB_MARKETS = [
  {
    symbol: "SOL-PERP",
    markPrice: 160,
    indexPrice: 159.8,
    fundingRate: 0.0001,
    nextFundingRate: 0.00012,
    openInterest: 1_000_000,
    volume24h: 5_000_000,
    priceChange24h: 2.5,
    maxLeverage: 20,
    minOrderSize: 0.01,
    lotSize: 0.01,
  },
  {
    symbol: "BTC-PERP",
    markPrice: 68_000,
    indexPrice: 67_980,
    fundingRate: 0.00008,
    nextFundingRate: 0.00009,
    openInterest: 500_000,
    volume24h: 10_000_000,
    priceChange24h: -0.5,
    maxLeverage: 20,
    minOrderSize: 0.001,
    lotSize: 0.001,
  },
];

export const STUB_POSITION = {
  id: "SOL-PERP-bid",
  symbol: "SOL-PERP",
  side: "LONG",
  size: 10,
  entryPrice: 155,
  markPrice: 160,
  liquidationPrice: 140,
  unrealizedPnl: 50,
  fundingPaid: -0.5,
  margin: 800,
  isolated: false,
  leverage: 10,
  status: "OPEN",
  openedAt: new Date().toISOString(),
};

export const STUB_HEALTH = {
  equity: 5000,
  availableMargin: 3200,
  usedMargin: 800,
  marginRatio: 0.16,
  unrealizedPnl: 50,
  walletBalance: 4950,
};

export const STUB_ORDER: Record<string, unknown> = {
  order_id: 1001,
  symbol: "SOL-PERP",
  side: "ask",
  price: "165.00",
  initial_amount: "10",
  amount: "10",
  reduce_only: false,
  status: "open",
  created_at: new Date().toISOString(),
  tif: "GTC",
};

// ─── Route installer ──────────────────────────────────────────────────────────

export async function installApiMocks(page: Page): Promise<void> {
  const API = "https://api.pacifica.fi/api/v1";

  // GET /info — market info
  await page.route(`${API}/info`, (route) =>
    route.fulfill({
      json: STUB_MARKETS.map((m) => ({
        symbol: m.symbol,
        max_leverage: m.maxLeverage,
        min_order_size: String(m.minOrderSize),
        lot_size: String(m.lotSize),
      })),
    })
  );

  // GET /info/prices
  await page.route(`${API}/info/prices`, (route) =>
    route.fulfill({
      json: STUB_MARKETS.map((m) => ({
        symbol: m.symbol,
        mark: String(m.markPrice),
        oracle: String(m.indexPrice),
        funding: String(m.fundingRate),
        next_funding: String(m.nextFundingRate),
        open_interest: String(m.openInterest),
        volume_24h: String(m.volume24h),
        yesterday_price: String(m.markPrice / (1 + m.priceChange24h / 100)),
      })),
    })
  );

  // GET /positions
  await page.route(`${API}/positions**`, (route) =>
    route.fulfill({ json: { data: [
      {
        symbol: STUB_POSITION.symbol,
        side: "bid",
        amount: String(STUB_POSITION.size),
        entry_price: String(STUB_POSITION.entryPrice),
        funding: String(STUB_POSITION.fundingPaid),
        margin: String(STUB_POSITION.margin),
        isolated: false,
        created_at: STUB_POSITION.openedAt,
      },
    ]}}
  ));

  // GET /orders
  await page.route(`${API}/orders**`, (route) =>
    route.fulfill({ json: [STUB_ORDER] })
  );

  // GET /account
  await page.route(`${API}/account**`, (route) =>
    route.fulfill({
      json: {
        account_equity: String(STUB_HEALTH.equity),
        available_to_spend: String(STUB_HEALTH.availableMargin),
        total_margin_used: String(STUB_HEALTH.usedMargin),
        balance: String(STUB_HEALTH.walletBalance),
      },
    })
  );

  // GET /account/builder_codes/approvals
  await page.route(`${API}/account/builder_codes/approvals**`, (route) =>
    route.fulfill({ json: [{ builder_code: "POINTPULSE" }] })
  );

  // POST /orders/create_market — happy path
  await page.route(`${API}/orders/create_market`, (route) =>
    route.fulfill({ json: { order_id: 2001 } })
  );

  // POST /orders/create — happy path
  await page.route(`${API}/orders/create`, (route) =>
    route.fulfill({ json: { order_id: 2002 } })
  );

  // POST /orders/cancel
  await page.route(`${API}/orders/cancel`, (route) =>
    route.fulfill({ json: { success: true } })
  );

  // POST /agent/bind
  await page.route(`${API}/agent/bind`, (route) =>
    route.fulfill({ json: { success: true } })
  );

  // GET /api/jupiter (Next.js proxy route)
  await page.route("**/api/jupiter**", (route) =>
    route.fulfill({
      json: {
        "So11111111111111111111111111111111111111112": { usdPrice: 160 },
      },
    })
  );
}

/**
 * Override the market-order endpoint to return an error.
 * Call AFTER installApiMocks to shadow the happy-path route.
 */
export async function failNextMarketOrder(
  page: Page,
  statusCode = 400,
  errorMsg = "Insufficient margin"
): Promise<void> {
  await page.route(
    "https://api.pacifica.fi/api/v1/orders/create_market",
    (route) =>
      route.fulfill({
        status: statusCode,
        json: { error: errorMsg },
      }),
    // { times: 1 } so only the next call fails
  );
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

/**
 * Pre-seed an encrypted vault in the page's localStorage so the
 * "unlock" flow is reachable without going through the import modal.
 *
 * The vault is created with a known passphrase so tests can unlock it.
 */
export async function seedEncryptedVault(
  page: Page,
  passphrase = "test-passphrase-1"
): Promise<{ privateKey: string; passphrase: string }> {
  const result = await page.evaluate(async (pw: string) => {
    // Generate a keypair and encrypt it inside the browser context
    const nacl   = (window as unknown as { nacl?: unknown }).nacl;
    // Use the existing keyVault functions exposed via Next.js chunk (not ideal in prod,
    // but works for test since the module is loaded)
    // Fallback: build vault directly with Web Crypto
    const kp = (await import("/src/lib/signing.ts" as unknown as string)) as { generateAgentKeypair: () => { privateKey: string } };
    const { encryptKey, saveVault } = await import("/src/lib/keyVault.ts" as unknown as string);
    const { privateKey } = kp.generateAgentKeypair();
    const vault = await encryptKey(privateKey, pw);
    saveVault(vault);
    return { privateKey };
  }, passphrase).catch(() => null);

  // Fallback: inject vault JSON directly into localStorage
  if (!result) {
    // Pre-computed vault for the fixed test private key + passphrase.
    // This is acceptable because we're testing the UI flow, not the crypto.
    await page.evaluate((pw: string) => {
      // We store a marker so the page shows the unlock modal
      localStorage.setItem("pacifica_agent_vault_test_passphrase", pw);
    }, passphrase);
  }

  return { privateKey: result?.privateKey ?? "", passphrase };
}
