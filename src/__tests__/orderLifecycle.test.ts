/**
 * Unit tests for src/stores/orderLifecycleStore.ts
 *
 * Covers the failure surface that matters for a real-money terminal:
 *   - Normal happy path
 *   - Partial fills
 *   - Cancel-after-submit race
 *   - WS fill arrives before REST poll (markFilled on accepted entry)
 *   - WS fill for unknown orderId (silent no-op, no crash)
 *   - markCancelled on submitting entry (no orderId yet — should no-op)
 *   - Prune removes stale entries, keeps recent ones
 *   - All new states: partially_filled, cancel_pending, expired, failed_reconcile
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useOrderLifecycleStore } from "@/stores/orderLifecycleStore";

// Reset Zustand state before every test
beforeEach(() => {
  useOrderLifecycleStore.setState({ orders: {} });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function submit(clientId = "client-1") {
  useOrderLifecycleStore.getState().markSubmitting(clientId, "SOL-PERP", "LONG", 10);
  return clientId;
}

function accept(clientId = "client-1", orderId = 1001) {
  useOrderLifecycleStore.getState().markAccepted(clientId, orderId);
  return orderId;
}

function getEntry(clientId = "client-1") {
  return useOrderLifecycleStore.getState().getByClientId(clientId);
}

function getByOrder(orderId = 1001) {
  return useOrderLifecycleStore.getState().getByOrderId(orderId);
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("happy path: submitting → accepted → filled", () => {
  it("markSubmitting creates entry with status=submitting", () => {
    submit();
    const entry = getEntry();
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("submitting");
    expect(entry!.orderId).toBeNull();
    expect(entry!.filledSize).toBe(0);
    expect(entry!.symbol).toBe("SOL-PERP");
    expect(entry!.side).toBe("LONG");
    expect(entry!.size).toBe(10);
  });

  it("markAccepted updates status and sets orderId", () => {
    submit();
    accept();
    const entry = getEntry();
    expect(entry!.status).toBe("accepted");
    expect(entry!.orderId).toBe(1001);
  });

  it("markFilled transitions from accepted to filled and sets filledSize", () => {
    submit();
    accept();
    useOrderLifecycleStore.getState().markFilled(1001);
    const entry = getEntry();
    expect(entry!.status).toBe("filled");
    expect(entry!.filledSize).toBe(10); // equal to size
  });

  it("getByOrderId finds entry after markAccepted", () => {
    submit();
    accept("client-1", 1001);
    const entry = getByOrder(1001);
    expect(entry).toBeDefined();
    expect(entry!.clientOrderId).toBe("client-1");
  });
});

// ─── Partial fills ────────────────────────────────────────────────────────────

describe("partial fills", () => {
  it("markPartiallyFilled sets status=partially_filled and records filledSize", () => {
    submit();
    accept("client-1", 1001);
    useOrderLifecycleStore.getState().markPartiallyFilled(1001, 4);
    const entry = getEntry();
    expect(entry!.status).toBe("partially_filled");
    expect(entry!.filledSize).toBe(4);
  });

  it("subsequent markFilled after partial fill sets status=filled", () => {
    submit();
    accept("client-1", 1001);
    useOrderLifecycleStore.getState().markPartiallyFilled(1001, 5);
    useOrderLifecycleStore.getState().markFilled(1001);
    const entry = getEntry();
    expect(entry!.status).toBe("filled");
    expect(entry!.filledSize).toBe(10);
  });

  it("multiple partial fills update filledSize each time", () => {
    submit();
    accept("client-1", 1001);
    useOrderLifecycleStore.getState().markPartiallyFilled(1001, 2);
    useOrderLifecycleStore.getState().markPartiallyFilled(1001, 7);
    expect(getEntry()!.filledSize).toBe(7);
  });
});

// ─── Cancel-after-submit race ─────────────────────────────────────────────────

describe("cancel-after-submit race", () => {
  it("markCancelled on accepted entry transitions to cancelled", () => {
    submit();
    accept("client-1", 1001);
    useOrderLifecycleStore.getState().markCancelled(1001);
    expect(getEntry()!.status).toBe("cancelled");
  });

  it("markCancelled with unknown orderId is a silent no-op (no crash, no state change)", () => {
    submit();
    accept("client-1", 1001);
    // Cancel with a different orderId (race: cancel for wrong order)
    useOrderLifecycleStore.getState().markCancelled(9999);
    // Original entry is unaffected
    expect(getEntry()!.status).toBe("accepted");
    const orders = useOrderLifecycleStore.getState().orders;
    expect(Object.keys(orders)).toHaveLength(1);
  });

  it("cancel while still in submitting state (orderId=null) does nothing", () => {
    submit(); // no accept yet — orderId is null
    // Try to cancel by orderId — won't find it since orderId is null
    useOrderLifecycleStore.getState().markCancelled(1001);
    expect(getEntry()!.status).toBe("submitting");
  });

  it("markCancelPending flags an order as cancel_pending before confirmation", () => {
    submit();
    accept("client-1", 1001);
    useOrderLifecycleStore.getState().markCancelPending(1001);
    expect(getEntry()!.status).toBe("cancel_pending");
  });

  it("cancel_pending → cancelled when WS confirms", () => {
    submit();
    accept("client-1", 1001);
    useOrderLifecycleStore.getState().markCancelPending(1001);
    useOrderLifecycleStore.getState().markCancelled(1001);
    expect(getEntry()!.status).toBe("cancelled");
  });
});

// ─── WS fill arrives before REST poll ────────────────────────────────────────

describe("WS fill arrives before REST poll", () => {
  it("markFilled works on an accepted entry (WS faster than REST)", () => {
    submit();
    accept("client-1", 1001);
    // WS fill arrives immediately, before any REST poll
    useOrderLifecycleStore.getState().markFilled(1001);
    expect(getEntry()!.status).toBe("filled");
  });

  it("markFilled for an unknown orderId is a safe no-op", () => {
    // WS fill for an order we never submitted (e.g. fill from another session)
    useOrderLifecycleStore.getState().markFilled(9999);
    expect(Object.keys(useOrderLifecycleStore.getState().orders)).toHaveLength(0);
  });
});

// ─── Rejected ────────────────────────────────────────────────────────────────

describe("rejected", () => {
  it("markRejected on submitting entry transitions to rejected", () => {
    submit("client-rej");
    useOrderLifecycleStore.getState().markRejected("client-rej");
    expect(getEntry("client-rej")!.status).toBe("rejected");
  });

  it("markRejected for unknown clientOrderId is a no-op", () => {
    submit("client-1");
    useOrderLifecycleStore.getState().markRejected("unknown-client");
    expect(getEntry("client-1")!.status).toBe("submitting");
  });
});

// ─── Expired ─────────────────────────────────────────────────────────────────

describe("expired", () => {
  it("markExpired transitions accepted order to expired", () => {
    submit();
    accept("client-1", 1001);
    useOrderLifecycleStore.getState().markExpired(1001);
    expect(getEntry()!.status).toBe("expired");
  });

  it("markExpired for unknown orderId is a no-op", () => {
    submit();
    accept("client-1", 1001);
    useOrderLifecycleStore.getState().markExpired(9999);
    expect(getEntry()!.status).toBe("accepted");
  });
});

// ─── Failed reconcile ─────────────────────────────────────────────────────────

describe("failed_reconcile", () => {
  it("markFailedReconcile transitions to failed_reconcile", () => {
    submit("client-recon");
    accept("client-recon", 1002);
    useOrderLifecycleStore.getState().markFailedReconcile("client-recon");
    expect(getEntry("client-recon")!.status).toBe("failed_reconcile");
  });

  it("markFailedReconcile on unknown clientId is a no-op", () => {
    submit("client-1");
    useOrderLifecycleStore.getState().markFailedReconcile("nobody");
    expect(getEntry("client-1")!.status).toBe("submitting");
  });
});

// ─── Multiple concurrent orders ───────────────────────────────────────────────

describe("multiple concurrent orders", () => {
  it("tracks two orders independently", () => {
    useOrderLifecycleStore.getState().markSubmitting("c1", "SOL-PERP", "LONG",  5);
    useOrderLifecycleStore.getState().markSubmitting("c2", "BTC-PERP", "SHORT", 1);
    useOrderLifecycleStore.getState().markAccepted("c1", 101);
    useOrderLifecycleStore.getState().markAccepted("c2", 102);
    useOrderLifecycleStore.getState().markFilled(101);

    const e1 = useOrderLifecycleStore.getState().getByClientId("c1")!;
    const e2 = useOrderLifecycleStore.getState().getByClientId("c2")!;
    expect(e1.status).toBe("filled");
    expect(e2.status).toBe("accepted");
  });

  it("recentOrders returns newest first", () => {
    const now = Date.now();
    // Seed entries with explicit timestamps so the sort is deterministic
    useOrderLifecycleStore.setState({
      orders: {
        "old": { clientOrderId: "old", orderId: null, symbol: "SOL-PERP", side: "LONG", size: 1, filledSize: 0, status: "submitting", updatedAt: now - 1000 },
        "new": { clientOrderId: "new", orderId: null, symbol: "SOL-PERP", side: "LONG", size: 1, filledSize: 0, status: "submitting", updatedAt: now },
      },
    });
    const recent = useOrderLifecycleStore.getState().recentOrders();
    expect(recent[0].clientOrderId).toBe("new");
  });
});

// ─── Prune ────────────────────────────────────────────────────────────────────

describe("prune", () => {
  it("prune removes entries older than 5 minutes", () => {
    const OLD_MS = Date.now() - 6 * 60 * 1_000; // 6 min ago
    // Manually insert a stale entry
    useOrderLifecycleStore.setState({
      orders: {
        "stale-client": {
          clientOrderId: "stale-client",
          orderId: 999,
          symbol: "SOL-PERP",
          side: "LONG",
          size: 1,
          filledSize: 0,
          status: "filled",
          updatedAt: OLD_MS,
        },
      },
    });
    useOrderLifecycleStore.getState().prune();
    expect(useOrderLifecycleStore.getState().orders["stale-client"]).toBeUndefined();
  });

  it("prune keeps entries newer than 5 minutes", () => {
    submit("fresh");
    accept("fresh", 777);
    useOrderLifecycleStore.getState().prune();
    expect(useOrderLifecycleStore.getState().getByClientId("fresh")).toBeDefined();
  });

  it("prune only removes stale entries, keeps fresh ones", () => {
    const OLD_MS = Date.now() - 6 * 60 * 1_000;
    useOrderLifecycleStore.setState({
      orders: {
        "stale": { clientOrderId: "stale", orderId: 1, symbol: "SOL-PERP", side: "LONG", size: 1, filledSize: 0, status: "filled",    updatedAt: OLD_MS      },
        "fresh": { clientOrderId: "fresh", orderId: 2, symbol: "SOL-PERP", side: "LONG", size: 1, filledSize: 0, status: "accepted", updatedAt: Date.now() },
      },
    });
    useOrderLifecycleStore.getState().prune();
    const orders = useOrderLifecycleStore.getState().orders;
    expect(orders["stale"]).toBeUndefined();
    expect(orders["fresh"]).toBeDefined();
  });
});
