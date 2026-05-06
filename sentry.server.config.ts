/**
 * sentry.server.config.ts
 *
 * Sentry Node.js SDK initialisation (Next.js server-side / API routes).
 * Loaded automatically by @sentry/nextjs on the server bundle.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  debug: false,
});
