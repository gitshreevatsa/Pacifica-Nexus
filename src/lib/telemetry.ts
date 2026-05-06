/**
 * telemetry.ts
 *
 * Thin wrappers around Sentry for structured, domain-specific instrumentation.
 * All functions are no-ops when Sentry is not initialised (no DSN set).
 */

import * as Sentry from "@sentry/nextjs";

// ─── Order events ─────────────────────────────────────────────────────────────

export function trackOrderFailed(params: {
  symbol:    string;
  side:      string;
  orderType: string;
  error:     unknown;
}) {
  Sentry.withScope((scope) => {
    scope.setTag("event", "order_failed");
    scope.setContext("order", {
      symbol:    params.symbol,
      side:      params.side,
      orderType: params.orderType,
    });
    Sentry.captureException(
      params.error instanceof Error ? params.error : new Error(String(params.error))
    );
  });
}

export function trackOrderPlaced(params: {
  symbol:  string;
  side:    string;
  orderId: number;
}) {
  Sentry.addBreadcrumb({
    category: "trading",
    message:  `Order placed: ${params.side} ${params.symbol} #${params.orderId}`,
    level:    "info",
  });
}

// ─── Key vault events ─────────────────────────────────────────────────────────

export function trackUnlockFailed(attempt: number) {
  Sentry.addBreadcrumb({
    category: "auth",
    message:  `Key vault unlock failed (attempt ${attempt})`,
    level:    "warning",
  });
  if (attempt >= 3) {
    Sentry.captureMessage(
      `Key vault unlock failed ${attempt} times in a row`,
      "warning"
    );
  }
}

