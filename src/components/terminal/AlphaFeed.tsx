/**
 * AlphaFeed.tsx – Left panel
 * Social alpha from Elfa AI v2 — trending tokens by mention volume.
 * "Trade Signal" opens a position on Pacifica with POINTPULSE builder code.
 */

"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Minus, Zap, RefreshCw, AlertCircle, MessageSquare,
} from "lucide-react";
import { getTrendingTokens } from "@/lib/elfa-client";
import { usePacifica } from "@/hooks/usePacifica";
import type { TrendingToken } from "@/types";
import { cn, formatTime } from "@/lib/utils";
import TradeConfirmModal from "@/components/terminal/TradeConfirmModal";

function formatMentions(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ─── Sentiment badge ──────────────────────────────────────────────────────────

function SentimentBadge({ sentiment }: { sentiment: TrendingToken["sentiment"] }) {
  const map = {
    BULLISH: "bg-neon-green/10 text-neon-green border-neon-green/30",
    BEARISH: "bg-danger/10 text-danger border-danger/30",
    NEUTRAL: "bg-electric/10 text-electric-300 border-electric/30",
  };
  const Icon = sentiment === "BULLISH" ? TrendingUp : sentiment === "BEARISH" ? TrendingDown : Minus;
  return (
    <span className={cn("flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border", map[sentiment])}>
      <Icon className="w-2.5 h-2.5" />
      {sentiment[0] + sentiment.slice(1).toLowerCase()}
    </span>
  );
}

// ─── Token Card ───────────────────────────────────────────────────────────────

function TokenCard({
  token,
  rank,
  onTrade,
  isTrading,
}: {
  token: TrendingToken;
  rank: number;
  onTrade: (token: TrendingToken, side: "LONG" | "SHORT") => void;
  isTrading: boolean;
}) {
  const isUp = token.changePercent >= 0;

  return (
    <div className="group bg-surface-raised border border-surface-border rounded-lg p-3 hover:border-electric/40 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0">#{rank}</span>
          <div className="w-7 h-7 rounded-full bg-electric/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-electric-300">
              {token.symbol.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white">{token.symbol}</p>
            <div className="flex items-center gap-1">
              <MessageSquare className="w-2.5 h-2.5 text-slate-500" />
              <p className="text-[10px] text-slate-500 font-mono">
                {formatMentions(token.mentionCount)} mentions
              </p>
            </div>
          </div>
        </div>
        <SentimentBadge sentiment={token.sentiment} />
      </div>

      {/* Change bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1 bg-surface-border rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", isUp ? "bg-neon-green" : "bg-danger")}
            style={{ width: `${Math.min(Math.abs(token.changePercent), 100)}%` }}
          />
        </div>
        <span className={cn("text-[10px] font-mono font-semibold w-14 text-right", isUp ? "text-neon-green" : "text-danger")}>
          {isUp ? "+" : ""}{token.changePercent.toFixed(1)}%
        </span>
      </div>

      {/* Trade buttons */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => onTrade(token, "LONG")}
          disabled={isTrading}
          className={cn(
            "flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-semibold border transition-all",
            "border-neon-green/40 text-neon-green hover:bg-neon-green/10",
            isTrading && "opacity-40 cursor-not-allowed"
          )}
        >
          <Zap className="w-2.5 h-2.5" />
          Long
        </button>
        <button
          onClick={() => onTrade(token, "SHORT")}
          disabled={isTrading}
          className={cn(
            "flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-semibold border transition-all",
            "border-danger/40 text-danger hover:bg-danger/10",
            isTrading && "opacity-40 cursor-not-allowed"
          )}
        >
          <Zap className="w-2.5 h-2.5" />
          Short
        </button>
      </div>

      <p className="text-[9px] text-slate-600 mt-1.5 text-right font-mono">
        {formatTime(token.timestamp)}
      </p>
    </div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ tokens }: { tokens: TrendingToken[] }) {
  const bullish = tokens.filter((t) => t.sentiment === "BULLISH").length;
  const bearish = tokens.filter((t) => t.sentiment === "BEARISH").length;
  const totalMentions = tokens.reduce((acc, t) => acc + t.mentionCount, 0);
  const topToken = tokens[0];

  return (
    <div className="flex items-center justify-between bg-surface-overlay rounded-lg px-3 py-2 mb-3">
      <div>
        <p className="text-[9px] text-slate-500 uppercase">Top Signal</p>
        <p className="text-sm font-mono font-bold text-white">{topToken?.symbol ?? "—"}</p>
      </div>
      <div className="text-center">
        <p className="text-[9px] text-slate-500 uppercase">Mentions</p>
        <p className="text-sm font-mono font-bold text-electric-300">{formatMentions(totalMentions)}</p>
      </div>
      <div className="text-right">
        <p className="text-[9px] text-slate-500 uppercase">Bull / Bear</p>
        <p className="text-sm font-mono font-bold">
          <span className="text-neon-green">{bullish}</span>
          <span className="text-slate-500"> / </span>
          <span className="text-danger">{bearish}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlphaFeed() {
  const { openPosition, hasAgent, keyStored, walletAddress, markPrices } = usePacifica();
  const [tradingId, setTradingId]   = useState<string | null>(null);
  const [toastMsg, setToastMsg]     = useState<string | null>(null);
  const [pending, setPending]       = useState<{ token: TrendingToken; side: "LONG" | "SHORT" } | null>(null);

  const { data: tokens = [], isLoading, error, refetch } = useQuery<TrendingToken[]>({
    queryKey: ["elfa", "trending-tokens"],
    queryFn:  () => getTrendingTokens("24h", 15),
    refetchInterval: 30_000,   // trending data doesn't change that fast
    staleTime:       20_000,
  });

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3_500);
  }, []);

  const handleTrade = useCallback(
    (token: TrendingToken, side: "LONG" | "SHORT") => {
      if (!keyStored) { showToast("Paste your Agent Key in the top bar first."); return; }
      if (!walletAddress) { showToast("Connect your wallet (top bar) before trading."); return; }
      setPending({ token, side }); // open confirm modal
    },
    [keyStored, walletAddress, showToast]
  );

  const handleConfirm = useCallback(async (units: number) => {
    if (!pending) return;
    const { token, side } = pending;
    setTradingId(token.id);
    setPending(null);
    try {
      await openPosition({ symbol: token.symbol, side, size: units });
      showToast(`${side} opened on ${token.symbol} ✓`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setTradingId(null);
    }
  }, [pending, openPosition, showToast]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse-slow" />
            <h2 className="text-sm font-semibold text-white">Alpha Feed</h2>
            <span className="text-[10px] font-mono text-slate-500 bg-surface-overlay px-1.5 py-0.5 rounded">
              Social
            </span>
          </div>
          <button onClick={() => refetch()} className="text-slate-500 hover:text-electric transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Tokens trending on social media — ranked by mention volume. Click <span className="text-neon-green font-semibold">Long</span> or <span className="text-danger font-semibold">Short</span> to open a 0.1-unit market order on Pacifica.
        </p>
      </div>

      <div className="px-4 pt-3">
        {tokens.length > 0 && <SummaryBar tokens={tokens} />}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 bg-surface-raised rounded-lg animate-pulse" />
        ))}

        {error && (
          <div className="flex flex-col gap-1 text-danger text-xs p-3 bg-danger/10 rounded-lg mt-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">Elfa AI unavailable</span>
            </div>
            <span className="text-danger/70 font-mono pl-6 break-all">
              {error instanceof Error ? error.message : String(error)}
            </span>
          </div>
        )}

        {!isLoading && !error && tokens.length === 0 && (
          <p className="text-center text-slate-600 text-xs mt-8">No trending tokens found.</p>
        )}

        {tokens.map((token, i) => (
          <TokenCard
            key={token.id}
            token={token}
            rank={i + 1}
            onTrade={handleTrade}
            isTrading={tradingId === token.id}
          />
        ))}
      </div>

      {toastMsg && (
        <div className="absolute bottom-4 left-4 right-4 bg-surface-overlay border border-electric/30 text-white text-xs rounded-lg px-3 py-2 animate-slide-up z-50 font-mono">
          {toastMsg}
        </div>
      )}

      {pending && (
        <TradeConfirmModal
          symbol={pending.token.symbol}
          side={pending.side}
          markPrice={markPrices[pending.token.symbol] ?? 0}
          description={`${pending.token.symbol} is trending with ${formatMentions(pending.token.mentionCount)} mentions (${pending.token.changePercent > 0 ? "+" : ""}${pending.token.changePercent.toFixed(1)}% in 24h). Market order on Pacifica via your Agent Key.`}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
          isExecuting={tradingId === pending.token.id}
        />
      )}
    </div>
  );
}
