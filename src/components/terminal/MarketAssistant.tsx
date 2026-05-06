"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Loader2, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import { getTrendingTokens, getTopMentions } from "@/lib/elfa-client";
import { formatUSD, cn } from "@/lib/utils";
import type { TrendingToken, ElfaMention, Market, Position } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: React.ReactNode;
  timestamp: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sentimentColor(s: string) {
  if (s === "BULLISH") return "#00FF87";
  if (s === "BEARISH") return "#FF3B5C";
  return "#94a3b8";
}

function sentimentEmoji(s: string) {
  if (s === "BULLISH") return "📈";
  if (s === "BEARISH") return "📉";
  return "➡️";
}

function relTime(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─── Response renderers ───────────────────────────────────────────────────────

function MarketSummaryCard({
  market,
  position,
}: {
  market: Market;
  position?: Position;
}) {
  const isUp = market.priceChange24h >= 0;
  const liqDist = position
    ? Math.abs(((market.markPrice - position.liquidationPrice) / market.markPrice) * 100)
    : null;
  const liqDanger = liqDist !== null && liqDist < 10;

  return (
    <div
      className="rounded-xl p-3 space-y-2 text-[11px] font-mono"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-white text-[13px]">{market.symbol}</span>
        <span className={cn("font-semibold", isUp ? "text-neon-green" : "text-danger")}>
          {isUp ? "▲" : "▼"} {Math.abs(market.priceChange24h).toFixed(2)}%
        </span>
      </div>
      <div className="text-slate-200 text-[12px]">{formatUSD(market.markPrice)}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-400">
        <span>
          Funding:{" "}
          <span className={market.fundingRate > 0 ? "text-neon-green" : "text-danger"}>
            {market.fundingRate > 0 ? "+" : ""}
            {(market.fundingRate * 100).toFixed(4)}%
          </span>
        </span>
        <span>
          OI: <span className="text-slate-300">{formatUSD(market.openInterest)}</span>
        </span>
        <span>
          Vol 24h: <span className="text-slate-300">{formatUSD(market.volume24h)}</span>
        </span>
        <span>
          Max lev: <span className="text-slate-300">{market.maxLeverage}×</span>
        </span>
      </div>

      {position && (
        <div
          className="rounded-lg px-2 py-1.5 flex items-center gap-2"
          style={{
            background: liqDanger
              ? "rgba(255,59,92,0.15)"
              : "rgba(255,165,0,0.08)",
            border: `1px solid ${liqDanger ? "rgba(255,59,92,0.35)" : "rgba(255,165,0,0.2)"}`,
          }}
        >
          <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: liqDanger ? "#FF3B5C" : "#f59e0b" }} />
          <span className="text-slate-300">
            You have a{" "}
            <span style={{ color: position.side === "LONG" ? "#00FF87" : "#FF3B5C" }}>
              {position.side}
            </span>{" "}
            position. LIQ at{" "}
            <span style={{ color: liqDanger ? "#FF3B5C" : "#f59e0b", fontWeight: 600 }}>
              {formatUSD(position.liquidationPrice)}
            </span>{" "}
            <span className="text-slate-500">({liqDist!.toFixed(1)}% away)</span>
          </span>
        </div>
      )}
    </div>
  );
}

function SentimentCard({ token, mentions }: { token: TrendingToken; mentions: ElfaMention[] }) {
  return (
    <div
      className="rounded-xl p-3 space-y-2 text-[11px] font-mono"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-white text-[12px]">
          {sentimentEmoji(token.sentiment)} Social Sentiment
        </span>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: `${sentimentColor(token.sentiment)}22`,
            color: sentimentColor(token.sentiment),
          }}
        >
          {token.sentiment}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-slate-400">
        <span>
          Mentions: <span className="text-slate-200">{token.mentionCount.toLocaleString()}</span>
        </span>
        <span>
          Change:{" "}
          <span className={token.changePercent >= 0 ? "text-neon-green" : "text-danger"}>
            {token.changePercent >= 0 ? "+" : ""}
            {token.changePercent.toFixed(1)}%
          </span>
        </span>
      </div>
      {mentions.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">Top posts</div>
          {mentions.slice(0, 3).map((m) => (
            <div
              key={m.id}
              className="rounded-lg p-2 text-[10px] text-slate-300 leading-relaxed"
              style={{ background: "rgba(0,0,0,0.3)" }}
            >
              <div className="text-slate-500 mb-0.5">@{m.author} · {relTime(m.timestamp)}</div>
              <div className="line-clamp-2">{m.text}</div>
              <div className="flex gap-3 mt-1 text-slate-600">
                <span>♥ {m.likeCount}</span>
                <span>🔁 {m.repostCount}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrendingList({ tokens }: { tokens: TrendingToken[] }) {
  return (
    <div
      className="rounded-xl p-3 space-y-2 text-[11px] font-mono"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase tracking-wider pb-1">
        <TrendingUp className="w-3 h-3" /> Trending Now
      </div>
      {tokens.map((t, i) => (
        <div key={t.id} className="flex items-center justify-between">
          <span className="text-slate-400 w-4">{i + 1}.</span>
          <span className="font-bold text-white flex-1">${t.symbol}</span>
          <span
            className="text-[10px] font-semibold mr-2"
            style={{ color: sentimentColor(t.sentiment) }}
          >
            {sentimentEmoji(t.sentiment)} {t.sentiment}
          </span>
          <span className="text-slate-400">{t.mentionCount.toLocaleString()} mentions</span>
        </div>
      ))}
    </div>
  );
}

function LiqExplainer({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return (
      <div
        className="rounded-xl p-3 text-[11px] font-mono text-slate-400"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        You have no open positions. Liquidation prices appear as red dashed lines on the chart when
        you have open trades.
      </div>
    );
  }
  return (
    <div
      className="rounded-xl p-3 space-y-2 text-[11px] font-mono"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="text-slate-400 text-[10px] uppercase tracking-wider pb-0.5">Your Liquidation Levels</div>
      {positions.map((p) => {
        const dist = Math.abs(((p.markPrice - p.liquidationPrice) / p.markPrice) * 100);
        const danger = dist < 10;
        return (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-lg px-2 py-1.5"
            style={{
              background: danger ? "rgba(255,59,92,0.12)" : "rgba(255,255,255,0.04)",
              border: danger ? "1px solid rgba(255,59,92,0.3)" : "1px solid transparent",
            }}
          >
            <span className="font-bold text-white">{p.symbol}</span>
            <span style={{ color: p.side === "LONG" ? "#00FF87" : "#FF3B5C" }}>{p.side}</span>
            <span className="text-slate-400">
              LIQ:{" "}
              <span style={{ color: danger ? "#FF3B5C" : "#f59e0b", fontWeight: 600 }}>
                {formatUSD(p.liquidationPrice)}
              </span>
            </span>
            <span className="text-slate-500">({dist.toFixed(1)}% away)</span>
          </div>
        );
      })}
      <div className="text-slate-600 text-[10px] pt-1">
        Red dashed lines on the chart show your liq prices. Blue dashed lines show entry prices.
      </div>
    </div>
  );
}

function FundingList({ markets }: { markets: Market[] }) {
  const sorted = [...markets]
    .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
    .slice(0, 8);
  return (
    <div
      className="rounded-xl p-3 space-y-1.5 text-[11px] font-mono"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="text-slate-400 text-[10px] uppercase tracking-wider pb-0.5 flex items-center gap-1">
        <Zap className="w-3 h-3" /> Funding Rates (hourly)
      </div>
      {sorted.map((m) => {
        const annualized = m.fundingRate * 24 * 365 * 100;
        return (
          <div key={m.symbol} className="flex items-center justify-between">
            <span className="font-bold text-white w-16">{m.symbol}</span>
            <span className={m.fundingRate > 0 ? "text-neon-green" : "text-danger"}>
              {m.fundingRate > 0 ? "+" : ""}
              {(m.fundingRate * 100).toFixed(4)}%
            </span>
            <span className="text-slate-500">
              ({annualized > 0 ? "+" : ""}
              {annualized.toFixed(1)}% /yr)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HelpCard() {
  return (
    <div
      className="rounded-xl p-3 space-y-2 text-[11px] font-mono"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="text-slate-300 font-semibold">Try asking me:</div>
      <div className="space-y-1 text-slate-400">
        <div>• <span className="text-slate-200">SOL</span> — market data + social sentiment</div>
        <div>• <span className="text-slate-200">trending</span> — top tokens by social volume</div>
        <div>• <span className="text-slate-200">my positions</span> — your open trades & liq levels</div>
        <div>• <span className="text-slate-200">funding</span> — current funding rates</div>
        <div>• <span className="text-slate-200">what is liquidation?</span> — Elfa explains it simply</div>
        <div>• <span className="text-slate-200">explain funding rates</span> — any concept, plain English</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MarketAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // sessionId persists across messages for multi-turn Elfa chat memory
  const elfaSessionId = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: (
        <div className="space-y-2">
          <p className="text-slate-300 text-[11px] font-mono leading-relaxed">
            Hey! I&apos;m powered by <span className="text-neon-green">Elfa AI</span>. Ask me anything
            — market data, &quot;what is liquidation?&quot;, &quot;explain funding rates&quot; — I&apos;ll answer in plain English.
          </p>
          <HelpCard />
        </div>
      ),
      timestamp: 0,
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { markets, positions } = usePacifica();

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [isOpen, messages]);

  const addMessage = useCallback((role: MessageRole, content: React.ReactNode) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, content, timestamp: Date.now() },
    ]);
  }, []);

  const handleQuery = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q) return;

      addMessage("user", <span className="text-white text-[11px] font-mono">{q}</span>);
      setInput("");
      setLoading(true);

      try {
        const lower = q.toLowerCase();

        // ── "my positions" or "liquidation" ──────────────────────────────────
        if (
          lower.includes("my position") ||
          lower.includes("liq") ||
          lower.includes("positions")
        ) {
          addMessage("assistant", <LiqExplainer positions={positions} />);
          return;
        }

        // ── "trending" ────────────────────────────────────────────────────────
        if (lower.includes("trending") || lower === "top") {
          const tokens = await getTrendingTokens("24h", 8);
          addMessage(
            "assistant",
            tokens.length > 0 ? (
              <TrendingList tokens={tokens} />
            ) : (
              <span className="text-slate-400 text-[11px] font-mono">
                Couldn&apos;t fetch trending data right now.
              </span>
            )
          );
          return;
        }

        // ── "funding" or "arb" ────────────────────────────────────────────────
        if (lower.includes("funding") || lower.includes("arb")) {
          addMessage("assistant", <FundingList markets={markets} />);
          return;
        }

        // ── "help" ────────────────────────────────────────────────────────────
        if (lower === "help" || lower === "?") {
          addMessage("assistant", <HelpCard />);
          return;
        }

        // ── Symbol lookup: only match known Pacifica markets or bare ticker (e.g. "SOL") ──
        const knownSymbols = markets.map((m) => m.symbol.toUpperCase());
        const upperQ = q.toUpperCase().trim();
        // Prefer exact or substring match against known markets
        const matchedMarketSymbol =
          knownSymbols.find((s) => upperQ === s) ??
          knownSymbols.find((s) => upperQ.includes(s));
        // Accept as a symbol only if the user typed it in all-caps (e.g. "SOL", "BTC") — not lowercase words like "hey"
        const isBareSymbol = /^[A-Z]{2,6}$/.test(q.trim()) && !matchedMarketSymbol;
        const symbolMatch = matchedMarketSymbol ?? (isBareSymbol ? upperQ : null);

        if (symbolMatch) {
          const market = markets.find((m) => m.symbol === symbolMatch);
          const position = positions.find((p) => p.symbol === symbolMatch);

          const [mentions, trendingList] = await Promise.allSettled([
            getTopMentions(symbolMatch, 3),
            getTrendingTokens("24h", 50),
          ]);

          const mentionData: ElfaMention[] =
            mentions.status === "fulfilled" ? mentions.value : [];
          const trendingData: TrendingToken[] =
            trendingList.status === "fulfilled" ? trendingList.value : [];
          const trendingToken = trendingData.find(
            (t) => t.symbol === symbolMatch || t.symbol === symbolMatch.replace(/-PERP$/, "")
          );

          addMessage(
            "assistant",
            <div className="space-y-2">
              {market ? (
                <MarketSummaryCard market={market} position={position} />
              ) : (
                <div className="text-slate-400 text-[11px] font-mono">
                  {symbolMatch} isn&apos;t listed on Pacifica, but here&apos;s the social data:
                </div>
              )}
              {trendingToken ? (
                <SentimentCard token={trendingToken} mentions={mentionData} />
              ) : mentionData.length > 0 ? (
                <SentimentCard
                  token={{
                    id: symbolMatch,
                    symbol: symbolMatch,
                    mentionCount: mentionData.length,
                    changePercent: 0,
                    sentiment: "NEUTRAL",
                    timestamp: Date.now(),
                  }}
                  mentions={mentionData}
                />
              ) : (
                <div className="text-slate-500 text-[10px] font-mono">
                  No social signal found for {symbolMatch} right now.
                </div>
              )}
            </div>
          );
          return;
        }

        // ── Natural language fallback → Elfa /v2/chat ─────────────────────────
        const chatBody: Record<string, unknown> = {
          path: "/v2/chat",
          analysisType: "chat",
          message: q,
          speed: "fast",
        };
        if (elfaSessionId.current) chatBody.sessionId = elfaSessionId.current;

        const elfaRes = await fetch("/api/elfa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chatBody),
        });

        if (elfaRes.ok) {
          const json = await elfaRes.json() as Record<string, unknown>;
          // Save sessionId for conversation continuity
          const newSession =
            (json.data as Record<string, unknown>)?.sessionId ??
            (json as Record<string, unknown>).sessionId;
          if (typeof newSession === "string") elfaSessionId.current = newSession;

          // Extract reply text from various possible shapes
          const replyText: string =
            String(
              (json.data as Record<string, unknown>)?.message ??
              (json.data as Record<string, unknown>)?.response ??
              (json.data as Record<string, unknown>)?.content ??
              json.message ??
              json.response ??
              "Elfa couldn't answer that right now."
            );

          addMessage(
            "assistant",
            <div
              className="rounded-xl p-3 text-[11px] font-mono text-slate-200 leading-relaxed space-y-1"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-1 text-[9px] text-slate-500 mb-1">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#00FF87" }} />
                Elfa AI
              </div>
              {replyText.split("\n").filter(Boolean).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          );
        } else {
          addMessage(
            "assistant",
            <div className="space-y-2">
              <span className="text-slate-400 text-[11px] font-mono">
                Elfa couldn&apos;t answer that. Try a specific symbol or one of these:
              </span>
              <HelpCard />
            </div>
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [markets, positions, addMessage]
  );

  const quickActions = ["SOL", "trending", "my positions", "funding"];

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-[74px] right-4 z-50 flex items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105"
        style={{
          width: 44,
          height: 44,
          background: isOpen
            ? "rgba(0,98,255,0.9)"
            : "rgba(15,20,40,0.95)",
          border: "1px solid rgba(0,98,255,0.5)",
          boxShadow: isOpen
            ? "0 0 20px rgba(0,98,255,0.4)"
            : "0 4px 16px rgba(0,0,0,0.5)",
        }}
        title="Market Assistant"
      >
        {isOpen ? (
          <X className="w-4 h-4 text-white" />
        ) : (
          <MessageSquare className="w-4 h-4 text-blue-400" />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-[126px] right-4 z-50 flex flex-col rounded-2xl overflow-hidden"
          style={{
            width: 360,
            maxHeight: "60vh",
            background: "rgba(8,8,14,0.97)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            backdropFilter: "blur(16px)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,98,255,0.2)" }}
            >
              <MessageSquare className="w-3 h-3 text-blue-400" />
            </div>
            <span className="text-[12px] font-semibold text-white">Market Assistant</span>
            <span
              className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-mono"
              style={{ background: "rgba(0,255,135,0.1)", color: "#00FF87" }}
            >
              ELFA
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="ml-auto text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "user" ? (
                  <div
                    className="max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2"
                    style={{
                      background: "rgba(0,98,255,0.2)",
                      border: "1px solid rgba(0,98,255,0.3)",
                    }}
                  >
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[95%]">{msg.content}</div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-mono text-slate-400"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Fetching data…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick action chips */}
          <div
            className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none shrink-0"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            {quickActions.map((a) => (
              <button
                key={a}
                onClick={() => handleQuery(a)}
                disabled={loading}
                className="shrink-0 text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  color: "#94a3b8",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {a}
              </button>
            ))}
          </div>

          {/* Input */}
          <div
            className="flex items-center gap-2 px-3 pb-3 pt-1 shrink-0"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQuery(input); } }}
              placeholder="Ask about any market…"
              disabled={loading}
              className="flex-1 text-[11px] font-mono text-white rounded-xl px-3 py-2 focus:outline-none placeholder:text-slate-600 disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            <button
              onClick={() => handleQuery(input)}
              disabled={loading || !input.trim()}
              className="flex items-center justify-center w-8 h-8 rounded-xl transition-all disabled:opacity-40"
              style={{
                background: input.trim() ? "rgba(0,98,255,0.8)" : "rgba(255,255,255,0.07)",
              }}
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
