/**
 * featureFlags.ts
 *
 * Type-safe feature flag definitions with environment-variable overrides.
 * Flags are read once at module load — they are static for the lifetime of
 * the page. For runtime toggles (e.g. emergency kill switch) use killSwitchStore.
 *
 * Override any flag by setting NEXT_PUBLIC_FF_<FLAG_NAME>=true|false
 * in your .env.local (or in the CI env block).
 *
 * Usage:
 *   import { flags } from "@/lib/featureFlags";
 *   if (flags.arbScanner) { ... }
 */

export type FlagName =
  | "arbScanner"       // Arbitrage opportunity scanner panel
  | "trailingStop"     // Trailing-stop manager
  | "fundingAlerts"    // Funding rate alert notifications
  | "riskGuard"        // Auto de-risk on liquidation proximity
  | "tpSl"             // TP/SL bracket order UI
  | "devTools"         // TanStack Query devtools, extra console logging
  | "autoCompound";    // Yield auto-compound (not yet built — gated off by default)

/** Compile-time defaults for every flag. */
const DEFAULTS: Record<FlagName, boolean> = {
  arbScanner:    true,
  trailingStop:  true,
  fundingAlerts: true,
  riskGuard:     true,
  tpSl:          true,
  devTools:      process.env.NODE_ENV === "development",
  autoCompound:  false, // not yet built
};

/**
 * Reads NEXT_PUBLIC_FF_<FLAG> env var.
 * Returns `true` for "1" / "true" (case-insensitive).
 * Returns `false` for "0" / "false".
 * Returns `undefined` if the var is not set (use default).
 */
function readEnvFlag(name: FlagName): boolean | undefined {
  const raw = process.env[`NEXT_PUBLIC_FF_${name.toUpperCase()}`];
  if (raw === undefined || raw === "") return undefined;
  return raw === "1" || raw.toLowerCase() === "true";
}

function buildFlags(): Record<FlagName, boolean> {
  const result = {} as Record<FlagName, boolean>;
  for (const key of Object.keys(DEFAULTS) as FlagName[]) {
    const envOverride = readEnvFlag(key);
    result[key] = envOverride !== undefined ? envOverride : DEFAULTS[key];
  }
  return result;
}

/** Resolved feature flags — static for the page lifetime. */
export const flags = buildFlags();

/** Convenience: check a flag by name at runtime (safe to call from components). */
export function isEnabled(flag: FlagName): boolean {
  return flags[flag];
}
