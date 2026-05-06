/**
 * sentry.client.config.ts
 *
 * Sentry browser SDK initialisation.
 * Loaded automatically by @sentry/nextjs on the client bundle.
 *
 * DSN is optional — if NEXT_PUBLIC_SENTRY_DSN is unset Sentry stays silent
 * (useful in local dev where you don't want noise in your Sentry project).
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,

  // Capture 10% of traces in production; 100% in dev for easier debugging.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Capture session replays for 1% of sessions, 10% on errors.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 0.1,

  // Don't log Sentry debug info to the console.
  debug: false,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Ignore noise from browser extensions and Privy auth iframes.
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    /^Non-Error promise rejection captured with value: undefined/,
  ],

});
