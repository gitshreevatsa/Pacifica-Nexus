/**
 * fundingAlertStore.ts
 * Zustand store for user-defined funding rate alert thresholds.
 * Persists alerts across renders; resets "triggered" on page reload.
 */

import { create } from "zustand";

export interface FundingAlert {
  id: string;
  symbol: string;
  threshold: number;    // hourly rate, e.g. 0.0001 = 0.01%/h
  direction: "above" | "below";
  triggered: boolean;
  createdAt: number;
}

interface FundingAlertStore {
  alerts: FundingAlert[];
  addAlert: (a: Omit<FundingAlert, "id" | "triggered" | "createdAt">) => void;
  removeAlert: (id: string) => void;
  markTriggered: (id: string) => void;
  resetTrigger: (id: string) => void;
}

export const useFundingAlertStore = create<FundingAlertStore>((set) => ({
  alerts: [],

  addAlert: (a) =>
    set((s) => ({
      alerts: [
        ...s.alerts,
        {
          ...a,
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          triggered: false,
          createdAt: Date.now(),
        },
      ],
    })),

  removeAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

  markTriggered: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, triggered: true } : a)),
    })),

  resetTrigger: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, triggered: false } : a)),
    })),
}));
