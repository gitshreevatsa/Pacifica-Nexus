"use client";

/**
 * useRemoteKillSwitch
 *
 * Polls GET /api/kill-switch every POLL_INTERVAL_MS.
 * When the server returns { halted: true }, the killSwitchStore is activated
 * and all trading mutations are blocked immediately.
 *
 * Mount once in SessionBar (which is always rendered when the app is open).
 *
 * This provides a confirmed server-side kill switch:
 *   - Set KILL_SWITCH=true in your Vercel env vars (no deploy needed)
 *   - Within POLL_INTERVAL_MS, all connected clients halt trading
 *   - The halt persists until the server returns { halted: false }
 *
 * The remote halt cannot be "Resume"-d by the user in the UI —
 * only the server clearing the env var can lift it.
 */

import { useEffect, useRef } from "react";
import { useKillSwitchStore } from "@/stores/killSwitchStore";

const POLL_INTERVAL_MS = 30_000; // 30 seconds — halting within 30s of env var change
const REMOTE_HALT_REASON_PREFIX = "[Remote]";

export function useRemoteKillSwitch() {
  // Track whether the current halt was set by the remote (vs user-triggered)
  const remoteHaltedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/kill-switch", { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as {
          halted: boolean;
          reason: string;
        };
        const store = useKillSwitchStore.getState();

        if (data.halted && !store.tradingHalted) {
          // Server says halt → activate kill switch
          remoteHaltedRef.current = true;
          store.haltTrading(`${REMOTE_HALT_REASON_PREFIX} ${data.reason}`);
        } else if (
          !data.halted &&
          store.tradingHalted &&
          remoteHaltedRef.current
        ) {
          // Server lifted the halt AND we were the ones who set it → resume
          remoteHaltedRef.current = false;
          store.resumeTrading();
        }
      } catch {
        // Network failure — don't halt trading on a failed poll.
        // If the server is unreachable the user's experience degrades naturally.
      }
    }

    // Check immediately on mount, then on interval
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}
