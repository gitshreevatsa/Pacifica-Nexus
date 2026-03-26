/**
 * AlphaFeed.tsx – Left panel
 * Dual-Signal Discovery Engine — "Verified Alpha" when Elfa social + Pacifica whale agree.
 * "Mirror Trade" fires a market order on Pacifica with POINTPULSE builder code.
 */

"use client";

import { useState, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, Zap, RefreshCw, AlertCircle,
  MessageSquare, Wifi, WifiOff, CheckCircle2, BarChart2,
} from "lucide-react";
import { useWhaleStream } from "@/hooks/useWhaleStream";
import { usePacifica } from "@/hooks/usePacifica";
import type { VerifiedAlpha, AlphaSocialSignal } from "@/types";
import { cn, formatTime } from "@/lib/utils";
import TradeConfirmModal from "@/components/terminal/TradeConfirmModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMentions(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function formatNotional(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className={cn("h-full rounded-full transition-all duration-150", color)}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function SocialBadge({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,98,255,0.12)", color: "#4d8fff" }}>
      🐦 {score}
    </span>
  );
}

function VolumeBadge({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,255,135,0.08)", color: "#00ff87" }}>
      <BarChart2 className="w-2.5 h-2.5" />
      {score}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded animate-pulse" style={{ background: "rgba(0,98,255,0.18)", color: "#4d8fff" }}>
      <CheckCircle2 className="w-2.5 h-2.5" />
      VERIFIED
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" }) {
  const styles: Record<string, React.CSSProperties> = {
    BULLISH: { background: "rgba(0,255,135,0.08)", color: "#00ff87" },
    BEARISH: { background: "rgba(255,59,92,0.08)", color: "#ff3b5c" },
    NEUTRAL: { background: "rgba(0,98,255,0.08)", color: "#4d8fff" },
  };
  const Icon = sentiment === "BULLISH" ? TrendingUp : sentiment === "BEARISH" ? TrendingDown : Minus;
  return (
    <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded" style={styles[sentiment]}>
      <Icon className="w-2.5 h-2.5" />
      {sentiment[0] + sentiment.slice(1).toLowerCase()}
    </span>
  );
}

// ─── Verified Alpha Card ───────────────────────────────────────────────────────

function VerifiedAlphaCard({
  alpha,
  onMirror,
  isTrading,
}: {
  alpha: VerifiedAlpha;
  onMirror: (alpha: VerifiedAlpha) => void;
  isTrading: boolean;
}) {
  const { social, whale } = alpha;
  const isLong = alpha.direction === "LONG";

  return (
    <div className="group relative rounded-xl p-3 transition-all duration-150" style={{
      background: "rgba(0,98,255,0.05)",
      boxShadow: "0 0 20px rgba(0,98,255,0.12)",
    }}>
      <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ background: "rgba(0,98,255,0.03)" }} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-electric/20 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-electric-300">
              {alpha.symbol.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white">{alpha.symbol}</p>
            <p className="text-[9px] font-mono text-slate-500">
              {formatTime(alpha.verifiedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <VerifiedBadge />
          <SentimentBadge sentiment={social.sentiment} />
        </div>
      </div>

      {/* Social scores */}
      <div className="space-y-1.5 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500 w-10 shrink-0">Social</span>
          <ScoreBar score={social.sentimentScore} color="bg-electric" />
          <SocialBadge score={social.sentimentScore} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500 w-10 shrink-0">Volume</span>
          <ScoreBar score={social.volumeScore} color="bg-neon-green" />
          <VolumeBadge score={social.volumeScore} />
        </div>
      </div>

      {/* Whale entry info */}
      <div className="flex items-center justify-between rounded px-2 py-1.5 mb-2 text-[9px] font-mono" style={{ background: "rgba(255,255,255,0.04)" }}>
        <span className="text-slate-500">Whale entry</span>
        <span className="text-white font-semibold">${whale.price.toLocaleString()}</span>
        <span className="text-slate-400">{formatNotional(whale.notional)}</span>
        <span className={cn("font-bold", isLong ? "text-neon-green" : "text-danger")}>
          {isLong ? "▲ LONG" : "▼ SHORT"}
        </span>
      </div>

      {/* Mentions row */}
      <div className="flex items-center gap-1 mb-2">
        <MessageSquare className="w-2.5 h-2.5 text-slate-500" />
        <span className="text-[9px] text-slate-500 font-mono">
          {formatMentions(social.mentionCount)} mentions
          {social.changePercent !== 0 && (
            <span className={cn("ml-1", social.changePercent > 0 ? "text-neon-green" : "text-danger")}>
              ({social.changePercent > 0 ? "+" : ""}{social.changePercent.toFixed(1)}%)
            </span>
          )}
        </span>
        <div className="ml-auto">
          <span className="text-[9px] font-mono text-slate-500">
            Confidence: <span className="text-electric-300 font-semibold">{alpha.confidence}%</span>
          </span>
        </div>
      </div>

      {/* Mirror Trade CTA — ghost → electric glow on hover */}
      <button
        onClick={() => onMirror(alpha)}
        disabled={isTrading}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-2 rounded text-[11px] font-semibold transition-all duration-150",
          "btn-ghost-blue",
          isTrading && "btn-scanning opacity-70 cursor-not-allowed"
        )}
      >
        <Zap className="w-3 h-3" />
        {isTrading ? "Executing…" : `Mirror Trade — ${isLong ? "Long" : "Short"} ${alpha.symbol}`}
      </button>
    </div>
  );
}

// ─── Social-only Token Card (pending whale confirmation) ──────────────────────

function SocialCard({
  signal,
  onTrade,
  isTrading,
}: {
  signal: AlphaSocialSignal;
  onTrade: (signal: AlphaSocialSignal, side: "LONG" | "SHORT") => void;
  isTrading: boolean;
}) {
  const isUp = signal.changePercent >= 0;

  return (
    <div className="glass-card p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
            <span className="text-[9px] font-bold text-slate-400">
              {signal.symbol.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-200">{signal.symbol}</p>
            <div className="flex items-center gap-1">
              <MessageSquare className="w-2.5 h-2.5 text-slate-600" />
              <p className="text-[9px] text-slate-600 font-mono">
                {formatMentions(signal.mentionCount)} mentions
              </p>
            </div>
          </div>
        </div>
        <SentimentBadge sentiment={signal.sentiment} />
      </div>

      {/* Change bar */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className={cn("h-full rounded-full", isUp ? "bg-neon-green/60" : "bg-danger/60")}
            style={{ width: `${Math.min(Math.abs(signal.changePercent), 100)}%` }}
          />
        </div>
        <span className={cn("text-[9px] font-mono w-12 text-right", isUp ? "text-neon-green" : "text-danger")}>
          {isUp ? "+" : ""}{signal.changePercent.toFixed(1)}%
        </span>
      </div>

      {/* Trade buttons */}
      <div className="grid grid-cols-2 gap-1">
        <button
          onClick={() => onTrade(signal, "LONG")}
          disabled={isTrading}
          className={cn(
            "flex items-center justify-center gap-1 py-1 rounded text-[9px] font-semibold border transition-all",
            "border-neon-green/30 text-neon-green/70 hover:bg-neon-green/10 hover:text-neon-green",
            isTrading && "opacity-40 cursor-not-allowed"
          )}
        >
          <Zap className="w-2 h-2" />
          Long
        </button>
        <button
          onClick={() => onTrade(signal, "SHORT")}
          disabled={isTrading}
          className={cn(
            "flex items-center justify-center gap-1 py-1 rounded text-[9px] font-semibold border transition-all",
            "border-danger/30 text-danger/70 hover:bg-danger/10 hover:text-danger",
            isTrading && "opacity-40 cursor-not-allowed"
          )}
        >
          <Zap className="w-2 h-2" />
          Short
        </button>
      </div>
    </div>
  );
}

// ─── WS status dot ────────────────────────────────────────────────────────────

function WsStatusDot({ connected }: { connected: boolean }) {
  return (
    <span className={cn(
      "flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded",
      connected ? "text-neon-green" : "text-slate-500"
    )}>
      {connected
        ? <Wifi className="w-2.5 h-2.5" />
        : <WifiOff className="w-2.5 h-2.5" />}
      {connected ? "Live" : "Offline"}
    </span>
  );
}

// ─── Pending type for modal ───────────────────────────────────────────────────

type Pending =
  | { kind: "verified"; alpha: VerifiedAlpha }
  | { kind: "social"; signal: AlphaSocialSignal; side: "LONG" | "SHORT" };

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlphaFeed() {
  const { openPosition, keyStored, walletAddress, markPrices } = usePacifica();

  const {
    verifiedAlphas,
    socialSignals,
    isWsConnected,
    isSocialLoading,
    socialError,
    refreshSocial,
  } = useWhaleStream();

  const [tradingId, setTradingId] = useState<string | null>(null);
  const [toastMsg,  setToastMsg]  = useState<string | null>(null);
  const [pending,   setPending]   = useState<Pending | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3_500);
  }, []);

  // Guard checks shared by both card types
  const guardCheck = useCallback((): boolean => {
    if (!keyStored)      { showToast("Paste your Agent Key in the top bar first."); return false; }
    if (!walletAddress)  { showToast("Connect your wallet (top bar) before trading."); return false; }
    return true;
  }, [keyStored, walletAddress, showToast]);

  const handleMirror = useCallback((alpha: VerifiedAlpha) => {
    if (!guardCheck()) return;
    setPending({ kind: "verified", alpha });
  }, [guardCheck]);

  const handleSocialTrade = useCallback(
    (signal: AlphaSocialSignal, side: "LONG" | "SHORT") => {
      if (!guardCheck()) return;
      setPending({ kind: "social", signal, side });
    },
    [guardCheck]
  );

  const handleConfirm = useCallback(async (units: number) => {
    if (!pending) return;

    const symbol = pending.kind === "verified"
      ? pending.alpha.symbol
      : pending.signal.symbol;
    const side = pending.kind === "verified"
      ? pending.alpha.direction
      : pending.side;

    setTradingId(symbol);
    setPending(null);

    try {
      await openPosition({ symbol, side, size: units });
      showToast(`${side} opened on ${symbol} ✓`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setTradingId(null);
    }
  }, [pending, openPosition, showToast]);

  // Modal props derived from pending state
  const modalProps = pending
    ? {
        symbol: pending.kind === "verified" ? pending.alpha.symbol : pending.signal.symbol,
        side:   (pending.kind === "verified" ? pending.alpha.direction : pending.side) as "LONG" | "SHORT",
        markPrice: pending.kind === "verified"
          ? pending.alpha.whale.price
          : (markPrices[pending.signal.symbol] ?? 0),
        description: pending.kind === "verified"
          ? `Verified Alpha: ${pending.alpha.symbol} has ${pending.alpha.social.mentionCount} social mentions + a $${(pending.alpha.whale.notional / 1000).toFixed(0)}k whale ${pending.alpha.direction.toLowerCase()} entry at $${pending.alpha.whale.price.toLocaleString()}. Mirroring via POINTPULSE.`
          : `${pending.signal.symbol} is trending with ${formatMentions(pending.signal.mentionCount)} mentions (${pending.signal.changePercent > 0 ? "+" : ""}${pending.signal.changePercent.toFixed(1)}% in 24h). Market order on Pacifica via your Agent Key.`,
      }
    : null;

  // Social signals that are NOT already verified (avoid duplication)
  const verifiedSymbols = new Set(verifiedAlphas.map((v) => v.symbol));
  const pendingSocials  = socialSignals.filter((s) => !verifiedSymbols.has(s.symbol));

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-electric animate-pulse" />
            <h2 className="text-sm font-semibold text-white">Verified Alpha</h2>
            <span className="text-[10px] font-mono text-slate-500 px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)" }}>
              Dual-Signal
            </span>
          </div>
          <div className="flex items-center gap-2">
            <WsStatusDot connected={isWsConnected} />
            <button onClick={refreshSocial} className="text-slate-500 hover:text-electric transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          <span className="text-electric-300">VERIFIED</span> = Elfa social signal + Pacifica whale trade (&gt;$10k) aligned.{" "}
          <span className="text-neon-green">Mirror Trade</span> opens via POINTPULSE.
        </p>
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 custom-scrollbar pt-3">

        {/* ── Verified Alpha section ── */}
        {verifiedAlphas.length > 0 && (
          <div>
            <p className="term-label mb-2 flex items-center gap-1" style={{ color: "rgba(0,98,255,0.7)" }}>
              <CheckCircle2 className="w-2.5 h-2.5" />
              Verified Alpha ({verifiedAlphas.length})
            </p>
            <div className="space-y-2">
              {verifiedAlphas.map((alpha) => (
                <VerifiedAlphaCard
                  key={alpha.id}
                  alpha={alpha}
                  onMirror={handleMirror}
                  isTrading={tradingId === alpha.symbol}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Social signals section ── */}
        <div>
          <p className="term-label mb-2 flex items-center gap-1">
            🐦 Social Signals
            {verifiedAlphas.length > 0 && (
              <span className="text-slate-600 normal-case tracking-normal ml-1">
                — awaiting whale confirmation
              </span>
            )}
          </p>

          {isSocialLoading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse mb-2" style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}

          {socialError && (
            <div className="flex flex-col gap-1 text-danger text-xs p-3 bg-danger/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-medium">Elfa AI unavailable</span>
              </div>
              <span className="text-danger/70 font-mono pl-6 break-all text-[10px]">
                {socialError.message}
              </span>
            </div>
          )}

          {!isSocialLoading && !socialError && pendingSocials.length === 0 && verifiedAlphas.length === 0 && (
            <p className="text-center text-slate-600 text-xs mt-8">No social signals found.</p>
          )}

          <div className="space-y-2">
            {pendingSocials.map((signal) => (
              <SocialCard
                key={signal.symbol}
                signal={signal}
                onTrade={handleSocialTrade}
                isTrading={tradingId === signal.symbol}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="absolute bottom-4 left-4 right-4 text-white text-xs rounded-xl px-3 py-2 animate-slide-up z-50 font-mono" style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}>
          {toastMsg}
        </div>
      )}

      {/* Trade confirm modal */}
      {pending && modalProps && (
        <TradeConfirmModal
          symbol={modalProps.symbol}
          side={modalProps.side}
          markPrice={modalProps.markPrice}
          description={modalProps.description}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
          isExecuting={tradingId === modalProps.symbol}
        />
      )}
    </div>
  );
}
