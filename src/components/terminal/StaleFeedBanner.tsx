"use client";

/**
 * StaleFeedBanner
 *
 * Shows a degraded-mode warning when:
 *  - WebSocket is disconnected (wsState !== "open"), OR
 *  - Connected but no message received in the last 60 seconds (stale feed)
 *
 * Renders nothing during normal operation.
 * Stacks below KillSwitchBanner in NexusDashboard.
 */

import { useWsStatus } from "@/hooks/useWsStatus";
import { getLastMessageTime } from "@/lib/pacifica-ws";
import { useState, useEffect } from "react";

function useSecondsSinceLastMessage(): number | null {
  const [secs, setSecs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const t = getLastMessageTime();
      setSecs(t === null ? null : Math.floor((Date.now() - t) / 1_000));
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  return secs;
}

/** How long to wait after mount before showing the disconnected banner. */
const STARTUP_GRACE_MS = 6_000;

export function StaleFeedBanner() {
  const { connected, stale } = useWsStatus();
  const secsSince = useSecondsSinceLastMessage();
  const [pastGrace, setPastGrace] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setPastGrace(true), STARTUP_GRACE_MS);
    return () => clearTimeout(id);
  }, []);

  if (connected && !stale) return null;
  if (!connected && !pastGrace) return null;

  const isDisconnected = !connected;
  const label = isDisconnected
    ? "Market feed disconnected — prices may be outdated"
    : `Market feed stale — last update ${secsSince !== null ? `${secsSince}s` : "unknown"} ago`;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full flex items-center gap-3 px-4 py-1.5 text-xs font-mono"
      style={{
        background: isDisconnected ? "rgba(220,38,38,0.08)" : "rgba(234,179,8,0.08)",
        borderBottom: `1px solid ${isDisconnected ? "rgba(220,38,38,0.25)" : "rgba(234,179,8,0.25)"}`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
        style={{ background: isDisconnected ? "rgb(220,38,38)" : "rgb(234,179,8)" }}
      />
      <span style={{ color: isDisconnected ? "rgb(248,113,113)" : "rgb(253,224,71)" }}>
        {label}
      </span>
      {isDisconnected && (
        <span className="ml-auto text-slate-500">Reconnecting…</span>
      )}
    </div>
  );
}
