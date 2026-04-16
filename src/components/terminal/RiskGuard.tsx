"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Shield, AlertTriangle, TrendingDown, Activity, Layers, Zap, Settings2 } from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import type { Position, AccountHealth } from "@/types";
import { cn, formatUSD } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import MarginEfficiency from "@/components/terminal/MarginEfficiency";

// ─── Segmented Health Bar ─────────────────────────────────────────────────────

function SegmentedBar({ marginRatio }: { marginRatio: number }) {
  const segments = 10;
  const filled   = Math.round(Math.min(Math.max(marginRatio, 0), 1) * segments);
  return (
    <div className="w-full">
      <div className="flex gap-0.5 mb-1">
        {Array.from({ length: segments }).map((_, i) => {
          const active = i < filled;
          const bg = active
            ? i < 4 ? "#00ff87" : i < 7 ? "#ffb800" : "#ff3b5c"
            : "rgba(255,255,255,0.07)";
          return (
            <div
              key={i}
              className="flex-1 h-2 rounded-sm transition-all duration-150"
              style={{ background: bg, boxShadow: active && i >= 7 ? "0 0 6px rgba(255,59,92,0.5)" : undefined }}
            />
          );
        })}
      </div>
      <div className="flex justify-between">
        <span className="term-label">Margin Used</span>
        <span className={cn("text-[10px] font-mono font-semibold",
          marginRatio > 0.7 ? "danger-glow" : marginRatio > 0.5 ? "text-warning" : "text-neon-green"
        )}>
          {(marginRatio * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

// ─── Account stats ────────────────────────────────────────────────────────────

function AccountStats({ health }: { health: AccountHealth }) {
  const stats = [
    { label: "Equity", value: formatUSD(health.equity), color: "text-white" },
    { label: "Available", value: formatUSD(health.availableMargin), color: "text-neon-green" },
    { label: "Used Margin", value: formatUSD(health.usedMargin), color: "text-slate-300" },
    {
      label: "Unreal. PnL",
      value: `${health.unrealizedPnl >= 0 ? "+" : ""}${formatUSD(health.unrealizedPnl)}`,
      color: health.unrealizedPnl >= 0 ? "text-neon-green" : "text-danger",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-1.5 mb-3">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="rounded-lg p-2.5 transition-all duration-150" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="term-label mb-0.5">{label}</p>
          <p className={cn("text-sm font-mono font-bold", color)}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Position row ─────────────────────────────────────────────────────────────

function PositionRow({
  position,
  onDeRisk,
  isDeRisking,
}: {
  position: Position;
  onDeRisk: (p: Position) => void;
  isDeRisking: boolean;
}) {
  const isLong = position.side === "LONG";
  const distToLiq =
    position.markPrice > 0
      ? Math.abs(((position.liquidationPrice - position.markPrice) / position.markPrice) * 100)
      : 100;
  const isAtRisk = distToLiq < 10;

  return (
    <div className="rounded-xl p-3 transition-all duration-150" style={{
      background: isAtRisk ? "rgba(255,59,92,0.06)" : "rgba(255,255,255,0.02)",
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isAtRisk && <AlertTriangle className="w-3 h-3 text-danger shrink-0" />}
          <span className="text-xs font-semibold text-white">{position.symbol}</span>
          <span className={cn(
            "text-[10px] font-mono px-1.5 rounded",
            isLong ? "bg-neon-green/10 text-neon-green" : "bg-danger/10 text-danger"
          )}>
            {position.side}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{position.size} units</span>
        </div>
        <span className={cn(
          "text-xs font-mono font-semibold",
          position.unrealizedPnl >= 0 ? "text-neon-green" : "text-danger"
        )}>
          {position.unrealizedPnl >= 0 ? "+" : ""}{formatUSD(position.unrealizedPnl)}
        </span>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-3 gap-1 text-[10px] mb-2">
        {[
          { label: "Entry", val: formatUSD(position.entryPrice) },
          { label: "Mark", val: formatUSD(position.markPrice) },
          { label: "Liq.", val: formatUSD(position.liquidationPrice), danger: isAtRisk },
        ].map(({ label, val, danger }) => (
          <div key={label}>
            <p className="text-slate-500">{label}</p>
            <p className={cn("font-mono", danger ? "text-danger font-bold" : "text-slate-300")}>{val}</p>
          </div>
        ))}
      </div>

      {/* Distance-to-liq bar */}
      <div className="mb-2.5">
        <div className="flex justify-between mb-1">
          <span className="term-label">Dist. to Liq.</span>
          <span className={cn("text-[9px] font-mono font-semibold", isAtRisk ? "danger-glow" : "text-white/50")}>
            {distToLiq.toFixed(1)}%
          </span>
        </div>
        <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{
              width: `${Math.min(distToLiq, 100)}%`,
              background: isAtRisk ? "#ff3b5c" : distToLiq < 25 ? "#ffb800" : "#00ff87",
              boxShadow: isAtRisk ? "0 0 6px rgba(255,59,92,0.6)" : undefined,
            }}
          />
        </div>
      </div>

      {/* De-Risk button — pulses when at risk */}
      <button
        onClick={() => onDeRisk(position)}
        disabled={isDeRisking}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold",
          isAtRisk ? "btn-ghost-danger" : "btn-ghost-neutral",
          isDeRisking ? "btn-scanning opacity-60 cursor-not-allowed" : ""
        )}
      >
        <TrendingDown className="w-3 h-3" />
        {isDeRisking ? "De-Risking…" : "De-Risk 25%"}
      </button>
    </div>
  );
}

// ─── PnL Sparkline ────────────────────────────────────────────────────────────

function PnlSparkline({ currentPnl }: { currentPnl: number }) {
  const [samples, setSamples] = useState<number[]>([currentPnl]);
  const prevRef = useRef(currentPnl);

  useEffect(() => {
    if (currentPnl === prevRef.current) return;
    prevRef.current = currentPnl;
    setSamples((prev) => [...prev, currentPnl].slice(-50));
  }, [currentPnl]);

  if (samples.length < 2) return null;

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const W = 100;
  const H = 32;

  const pts = samples
    .map((v, i) => {
      const x = (i / (samples.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = samples[samples.length - 1];
  const isUp = last >= 0;
  const color = isUp ? "#00ff87" : "#ff3b5c";

  // Filled area path: go down to bottom-right, across to bottom-left, close
  const firstX = 0;
  const lastX = W;
  const fillPts = `${firstX},${H} ${pts} ${lastX},${H}`;

  return (
    <div className="mb-3 rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="term-label">Session PnL Curve</p>
        <span className={cn("text-[10px] font-mono font-semibold", isUp ? "text-neon-green" : "text-danger")}>
          {last >= 0 ? "+" : ""}{formatUSD(last)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 32, display: "block" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="pnl-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill="url(#pnl-grad)" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        {min < 0 && max > 0 && (
          <line
            x1="0" y1={H - ((0 - min) / range) * (H - 2) - 1}
            x2={W} y2={H - ((0 - min) / range) * (H - 2) - 1}
            stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" strokeDasharray="2,2"
          />
        )}
      </svg>
    </div>
  );
}

// ─── Liquidation Heatmap ──────────────────────────────────────────────────────

/**
 * Shows all open positions as marks on a shared price axis.
 * Green/blue line = mark price, red line = liquidation price.
 * Glows red when distance-to-liq < 10 %.
 */
function LiqHeatmap({ positions }: { positions: Position[] }) {
  if (positions.length === 0) return null;

  // Collect every relevant price to build the axis range
  const allPrices = positions
    .flatMap((p) => [p.markPrice, p.liquidationPrice])
    .filter((v) => v > 0);

  if (allPrices.length === 0) return null;

  const minP  = Math.min(...allPrices) * 0.94;
  const maxP  = Math.max(...allPrices) * 1.06;
  const range = maxP - minP || 1;

  const toX = (price: number) =>
    Math.min(100, Math.max(0, ((price - minP) / range) * 100));

  return (
    <div className="mb-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <Layers className="w-3 h-3 text-electric-300 shrink-0" />
        <p className="term-label">Liquidation Price Map</p>
      </div>

      {/* Per-position row */}
      <div className="space-y-2">
        {positions.map((pos) => {
          const distToLiq =
            pos.markPrice > 0
              ? Math.abs(((pos.liquidationPrice - pos.markPrice) / pos.markPrice) * 100)
              : 100;
          const isAtRisk = distToLiq < 10;
          const isLong   = pos.side === "LONG";
          const markX    = toX(pos.markPrice);
          const liqX     = toX(pos.liquidationPrice);

          return (
            <div key={pos.id}>
              {/* Label */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {isAtRisk && <AlertTriangle className="w-2.5 h-2.5 text-danger" />}
                  <span className="text-[10px] font-semibold text-white">
                    {pos.symbol.replace("-PERP", "")}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-mono px-1 rounded",
                      isLong ? "text-neon-green bg-neon-green/10" : "text-danger bg-danger/10"
                    )}
                  >
                    {pos.side}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[9px] font-mono font-semibold",
                    isAtRisk ? "danger-glow" : "text-slate-500"
                  )}
                >
                  {distToLiq.toFixed(1)}% to liq
                </span>
              </div>

              {/* Bar */}
              <div
                className="relative h-2 w-full rounded-full overflow-visible"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                {/* Filled zone between mark and liq */}
                <div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left:       `${Math.min(markX, liqX)}%`,
                    width:      `${Math.abs(markX - liqX)}%`,
                    background: isAtRisk
                      ? "rgba(255,59,92,0.2)"
                      : "rgba(255,255,255,0.05)",
                  }}
                />
                {/* Mark price pin */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full"
                  style={{
                    left:       `${markX}%`,
                    background: isLong ? "#00ff87" : "rgba(0,98,255,0.8)",
                  }}
                  title={`Mark: ${formatUSD(pos.markPrice)}`}
                />
                {/* Liquidation price pin */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full"
                  style={{
                    left:       `${liqX}%`,
                    background: isAtRisk ? "#ff3b5c" : "rgba(255,59,92,0.6)",
                    boxShadow:  isAtRisk ? "0 0 6px rgba(255,59,92,0.9)" : undefined,
                  }}
                  title={`Liq: ${formatUSD(pos.liquidationPrice)}`}
                />
              </div>

              {/* Price labels */}
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] font-mono text-slate-600">{formatUSD(minP)}</span>
                <span className="text-[9px] font-mono text-slate-600">{formatUSD(maxP)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-1">
          <div className="w-2 h-0.5 rounded-full bg-neon-green" />
          <span className="text-[9px] font-mono text-slate-600">Mark (Long)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-0.5 rounded-full" style={{ background: "rgba(0,98,255,0.8)" }} />
          <span className="text-[9px] font-mono text-slate-600">Mark (Short)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-0.5 rounded-full bg-danger" />
          <span className="text-[9px] font-mono text-slate-600">Liquidation</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RiskGuard() {
  const { positions, accountHealth, deRisk25Pct, keyStored, walletAddress } = usePacifica();
  const [rightTab, setRightTab] = useState<"risk" | "margin">("risk");
  const [deRiskingId, setDeRiskingId] = useState<string | null>(null);
  const [toastMsg, showToast] = useToast();

  // Auto de-risk rule state — persisted in localStorage
  const [autoDeRisk, setAutoDeRisk] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("nexus_auto_derisk") === "true";
  });
  const [autoThreshold, setAutoThreshold] = useState<number>(() => {
    if (typeof window === "undefined") return 10;
    return Number(localStorage.getItem("nexus_auto_derisk_threshold") ?? 10);
  });
  const [showAutoConfig, setShowAutoConfig] = useState(false);
  // Pending threshold — only committed to autoThreshold when user clicks "Set"
  const [pendingThreshold, setPendingThreshold] = useState<string>(() =>
    String(typeof window !== "undefined" ? (Number(localStorage.getItem("nexus_auto_derisk_threshold") ?? 10)) : 10)
  );
  // Per-position cooldown: maps position.id → last auto-fire timestamp
  const autoFiredAt = useRef<Map<string, number>>(new Map());

  const toggleAutoDeRisk = useCallback((val: boolean) => {
    setAutoDeRisk(val);
    localStorage.setItem("nexus_auto_derisk", String(val));
  }, []);

  const updateThreshold = useCallback((val: number) => {
    setAutoThreshold(val);
    localStorage.setItem("nexus_auto_derisk_threshold", String(val));
  }, []);

  const handleDeRisk = useCallback(async (position: Position) => {
    if (!keyStored) { showToast("Paste your Agent Key in the top bar first."); return; }
    if (!walletAddress) { showToast("Connect your wallet (top bar) first."); return; }
    setDeRiskingId(position.id);
    try {
      await deRisk25Pct(position);
      showToast(`Trimmed 25% of ${position.symbol} ✓`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "De-risk failed");
    } finally {
      setDeRiskingId(null);
    }
  }, [keyStored, walletAddress, deRisk25Pct, showToast]);

  const openPositions = positions.filter((p) => p.status === "OPEN");
  const atRiskCount = openPositions.filter((p) => {
    const dist = p.markPrice > 0
      ? Math.abs(((p.liquidationPrice - p.markPrice) / p.markPrice) * 100) : 100;
    return dist < 10;
  }).length;

  // Auto de-risk: watch positions, fire when dist-to-liq < threshold (10s cooldown per position)
  useEffect(() => {
    if (!autoDeRisk || !keyStored || !walletAddress) return;
    const COOLDOWN_MS = 10_000;
    openPositions.forEach((position) => {
      if (deRiskingId === position.id) return;
      const lastFired = autoFiredAt.current.get(position.id) ?? 0;
      if (Date.now() - lastFired < COOLDOWN_MS) return;
      const dist = position.markPrice > 0
        ? Math.abs(((position.liquidationPrice - position.markPrice) / position.markPrice) * 100)
        : 100;
      // Skip if 25% of position rounds down to 0 (lot size ≥ 1 markets)
      const deRiskAmt = Math.floor(position.size * 0.25);
      if (dist < autoThreshold && deRiskAmt >= 1) {
        autoFiredAt.current.set(position.id, Date.now());
        deRisk25Pct(position)
          .then(() => showToast(`Auto de-risked ${position.symbol} (${dist.toFixed(1)}% to liq) ✓`))
          .catch(() => autoFiredAt.current.delete(position.id));
      }
    });
  }, [autoDeRisk, autoThreshold, openPositions, keyStored, walletAddress, deRisk25Pct, deRiskingId, showToast]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {(["risk", "margin"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setRightTab(tab)}
            className={rightTab === tab
              ? "market-tab-selected text-[10px] font-semibold px-2.5 py-1 rounded-lg"
              : "market-tab text-[10px] font-semibold px-2.5 py-1 rounded-lg"
            }
          >
            {tab === "risk" ? "Risk Guard" : "Margin"}
          </button>
        ))}
      </div>

      {rightTab === "margin" && (
        <div className="flex-1 overflow-y-auto p-4">
          <MarginEfficiency />
        </div>
      )}

      {rightTab === "risk" && (
        <>
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className={cn("w-4 h-4", atRiskCount > 0 ? "text-danger" : "text-neon-green")} />
            <h2 className="text-sm font-semibold text-white">Risk Guard</h2>
            {atRiskCount > 0 && (
              <span className="text-[10px] bg-danger text-white px-1.5 py-0.5 rounded-full font-bold">
                {atRiskCount} at risk
              </span>
            )}
            {autoDeRisk && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full animate-pulse"
                style={{ background: "rgba(0,255,135,0.12)", color: "#00ff87" }}>
                AUTO
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAutoConfig((v) => !v)}
              className={cn(
                "p-1 rounded transition-colors",
                showAutoConfig ? "bg-warning/10 text-warning" : "text-slate-500 hover:text-slate-300"
              )}
              title="Auto De-Risk settings"
            >
              <Settings2 className="w-3 h-3" />
            </button>
            <Activity className="w-3.5 h-3.5 text-slate-500" />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Your account health &amp; open positions. <span className="text-warning">De-Risk 25%</span> closes a quarter of a position to reduce liquidation risk.
        </p>

        {/* Auto de-risk config panel */}
        {showAutoConfig && (
          <div className="mt-2 rounded-xl p-3 space-y-2" style={{ background: "rgba(255,184,0,0.05)", border: "1px solid rgba(255,184,0,0.12)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-warning" />
                <span className="text-[11px] font-semibold text-white">Auto De-Risk</span>
              </div>
              {/* Toggle */}
              <button
                onClick={() => toggleAutoDeRisk(!autoDeRisk)}
                className={cn(
                  "w-8 h-4 rounded-full transition-all duration-150 relative shrink-0",
                  autoDeRisk ? "bg-neon-green/60" : "bg-white/10"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-3 h-3 rounded-full transition-all duration-150",
                  autoDeRisk ? "left-4 bg-neon-green" : "left-0.5 bg-slate-500"
                )} />
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              Trigger when dist-to-liq &lt; threshold. 10s cooldown per position.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 shrink-0">Trigger at</span>
              <input
                type="number"
                min={1}
                max={50}
                value={pendingThreshold}
                onChange={(e) => setPendingThreshold(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = Number(pendingThreshold);
                    if (v >= 1 && v <= 50) updateThreshold(v);
                  }
                }}
                className="w-14 text-[11px] font-mono text-white rounded-lg px-2 py-1 text-center focus:outline-none"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
              <span className="text-[10px] text-slate-400 shrink-0">% to liq.</span>
              <button
                onClick={() => {
                  const v = Number(pendingThreshold);
                  if (v >= 1 && v <= 50) updateThreshold(v);
                }}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
                style={{ background: "rgba(255,184,0,0.15)", color: "#ffb800" }}
                title="Apply threshold"
              >
                Set
              </button>
              <span className="text-[10px] font-mono text-slate-500">active: {autoThreshold}%</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
        {/* Health Gauge */}
        {accountHealth ? (
          <div className="pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="term-label">Account Status</p>
              <p className={cn("text-xs font-semibold",
                accountHealth.marginRatio > 0.8 ? "danger-glow" :
                accountHealth.marginRatio > 0.5 ? "text-warning" : "text-neon-green"
              )}>
                {accountHealth.marginRatio > 0.8 ? "⚠ Critical" :
                 accountHealth.marginRatio > 0.5 ? "Caution" : "● Healthy"}
              </p>
            </div>
            <SegmentedBar marginRatio={accountHealth.marginRatio} />
            <div className="mt-3">
              <AccountStats health={accountHealth} />
              <PnlSparkline currentPnl={accountHealth.unrealizedPnl} />
            </div>
          </div>
        ) : (
          <div className="pt-3 space-y-2">
            <div className="h-8 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
              ))}
            </div>
          </div>
        )}

        {/* Liquidation Heatmap */}
        <LiqHeatmap positions={openPositions} />

        {/* Positions list */}
        <p className="term-label mb-2">Open Positions ({openPositions.length})</p>

        {openPositions.length === 0 && (
          <p className="text-center text-slate-600 text-xs py-6">No open positions.</p>
        )}

        <div className="space-y-2">
          {openPositions.map((position) => (
            <PositionRow
              key={position.id}
              position={position}
              onDeRisk={handleDeRisk}
              isDeRisking={deRiskingId === position.id}
            />
          ))}
        </div>
      </div>

      {toastMsg && (
        <div className="absolute bottom-4 left-4 right-4 text-white text-xs rounded-xl px-3 py-2 animate-slide-up z-50 font-mono" style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}>
          {toastMsg}
        </div>
      )}
        </>
      )}
    </div>
  );
}
