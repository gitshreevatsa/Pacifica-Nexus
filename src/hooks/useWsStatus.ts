/**
 * useWsStatus.ts
 *
 * Polls the pacifica-ws singleton state so components can react to
 * connection loss or a stale feed (no messages for > STALE_THRESHOLD_MS).
 */

"use client";

import { useState, useEffect } from "react";
import { getWsState, getLastMessageTime, type WsState } from "@/lib/pacifica-ws";

/** A feed is considered stale if no WS message arrives within this window. */
const STALE_THRESHOLD_MS = 60_000;
const POLL_INTERVAL_MS   = 3_000;

export interface WsStatus {
  state:     WsState;
  connected: boolean;
  /** true when connected but no message received in the last 60 s */
  stale:     boolean;
}

export function useWsStatus(): WsStatus {
  const [status, setStatus] = useState<WsStatus>(() => {
    const state = getWsState();
    return { state, connected: state === "open", stale: false };
  });

  useEffect(() => {
    const tick = () => {
      const state      = getWsState();
      const lastMsg    = getLastMessageTime();
      const connected  = state === "open";
      const stale      = connected && lastMsg !== null && Date.now() - lastMsg > STALE_THRESHOLD_MS;
      setStatus({ state, connected, stale });
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return status;
}
