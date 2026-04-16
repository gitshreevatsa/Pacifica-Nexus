import { create } from "zustand";
import type { Direction } from "@/types";

export interface TrailingStop {
  positionId: string;       // `${symbol}-${side}`  (matches Position.id)
  symbol: string;
  side: Direction;
  trailPct: number;         // e.g. 2 = 2%
  enabled: boolean;
  waterMark: number;        // best price seen (initialized to entry price)
  currentSlOrderId?: number;
}

interface TrailingStopStore {
  stops: Record<string, TrailingStop>;   // keyed by positionId
  setStop: (positionId: string, stop: TrailingStop) => void;
  updateWaterMark: (positionId: string, waterMark: number) => void;
  setSlOrderId: (positionId: string, orderId: number | undefined) => void;
  removeStop: (positionId: string) => void;
}

export const useTrailingStopStore = create<TrailingStopStore>((set) => ({
  stops: {},

  setStop: (positionId, stop) =>
    set((state) => ({
      stops: { ...state.stops, [positionId]: stop },
    })),

  updateWaterMark: (positionId, waterMark) =>
    set((state) => {
      const existing = state.stops[positionId];
      if (!existing) return state;
      return {
        stops: {
          ...state.stops,
          [positionId]: { ...existing, waterMark },
        },
      };
    }),

  setSlOrderId: (positionId, orderId) =>
    set((state) => {
      const existing = state.stops[positionId];
      if (!existing) return state;
      return {
        stops: {
          ...state.stops,
          [positionId]: { ...existing, currentSlOrderId: orderId },
        },
      };
    }),

  removeStop: (positionId) =>
    set((state) => {
      const next = { ...state.stops };
      delete next[positionId];
      return { stops: next };
    }),
}));
