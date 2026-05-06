/**
 * Unit tests for src/stores/killSwitchStore.ts
 *
 * Covers:
 *   - assertTradingAllowed throws when halted, passes when not
 *   - haltTrading / resumeTrading state transitions
 *   - haltedAt timestamp is set / cleared correctly
 *   - Multiple halt/resume cycles
 *   - Halt reason is preserved and cleared
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useKillSwitchStore, assertTradingAllowed } from "@/stores/killSwitchStore";

// Reset store to clean state before each test (overrides boot env-var state)
beforeEach(() => {
  useKillSwitchStore.setState({
    tradingHalted: false,
    haltReason:    "",
    haltedAt:      null,
  });
});

// ─── assertTradingAllowed ─────────────────────────────────────────────────────

describe("assertTradingAllowed", () => {
  it("does not throw when trading is not halted", () => {
    expect(() => assertTradingAllowed()).not.toThrow();
  });

  it("throws when trading is halted", () => {
    useKillSwitchStore.getState().haltTrading("Circuit breaker triggered");
    expect(() => assertTradingAllowed()).toThrow("Circuit breaker triggered");
  });

  it("throws with the exact halt reason message", () => {
    const reason = "Abnormal P&L detected: -$50,000";
    useKillSwitchStore.getState().haltTrading(reason);
    expect(() => assertTradingAllowed()).toThrow(reason);
  });

  it("throws with default message when reason is empty string", () => {
    useKillSwitchStore.setState({ tradingHalted: true, haltReason: "", haltedAt: Date.now() });
    expect(() => assertTradingAllowed()).toThrow("Trading is currently halted");
  });

  it("passes again after resumeTrading", () => {
    useKillSwitchStore.getState().haltTrading("reason");
    useKillSwitchStore.getState().resumeTrading();
    expect(() => assertTradingAllowed()).not.toThrow();
  });
});

// ─── haltTrading ──────────────────────────────────────────────────────────────

describe("haltTrading", () => {
  it("sets tradingHalted=true", () => {
    useKillSwitchStore.getState().haltTrading("test");
    expect(useKillSwitchStore.getState().tradingHalted).toBe(true);
  });

  it("stores the halt reason", () => {
    useKillSwitchStore.getState().haltTrading("Margin call imminent");
    expect(useKillSwitchStore.getState().haltReason).toBe("Margin call imminent");
  });

  it("records haltedAt as a recent timestamp", () => {
    const before = Date.now();
    useKillSwitchStore.getState().haltTrading("test");
    const after = Date.now();
    const { haltedAt } = useKillSwitchStore.getState();
    expect(haltedAt).not.toBeNull();
    expect(haltedAt!).toBeGreaterThanOrEqual(before);
    expect(haltedAt!).toBeLessThanOrEqual(after);
  });

  it("overwriting a halt with a new reason updates the reason", () => {
    useKillSwitchStore.getState().haltTrading("first reason");
    useKillSwitchStore.getState().haltTrading("second reason");
    expect(useKillSwitchStore.getState().haltReason).toBe("second reason");
    expect(useKillSwitchStore.getState().tradingHalted).toBe(true);
  });
});

// ─── resumeTrading ────────────────────────────────────────────────────────────

describe("resumeTrading", () => {
  it("clears tradingHalted", () => {
    useKillSwitchStore.getState().haltTrading("reason");
    useKillSwitchStore.getState().resumeTrading();
    expect(useKillSwitchStore.getState().tradingHalted).toBe(false);
  });

  it("clears haltReason", () => {
    useKillSwitchStore.getState().haltTrading("reason");
    useKillSwitchStore.getState().resumeTrading();
    expect(useKillSwitchStore.getState().haltReason).toBe("");
  });

  it("clears haltedAt to null", () => {
    useKillSwitchStore.getState().haltTrading("reason");
    useKillSwitchStore.getState().resumeTrading();
    expect(useKillSwitchStore.getState().haltedAt).toBeNull();
  });

  it("resumeTrading when not halted is a no-op (no throw)", () => {
    expect(() => useKillSwitchStore.getState().resumeTrading()).not.toThrow();
  });
});

// ─── Multiple halt/resume cycles ──────────────────────────────────────────────

describe("multiple halt/resume cycles", () => {
  it("can halt → resume → halt again", () => {
    const store = useKillSwitchStore.getState();
    store.haltTrading("first halt");
    expect(useKillSwitchStore.getState().tradingHalted).toBe(true);

    useKillSwitchStore.getState().resumeTrading();
    expect(useKillSwitchStore.getState().tradingHalted).toBe(false);

    useKillSwitchStore.getState().haltTrading("second halt");
    expect(useKillSwitchStore.getState().tradingHalted).toBe(true);
    expect(useKillSwitchStore.getState().haltReason).toBe("second halt");
  });

  it("assertTradingAllowed respects each state transition", () => {
    expect(() => assertTradingAllowed()).not.toThrow();

    useKillSwitchStore.getState().haltTrading("halt 1");
    expect(() => assertTradingAllowed()).toThrow();

    useKillSwitchStore.getState().resumeTrading();
    expect(() => assertTradingAllowed()).not.toThrow();

    useKillSwitchStore.getState().haltTrading("halt 2");
    expect(() => assertTradingAllowed()).toThrow("halt 2");
  });
});

// ─── Kill switch during simulated order flow ───────────────────────────────────

describe("kill switch active during order flow simulation", () => {
  it("simulates openMutation being blocked by active kill switch", () => {
    // Simulate what usePacifica openMutation does: call assertTradingAllowed() first
    useKillSwitchStore.getState().haltTrading("Exchange maintenance");

    const simulateOpenOrder = () => {
      assertTradingAllowed(); // this is the gate in usePacifica
      // If we reach here, the order would be placed — but we should not
      return "order placed";
    };

    expect(simulateOpenOrder).toThrow("Exchange maintenance");
  });

  it("simulates closeMutation being blocked by active kill switch", () => {
    useKillSwitchStore.getState().haltTrading("Risk limit exceeded");

    const simulateCloseOrder = () => {
      assertTradingAllowed();
      return "order closed";
    };

    expect(simulateCloseOrder).toThrow("Risk limit exceeded");
  });

  it("order mutations succeed after kill switch is lifted", () => {
    useKillSwitchStore.getState().haltTrading("Temporary halt");
    useKillSwitchStore.getState().resumeTrading();

    const simulateOrder = () => {
      assertTradingAllowed();
      return "order placed";
    };

    expect(simulateOrder()).toBe("order placed");
  });
});
