/**
 * usePacifica.ts
 * Core trading hook.
 *
 * Auth flow:
 *  1. Privy login → gets embedded Solana wallet address ("account")
 *  2. User creates an agent key at app.pacifica.fi/apikey → pastes into terminal
 *  3. Terminal checks builder code approval (POINTPULSE) → prompts once if missing
 *  4. All subsequent orders fire silently — one click, no popups
 */

"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { getPacificaClient } from "@/lib/pacifica-client";
import {
  importAgentKey,
  generateAgentKeypair,
  storeAgentKeypair,
  loadAgentKeypair,
  clearAgentKeypair,
  type AgentKeypair,
} from "@/lib/signing";
import type { Position, PacificaOrder, AccountHealth, Market } from "@/types";
import { useTradeLogStore } from "@/stores/tradeLogStore";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const QK = {
  markets:       ["pacifica", "markets"] as const,
  positions:     (addr: string) => ["pacifica", "positions", addr] as const,
  orders:        (addr: string) => ["pacifica", "orders", addr] as const,
  health:        (addr: string) => ["pacifica", "health", addr] as const,
  builderApproved: (addr: string) => ["pacifica", "builderApproved", addr] as const,
};

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface UsePacificaReturn {
  // Auth
  walletAddress:    string | null;
  agentPublicKey:   string | null;
  hasAgent:         boolean;   // key stored AND Solana wallet connected
  keyStored:        boolean;   // key stored (wallet may not be connected yet)
  isAuthenticated:  boolean;

  // Agent key registration
  agentKeyRegistered:       boolean;
  isCheckingAgentKey:       boolean;
  registerAgentKey:         () => Promise<void>;
  isRegisteringAgentKey:    boolean;

  // Builder Program
  builderApproved:         boolean;
  isCheckingApproval:      boolean;
  approveBuilderCode:      () => Promise<void>;
  isApprovingBuilderCode:  boolean;

  // Data
  markets:       Market[];
  positions:     Position[];
  openOrders:    PacificaOrder[];
  accountHealth: AccountHealth | undefined;
  markPrices:    Record<string, number>;

  // Loading
  isLoading:        boolean;
  isMarketsLoading: boolean;

  // Agent key management
  importKey:                (b58: string) => void;
  generateAndStoreAgentKey: () => AgentKeypair;
  clearAgent:               () => void;

  // Trading
  openPosition:   (p: OpenPositionParams) => Promise<{ order_id: number }>;
  closePosition:  (p: ClosePositionParams) => Promise<{ order_id: number }>;
  deRisk25Pct:    (position: Position) => Promise<{ order_id: number }>;
  cancelOrder:    (symbol: string, orderId: number) => Promise<{ success: boolean }>;
}

export interface OpenPositionParams {
  symbol:     string;
  side:       "LONG" | "SHORT";
  size:       number;
  price?:     number;
  orderType?: "market" | "limit";
  slippage?:  string;
  tpPrice?:   number;
  slPrice?:   number;
}

export interface ClosePositionParams {
  symbol:      string;
  side:        "LONG" | "SHORT";
  currentSize: number;
  size?:       number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePacifica(): UsePacificaReturn {
  const { authenticated } = usePrivy();
  const queryClient       = useQueryClient();
  // Solana Wallet Adapter — MetaMask (native Solana), Phantom, Solflare, …
  const { publicKey: adapterPublicKey, signMessage: adapterSignMessage } = useWallet();

  // ── Wallet address ─────────────────────────────────────────────────────────
  const walletAddress = useMemo(() => {
    return adapterPublicKey?.toBase58() ?? null;
  }, [adapterPublicKey]);

  // ── Agent key state ────────────────────────────────────────────────────────
  const [agentPublicKey, setAgentPublicKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return loadAgentKeypair()?.publicKey ?? null;
  });

  // Sync client on mount or when walletAddress changes
  const client = useMemo(() => {
    const c = getPacificaClient();
    if (walletAddress) c.setMainWallet(walletAddress);
    const stored = loadAgentKeypair();
    if (stored) c.setAgentKeypair(stored);
    return c;
  }, [walletAddress]);

  // hasAgent = key stored + Solana wallet connected (required for actual trading)
  const hasAgent = !!agentPublicKey && !!walletAddress;
  // keyStored = key is in sessionStorage regardless of wallet state (for badge display)
  const keyStored = !!agentPublicKey;

  // ── Markets ────────────────────────────────────────────────────────────────
  const { data: markets = [], isLoading: isMarketsLoading } = useQuery<Market[]>({
    queryKey: QK.markets,
    queryFn:  () => client.getMarkets(),
    refetchInterval: 3_000,
    staleTime:       2_000,
    enabled:  true,
  });

  const markPrices = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.symbol, m.markPrice])),
    [markets]
  );

  // ── Positions ──────────────────────────────────────────────────────────────
  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: QK.positions(walletAddress ?? ""),
    queryFn:  () => client.getPositions(markPrices),
    refetchInterval: 3_000,
    staleTime:       2_000,
    enabled:  !!walletAddress,
  });

  // ── Open orders ────────────────────────────────────────────────────────────
  const { data: openOrders = [] } = useQuery<PacificaOrder[]>({
    queryKey: QK.orders(walletAddress ?? ""),
    queryFn:  () => client.getOpenOrders(),
    refetchInterval: 3_000,
    staleTime:       2_000,
    enabled:  !!walletAddress,
  });

  // ── Account health ─────────────────────────────────────────────────────────
  const { data: accountHealth, isLoading: isHealthLoading } = useQuery<AccountHealth>({
    queryKey: QK.health(walletAddress ?? ""),
    queryFn:  () => client.getAccount(),
    refetchInterval: 5_000,
    staleTime:       3_000,
    enabled:  !!walletAddress,
  });

  // ── Agent key registration ─────────────────────────────────────────────────
  // isAgentKeyRegistered is synchronous (sessionStorage check), so we use
  // a regular query with a short staleTime to re-check when wallet/key changes.
  const { data: agentKeyRegistered = false, isLoading: isCheckingAgentKey } = useQuery<boolean>({
    queryKey: ["pacifica", "agentKeyRegistered", walletAddress ?? "", agentPublicKey ?? ""],
    queryFn:  () => Promise.resolve(client.isAgentKeyRegistered()),
    staleTime:       Infinity,   // sessionStorage doesn't change unless we write it
    enabled:  !!walletAddress && !!agentPublicKey,
  });

  const registerAgentKeyMutation = useMutation({
    mutationFn: () => {
      if (!adapterSignMessage) throw new Error("Wallet does not support signMessage");
      return client.registerAgentKey(adapterSignMessage);
    },
    onSuccess: () => {
      queryClient.setQueryData(
        ["pacifica", "agentKeyRegistered", walletAddress ?? "", agentPublicKey ?? ""],
        true
      );
    },
  });

  const registerAgentKey = useCallback(async () => {
    await registerAgentKeyMutation.mutateAsync();
  }, [registerAgentKeyMutation]);

  // ── Builder code approval ──────────────────────────────────────────────────
  const { data: builderApproved = false, isLoading: isCheckingApproval } = useQuery<boolean>({
    queryKey: QK.builderApproved(walletAddress ?? ""),
    queryFn:  () => client.hasApprovedBuilderCode(),
    staleTime:       60_000,  // re-check every minute
    refetchInterval: 60_000,
    enabled:  !!walletAddress,
  });

  const approveBuilderMutation = useMutation({
    mutationFn: () => {
      if (!adapterSignMessage) throw new Error("Wallet does not support signMessage");
      return client.approveBuilderCode(adapterSignMessage);
    },
    onSuccess:  () => {
      if (walletAddress) {
        queryClient.setQueryData(QK.builderApproved(walletAddress), true);
      }
    },
  });

  const approveBuilderCode = useCallback(async () => {
    await approveBuilderMutation.mutateAsync();
  }, [approveBuilderMutation]);

  const isLoading = isMarketsLoading || isHealthLoading;

  // ── Invalidate after trading mutations ─────────────────────────────────────
  const invalidateTrades = useCallback(() => {
    if (!walletAddress) return;
    queryClient.invalidateQueries({ queryKey: QK.positions(walletAddress) });
    queryClient.invalidateQueries({ queryKey: QK.orders(walletAddress) });
    queryClient.invalidateQueries({ queryKey: QK.health(walletAddress) });
  }, [queryClient, walletAddress]);

  // ── Trade mutations ────────────────────────────────────────────────────────
  const openMutation = useMutation({
    mutationFn: async (p: OpenPositionParams) => {
      // Main order — market or limit
      const result = p.orderType === "limit"
        ? await client.createLimitOrder({ symbol: p.symbol, side: p.side, size: p.size, price: p.price })
        : await client.createMarketOrder({ symbol: p.symbol, side: p.side, size: p.size, slippage: p.slippage });

      // Bracket orders: TP and SL as reduce-only limit orders on the opposite side
      const oppSide = p.side === "LONG" ? "SHORT" : "LONG";
      if (p.tpPrice && p.tpPrice > 0) {
        try {
          await client.createLimitOrder({ symbol: p.symbol, side: oppSide, size: p.size, price: p.tpPrice, reduceOnly: true });
        } catch (e) { console.warn("[Nexus] TP order failed:", e); }
      }
      if (p.slPrice && p.slPrice > 0) {
        try {
          await client.createLimitOrder({ symbol: p.symbol, side: oppSide, size: p.size, price: p.slPrice, reduceOnly: true });
        } catch (e) { console.warn("[Nexus] SL order failed:", e); }
      }
      return result;
    },
    onSuccess: (result, p) => {
      invalidateTrades();
      const price = markPrices[p.symbol] ?? 0;
      useTradeLogStore.getState().addEntry({
        symbol: p.symbol,
        side: p.side,
        size: p.size,
        price,
        notional: p.size * price,
        type: "OPEN",
        timestamp: Date.now(),
        orderId: result.order_id,
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (p: ClosePositionParams) =>
      client.closePosition(p.symbol, p.side, p.size ?? p.currentSize),
    onSuccess: (result, p) => {
      invalidateTrades();
      const price = markPrices[p.symbol] ?? 0;
      const size = p.size ?? p.currentSize;
      useTradeLogStore.getState().addEntry({
        symbol: p.symbol,
        side: p.side,
        size,
        price,
        notional: size * price,
        type: p.size && p.size < p.currentSize ? "DE-RISK" : "CLOSE",
        timestamp: Date.now(),
        orderId: result.order_id,
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ symbol, orderId }: { symbol: string; orderId: number }) =>
      client.cancelOrder(symbol, orderId),
    onSuccess: invalidateTrades,
  });

  // ── Agent key management ───────────────────────────────────────────────────

  const handleImportKey = useCallback((b58: string) => {
    const kp = importAgentKey(b58);
    storeAgentKeypair(kp);
    client.setAgentKeypair(kp);
    setAgentPublicKey(kp.publicKey);
  }, [client]);

  const handleGenerateKey = useCallback((): AgentKeypair => {
    const kp = generateAgentKeypair();
    storeAgentKeypair(kp);
    client.setAgentKeypair(kp);
    setAgentPublicKey(kp.publicKey);
    return kp;
  }, [client]);

  const handleClearAgent = useCallback(() => {
    clearAgentKeypair();
    client.clearAgentKeypair();
    setAgentPublicKey(null);
  }, [client]);

  // ── Trading actions ────────────────────────────────────────────────────────

  const openPosition = useCallback(
    (p: OpenPositionParams) => openMutation.mutateAsync(p),
    [openMutation]
  );

  const closePosition = useCallback(
    (p: ClosePositionParams) => closeMutation.mutateAsync(p),
    [closeMutation]
  );

  const deRisk25Pct = useCallback(
    (position: Position) =>
      closeMutation.mutateAsync({
        symbol:      position.symbol,
        side:        position.side,
        currentSize: position.size,
        size:        position.size * 0.25,
      }),
    [closeMutation]
  );

  const cancelOrder = useCallback(
    (symbol: string, orderId: number) => cancelMutation.mutateAsync({ symbol, orderId }),
    [cancelMutation]
  );

  return {
    // Auth
    walletAddress,
    agentPublicKey,
    hasAgent,
    keyStored,
    isAuthenticated: authenticated,
    // Agent key registration
    agentKeyRegistered,
    isCheckingAgentKey,
    registerAgentKey,
    isRegisteringAgentKey: registerAgentKeyMutation.isPending,
    // Builder Program
    builderApproved,
    isCheckingApproval,
    approveBuilderCode,
    isApprovingBuilderCode: approveBuilderMutation.isPending,
    // Data
    markets,
    positions,
    openOrders,
    accountHealth,
    markPrices,
    // Loading
    isLoading,
    isMarketsLoading,
    // Agent key management
    importKey:                handleImportKey,
    generateAndStoreAgentKey: handleGenerateKey,
    clearAgent:               handleClearAgent,
    // Trading
    openPosition,
    closePosition,
    deRisk25Pct,
    cancelOrder,
  };
}
