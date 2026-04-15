/**
 * TradeLog.tsx
 * Session trade activity log — shows every OPEN / CLOSE / DE-RISK fired this session.
 */

"use client";

import { ClipboardList, Trash2, TrendingUp, TrendingDown, ArrowDownLeft } from "lucide-react";
import { useTradeLogStore, type TradeLogEntry } from "@/stores/tradeLogStore";
import { cn, formatUSD, formatTime } from "@/lib/utils";

function EntryRow({ entry }: { entry: TradeLogEntry }) {
  const isLong = entry.side === "LONG";

  const typeColor: Record<TradeLogEntry["type"], string> = {
    OPEN:     isLong ? "text-neon-green" : "text-danger",
    CLOSE:    "text-slate-400",
    "DE-RISK": "text-warning",
  };

  const TypeIcon =
    entry.type === "OPEN"
      ? isLong ? TrendingUp : TrendingDown
      : ArrowDownLeft;

  return (
    <div
      className="flex items-center gap-2.5 py-2 px-3 rounded-lg transition-colors"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      {/* Icon */}
      <TypeIcon className={cn("w-3.5 h-3.5 shrink-0", typeColor[entry.type])} />

      {/* Symbol + type */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-white">{entry.symbol}</span>
          <span className={cn("text-[9px] font-mono px-1 py-0.5 rounded", typeColor[entry.type])}
            style={{ background: "rgba(255,255,255,0.05)" }}>
            {entry.type}
          </span>
          <span className={cn(
            "text-[9px] font-mono px-1 py-0.5 rounded",
            isLong ? "text-neon-green bg-neon-green/10" : "text-danger bg-danger/10"
          )}>
            {entry.side}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-mono text-slate-500">
            {entry.size.toFixed(4)} units @ {formatUSD(entry.price)}
          </span>
          <span className="text-[9px] font-mono text-slate-600">·</span>
          <span className="text-[9px] font-mono text-slate-500">{formatUSD(entry.notional)}</span>
        </div>
      </div>

      {/* Time */}
      <span className="text-[9px] font-mono text-slate-600 shrink-0">
        {formatTime(entry.timestamp)}
      </span>
    </div>
  );
}

export default function TradeLog() {
  const { entries, clear } = useTradeLogStore();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5 text-electric-300" />
          <h2 className="text-sm font-semibold text-white">Trade Log</h2>
          {entries.length > 0 && (
            <span className="text-[10px] font-mono bg-electric/10 text-electric-300 px-1.5 py-0.5 rounded-full">
              {entries.length}
            </span>
          )}
        </div>
        {entries.length > 0 && (
          <button
            onClick={clear}
            className="text-slate-600 hover:text-danger transition-colors p-1 rounded"
            title="Clear log"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <ClipboardList className="w-6 h-6 text-slate-700" />
            <p className="text-xs text-slate-600">No trades yet this session.</p>
            <p className="text-[10px] text-slate-700">Mirror a signal or use Quick Order to get started.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
