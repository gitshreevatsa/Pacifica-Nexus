"use client";

import { usePacifica } from "@/hooks/usePacifica";
import { cn, formatUSD } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

export default function MarginEfficiency() {
  const { positions, accountHealth } = usePacifica();

  const openPositions = positions.filter((p) => p.status === "OPEN");
  const totalMargin = accountHealth?.usedMargin ?? 0;

  const positionData = openPositions.map((position) => {
    const marginShare =
      totalMargin > 0
        ? position.margin > 0
          ? (position.margin / totalMargin) * 100
          : ((position.size * position.entryPrice) / 10 / totalMargin) * 100
        : 0;

    const efficiency =
      position.margin > 0
        ? (Math.abs(position.unrealizedPnl) / position.margin) * 100
        : 0;

    const isOverconcentrated = marginShare > 60;

    return { position, marginShare, efficiency, isOverconcentrated };
  });

  const highestMarginUser = positionData.reduce(
    (max, d) => (d.marginShare > (max?.marginShare ?? -1) ? d : max),
    null as (typeof positionData)[0] | null
  );

  const losingPositions = positionData.filter(
    (d) => d.position.unrealizedPnl < 0
  );

  const marginRatio = accountHealth?.marginRatio ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        Margin Efficiency
      </p>

      {accountHealth && (
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "Equity", value: formatUSD(accountHealth.equity), color: "text-white" },
            { label: "Used Margin", value: formatUSD(accountHealth.usedMargin), color: "text-slate-300" },
            {
              label: "Margin Ratio",
              value: `${(marginRatio * 100).toFixed(1)}%`,
              color:
                marginRatio > 0.8
                  ? "text-danger"
                  : marginRatio > 0.5
                  ? "text-warning"
                  : "text-neon-green",
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-lg p-2 transition-all duration-150"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-[9px] font-mono text-slate-500 mb-0.5">{label}</p>
              <p className={cn("text-[11px] font-mono font-bold", color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {openPositions.length === 0 && (
        <p className="text-center text-slate-600 text-xs py-6">No open positions</p>
      )}

      <div className="flex flex-col gap-2">
        {positionData.map(({ position, marginShare, efficiency, isOverconcentrated }) => {
          const isLong = position.side === "LONG";
          const barColor =
            marginShare > 60
              ? "rgba(255,59,92,0.7)"
              : marginShare > 40
              ? "rgba(255,184,0,0.7)"
              : "rgba(0,255,135,0.7)";

          return (
            <div
              key={position.id}
              className="rounded-xl p-3"
              style={{
                background: isOverconcentrated
                  ? "rgba(255,184,0,0.04)"
                  : "rgba(255,255,255,0.02)",
                border: isOverconcentrated
                  ? "1px solid rgba(255,184,0,0.10)"
                  : "1px solid transparent",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{position.symbol}</span>
                  <span
                    className={cn(
                      "text-[10px] font-mono px-1.5 rounded",
                      isLong
                        ? "bg-neon-green/10 text-neon-green"
                        : "bg-danger/10 text-danger"
                    )}
                  >
                    {position.side}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {marginShare.toFixed(1)}% of margin
                </span>
              </div>

              <div
                className="h-1.5 rounded-full overflow-hidden mb-2"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(marginShare, 100)}%`, background: barColor }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-1 text-slate-400">
                  {position.unrealizedPnl >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-neon-green" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-danger" />
                  )}
                  <span>PnL/Margin: {efficiency.toFixed(1)}%</span>
                </div>
                <span
                  className={cn(
                    "font-semibold",
                    position.unrealizedPnl >= 0 ? "text-neon-green" : "text-danger"
                  )}
                >
                  Unrealized: {position.unrealizedPnl >= 0 ? "+" : ""}
                  {formatUSD(position.unrealizedPnl)}
                </span>
              </div>

              {isOverconcentrated && (
                <div className="flex items-center gap-1 mt-2 text-[10px] font-mono text-warning">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Concentrated — consider reducing</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openPositions.length > 0 && (
        <div
          className="rounded-xl p-3 space-y-1.5"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Recommendations
          </p>

          {highestMarginUser && (
            <p className="text-[10px] text-slate-400 font-mono">
              ⚠ {highestMarginUser.position.symbol} uses{" "}
              {highestMarginUser.marginShare.toFixed(1)}% of margin
            </p>
          )}

          {losingPositions.map(({ position }) => (
            <p key={position.id} className="text-[10px] text-warning font-mono">
              Consider de-risking {position.symbol}
            </p>
          ))}

          {marginRatio > 0.8 && (
            <p className="text-[10px] text-warning font-mono">
              ⚠ Margin ratio critical — reduce exposure
            </p>
          )}
        </div>
      )}
    </div>
  );
}
