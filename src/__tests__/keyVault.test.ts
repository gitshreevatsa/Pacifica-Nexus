/**
 * Unit tests for src/lib/keyVault.ts and src/lib/signing.ts (key import edge cases).
 *
 * Web Crypto (AES-GCM, PBKDF2) is available natively in Node 18+.
 * localStorage is mocked below — keyVault guards against server-side rendering
 * with `typeof window === "undefined"` checks.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptKey,
  decryptKey,
  saveVault,
  loadVault,
  deleteVault,
  hasVault,
  hasLegacyPlaintextKey,
  wipeLegacyKey,
  type StoredVault,
} from "@/lib/keyVault";
import { generateAgentKeypair, importAgentKey } from "@/lib/signing";

// ─── localStorage mock ────────────────────────────────────────────────────────

const store: Record<string, string> = {};

const mockLocalStorage = {
  getItem:    (key: string) => store[key] ?? null,
  setItem:    (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
  clear:      () => { Object.keys(store).forEach((k) => delete store[k]); },
};

// Expose `window` and `localStorage` so keyVault's SSR guards don't short-circuit
Object.defineProperty(globalThis, "window",       { value: globalThis, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: mockLocalStorage, writable: true });

beforeEach(() => mockLocalStorage.clear());

// ─── generateAgentKeypair ─────────────────────────────────────────────────────

describe("generateAgentKeypair", () => {
  it("returns a non-empty publicKey and privateKey", () => {
    const kp = generateAgentKeypair();
    expect(kp.publicKey).toBeTruthy();
    expect(kp.privateKey).toBeTruthy();
  });

  it("private key decodes to 64 bytes (Ed25519 seed+pubkey)", async () => {
    const { privateKey } = generateAgentKeypair();
    const { default: bs58 } = await import("bs58");
    expect(bs58.decode(privateKey).length).toBe(64);
  });

  it("public key decodes to 32 bytes", async () => {
    const { publicKey } = generateAgentKeypair();
    const { default: bs58 } = await import("bs58");
    expect(bs58.decode(publicKey).length).toBe(32);
  });

  it("each call produces a unique keypair", () => {
    const kp1 = generateAgentKeypair();
    const kp2 = generateAgentKeypair();
    expect(kp1.privateKey).not.toBe(kp2.privateKey);
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });
});

// ─── importAgentKey ───────────────────────────────────────────────────────────

describe("importAgentKey", () => {
  it("round-trips: generated key can be re-imported and gives same public key", () => {
    const original = generateAgentKeypair();
    const imported  = importAgentKey(original.privateKey);
    expect(imported.publicKey).toBe(original.publicKey);
    expect(imported.privateKey).toBe(original.privateKey);
  });

  it("accepts a 64-byte (full) private key", () => {
    const kp = generateAgentKeypair();
    expect(() => importAgentKey(kp.privateKey)).not.toThrow();
  });

  it("throws for an invalid base58 string", () => {
    expect(() => importAgentKey("not-valid-base58!!!")).toThrow();
  });

  it("throws for a key with wrong byte length (e.g. 16 bytes)", async () => {
    const bs58Module = await import("bs58");
    const bs58 = bs58Module.default;
    const shortKey = bs58.encode(new Uint8Array(16));
    expect(() => importAgentKey(shortKey)).toThrow(/Invalid key length/);
  });

  it("throws for empty string", () => {
    expect(() => importAgentKey("")).toThrow();
  });

  it("trims leading/trailing whitespace before decoding", () => {
    const kp = generateAgentKeypair();
    expect(() => importAgentKey(`  ${kp.privateKey}  `)).not.toThrow();
  });
});

// ─── encryptKey / decryptKey ──────────────────────────────────────────────────

describe("encryptKey + decryptKey", () => {
  it("round-trip: encrypt then decrypt returns the original key", async () => {
    const { privateKey } = generateAgentKeypair();
    const passphrase = "correct-horse-battery-staple";
    const vault = await encryptKey(privateKey, passphrase);
    const recovered = await decryptKey(vault, passphrase);
    expect(recovered).toBe(privateKey);
  });

  it("vault contains ciphertext, salt, iv fields (all base64 strings)", async () => {
    const { privateKey } = generateAgentKeypair();
    const vault = await encryptKey(privateKey, "pw");
    expect(typeof vault.ciphertext).toBe("string");
    expect(typeof vault.salt).toBe("string");
    expect(typeof vault.iv).toBe("string");
    // All must be valid base64
    expect(() => atob(vault.ciphertext)).not.toThrow();
    expect(() => atob(vault.salt)).not.toThrow();
    expect(() => atob(vault.iv)).not.toThrow();
  });

  it("each encryption produces a different ciphertext (random salt+iv)", async () => {
    const { privateKey } = generateAgentKeypair();
    const v1 = await encryptKey(privateKey, "pw");
    const v2 = await encryptKey(privateKey, "pw");
    expect(v1.ciphertext).not.toBe(v2.ciphertext);
    expect(v1.salt).not.toBe(v2.salt);
    expect(v1.iv).not.toBe(v2.iv);
  });

  it("decryptKey throws on wrong passphrase", async () => {
    const { privateKey } = generateAgentKeypair();
    const vault = await encryptKey(privateKey, "correct-pw");
    await expect(decryptKey(vault, "wrong-pw")).rejects.toThrow(
      /Wrong passphrase or corrupted vault/
    );
  });

  it("decryptKey throws on empty passphrase when encrypted with non-empty", async () => {
    const { privateKey } = generateAgentKeypair();
    const vault = await encryptKey(privateKey, "secret");
    await expect(decryptKey(vault, "")).rejects.toThrow();
  });

  it("decryptKey throws when ciphertext is tampered", async () => {
    const { privateKey } = generateAgentKeypair();
    const vault = await encryptKey(privateKey, "pw");
    // Flip one byte by replacing last char
    const tampered: StoredVault = {
      ...vault,
      ciphertext: vault.ciphertext.slice(0, -4) + "AAAA",
    };
    await expect(decryptKey(tampered, "pw")).rejects.toThrow();
  });

  it("works with a unicode passphrase", async () => {
    const { privateKey } = generateAgentKeypair();
    const passphrase = "passw0rd-🔐-日本語";
    const vault = await encryptKey(privateKey, passphrase);
    const recovered = await decryptKey(vault, passphrase);
    expect(recovered).toBe(privateKey);
  });

  it("works with a very long passphrase (1000 chars)", async () => {
    const { privateKey } = generateAgentKeypair();
    const passphrase = "x".repeat(1000);
    const vault = await encryptKey(privateKey, passphrase);
    const recovered = await decryptKey(vault, passphrase);
    expect(recovered).toBe(privateKey);
  });
});

// ─── saveVault / loadVault / deleteVault / hasVault ───────────────────────────

describe("localStorage vault helpers", () => {
  it("saveVault + loadVault round-trips the vault object", async () => {
    const { privateKey } = generateAgentKeypair();
    const vault = await encryptKey(privateKey, "pw");
    saveVault(vault);
    expect(loadVault()).toEqual(vault);
  });

  it("loadVault returns null when nothing is stored", () => {
    expect(loadVault()).toBeNull();
  });

  it("hasVault returns false when empty, true after save", async () => {
    expect(hasVault()).toBe(false);
    const { privateKey } = generateAgentKeypair();
    const vault = await encryptKey(privateKey, "pw");
    saveVault(vault);
    expect(hasVault()).toBe(true);
  });

  it("deleteVault removes the vault", async () => {
    const { privateKey } = generateAgentKeypair();
    saveVault(await encryptKey(privateKey, "pw"));
    expect(hasVault()).toBe(true);
    deleteVault();
    expect(hasVault()).toBe(false);
    expect(loadVault()).toBeNull();
  });

  it("loadVault returns null for invalid JSON in storage", () => {
    store["pacifica_agent_vault"] = "{ broken json [[[";
    expect(loadVault()).toBeNull();
  });
});

// ─── Legacy key detection and wipe ───────────────────────────────────────────

describe("hasLegacyPlaintextKey / wipeLegacyKey", () => {
  it("returns false when no legacy key is present", () => {
    expect(hasLegacyPlaintextKey()).toBe(false);
  });

  it("returns true when legacy key exists in localStorage", () => {
    store["pacifica_agent_priv"] = "some-plaintext-key";
    expect(hasLegacyPlaintextKey()).toBe(true);
  });

  it("wipeLegacyKey removes both legacy priv and pub keys", () => {
    store["pacifica_agent_priv"] = "priv";
    store["pacifica_agent_pub"]  = "pub";
    wipeLegacyKey();
    expect(store["pacifica_agent_priv"]).toBeUndefined();
    expect(store["pacifica_agent_pub"]).toBeUndefined();
    expect(hasLegacyPlaintextKey()).toBe(false);
  });

  it("wipeLegacyKey is a no-op when no legacy keys exist", () => {
    expect(() => wipeLegacyKey()).not.toThrow();
  });
});
