/**
 * Unit tests for src/lib/featureFlags.ts
 *
 * Covers: default flag values, env-var overrides (true/false/1/0),
 * case-insensitivity, unknown env values fall back to default, isEnabled().
 *
 * Each test temporarily sets process.env to simulate the env var being present,
 * then re-imports the module fresh via vi.resetModules().
 */

import { describe, it, expect, afterEach, vi } from "vitest";

// Cache to restore env after each test
const originalEnv = { ...process.env };

afterEach(() => {
  // Restore env and reset module registry so the next test gets a fresh import
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_FF_")) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
  vi.resetModules();
});

async function importFlags() {
  const mod = await import("@/lib/featureFlags");
  return mod;
}

// ─── Default flag values ──────────────────────────────────────────────────────

describe("default flag values", () => {
  it("arbScanner is true by default", async () => {
    const { flags } = await importFlags();
    expect(flags.arbScanner).toBe(true);
  });

  it("trailingStop is true by default", async () => {
    const { flags } = await importFlags();
    expect(flags.trailingStop).toBe(true);
  });

  it("fundingAlerts is true by default", async () => {
    const { flags } = await importFlags();
    expect(flags.fundingAlerts).toBe(true);
  });

  it("riskGuard is true by default", async () => {
    const { flags } = await importFlags();
    expect(flags.riskGuard).toBe(true);
  });

  it("tpSl is true by default", async () => {
    const { flags } = await importFlags();
    expect(flags.tpSl).toBe(true);
  });

  it("autoCompound is false by default (not yet built)", async () => {
    const { flags } = await importFlags();
    expect(flags.autoCompound).toBe(false);
  });

  it("all flags are booleans", async () => {
    const { flags } = await importFlags();
    for (const val of Object.values(flags)) {
      expect(typeof val).toBe("boolean");
    }
  });
});

// ─── Env-var overrides ────────────────────────────────────────────────────────

describe("env-var overrides", () => {
  it("NEXT_PUBLIC_FF_AUTCOMPOUND=true overrides the default to true", async () => {
    process.env.NEXT_PUBLIC_FF_AUTOCOMPOUND = "true";
    vi.resetModules();
    const { flags } = await importFlags();
    expect(flags.autoCompound).toBe(true);
  });

  it('"1" is treated as true', async () => {
    process.env.NEXT_PUBLIC_FF_AUTOCOMPOUND = "1";
    vi.resetModules();
    const { flags } = await importFlags();
    expect(flags.autoCompound).toBe(true);
  });

  it('"false" overrides a true default to false', async () => {
    process.env.NEXT_PUBLIC_FF_ARBSCANNER = "false";
    vi.resetModules();
    const { flags } = await importFlags();
    expect(flags.arbScanner).toBe(false);
  });

  it('"0" overrides a true default to false', async () => {
    process.env.NEXT_PUBLIC_FF_TRAILINGSTOP = "0";
    vi.resetModules();
    const { flags } = await importFlags();
    expect(flags.trailingStop).toBe(false);
  });

  it('"TRUE" (uppercase) is treated as true', async () => {
    process.env.NEXT_PUBLIC_FF_AUTOCOMPOUND = "TRUE";
    vi.resetModules();
    const { flags } = await importFlags();
    expect(flags.autoCompound).toBe(true);
  });

  it("empty string env var falls back to default", async () => {
    process.env.NEXT_PUBLIC_FF_AUTOCOMPOUND = "";
    vi.resetModules();
    const { flags } = await importFlags();
    expect(flags.autoCompound).toBe(false); // default
  });

  it("unrecognised value (e.g. 'yes') falls back to false since it is not '1'/'true'", async () => {
    process.env.NEXT_PUBLIC_FF_AUTOCOMPOUND = "yes";
    vi.resetModules();
    const { flags } = await importFlags();
    // "yes" is neither "1" nor "true" (case-insensitive), so readEnvFlag returns false
    expect(flags.autoCompound).toBe(false);
  });
});

// ─── isEnabled ────────────────────────────────────────────────────────────────

describe("isEnabled()", () => {
  it("returns true for a flag that is on by default", async () => {
    const { isEnabled } = await importFlags();
    expect(isEnabled("arbScanner")).toBe(true);
  });

  it("returns false for autoCompound (off by default)", async () => {
    const { isEnabled } = await importFlags();
    expect(isEnabled("autoCompound")).toBe(false);
  });

  it("returns the same value as flags[flagName]", async () => {
    const { flags, isEnabled } = await importFlags();
    for (const key of Object.keys(flags) as Array<keyof typeof flags>) {
      expect(isEnabled(key)).toBe(flags[key]);
    }
  });
});
