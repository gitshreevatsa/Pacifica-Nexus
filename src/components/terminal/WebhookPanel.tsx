/**
 * WebhookPanel.tsx
 * TradingView Webhook setup + live event log.
 * Polls GET /api/webhook/tradingview every 5 s via React Query.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Webhook, Copy, Check, AlertTriangle, Circle } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import type { WebhookEvent } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXAMPLE_ALERT = `{
  "secret": "your-shared-secret",
  "agentKey": "your-base58-agent-private-key",
  "walletAddress": "your-solana-wallet-address",
  "symbol": "SOL-PERP",
  "side": "{{strategy.order.action == 'buy' ? 'LONG' : 'SHORT'}}",
  "size": 1,
  "orderType": "market"
}`;

// Only the secret lives server-side — credentials come per-user in the alert body
const ENV_BLOCK = `TRADINGVIEW_WEBHOOK_SECRET=your-shared-secret`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function WebhookPanel() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  // Compute origin after mount (SSR safe)
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const webhookUrl = origin ? `${origin}/api/webhook/tradingview` : "";

  const handleCopy = useCallback(() => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    });
  }, [webhookUrl]);

  // ── Poll event log ──────────────────────────────────────────────────────────
  const { data: events = [] } = useQuery<WebhookEvent[]>({
    queryKey: ["webhook", "tradingview", "events"],
    queryFn: async () => {
      const res = await fetch("/api/webhook/tradingview");
      if (!res.ok) throw new Error("Failed to fetch webhook events");
      return res.json();
    },
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  // "LIVE" badge: any event in the last 2 minutes
  const isLive = events.some((e) => Date.now() - e.timestamp < 120_000);
  const recentRows = events.slice(0, 10);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-electric-300 shrink-0" />
            <h2 className="text-sm font-semibold text-white">TradingView Webhook</h2>
          </div>
          {isLive && (
            <span
              className="flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full animate-pulse"
              style={{ background: "rgba(0,255,135,0.1)", color: "#00ff87" }}
            >
              <Circle className="w-1.5 h-1.5 fill-current" />
              LIVE
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Automate orders from TradingView strategy alerts.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar space-y-3">

        {/* ── Section 1: Setup ──────────────────────────────────────────────── */}
        <div className="rounded-xl p-3 space-y-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Setup</p>

          {/* Webhook URL row */}
          <div>
            <p className="term-label mb-1">Webhook URL</p>
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 py-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="flex-1 text-[11px] font-mono text-slate-300 truncate select-all">
                {webhookUrl || "loading…"}
              </span>
              <button
                onClick={handleCopy}
                disabled={!webhookUrl}
                className={cn(
                  "shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-all",
                  copied
                    ? "text-neon-green"
                    : "text-slate-400 hover:text-white"
                )}
                style={{ background: "rgba(255,255,255,0.06)" }}
                title="Copy webhook URL"
              >
                {copied ? (
                  <><Check className="w-3 h-3" /> Copied</>
                ) : (
                  <><Copy className="w-3 h-3" /> Copy</>
                )}
              </button>
            </div>
          </div>

          {/* Env var warning */}
          <div
            className="rounded-lg p-2.5 space-y-1.5"
            style={{ background: "rgba(255,184,0,0.06)", border: "1px solid rgba(255,184,0,0.14)" }}
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
              <span className="text-[10px] font-semibold text-warning">Required env vars</span>
            </div>
            <pre
              className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap break-all leading-relaxed"
            >
              {ENV_BLOCK}
            </pre>
          </div>
        </div>

        {/* ── Section 2: Example Alert JSON ─────────────────────────────────── */}
        <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
            Example Alert JSON
          </p>
          <pre
            className="text-[11px] font-mono text-slate-300 rounded-lg p-2.5 overflow-x-auto leading-relaxed"
            style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {EXAMPLE_ALERT}
          </pre>
          <p className="text-[10px] text-slate-500">
            Paste this into your TradingView alert&rsquo;s &ldquo;Message&rdquo; field. The{" "}
            <span className="text-slate-300 font-mono">{"{{...}}"}</span> expression is a
            TradingView template variable.
          </p>
        </div>

        {/* ── Section 3: Recent Webhook Events ─────────────────────────────── */}
        <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
            Recent Webhook Events
          </p>

          {recentRows.length === 0 ? (
            <p className="text-center text-slate-600 text-xs py-4 font-mono">
              No webhook events yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono border-separate border-spacing-y-0.5">
                <thead>
                  <tr>
                    {["Time", "Symbol", "Side", "Size", "Status"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[10px] font-semibold text-slate-500 pb-1.5 pr-3 last:pr-0"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((evt) => (
                    <tr
                      key={evt.id}
                      className="transition-colors"
                      title={evt.error ?? `Order #${evt.orderId ?? "—"}`}
                    >
                      <td className="text-slate-500 pr-3 py-0.5 whitespace-nowrap">
                        {formatTime(evt.timestamp)}
                      </td>
                      <td className="text-white pr-3 py-0.5 whitespace-nowrap">
                        {evt.symbol}
                      </td>
                      <td className="pr-3 py-0.5">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                            evt.side === "LONG"
                              ? "bg-neon-green/10 text-neon-green"
                              : "bg-danger/10 text-danger"
                          )}
                        >
                          {evt.side}
                        </span>
                      </td>
                      <td className="text-slate-300 pr-3 py-0.5">{evt.size}</td>
                      <td className="py-0.5">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                            evt.status === "ok"
                              ? "bg-neon-green/10 text-neon-green"
                              : "bg-danger/10 text-danger"
                          )}
                        >
                          {evt.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
