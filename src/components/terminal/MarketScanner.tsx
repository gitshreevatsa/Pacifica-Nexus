"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import { useOIDelta } from "@/hooks/useOIDelta";
import type { Market } from "@/types";
import { cn, formatUSD } from "@/lib/utils";

type SortKey = keyof Pick<
  Market,
  "symbol" | "markPrice" | "priceChange24h" | "openInterest" | "volume24h" | "fundingRate"
>;
type SortDir = "asc" | "desc";

function SortTH({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      className="px-3 py-2 text-left cursor-pointer select-none group"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-wider transition-colors",
            active ? "text-electric-300" : "text-slate-600 group-hover:text-slate-400"
          )}
        >
          {label}
        </span>
        <ArrowUpDown
          className={cn(
            "w-2.5 h-2.5 transition-colors",
            active ? "text-electric-300" : "text-slate-700 group-hover:text-slate-500"
          )}
        />
        {active && (
          <span className="text-[9px] font-mono text-electric-300">
            {dir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </div>
    </th>
  );
}

export default function MarketScanner() {
  const { markets } = usePacifica();
  const oiDeltas = useOIDelta(markets);

  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    return [...markets].sort((a, b) => {
      if (sortKey === "symbol") {
        return sortDir === "asc"
          ? a.symbol.localeCompare(b.symbol)
          : b.symbol.localeCompare(a.symbol);
      }
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [markets, sortKey, sortDir]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse" />
          <h2 className="text-sm font-semibold text-white">Market Scanner</h2>
          <span
            className="text-[10px] font-mono text-slate-500 px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            {markets.length} markets
          </span>
        </div>
        <span className="text-[9px] font-mono text-slate-600">Click column header to sort</span>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full border-collapse min-w-[520px]">
          <thead
            className="sticky top-0 z-10"
            style={{ background: "rgba(5,5,5,0.96)", backdropFilter: "blur(8px)" }}
          >
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <SortTH label="Symbol"  sortKey="symbol"        active={sortKey === "symbol"}        dir={sortDir} onSort={handleSort} />
              <SortTH label="Mark"    sortKey="markPrice"     active={sortKey === "markPrice"}     dir={sortDir} onSort={handleSort} />
              <SortTH label="24h %"   sortKey="priceChange24h" active={sortKey === "priceChange24h"} dir={sortDir} onSort={handleSort} />
              <SortTH label="OI"      sortKey="openInterest"  active={sortKey === "openInterest"}  dir={sortDir} onSort={handleSort} />
              <SortTH label="Volume"  sortKey="volume24h"     active={sortKey === "volume24h"}     dir={sortDir} onSort={handleSort} />
              <SortTH label="Fund/h"  sortKey="fundingRate"   active={sortKey === "fundingRate"}   dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
                  OI Δ1h
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((m) => {
              const sym       = m.symbol.replace("-PERP", "");
              const isPos24h  = m.priceChange24h >= 0;
              const isPosFund = m.fundingRate >= 0;
              const delta     = oiDeltas[m.symbol];
              const isHighFund = Math.abs(m.fundingRate * 100) > 0.05;

              return (
                <tr
                  key={m.symbol}
                  className="transition-colors hover:bg-white/[0.02]"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                >
                  <td className="px-3 py-2">
                    <span className="text-[11px] font-bold text-white">{sym}</span>
                  </td>

                  <td className="px-3 py-2">
                    <span className="text-[11px] font-mono text-slate-200">
                      {formatUSD(m.markPrice)}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {isPos24h
                        ? <TrendingUp  className="w-3 h-3 text-neon-green shrink-0" />
                        : <TrendingDown className="w-3 h-3 text-danger shrink-0" />}
                      <span
                        className={cn(
                          "text-[11px] font-mono font-semibold",
                          isPos24h ? "text-neon-green" : "text-danger"
                        )}
                      >
                        {isPos24h ? "+" : ""}{m.priceChange24h.toFixed(2)}%
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-2">
                    <span className="text-[11px] font-mono text-slate-300">
                      {formatUSD(m.openInterest)}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <span className="text-[11px] font-mono text-slate-300">
                      {formatUSD(m.volume24h)}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "text-[11px] font-mono font-semibold",
                        isHighFund
                          ? isPosFund ? "apy-glow" : "danger-glow"
                          : isPosFund ? "text-neon-green" : "text-danger"
                      )}
                    >
                      {isPosFund ? "+" : ""}{(m.fundingRate * 100).toFixed(4)}%
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    {delta !== undefined ? (
                      <span
                        className={cn(
                          "text-[11px] font-mono font-semibold",
                          delta >= 0 ? "text-electric-300" : "text-warning"
                        )}
                      >
                        {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-700">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {markets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-600">
                  Loading markets…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
