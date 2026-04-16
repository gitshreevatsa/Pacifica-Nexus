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

