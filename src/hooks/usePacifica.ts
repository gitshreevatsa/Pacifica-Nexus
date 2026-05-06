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

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { getPacificaClient } from "@/lib/pacifica-client";
import {
  importAgentKey,
  generateAgentKeypair,
  type AgentKeypair,
} from "@/lib/signing";
import { deleteVault } from "@/lib/keyVault";
import { useAgentKeyStore } from "@/stores/agentKeyStore";
import type { Position, PacificaOrder, AccountHealth, Market, Direction } from "@/types";
import { useTradeLogStore } from "@/stores/tradeLogStore";
import { toast } from "@/stores/toastStore";
import { useKillSwitchStore, assertTradingAllowed } from "@/stores/killSwitchStore";
import { useOrderLifecycleStore } from "@/stores/orderLifecycleStore";
import { trackOrderFailed, trackOrderPlaced } from "@/lib/telemetry";

// ─── Query retry helpers ──────────────────────────────────────────────────────

/**
 * Returns true if the error is a 4xx client error (auth failure, bad request, etc.)
 * that won't benefit from retrying.
 */
function isClientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // apiFetch throws:  "[401] Unauthorized"
  // get()    throws:  "[Pacifica 401] ..."
  const match = msg.match(/\[(?:Pacifica )?(\d{3})\]/);
  if (match) {
    const status = parseInt(match[1], 10);
    return status >= 400 && status < 500;
  }
  return false;
}

/** Retry up to 3 times, but never for 4xx errors. */
const queryRetry = (failureCount: number, err: unknown) =>
  failureCount < 3 && !isClientError(err);

/** Exponential backoff: 1 s, 2 s, 4 s … capped at 30 s. */
const queryRetryDelay = (attempt: number) =>
  Math.min(1_000 * 2 ** attempt, 30_000);

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
  isOpenPending:   boolean;
  isClosePending:  boolean;
  isCancelPending: boolean;

  // Kill switches
  tradingHalted: boolean;
  haltReason:    string;
  haltTrading:   (reason: string) => void;
  resumeTrading: () => void;
}

export interface OpenPositionParams {
  symbol:     string;
  side:       Direction;
  size:       number;
  price?:     number;
  orderType?: "market" | "limit";
  slippage?:  string;
  tpPrice?:   number;
  slPrice?:   number;
}

export interface ClosePositionParams {
  symbol:      string;
  side:        Direction;
  currentSize: number;
  size?:       number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePacifica(): UsePacificaReturn {
  const { authenticated } = usePrivy();
  const queryClient       = useQueryClient();

  // ── Kill switches ──────────────────────────────────────────────────────────
  const tradingHalted = useKillSwitchStore((s) => s.tradingHalted);
  const haltReason    = useKillSwitchStore((s) => s.haltReason);
  const haltTrading   = useKillSwitchStore((s) => s.haltTrading);
  const resumeTrading = useKillSwitchStore((s) => s.resumeTrading);
  // Solana Wallet Adapter — MetaMask (native Solana), Phantom, Solflare, …
  const { publicKey: adapterPublicKey, signMessage: adapterSignMessage } = useWallet();

  // ── Wallet address ─────────────────────────────────────────────────────────
  const walletAddress = useMemo(() => {
    return adapterPublicKey?.toBase58() ?? null;
  }, [adapterPublicKey]);

  const agentPublicKey    = useAgentKeyStore((s) => s.publicKey);
  const agentPrivateKey   = useAgentKeyStore((s) => s.privateKey);
  const storeSetKeypair   = useAgentKeyStore((s) => s.setKeypair);
  const storeClearKeypair = useAgentKeyStore((s) => s.clearKeypair);

  const client = useMemo(() => {
    const c = getPacificaClient();
    if (walletAddress) c.setMainWallet(walletAddress);
    if (agentPublicKey && agentPrivateKey) {
      c.setAgentKeypair({ publicKey: agentPublicKey, privateKey: agentPrivateKey });
    }
    return c;
  }, [walletAddress, agentPublicKey, agentPrivateKey]);

  const hasAgent = !!agentPublicKey && !!walletAddress;
  const keyStored = !!agentPublicKey;

  // ── Markets ────────────────────────────────────────────────────────────────
  const { data: markets = [], isLoading: isMarketsLoading } = useQuery<Market[]>({
    queryKey: QK.markets,
    queryFn:  () => client.getMarkets(),
    refetchInterval:           3_000,
    refetchIntervalInBackground: false,
    staleTime:                 2_000,
    retry:                     queryRetry,
    retryDelay:                queryRetryDelay,
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
    refetchInterval:           3_000,
    refetchIntervalInBackground: false,
    staleTime:                 2_000,
    retry:                     queryRetry,
    retryDelay:                queryRetryDelay,
    enabled:  !!walletAddress,
  });

  // ── Open orders ────────────────────────────────────────────────────────────
  const { data: openOrders = [] } = useQuery<PacificaOrder[]>({
    queryKey: QK.orders(walletAddress ?? ""),
    queryFn:  () => client.getOpenOrders(),
    refetchInterval:           3_000,
    refetchIntervalInBackground: false,
    staleTime:                 2_000,
    retry:                     queryRetry,
    retryDelay:                queryRetryDelay,
    enabled:  !!walletAddress,
  });

  // ── Account health ─────────────────────────────────────────────────────────
  const { data: accountHealth, isLoading: isHealthLoading } = useQuery<AccountHealth>({
    queryKey: QK.health(walletAddress ?? ""),
    queryFn:  () => client.getAccount(),
    refetchInterval:           5_000,
    refetchIntervalInBackground: false,
    staleTime:                 3_000,
    retry:                     queryRetry,
    retryDelay:                queryRetryDelay,
    enabled:  !!walletAddress,
  });

  // ── Agent key registration ─────────────────────────────────────────────────
  // isAgentKeyRegistered is synchronous (sessionStorage check), so we use
  // a regular query with a short staleTime to re-check when wallet/key changes.
  const { data: agentKeyRegistered = false, isLoading: isCheckingAgentKey } = useQuery<boolean>({
    queryKey: ["pacifica", "agentKeyRegistered", walletAddress ?? "", agentPublicKey ?? ""],
    queryFn:  () => Promise.resolve(client.isAgentKeyRegistered()),
    staleTime: Infinity,   // sessionStorage doesn't change unless we write it
    retry:     false,      // sync check, no point retrying
    enabled:   !!walletAddress && !!agentPublicKey,
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
      queryClient.invalidateQueries({ queryKey: ["pacifica", "agentKeyRegistered"] });
    },
    onError: (err) => {
      toast.error(`Agent key registration failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const registerAgentKey = useCallback(async () => {
    await registerAgentKeyMutation.mutateAsync();
  }, [registerAgentKeyMutation]);

  // ── Builder code approval ──────────────────────────────────────────────────
  const { data: builderApproved = false, isLoading: isCheckingApproval } = useQuery<boolean>({
    queryKey: QK.builderApproved(walletAddress ?? ""),
    queryFn:  () => client.hasApprovedBuilderCode(),
    staleTime:                 60_000,
    refetchInterval:           60_000,
    refetchIntervalInBackground: false,
    retry:                     queryRetry,
    retryDelay:                queryRetryDelay,
    enabled:  !!walletAddress,
  });

  const approveBuilderMutation = useMutation({
    mutationFn: () => {
      if (!adapterSignMessage) throw new Error("Wallet does not support signMessage");
      return client.approveBuilderCode(adapterSignMessage);
    },
    onSuccess: () => {
      if (walletAddress) {
        queryClient.setQueryData(QK.builderApproved(walletAddress), true);
      }
    },
    onError: (err) => {
      toast.error(`Builder approval failed: ${err instanceof Error ? err.message : String(err)}`);
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
      assertTradingAllowed();
      const market        = markets.find((m) => m.symbol === p.symbol);
      const lotSize       = market?.lotSize ?? 0.01;
      const clientOrderId = crypto.randomUUID();

      useOrderLifecycleStore.getState().markSubmitting(clientOrderId, p.symbol, p.side, p.size);

      let result: { order_id: number };
      try {
        result = p.orderType === "limit"
          ? await client.createLimitOrder({ symbol: p.symbol, side: p.side, size: p.size, price: p.price, lotSize, clientOrderId })
          : await client.createMarketOrder({ symbol: p.symbol, side: p.side, size: p.size, slippage: p.slippage, lotSize, clientOrderId });
        useOrderLifecycleStore.getState().markAccepted(clientOrderId, result.order_id);
        trackOrderPlaced({ symbol: p.symbol, side: p.side, orderId: result.order_id });
      } catch (e) {
        useOrderLifecycleStore.getState().markRejected(clientOrderId);
        trackOrderFailed({ symbol: p.symbol, side: p.side, orderType: p.orderType ?? "market", error: e });
        throw e;
      }

      // Bracket orders: TP and SL as reduce-only limit orders on the opposite side
      const oppSide = p.side === "LONG" ? "SHORT" : "LONG";
      if (p.tpPrice && p.tpPrice > 0) {
        try {
          await client.createLimitOrder({ symbol: p.symbol, side: oppSide, size: p.size, price: p.tpPrice, reduceOnly: true, lotSize });
        } catch (e) { trackOrderFailed({ symbol: p.symbol, side: oppSide, orderType: "limit", error: e }); }
      }
      if (p.slPrice && p.slPrice > 0) {
        try {
          await client.createLimitOrder({ symbol: p.symbol, side: oppSide, size: p.size, price: p.slPrice, reduceOnly: true, lotSize });
        } catch (e) { trackOrderFailed({ symbol: p.symbol, side: oppSide, orderType: "limit", error: e }); }
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
    onError: (err) => {
      toast.error(`Order failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const closeMutation = useMutation({
    mutationFn: (p: ClosePositionParams) => {
      assertTradingAllowed();
      return client.closePosition(p.symbol, p.side, p.size ?? p.currentSize);
    },
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
    onError: (err) => {
      toast.error(`Close failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ symbol, orderId }: { symbol: string; orderId: number }) => {
      assertTradingAllowed();
      return client.cancelOrder(symbol, orderId);
    },
    onSuccess: invalidateTrades,
    onError: (err) => {
      toast.error(`Cancel failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  // ── Agent key management ───────────────────────────────────────────────────

  const handleImportKey = useCallback((b58: string) => {
    const kp = importAgentKey(b58);
    storeSetKeypair(kp);
    client.setAgentKeypair(kp);
  }, [client, storeSetKeypair]);

  const handleGenerateKey = useCallback((): AgentKeypair => {
    const kp = generateAgentKeypair();
    storeSetKeypair(kp);
    client.setAgentKeypair(kp);
    return kp;
  }, [client, storeSetKeypair]);

  const handleClearAgent = useCallback(() => {
    storeClearKeypair();
    client.clearAgentKeypair();
    deleteVault(); // remove encrypted vault so next session starts fresh
  }, [client, storeClearKeypair]);

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
    (position: Position) => {
      const market  = markets.find((m) => m.symbol === position.symbol);
      const lotSize = market?.lotSize ?? 1;
      // Snap to nearest lot size multiple; minimum 1 lot
      const raw     = position.size * 0.25;
      const snapped = Math.max(lotSize, Math.floor(raw / lotSize) * lotSize);
      return closeMutation.mutateAsync({
        symbol:      position.symbol,
        side:        position.side,
        currentSize: position.size,
        size:        snapped,
      });
    },
    [closeMutation, markets]
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
    isOpenPending:   openMutation.isPending,
    isClosePending:  closeMutation.isPending,
    isCancelPending: cancelMutation.isPending,
    // Kill switches
    tradingHalted,
    haltReason,
    haltTrading,
    resumeTrading,
  };
}
