"use client";

/**
 * KillSwitchBanner
 *
 * Displays a full-width warning banner when trading is halted via the kill switch.
 * Includes a "Resume Trading" button so the user can manually clear the halt.
 *
 * Mount this once near the top of the terminal layout (e.g. in NexusDashboard
 * or SessionBar) — it renders nothing when trading is not halted.
 */

import { useKillSwitchStore } from "@/stores/killSwitchStore";

export function KillSwitchBanner() {
  const tradingHalted = useKillSwitchStore((s) => s.tradingHalted);
  const haltReason    = useKillSwitchStore((s) => s.haltReason);
  const haltedAt      = useKillSwitchStore((s) => s.haltedAt);
  const resumeTrading = useKillSwitchStore((s) => s.resumeTrading);

  if (!tradingHalted) return null;

  const haltedAtStr = haltedAt
    ? new Date(haltedAt).toLocaleTimeString()
    : null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full bg-danger/10 border-b border-danger/40 px-4 py-2 flex items-center justify-between gap-4 text-sm"
    >
      <div className="flex items-center gap-2 text-danger font-medium">
        <span className="inline-block w-2 h-2 rounded-full bg-danger animate-pulse" />
        <span>
          Trading halted
          {haltReason ? ` — ${haltReason}` : ""}
          {haltedAtStr ? ` (since ${haltedAtStr})` : ""}
        </span>
      </div>

      <button
        onClick={resumeTrading}
        className="text-xs px-3 py-1 rounded border border-danger/50 text-danger hover:bg-danger/20 transition-colors"
      >
        Resume Trading
      </button>
    </div>
  );
}
