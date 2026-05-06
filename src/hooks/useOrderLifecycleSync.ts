"use client";

/**
 * useOrderLifecycleSync.ts
 *
 * Subscribes to the Pacifica `account_order_updates` WebSocket channel
 * and reconciles the orderLifecycleStore with exchange truth.
 *
 * When the WS reports an order as "filled" or "cancelled", the lifecycle
 * store is updated so the UI badge reflects the real status immediately,
 * before the next REST poll cycle.
 *
 * Mount once in SessionBar (which is always rendered).
 * Requires walletAddress to subscribe to the private channel.
 */

import { useEffect } from "react";
import { ensureConnected, onConnect, onMessage, wsSend } from "@/lib/pacifica-ws";
import { useOrderLifecycleStore } from "@/stores/orderLifecycleStore";
import type { WsOrderUpdatePayload } from "@/types";

export function useOrderLifecycleSync(walletAddress: string | null) {
  useEffect(() => {
    if (!walletAddress) return;

    ensureConnected();

    const subscribe = () => {
      wsSend({
        method: "subscribe",
        params: { channel: "account_order_updates", account: walletAddress },
      });
    };

    const unsubConnect = onConnect(subscribe);

    const unsubMsg = onMessage((raw) => {
      const msg = raw as Partial<WsOrderUpdatePayload>;
      if (msg?.channel !== "account_order_updates" || !Array.isArray(msg.data)) return;

      const store = useOrderLifecycleStore.getState();
      for (const update of msg.data) {
        if (update.os === "filled") {
          store.markFilled(update.i);
        } else if (update.os === "partially_filled") {
          const entry = store.getByOrderId(update.i);
          const filled = entry ? parseFloat(update.f ?? "0") : 0;
          store.markPartiallyFilled(update.i, filled);
        } else if (update.os === "cancelled") {
          store.markCancelled(update.i);
        } else if (update.os === "rejected") {
          const entry = store.getByOrderId(update.i);
          if (entry) store.markRejected(entry.clientOrderId);
        }
      }

      // Prune old entries every time we receive updates
      store.prune();
    });

    return () => {
      unsubConnect();
      unsubMsg();
    };
  }, [walletAddress]);
}
