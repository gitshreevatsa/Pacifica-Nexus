"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Target, TrendingUp, TrendingDown, X, RefreshCw } from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import { useTrailingStopStore } from "@/stores/trailingStopStore";
import { cn, formatUSD } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import type { Position, PacificaOrder, Direction } from "@/types";
import { bracketSide, isTp, isSl, trailSlPrice, slNeedsUpdate } from "@/lib/trading-math";

// ─── Toggle switch (reusable, matches RiskGuard style) ────────────────────────

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "w-8 h-4 rounded-full transition-all duration-150 relative shrink-0",
        value ? "bg-neon-green/60" : "bg-white/10"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-3 h-3 rounded-full transition-all duration-150",
          value ? "left-4 bg-neon-green" : "left-0.5 bg-slate-500"
        )}
      />
    </button>
  );
}

// ─── Bracket order row ────────────────────────────────────────────────────────

function BracketOrderRow({
  order,
  label,
  onCancel,
  isCancelling,
}: {
  order: PacificaOrder;
  label: "TP" | "SL";
  onCancel: (orderId: number, symbol: string) => void;
  isCancelling: boolean;
}) {
  const price  = parseFloat(order.price);
  const amount = parseFloat(order.initial_amount);
  const isTP   = label === "TP";

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <span
        className={cn(
          "text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0",
          isTP ? "bg-neon-green/10 text-neon-green" : "bg-danger/10 text-danger"
        )}
      >
        {label}
      </span>
      <span className="text-[11px] font-mono text-white flex-1">{formatUSD(price)}</span>
      <span className="text-[10px] font-mono text-slate-500">{amount} units</span>
      <button
        onClick={() => onCancel(order.order_id, order.symbol)}
        disabled={isCancelling}
        className="text-slate-500 hover:text-danger transition-colors disabled:opacity-40 shrink-0"
        title="Cancel order"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Position card ────────────────────────────────────────────────────────────

interface PositionCardProps {
  position: Position;
  bracketOrders: PacificaOrder[];
  onCancelOrder: (orderId: number, symbol: string) => Promise<void>;
  onOpenPosition: (params: Parameters<ReturnType<typeof usePacifica>["openPosition"]>[0]) => Promise<{ order_id: number }>;
  toast: (msg: string) => void;
}

function PositionCard({
  position,
  bracketOrders,
  onCancelOrder,
  onOpenPosition,
  toast,
}: PositionCardProps) {
  const { stops, setStop, updateWaterMark, setSlOrderId, removeStop } =
    useTrailingStopStore();

  const positionId = position.id;
  const stop       = stops[positionId];
  const isLong     = position.side === "LONG";

  // Pending trail % input (per-position)
  const [pendingTrailPct, setPendingTrailPct] = useState<string>(
    stop ? String(stop.trailPct) : "2"
  );
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [placingBe, setPlacingBe]   = useState(false);

  // Separate TP vs SL orders
  const tpOrders = bracketOrders.filter((o) => isTp(o, position.side, position.entryPrice));
  const slOrders = bracketOrders.filter((o) => isSl(o, position.side, position.entryPrice));

  // ── Toggle trailing stop ──────────────────────────────────────────────────
  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        if (stop) setStop(positionId, { ...stop, enabled: false });
        return;
      }
      const trailPct = parseFloat(pendingTrailPct);
      if (isNaN(trailPct) || trailPct <= 0) {
        toast("Enter a valid trail %");
        return;
      }
      setStop(positionId, {
        positionId,
        symbol:    position.symbol,
        side:      position.side,
        trailPct,
        enabled:   true,
        waterMark: position.markPrice || position.entryPrice,
        currentSlOrderId: stop?.currentSlOrderId,
      });
    },
    [positionId, pendingTrailPct, position, stop, setStop, toast]
  );

  // ── Confirm trail % ───────────────────────────────────────────────────────
  const handleSetTrail = useCallback(() => {
    const trailPct = parseFloat(pendingTrailPct);
    if (isNaN(trailPct) || trailPct <= 0) {
      toast("Enter a valid trail %");
      return;
    }
    const current = stops[positionId];
    setStop(positionId, {
      positionId,
      symbol:    position.symbol,
      side:      position.side,
      trailPct,
      enabled:   current?.enabled ?? false,
      waterMark: current?.waterMark ?? (position.markPrice || position.entryPrice),
      currentSlOrderId: current?.currentSlOrderId,
    });
    toast(`Trail % set to ${trailPct}%`);
  }, [positionId, pendingTrailPct, position, stops, setStop, toast]);

  // ── Cancel a bracket order ────────────────────────────────────────────────
  const handleCancel = useCallback(
    async (orderId: number, symbol: string) => {
      setCancelling(orderId);
      try {
        await onCancelOrder(orderId, symbol);
        toast(`Order #${orderId} cancelled`);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Cancel failed");
      } finally {
        setCancelling(null);
      }
    },
    [onCancelOrder, toast]
  );

  // ── Move SL to breakeven ──────────────────────────────────────────────────
  const handleBreakeven = useCallback(async () => {
    if (slOrders.length === 0) return;
    setPlacingBe(true);
    try {
      // Cancel all existing SL orders
      await Promise.all(slOrders.map((o) => onCancelOrder(o.order_id, o.symbol)));

      // Place a new reduce-only limit at entryPrice on the opposite side
      const oppSide = isLong ? "SHORT" : "LONG";
      const result  = await onOpenPosition({
        symbol:    position.symbol,
        side:      oppSide,
        size:      position.size,
        orderType: "limit",
        price:     position.entryPrice,
      });

      // Update trailing stop SL order ID if active
      if (stop?.enabled) setSlOrderId(positionId, result.order_id);

      toast(`SL moved to breakeven (${formatUSD(position.entryPrice)})`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Breakeven move failed");
    } finally {
      setPlacingBe(false);
    }
  }, [
    slOrders, isLong, onCancelOrder, onOpenPosition, position,
    stop, setSlOrderId, positionId, toast,
  ]);

  return (
    <div
      className="rounded-xl p-3 space-y-2.5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
    >
      {/* ── Position header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white">{position.symbol}</span>
          <span
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold",
              isLong ? "bg-neon-green/10 text-neon-green" : "bg-danger/10 text-danger"
            )}
          >
            {isLong ? (
              <span className="flex items-center gap-0.5">
                <TrendingUp className="w-2.5 h-2.5" /> LONG
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                <TrendingDown className="w-2.5 h-2.5" /> SHORT
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
          <span>Entry {formatUSD(position.entryPrice)}</span>
          <span className="text-slate-500">Mark {formatUSD(position.markPrice)}</span>
        </div>
      </div>

      {/* ── Bracket orders ──────────────────────────────────────────────── */}
      {(tpOrders.length > 0 || slOrders.length > 0) && (
        <div className="space-y-1">
          <p className="term-label">Bracket Orders</p>
          {tpOrders.map((o) => (
            <BracketOrderRow
              key={o.order_id}
              order={o}
              label="TP"
              onCancel={handleCancel}
              isCancelling={cancelling === o.order_id}
            />
          ))}
          {slOrders.map((o) => (
            <BracketOrderRow
              key={o.order_id}
              order={o}
              label="SL"
              onCancel={handleCancel}
              isCancelling={cancelling === o.order_id}
            />
          ))}
        </div>
      )}

      {/* ── Trailing stop row ────────────────────────────────────────────── */}
      <div
        className="rounded-lg p-2.5 space-y-2"
        style={{ background: "rgba(255,255,255,0.025)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-300">Trailing Stop</span>
          <Toggle value={stop?.enabled ?? false} onChange={handleToggle} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 shrink-0">Trail %</span>
          <input
            type="number"
            min={0.1}
            max={50}
            step={0.1}
            value={pendingTrailPct}
            onChange={(e) => setPendingTrailPct(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSetTrail();
            }}
            disabled={!(stop?.enabled)}
            className="w-14 text-[11px] font-mono text-white rounded-lg px-2 py-1 text-center focus:outline-none disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.06)" }}
          />
          <span className="text-[10px] text-slate-400 shrink-0">%</span>
          <button
            onClick={handleSetTrail}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
            style={{ background: "rgba(0,255,135,0.08)", color: "#00ff87" }}
            title="Apply trail %"
          >
            Set
          </button>
          {stop?.enabled && (
            <span className="text-[10px] font-mono text-slate-500 ml-auto shrink-0">
              wm {formatUSD(stop.waterMark)}
            </span>
          )}
        </div>
      </div>

      {/* ── Breakeven button ─────────────────────────────────────────────── */}
      <button
        onClick={handleBreakeven}
        disabled={slOrders.length === 0 || placingBe}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
          slOrders.length === 0 || placingBe
            ? "opacity-30 cursor-not-allowed"
            : "hover:bg-white/5"
        )}
        style={{ background: "rgba(255,255,255,0.04)", color: "#cbd5e1" }}
        title={slOrders.length === 0 ? "No SL orders to move" : "Move SL to entry price"}
      >
        <RefreshCw className={cn("w-3 h-3", placingBe && "animate-spin")} />
        {placingBe ? "Moving…" : "Move SL to Breakeven"}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TpSlManager() {
  const {
    positions,
    openOrders,
    markPrices,
    cancelOrder,
    openPosition,
  } = usePacifica();

  const { stops, updateWaterMark, setSlOrderId, setStop } = useTrailingStopStore();

  const [toast, showToast] = useToast();

  // ── Trailing stop engine (runs on every markPrices tick) ──────────────────
  const lastSlPrice = useRef<Map<string, number>>(new Map());
  const inFlight    = useRef<Set<string>>(new Set());

  useEffect(() => {
    const enabledStops = Object.values(stops).filter((s) => s.enabled);
    if (enabledStops.length === 0) return;

    for (const stop of enabledStops) {
      if (inFlight.current.has(stop.positionId)) continue;

      const position = positions.find((p) => p.id === stop.positionId);
      if (!position) continue;

      const markPrice = markPrices[stop.symbol];
      if (!markPrice) continue;

      let newWaterMark = stop.waterMark;

      if (stop.side === "LONG" && markPrice > stop.waterMark) {
        newWaterMark = markPrice;
        updateWaterMark(stop.positionId, markPrice);
      } else if (stop.side === "SHORT" && markPrice < stop.waterMark) {
        newWaterMark = markPrice;
        updateWaterMark(stop.positionId, markPrice);
      }

      // Compute new SL price from (potentially updated) watermark
      const newSlPrice = trailSlPrice(stop.side, newWaterMark, stop.trailPct);

      const prevSl = lastSlPrice.current.get(stop.positionId);

      // Only re-place if new SL is more than 0.1% away from last placed SL
      const needsUpdate = slNeedsUpdate(newSlPrice, prevSl);

      if (!needsUpdate) continue;

      const oppSide = stop.side === "LONG" ? "SHORT" : "LONG";

      // Mark in-flight to prevent concurrent re-fires
      inFlight.current.add(stop.positionId);
      lastSlPrice.current.set(stop.positionId, newSlPrice);

      (async () => {
        try {
          // Cancel old SL order if one exists
          if (stop.currentSlOrderId !== undefined) {
            try {
              await cancelOrder(stop.symbol, stop.currentSlOrderId);
            } catch {
              // If cancel fails (already filled/cancelled), proceed anyway
            }
          }

          // Place new limit SL on the opposite side
          const result = await openPosition({
            symbol:    stop.symbol,
            side:      oppSide,
            size:      position.size,
            orderType: "limit",
            price:     newSlPrice,
          });

          setSlOrderId(stop.positionId, result.order_id);
        } catch (e) {
          // If the place fails, clear the cached SL price so we retry next tick
          lastSlPrice.current.delete(stop.positionId);
          console.warn("[TpSlManager] Trailing SL update failed:", e);
        } finally {
          inFlight.current.delete(stop.positionId);
        }
      })();
    }
  }, [markPrices, stops, positions, cancelOrder, openPosition, updateWaterMark, setSlOrderId]);

  // ── Remove stops for positions that no longer exist ───────────────────────
  useEffect(() => {
    const activeIds = new Set(positions.map((p) => p.id));
    for (const positionId of Object.keys(stops)) {
      if (!activeIds.has(positionId)) {
        useTrailingStopStore.getState().removeStop(positionId);
        lastSlPrice.current.delete(positionId);
      }
    }
  }, [positions, stops]);

  const openPositions = positions.filter((p) => p.status === "OPEN");

  // ── cancelOrder wrapper (takes symbol + orderId) ──────────────────────────
  const handleCancelOrder = useCallback(
    async (orderId: number, symbol: string) => {
      await cancelOrder(symbol, orderId);
    },
    [cancelOrder]
  );

  return (
    <div className="flex flex-col h-full relative">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-electric-300 shrink-0" />
          <h2 className="text-sm font-semibold text-white">TP / SL Manager</h2>
          {openPositions.length > 0 && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}
            >
              {openPositions.length}
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Manage bracket orders, trailing stops, and breakeven moves per position.
        </p>
      </div>

      {/* ── Position list ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar space-y-2.5">
        {openPositions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Target className="w-6 h-6 text-slate-700" />
            <p className="text-xs text-slate-600 font-mono">No open positions</p>
          </div>
        ) : (
          openPositions.map((position) => {
            // Filter bracket orders for this position (reduce-only, opposite side, same symbol)
            const bracket = openOrders.filter(
              (o) =>
                o.symbol === position.symbol &&
                o.reduce_only &&
                o.side === bracketSide(position.side)
            );

            return (
              <PositionCard
                key={position.id}
                position={position}
                bracketOrders={bracket}
                onCancelOrder={handleCancelOrder}
                onOpenPosition={openPosition}
                toast={showToast}
              />
            );
          })
        )}
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className="absolute bottom-4 left-4 right-4 text-white text-xs rounded-xl px-3 py-2 animate-slide-up z-50 font-mono"
          style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
