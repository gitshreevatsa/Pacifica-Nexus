/**
 * signing.ts
 * Pacifica Ed25519 request signing — matches the official docs exactly.
 *
 * Signing structure (from docs Step 4):
 *  {
 *    "timestamp": <ms>,
 *    "expiry_window": 30000,
 *    "type": "<operation_type>",
 *    "data": { ...operation_fields }   ← nested under "data"
 *  }
 *
 * Final request body (from docs Step 8) — data fields are FLATTENED out:
 *  {
 *    "account": "<main_wallet_pubkey>",
 *    "agent_wallet": "<agent_pubkey | null>",
 *    "signature": "<base58_sig>",
 *    "timestamp": <ms>,
 *    "expiry_window": 30000,
 *    ...operation_fields (NOT wrapped in "data")
 *  }
 */

import nacl from "tweetnacl";
import bs58 from "bs58";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const AGENT_PRIV_KEY = "pacifica_agent_priv";
const AGENT_PUB_KEY  = "pacifica_agent_pub";

// ─── Recursive key sorter (alphabetical, all depths) ─────────────────────────

function recursiveSort(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(recursiveSort);
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(val as object).sort()) {
      out[k] = recursiveSort((val as Record<string, unknown>)[k]);
    }
    return out;
  }
  return val;
}

// ─── Compact JSON (no whitespace) ─────────────────────────────────────────────

export function compact(val: unknown): string {
  return JSON.stringify(recursiveSort(val));
}

// ─── Core sign ───────────────────────────────────────────────────────────────

/**
 * Sign an arbitrary string with a base58 Ed25519 private key.
 * Returns a base58-encoded signature.
 */
export function signMessage(message: string, agentPrivKeyB58: string): string {
  const secretKey   = bs58.decode(agentPrivKeyB58);
  const msgBytes    = new TextEncoder().encode(message);
  const signature   = nacl.sign.detached(msgBytes, secretKey);
  return bs58.encode(signature);
}

// ─── Signed request builder ───────────────────────────────────────────────────

export interface SignedBody {
  account: string;
  agent_wallet: string | null;
  signature: string;
  timestamp: number;
  expiry_window: number;
  [key: string]: unknown;
}

/**
 * Builds a fully signed POST body for any Pacifica endpoint.
 *
 * Step-by-step (mirrors official docs):
 *  1. Stamp timestamp + expiry_window
 *  2. Wrap operation fields under "data" key
 *  3. Merge with { type, timestamp, expiry_window }
 *  4. Recursively sort all keys
 *  5. Compact JSON → UTF-8 bytes → Ed25519 sign → base58 encode
 *  6. Return FLATTENED body: { account, agent_wallet, signature, timestamp,
 *     expiry_window, ...operation_fields }   (no "data" wrapper)
 */
export function buildSignedBody(
  type: string,
  operationData: Record<string, unknown>,
  mainWalletAddress: string,
  agentPrivKeyB58: string,
  agentPubKeyB58: string | null,
  expiryWindow = 30_000
): SignedBody {
  const timestamp = Date.now();

  // Message to sign — data lives under "data" key
  const toSign = compact({
    type,
    timestamp,
    expiry_window: expiryWindow,
    data: operationData,
  });

  const signature = signMessage(toSign, agentPrivKeyB58);

  // Final body — operation fields are FLATTENED (not wrapped in "data")
  return {
    account:        mainWalletAddress,
    agent_wallet:   agentPubKeyB58,      // null when main wallet signs
    signature,
    timestamp,
    expiry_window:  expiryWindow,
    ...operationData,
  };
}

// ─── Agent keypair management ─────────────────────────────────────────────────

export interface AgentKeypair {
  publicKey:  string;   // base58, 32 bytes
  privateKey: string;   // base58, 64 bytes (seed + pubkey)
}

/** Generate a fresh Ed25519 agent keypair in-browser. */
export function generateAgentKeypair(): AgentKeypair {
  const kp = nacl.sign.keyPair();
  return {
    publicKey:  bs58.encode(kp.publicKey),
    privateKey: bs58.encode(kp.secretKey),
  };
}

/**
 * Import a base58 private key from app.pacifica.fi/apikey.
 * Accepts 32-byte (seed only) or 64-byte (full keypair) inputs.
 */
export function importAgentKey(base58PrivKey: string): AgentKeypair {
  const decoded = bs58.decode(base58PrivKey.trim());
  let secretKey: Uint8Array;

  if (decoded.length === 32) {
    secretKey = nacl.sign.keyPair.fromSeed(decoded).secretKey;
  } else if (decoded.length === 64) {
    secretKey = decoded;
  } else {
    throw new Error(`Invalid key length ${decoded.length}. Expected 32 or 64 bytes.`);
  }

  return {
    publicKey:  bs58.encode(secretKey.slice(32)),
    privateKey: bs58.encode(secretKey),
  };
}

export function storeAgentKeypair(kp: AgentKeypair): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AGENT_PRIV_KEY, kp.privateKey);
  sessionStorage.setItem(AGENT_PUB_KEY,  kp.publicKey);
}

export function loadAgentKeypair(): AgentKeypair | null {
  if (typeof window === "undefined") return null;
  const priv = sessionStorage.getItem(AGENT_PRIV_KEY);
  const pub  = sessionStorage.getItem(AGENT_PUB_KEY);
  return priv && pub ? { privateKey: priv, publicKey: pub } : null;
}

export function clearAgentKeypair(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(AGENT_PRIV_KEY);
  sessionStorage.removeItem(AGENT_PUB_KEY);
}
