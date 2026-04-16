import { create } from "zustand";
import type { Direction } from "@/types";

export interface TradeLogEntry {
  id: string;
  symbol: string;
  side: Direction;
  size: number;
  price: number;
  notional: number;
  type: "OPEN" | "CLOSE" | "DE-RISK";
  timestamp: number;
  orderId?: number;
}

interface TradeLogState {
  entries: TradeLogEntry[];
  addEntry: (entry: Omit<TradeLogEntry, "id">) => void;
  clear: () => void;
}

export const useTradeLogStore = create<TradeLogState>((set) => ({
  entries: [],
  addEntry: (entry) =>
    set((state) => ({
      entries: [
        { ...entry, id: `${entry.symbol}-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        ...state.entries,
      ].slice(0, 100),
    })),
  clear: () => set({ entries: [] }),
}));
