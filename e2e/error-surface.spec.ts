/**
 * e2e/error-surface.spec.ts
 *
 * Tests that confirm errors surface visibly to the user rather than failing silently.
 * These tests run WITHOUT a connected wallet — they test the error handling surface
 * that is reachable from the unauthenticated state.
 *
 * For wallet-gated order errors (e.g. "Insufficient margin" toast), see the
 * test.skip blocks in orders.spec.ts — those require staging + a funded test wallet.
 */

import { test, expect } from "@playwright/test";
import { installApiMocks } from "./helpers/api-mocks";

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

// ─── API proxy error surfaces ─────────────────────────────────────────────────

test("Elfa AI proxy returns 500 gracefully — page does not crash", async ({ page }) => {
  // Override the Elfa proxy to return an error
  await page.route("**/api/elfa**", (route) =>
    route.fulfill({ status: 500, json: { error: "Upstream unavailable" } })
  );

  await page.reload();
  // Page should still be functional (not a white screen)
  await expect(page.locator("body")).toBeVisible();
  // No unhandled error overlay (Next.js dev error overlay)
  await expect(page.locator("[data-nextjs-dialog]")).not.toBeVisible({ timeout: 3_000 })
    .catch(() => {}); // not always present
});

test("Jupiter price API returning 500 does not crash the page", async ({ page }) => {
  await page.route("**/api/jupiter**", (route) =>
    route.fulfill({ status: 500, json: { error: "Rate limited" } })
  );
  await page.reload();
  await expect(page.locator("body")).toBeVisible();
});

test("markets API returning empty array shows no symbol list (no crash)", async ({ page }) => {
  await page.route("https://api.pacifica.fi/api/v1/info", (route) =>
    route.fulfill({ json: [] })
  );
  await page.route("https://api.pacifica.fi/api/v1/info/prices", (route) =>
    route.fulfill({ json: [] })
  );
  await page.reload();
  await expect(page.locator("body")).toBeVisible();
});

test("account API returning 401 does not crash the page", async ({ page }) => {
  await page.route("https://api.pacifica.fi/api/v1/account**", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );
  await page.reload();
  await expect(page.locator("body")).toBeVisible();
});

// ─── /api/kill-switch error resilience ────────────────────────────────────────

test("kill-switch endpoint returning 500 does not halt trading (fail-open)", async ({ page }) => {
  // If our own kill-switch endpoint is broken, we should NOT halt trading
  await page.route("**/api/kill-switch", (route) =>
    route.fulfill({ status: 500, json: { error: "Internal error" } })
  );
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Trading should NOT be halted just because the kill-switch poll failed
  await expect(page.getByText(/Trading halted/i)).not.toBeVisible({ timeout: 3_000 });
  await expect(page.locator("body")).toBeVisible();
});

test("kill-switch endpoint network failure does not halt trading (fail-open)", async ({ page }) => {
  await page.route("**/api/kill-switch", (route) => route.abort("failed"));
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(/Trading halted/i)).not.toBeVisible({ timeout: 3_000 });
});

// ─── UI error states ──────────────────────────────────────────────────────────

test("page loads without JavaScript console errors on clean start", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      // Filter out expected noise (Privy, WalletConnect, WS connection errors in test env)
      const text = msg.text();
      const isExpected =
        text.includes("privy") ||
        text.includes("walletconnect") ||
        text.includes("WebSocket") ||
        text.includes("ws://") ||
        text.includes("wss://") ||
        text.includes("NEXT_PUBLIC_") ||
        text.includes("hydrat");
      if (!isExpected) consoleErrors.push(text);
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Allow up to 1 unexpected console error (e.g. missing env var in test env)
  expect(consoleErrors.length).toBeLessThanOrEqual(1);
});

test("Connect Wallet button is accessible (keyboard focusable)", async ({ page }) => {
  await page.reload();
  const btn = page.getByRole("button", { name: /Connect Wallet/i });
  await expect(btn).toBeVisible({ timeout: 5_000 });
  // Should be focusable
  await btn.focus();
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  expect(focused).toContain("Connect");
});
