"use client";

/**
 * SolanaWalletProvider.tsx
 * Wraps the Solana Wallet Adapter alongside Privy.
 * Supports: Phantom, Solflare, MetaMask (native Solana v13.5+ / Drift Snap).
 */

import { type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

const RPC = "https://api.mainnet-beta.solana.com";

// Wrappers to satisfy React 19 JSX type constraints
function ConnProvider({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CP = ConnectionProvider as any;
  return <CP endpoint={RPC}>{children}</CP>;
}

function WalletProv({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WP = WalletProvider as any;
  // wallets={[]} — Phantom, Solflare, and MetaMask v13.5+ all register via
  // Wallet Standard automatically. Passing explicit adapters causes duplicates.
  return <WP wallets={[]} autoConnect onError={(e: Error) => console.warn("[WalletAdapter]", e)}>{children}</WP>;
}

function ModalProv({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MP = WalletModalProvider as any;
  return <MP>{children}</MP>;
}

export default function SolanaWalletProvider({ children }: { children: ReactNode }) {
  return (
    <ConnProvider>
      <WalletProv>
        <ModalProv>{children}</ModalProv>
      </WalletProv>
    </ConnProvider>
  );
}
