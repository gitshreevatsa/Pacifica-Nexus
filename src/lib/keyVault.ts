/**
 * keyVault.ts — Web Crypto AES-GCM encrypted agent key storage.
 *
 * Security model:
 *  - User provides a passphrase on first import and on each session unlock.
 *  - PBKDF2 (200k iterations, SHA-256) derives an AES-256-GCM key from passphrase + random salt.
 *  - Only { ciphertext, salt, iv } (all base64) are persisted to localStorage.
 *  - The raw private key is NEVER written to localStorage; it lives only in memory.
 *  - An XSS attacker stealing the vault cannot use it without the passphrase.
 *
 * Key lifecycle:
 *  encryptKey  → import or generate → encrypt → saveVault
 *  decryptKey  → on app load (if vault exists) → prompt passphrase → decrypt → hold in memory
 *  deleteVault → user chooses "forget this device" or revokes key
 */

export interface StoredVault {
  ciphertext: string; // base64
  salt:       string; // base64
  iv:         string; // base64
}

const VAULT_KEY      = "pacifica_agent_vault";
const LEGACY_PRIV    = "pacifica_agent_priv";   // old plaintext key (pre-encryption)
const LEGACY_PUB     = "pacifica_agent_pub";
const PBKDF2_ITERS   = 200_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(buf))));
}

/** Returns a Uint8Array backed by a plain ArrayBuffer (required by Web Crypto in TS 5.2+). */
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr as Uint8Array<ArrayBuffer>;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const passphraseBytes = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passphraseBytes.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt a base58 private key with AES-GCM, deriving the encryption key
 * from `passphrase` via PBKDF2. Returns the vault to persist to localStorage.
 */
export async function encryptKey(
  privateKeyB58: string,
  passphrase: string
): Promise<StoredVault> {
  const saltBuf = new ArrayBuffer(32);
  const ivBuf   = new ArrayBuffer(12);
  const salt    = crypto.getRandomValues(new Uint8Array(saltBuf)) as Uint8Array<ArrayBuffer>;
  const iv      = crypto.getRandomValues(new Uint8Array(ivBuf))   as Uint8Array<ArrayBuffer>;
  const aesKey  = await deriveKey(passphrase, salt);
  const rawData = new TextEncoder().encode(privateKeyB58);
  const dataBuf = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength) as ArrayBuffer;
  const cipher  = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, aesKey, dataBuf);
  return {
    ciphertext: toBase64(cipher),
    salt:       toBase64(salt.buffer as ArrayBuffer),
    iv:         toBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt a stored vault with the user's passphrase.
 * Throws "Wrong passphrase or corrupted vault." on failure.
 */
export async function decryptKey(
  vault: StoredVault,
  passphrase: string
): Promise<string> {
  const salt       = fromBase64(vault.salt);
  const iv         = fromBase64(vault.iv);
  const ciphertext = fromBase64(vault.ciphertext);
  const aesKey     = await deriveKey(passphrase, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      aesKey,
      ciphertext.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("Wrong passphrase or corrupted vault.");
  }
}

export function saveVault(vault: StoredVault): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

export function loadVault(): StoredVault | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredVault;
  } catch {
    return null;
  }
}

export function deleteVault(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(VAULT_KEY);
}

export function hasVault(): boolean {
  return loadVault() !== null;
}

/** True if the user has an old pre-encryption plaintext key that needs migration. */
export function hasLegacyPlaintextKey(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(LEGACY_PRIV);
}

/** Wipe the old plaintext key from localStorage — call after migration. */
export function wipeLegacyKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_PRIV);
  localStorage.removeItem(LEGACY_PUB);
}
