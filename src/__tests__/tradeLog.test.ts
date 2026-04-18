/**
 * Unit tests for src/stores/tradeLogStore.ts
 *
 * Covers: addEntry, id generation, prepend-order, 100-entry cap, clear,
 * DE-RISK type, optional orderId, multiple entries, duplicate symbol handling.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTradeLogStore } from "@/stores/tradeLogStore";

function makeEntry(overrides: Partial<Omit<import("@/stores/tradeLogStore").TradeLogEntry, "id">> = {}) {
  return {
    symbol:    "SOL-PERP",
    side:      "LONG" as const,
    size:      10,
    price:     160,
    notional:  1600,
    type:      "OPEN" as const,
    timestamp: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  useTradeLogStore.setState({ entries: [] });
});

// ─── addEntry ─────────────────────────────────────────────────────────────────

describe("addEntry", () => {
  it("adds an entry to the store", () => {
    useTradeLogStore.getState().addEntry(makeEntry());
    expect(useTradeLogStore.getState().entries).toHaveLength(1);
  });

  it("generates a non-empty string id automatically", () => {
    useTradeLogStore.getState().addEntry(makeEntry());
    const entry = useTradeLogStore.getState().entries[0];
    expect(typeof entry.id).toBe("string");
    expect(entry.id.length).toBeGreaterThan(0);
  });

  it("each entry gets a unique id", () => {
    useTradeLogStore.getState().addEntry(makeEntry({ symbol: "SOL-PERP" }));
    useTradeLogStore.getState().addEntry(makeEntry({ symbol: "SOL-PERP" }));
    const entries = useTradeLogStore.getState().entries;
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  it("id includes the symbol", () => {
    useTradeLogStore.getState().addEntry(makeEntry({ symbol: "BTC-PERP" }));
    expect(useTradeLogStore.getState().entries[0].id).toContain("BTC-PERP");
  });

  it("new entries are prepended (newest first)", () => {
    useTradeLogStore.getState().addEntry(makeEntry({ symbol: "SOL-PERP" }));
    useTradeLogStore.getState().addEntry(makeEntry({ symbol: "BTC-PERP" }));
    const entries = useTradeLogStore.getState().entries;
    expect(entries[0].symbol).toBe("BTC-PERP");
    expect(entries[1].symbol).toBe("SOL-PERP");
  });

  it("stores all fields correctly", () => {
    const ts = 1_700_000_000_000;
    useTradeLogStore.getState().addEntry({
      symbol:    "ETH-PERP",
      side:      "SHORT",
      size:      5,
      price:     3000,
      notional:  15_000,
      type:      "CLOSE",
      timestamp: ts,
      orderId:   9999,
    });
    const entry = useTradeLogStore.getState().entries[0];
    expect(entry.symbol).toBe("ETH-PERP");
    expect(entry.side).toBe("SHORT");
    expect(entry.size).toBe(5);
    expect(entry.price).toBe(3000);
    expect(entry.notional).toBe(15_000);
    expect(entry.type).toBe("CLOSE");
    expect(entry.timestamp).toBe(ts);
    expect(entry.orderId).toBe(9999);
  });

  it("orderId is optional — entry works without it", () => {
    const e = makeEntry({ type: "OPEN" });
    delete e.orderId;
    expect(() => useTradeLogStore.getState().addEntry(e)).not.toThrow();
    expect(useTradeLogStore.getState().entries[0].orderId).toBeUndefined();
  });

  it("supports DE-RISK type", () => {
    useTradeLogStore.getState().addEntry(makeEntry({ type: "DE-RISK" }));
    expect(useTradeLogStore.getState().entries[0].type).toBe("DE-RISK");
  });
});

// ─── 100-entry cap ────────────────────────────────────────────────────────────

describe("100-entry cap", () => {
  it("capped at 100 entries — oldest are dropped", () => {
    for (let i = 0; i < 110; i++) {
      useTradeLogStore.getState().addEntry(makeEntry({ symbol: `TOKEN-${i}` }));
    }
    expect(useTradeLogStore.getState().entries).toHaveLength(100);
  });

  it("newest entries are kept when over cap", () => {
    for (let i = 0; i < 105; i++) {
      useTradeLogStore.getState().addEntry(makeEntry({ symbol: `TOKEN-${i}` }));
    }
    const entries = useTradeLogStore.getState().entries;
    // Newest = TOKEN-104 (prepended last → index 0)
    expect(entries[0].symbol).toBe("TOKEN-104");
    // TOKEN-0 through TOKEN-4 should be dropped
    expect(entries.find((e) => e.symbol === "TOKEN-0")).toBeUndefined();
  });

  it("exactly 100 entries — no truncation", () => {
    for (let i = 0; i < 100; i++) {
      useTradeLogStore.getState().addEntry(makeEntry({ symbol: `TOKEN-${i}` }));
    }
    expect(useTradeLogStore.getState().entries).toHaveLength(100);
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe("clear", () => {
  it("removes all entries", () => {
    useTradeLogStore.getState().addEntry(makeEntry());
    useTradeLogStore.getState().addEntry(makeEntry());
    useTradeLogStore.getState().clear();
    expect(useTradeLogStore.getState().entries).toHaveLength(0);
  });

  it("clear when already empty is a no-op", () => {
    expect(() => useTradeLogStore.getState().clear()).not.toThrow();
    expect(useTradeLogStore.getState().entries).toHaveLength(0);
  });

  it("can add entries again after clear", () => {
    useTradeLogStore.getState().addEntry(makeEntry());
    useTradeLogStore.getState().clear();
    useTradeLogStore.getState().addEntry(makeEntry({ symbol: "NEW-PERP" }));
    expect(useTradeLogStore.getState().entries).toHaveLength(1);
    expect(useTradeLogStore.getState().entries[0].symbol).toBe("NEW-PERP");
  });
});

// ─── Multiple concurrent entries ─────────────────────────────────────────────

describe("multiple entry types in one session", () => {
  it("correctly stores OPEN, CLOSE, and DE-RISK entries together", () => {
    useTradeLogStore.getState().addEntry(makeEntry({ type: "OPEN",    symbol: "SOL-PERP" }));
    useTradeLogStore.getState().addEntry(makeEntry({ type: "CLOSE",   symbol: "BTC-PERP" }));
    useTradeLogStore.getState().addEntry(makeEntry({ type: "DE-RISK", symbol: "ETH-PERP" }));

    const entries = useTradeLogStore.getState().entries;
    expect(entries).toHaveLength(3);
    // Most recent first
    expect(entries[0].type).toBe("DE-RISK");
    expect(entries[1].type).toBe("CLOSE");
    expect(entries[2].type).toBe("OPEN");
  });

  it("entries for the same symbol are tracked independently", () => {
    useTradeLogStore.getState().addEntry(makeEntry({ type: "OPEN",  price: 150 }));
    useTradeLogStore.getState().addEntry(makeEntry({ type: "CLOSE", price: 165 }));
    const entries = useTradeLogStore.getState().entries;
    expect(entries[0].price).toBe(165);
    expect(entries[1].price).toBe(150);
  });
});
