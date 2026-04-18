/**
 * orderLifecycleStore.ts
 *
 * Tracks the client-side lifecycle of orders placed in this session.
 * The Pacifica REST API is authoritative for long-lived order state;
 * this store fills the gap between "submitted" and "first poll refresh"
 * so the UI can show immediate feedback without waiting for polling.
 *
 * Lifecycle:
 *   submitting → accepted → filled
 *                        ↘ cancelled
 *                        ↘ rejected
 *
 * Flow:
 *  1. Before calling createMarketOrder / createLimitOrder:
 *     orderLifecycleStore.getState().submitting(clientOrderId, symbol, side, size)
 *  2. On success (server returns order_id):
 *     orderLifecycleStore.getState().accepted(clientOrderId, orderId)
 *  3. On WebSocket `account_order_updates` fill event:
 *     orderLifecycleStore.getState().filled(orderId)
 *  4. On cancel confirm or WS cancel event:
 *     orderLifecycleStore.getState().cancelled(orderId)
 *
 * Entries are pruned after RETAIN_MS to prevent unbounded memory growth.
 */

import { create } from "zustand";

const RETAIN_MS = 5 * 60 * 1_000; // keep entries for 5 minutes

export type OrderLifecycleStatus =
  | "submitting"
  | "accepted"
  | "partially_filled"
  | "cancel_pending"
  | "filled"
  | "cancelled"
  | "rejected"
  | "expired"
  | "failed_reconcile";

export interface OrderLifecycleEntry {
  clientOrderId: string;
  orderId:       number | null;   // null until server acknowledges
  symbol:        string;
  side:          "LONG" | "SHORT";
  size:          number;
  filledSize:    number;          // 0 until partially or fully filled
  status:        OrderLifecycleStatus;
  updatedAt:     number;          // ms timestamp
}

interface OrderLifecycleState {
  orders: Record<string, OrderLifecycleEntry>; // keyed by clientOrderId

  // Actions
  markSubmitting:     (clientOrderId: string, symbol: string, side: "LONG" | "SHORT", size: number) => void;
  markAccepted:       (clientOrderId: string, orderId: number) => void;
  markPartiallyFilled:(orderId: number, filledSize: number) => void;
  markCancelPending:  (orderId: number) => void;
  markFilled:         (orderId: number) => void;
  markCancelled:      (orderId: number) => void;
  markRejected:       (clientOrderId: string) => void;
  markExpired:        (orderId: number) => void;
  markFailedReconcile:(clientOrderId: string) => void;
  prune:              () => void;

  // Selectors
  getByClientId:  (clientOrderId: string) => OrderLifecycleEntry | undefined;
  getByOrderId:   (orderId: number) => OrderLifecycleEntry | undefined;
  recentOrders:   () => OrderLifecycleEntry[];
}

export const useOrderLifecycleStore = create<OrderLifecycleState>((set, get) => ({
  orders: {},

  markSubmitting: (clientOrderId, symbol, side, size) =>
    set((s) => ({
      orders: {
        ...s.orders,
        [clientOrderId]: { clientOrderId, orderId: null, symbol, side, size, filledSize: 0, status: "submitting", updatedAt: Date.now() },
      },
    })),

  markAccepted: (clientOrderId, orderId) =>
    set((s) => {
      const existing = s.orders[clientOrderId];
      if (!existing) return s;
      return {
        orders: {
          ...s.orders,
          [clientOrderId]: { ...existing, orderId, status: "accepted", updatedAt: Date.now() },
        },
      };
    }),

  markPartiallyFilled: (orderId, filledSize) =>
    set((s) => {
      const entry = Object.values(s.orders).find((o) => o.orderId === orderId);
      if (!entry) return s;
      return {
        orders: {
          ...s.orders,
          [entry.clientOrderId]: { ...entry, filledSize, status: "partially_filled", updatedAt: Date.now() },
        },
      };
    }),

  markCancelPending: (orderId) =>
    set((s) => {
      const entry = Object.values(s.orders).find((o) => o.orderId === orderId);
      if (!entry) return s;
      return {
        orders: {
          ...s.orders,
          [entry.clientOrderId]: { ...entry, status: "cancel_pending", updatedAt: Date.now() },
        },
      };
    }),

  markFilled: (orderId) =>
    set((s) => {
      const entry = Object.values(s.orders).find((o) => o.orderId === orderId);
      if (!entry) return s;
      return {
        orders: {
          ...s.orders,
          [entry.clientOrderId]: { ...entry, filledSize: entry.size, status: "filled", updatedAt: Date.now() },
        },
      };
    }),

  markCancelled: (orderId) =>
    set((s) => {
      const entry = Object.values(s.orders).find((o) => o.orderId === orderId);
      if (!entry) return s;
      return {
        orders: {
          ...s.orders,
          [entry.clientOrderId]: { ...entry, status: "cancelled", updatedAt: Date.now() },
        },
      };
    }),

  markRejected: (clientOrderId) =>
    set((s) => {
      const existing = s.orders[clientOrderId];
      if (!existing) return s;
      return {
        orders: {
          ...s.orders,
          [clientOrderId]: { ...existing, status: "rejected", updatedAt: Date.now() },
        },
      };
    }),

  markExpired: (orderId) =>
    set((s) => {
      const entry = Object.values(s.orders).find((o) => o.orderId === orderId);
      if (!entry) return s;
      return {
        orders: {
          ...s.orders,
          [entry.clientOrderId]: { ...entry, status: "expired", updatedAt: Date.now() },
        },
      };
    }),

  markFailedReconcile: (clientOrderId) =>
    set((s) => {
      const existing = s.orders[clientOrderId];
      if (!existing) return s;
      return {
        orders: {
          ...s.orders,
          [clientOrderId]: { ...existing, status: "failed_reconcile", updatedAt: Date.now() },
        },
      };
    }),

  prune: () =>
    set((s) => {
      const cutoff = Date.now() - RETAIN_MS;
      const pruned = Object.fromEntries(
        Object.entries(s.orders).filter(([, v]) => v.updatedAt > cutoff)
      );
      return { orders: pruned };
    }),

  getByClientId: (clientOrderId) => get().orders[clientOrderId],

  getByOrderId: (orderId) =>
    Object.values(get().orders).find((o) => o.orderId === orderId),

  recentOrders: () =>
    Object.values(get().orders).sort((a, b) => b.updatedAt - a.updatedAt),
}));
