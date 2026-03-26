/**
 * privy.ts
 * Privy configuration for Pacifica Nexus.
 * Enables Embedded Wallets + Managed Sub-accounts for one-click trading.
 */

import type { PrivyClientConfig } from "@privy-io/react-auth";

// ─── App ID ───────────────────────────────────────────────────────────────────

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

if (!PRIVY_APP_ID && typeof window !== "undefined") {
  console.warn("[Privy] NEXT_PUBLIC_PRIVY_APP_ID is not set. Auth will not work.");
}

// ─── Privy Config ─────────────────────────────────────────────────────────────

export const privyConfig: PrivyClientConfig = {
  // ── Appearance ─────────────────────────────────────────────────────────────
  appearance: {
    theme: "dark",
    accentColor: "#0062FF",      // Electric blue brand color
    logo: "/logo.svg",
    landingHeader: "Pacifica Nexus",
    loginMessage: "Connect to access the alpha terminal.",
    walletChainType: "ethereum-and-solana",
    showWalletLoginFirst: true,
  },

  // ── Login Methods ──────────────────────────────────────────────────────────
  loginMethods: ["email", "wallet", "google", "twitter"],

  // ── Embedded Wallets ───────────────────────────────────────────────────────
  // Creates a non-custodial Solana embedded wallet per user on first login.
  embeddedWallets: {
    createOnLogin: "all-users",  // auto-create for every user
    requireUserPasswordOnCreate: false,
    noPromptOnSignature: true,   // enable one-click signing (session key flow)
  },

  // ── MFA ────────────────────────────────────────────────────────────────────
  mfa: {
    noPromptOnMfaRequired: false,
  },

  // ── Solana Cluster ─────────────────────────────────────────────────────────
  solanaClusters: [
    {
      name: "mainnet-beta",
      rpcUrl: process.env.PACIFICA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    },
  ],
};

// ─── Session Key Utilities ────────────────────────────────────────────────────

export const SESSION_KEY_STORAGE = "pacifica_session_key";
export const SESSION_EXPIRY_STORAGE = "pacifica_session_expiry";
export const SUBACCOUNT_STORAGE = "pacifica_subaccount";

/** Duration of session keys in milliseconds (24 hours). */
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export function storeSessionKey(key: string, expiresAt: number) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY_STORAGE, key);
  sessionStorage.setItem(SESSION_EXPIRY_STORAGE, String(expiresAt));
}

export function getStoredSessionKey(): { key: string; expiresAt: number } | null {
  if (typeof window === "undefined") return null;
  const key = sessionStorage.getItem(SESSION_KEY_STORAGE);
  const expiresAt = Number(sessionStorage.getItem(SESSION_EXPIRY_STORAGE));
  if (!key || !expiresAt || Date.now() > expiresAt) {
    clearSessionKey();
    return null;
  }
  return { key, expiresAt };
}

export function clearSessionKey() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY_STORAGE);
  sessionStorage.removeItem(SESSION_EXPIRY_STORAGE);
}

export function storeSubAccount(address: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SUBACCOUNT_STORAGE, address);
}

export function getStoredSubAccount(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SUBACCOUNT_STORAGE);
}
