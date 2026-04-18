import { z } from "zod";

/**
 * Server-only env vars (never exposed to the client bundle).
 * Validated once at module load time — app crashes early with a clear message
 * rather than producing undefined runtime behavior.
 */
const serverSchema = z.object({
  PRIVY_APP_SECRET: z.string().min(1, "PRIVY_APP_SECRET is required"),
  ELFA_AI_API_KEY: z.string().min(1, "ELFA_AI_API_KEY is required"),
});

/**
 * Public env vars (NEXT_PUBLIC_*) — safe to read on client and server.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_PRIVY_APP_ID: z
    .string()
    .min(1, "NEXT_PUBLIC_PRIVY_APP_ID is required"),
  NEXT_PUBLIC_PACIFICA_API_URL: z
    .string()
    .url("NEXT_PUBLIC_PACIFICA_API_URL must be a valid URL"),
  NEXT_PUBLIC_PACIFICA_WS_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_PACIFICA_WS_URL is required"),
  NEXT_PUBLIC_BUILDER_CODE: z
    .string()
    .min(1, "NEXT_PUBLIC_BUILDER_CODE is required"),
  NEXT_PUBLIC_ELFA_AI_BASE_URL: z
    .string()
    .url("NEXT_PUBLIC_ELFA_AI_BASE_URL must be a valid URL")
    .default("https://api.elfa.ai/v1"),
  NEXT_PUBLIC_JUPITER_PRICE_API: z
    .string()
    .url("NEXT_PUBLIC_JUPITER_PRICE_API must be a valid URL")
    .default("https://price.jup.ag/v6/price"),
  // Optional — Sentry is silent when DSN is not set
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  // Optional — operator kill switch: set to "true" to disable all trading at boot
  // without shipping a new build (change the env var in Vercel/Railway dashboard)
  NEXT_PUBLIC_KILL_SWITCH: z.enum(["true", "false"]).optional(),
  NEXT_PUBLIC_KILL_SWITCH_REASON: z.string().optional(),
});

function validateEnv() {
  const isServer = typeof window === "undefined";
  // During `next build`, Next.js sets NEXT_PHASE. Skip server-only validation
  // at build time — those vars are injected at runtime by the deployment environment.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  const clientResult = clientSchema.safeParse(process.env);
  if (!clientResult.success && !isBuildPhase) {
    const msg = clientResult.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Missing or invalid environment variables:\n${msg}`);
  }

  if (isServer && !isBuildPhase) {
    const serverResult = serverSchema.safeParse(process.env);
    if (!serverResult.success) {
      const msg = serverResult.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(
        `Missing or invalid server environment variables:\n${msg}`,
      );
    }
    return {
      ...(clientResult.success ? clientResult.data : {}),
      ...serverResult.data,
    };
  }

  return clientResult.success ? clientResult.data : {};
}

export const env = validateEnv();
