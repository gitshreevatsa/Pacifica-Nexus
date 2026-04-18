/**
 * killSwitchStore.ts
 *
 * Runtime kill switches for emergency disabling of trading operations.
 *
 * Kill switches differ from feature flags:
 *  - Feature flags are compile-time / deploy-time static values
 *  - Kill switches can be toggled at runtime (e.g. user-triggered, or via
 *    a future admin API response header)
 *
 * Current kill switches:
 *  - tradingHalted   — disables all order placement (open / close / cancel)
 *  - readOnlyMode    — same as tradingHalted but with clearer messaging
 *
 * Usage:
 *   // In a component or hook:
 *   const { tradingHalted, haltReason } = useKillSwitchStore();
 *
 *   // To trigger (e.g. from an emergency button or API error handler):
 *   haltTrading("Circuit breaker: abnormal P&L detected");
 *
 *   // To resume:
 *   resumeTrading();
 */

import { create } from "zustand";

// Read operator kill switch from env at module load time.
// Set NEXT_PUBLIC_KILL_SWITCH=true in your Vercel / Railway dashboard to halt
// all trading immediately without shipping a new build.
const BOOT_HALTED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_KILL_SWITCH === "true";
const BOOT_REASON =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_KILL_SWITCH_REASON) ||
  "Trading disabled by operator";

export interface KillSwitchState {
  /** All order mutations are blocked when true. */
  tradingHalted: boolean;

  /** Human-readable reason shown in the UI. Empty string when not halted. */
  haltReason: string;

  /** When the halt was triggered (null when not halted). */
  haltedAt: number | null;

  // Actions
  haltTrading:   (reason: string) => void;
  resumeTrading: () => void;
}

export const useKillSwitchStore = create<KillSwitchState>((set) => ({
  tradingHalted: BOOT_HALTED,
  haltReason:    BOOT_HALTED ? BOOT_REASON : "",
  haltedAt:      BOOT_HALTED ? Date.now() : null,

  haltTrading: (reason: string) =>
    set({ tradingHalted: true, haltReason: reason, haltedAt: Date.now() }),

  resumeTrading: () =>
    set({ tradingHalted: false, haltReason: "", haltedAt: null }),
}));

/**
 * Asserts that trading is currently allowed.
 * Throws with the halt reason if a kill switch is active.
 * Intended to be called at the top of every trade mutation.
 */
export function assertTradingAllowed(): void {
  const { tradingHalted, haltReason } = useKillSwitchStore.getState();
  if (tradingHalted) {
    throw new Error(haltReason || "Trading is currently halted");
  }
}
