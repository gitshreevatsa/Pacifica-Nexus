/**
 * SessionBar.tsx
 * Top bar: external wallet connect (MetaMask/Phantom/Solflare), agent key, account health.
 */

"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Key,
  LogOut,
  CheckCircle,
  Zap,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Copy,
  X,
  Wallet,
  Bell,
  BellRing,
  Plus,
  Trash2,
} from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import { useFundingAlertStore } from "@/stores/fundingAlertStore";
import { useFundingAlerts } from "@/hooks/useFundingAlerts";
import { truncateAddress, formatUSD } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Market } from "@/types";

// ─── Agent Key Modal ──────────────────────────────────────────────────────────

function AgentKeyModal({
  onImport,
  onClose,
  hasSolanaWallet,
}: {
  onImport: (key: string) => void;
  onClose: () => void;
  hasSolanaWallet: boolean;
}) {
  const [value, setValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) { setError("Paste your agent private key."); return; }
    try {
      onImport(trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid key format");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6 animate-fade-in" style={{ background: "rgba(8,8,8,0.97)", backdropFilter: "blur(24px)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white">Connect Agent Key</h3>
            <p className="text-xs text-slate-400 mt-1">
              Required for one-click trading. Never leaves your browser.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!hasSolanaWallet && (
          <div className="flex items-start gap-2 bg-warning/10 rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-[11px] text-warning leading-relaxed">
              Connect your wallet first — the agent key must match the wallet registered at Pacifica.
            </p>
          </div>
        )}

        <div className="rounded-xl p-3 mb-4 space-y-2" style={{ background: "rgba(255,255,255,0.04)" }}>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">Steps</p>
          {[
            { n: 1, text: "Create an Agent Key at Pacifica", link: "https://app.pacifica.fi/apikey" },
            { n: 2, text: "Copy the private key (base58)" },
            { n: 3, text: "Paste below — stored only in sessionStorage" },
          ].map(({ n, text, link }) => (
            <div key={n} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-electric/20 text-electric text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                {n}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-300">{text}</span>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    className="text-electric-300 hover:text-electric transition-colors">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="relative mb-1">
          <input
            type={showKey ? "text" : "password"}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            placeholder="Paste agent private key (base58)…"
            className="w-full text-white text-xs font-mono rounded-lg px-3 py-2.5 pr-10 focus:outline-none placeholder:text-slate-600"
            style={{ background: "rgba(255,255,255,0.05)" }}
          />
          <button onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Clarify what will be displayed after import */}
        <p className="text-[10px] text-slate-500 mb-3 pl-1">
          The badge will show your <span className="text-slate-400">public key</span> (derived from the private key you paste — this is intentional).
        </p>

        {error && (
          <p className="text-danger text-[11px] mb-3 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}

        <button onClick={handleSubmit} disabled={!value.trim()}
          className="w-full bg-electric hover:bg-electric-600 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
          Connect Key
        </button>
      </div>
    </div>
  );
}

// ─── Agent Status Badge ───────────────────────────────────────────────────────

function AgentBadge({ publicKey, onClear }: { publicKey: string; onClear: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-center gap-1.5 bg-neon-green/5 rounded-full px-2.5 py-1 text-[10px] font-mono"
      title={`Agent public key: ${publicKey}`}>
      <CheckCircle className="w-3 h-3 text-neon-green" />
      <span className="text-neon-green">Agent</span>
      <span className="text-slate-500 text-[9px]">pub:</span>
      <span className="text-slate-300">{truncateAddress(publicKey, 4)}</span>
      <button onClick={copy} className="text-slate-500 hover:text-white transition-colors" title="Copy public key">
        {copied ? <CheckCircle className="w-2.5 h-2.5 text-neon-green" /> : <Copy className="w-2.5 h-2.5" />}
      </button>
      <button onClick={onClear} className="text-slate-500 hover:text-danger transition-colors ml-1" title="Remove key">
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ─── Funding Alerts Panel ────────────────────────────────────────────────────

function FundingAlertsPanel({
  markets,
  onClose,
}: {
  markets: Market[];
  onClose: () => void;
}) {
  const { alerts, addAlert, removeAlert } = useFundingAlertStore();
  const [sym, setSym]       = useState(markets[0]?.symbol.replace("-PERP", "") ?? "");
  const [threshold, setThreshold] = useState("0.01");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [err, setErr]       = useState("");

  const handleAdd = () => {
    const t = parseFloat(threshold);
    if (!sym)        { setErr("Choose a symbol."); return; }
    if (isNaN(t) || t <= 0) { setErr("Enter a valid threshold > 0."); return; }
    addAlert({ symbol: sym, threshold: t / 100, direction }); // store as decimal
    setErr("");
  };

  return (
    <div
      className="absolute top-full right-0 mt-1 w-80 rounded-2xl z-50 overflow-hidden animate-fade-in"
      style={{ background: "rgba(10,10,10,0.97)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <BellRing className="w-3.5 h-3.5 text-electric-300" />
          <span className="text-sm font-semibold text-white">Funding Alerts</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Add new alert */}
      <div className="px-4 py-3 space-y-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">New Alert</p>

        <div className="flex gap-2">
          {/* Symbol */}
          <select
            value={sym}
            onChange={(e) => setSym(e.target.value)}
            className="flex-1 text-[11px] font-mono text-white rounded-lg px-2 py-1.5 focus:outline-none appearance-none"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {markets.map((m) => (
              <option key={m.symbol} value={m.symbol.replace("-PERP", "")} style={{ background: "#0a0a0a" }}>
                {m.symbol.replace("-PERP", "")}
              </option>
            ))}
          </select>

          {/* Direction */}
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "above" | "below")}
            className="text-[11px] font-mono text-white rounded-lg px-2 py-1.5 focus:outline-none appearance-none"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <option value="above" style={{ background: "#0a0a0a" }}>Above</option>
            <option value="below" style={{ background: "#0a0a0a" }}>Below</option>
          </select>
        </div>

        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type="number"
              min="0"
              step="0.001"
              value={threshold}
              onChange={(e) => { setThreshold(e.target.value); setErr(""); }}
              placeholder="0.01"
              className="w-full text-[11px] font-mono text-white rounded-lg px-2 py-1.5 pr-6 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)" }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%/h</span>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-colors"
            style={{ background: "rgba(0,98,255,0.2)", border: "1px solid rgba(0,98,255,0.3)" }}
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>

        {err && <p className="text-[10px] text-danger">{err}</p>}
      </div>

      {/* Alert list */}
      <div className="px-4 py-3 max-h-48 overflow-y-auto custom-scrollbar">
        {alerts.length === 0 ? (
          <p className="text-[10px] text-slate-600 text-center py-2">No alerts set.</p>
        ) : (
          <div className="space-y-1.5">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
                style={{ background: a.triggered ? "rgba(255,184,0,0.06)" : "rgba(255,255,255,0.03)" }}
              >
                <div className="flex items-center gap-2">
                  {a.triggered
                    ? <BellRing className="w-3 h-3 text-warning shrink-0" />
                    : <Bell     className="w-3 h-3 text-slate-500 shrink-0" />}
                  <span className="text-[11px] font-mono text-white">{a.symbol}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {a.direction} {(a.threshold * 100).toFixed(3)}%/h
                  </span>
                  {a.triggered && (
                    <span className="text-[9px] font-mono text-warning">FIRED</span>
                  )}
                </div>
                <button
                  onClick={() => removeAlert(a.id)}
                  className="text-slate-600 hover:text-danger transition-colors ml-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Funding Rate Ticker ──────────────────────────────────────────────────────

function FundingTicker({ markets }: { markets: Market[] }) {
  const top = markets
    .filter((m) => m.volume24h > 0)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 10);

  if (top.length === 0) return null;

  // Double the list so the CSS ticker loop is seamless
  const items = [...top, ...top];

  return (
    <div
      className="overflow-hidden"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(0,0,0,0.25)" }}
    >
      <div className="flex animate-ticker whitespace-nowrap py-1" style={{ width: "max-content" }}>
        {items.map((m, i) => {
          const sym = m.symbol.replace("-PERP", "");
          const fundingPct = (m.fundingRate * 100).toFixed(4);
          const fundingPos = m.fundingRate >= 0;
          const changePos = m.priceChange24h >= 0;
          return (
            <span
              key={`${m.symbol}-${i}`}
              className="flex items-center gap-2 shrink-0 px-5 text-[10px] font-mono"
              style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="text-slate-400 font-semibold">{sym}</span>
              <span className={changePos ? "text-neon-green" : "text-danger"}>
                {changePos ? "+" : ""}{m.priceChange24h.toFixed(2)}%
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">F</span>
              <span className={fundingPos ? "text-electric-300" : "text-warning"}>
                {fundingPos ? "+" : ""}{fundingPct}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SessionBar() {
  const { connected, disconnect, wallet, publicKey } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const {
    walletAddress,
    agentPublicKey,
    hasAgent,
    keyStored,
    accountHealth,
    markets,
    importKey,
    clearAgent,
    agentKeyRegistered,
    isCheckingAgentKey,
    registerAgentKey,
    isRegisteringAgentKey,
    builderApproved,
    isCheckingApproval,
    approveBuilderCode,
    isApprovingBuilderCode,
  } = usePacifica();

  const { alerts } = useFundingAlertStore();
  const firedAlerts = useFundingAlerts(markets);

  const [showModal,  setShowModal]  = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);

  const handleImport = useCallback((key: string) => { importKey(key); }, [importKey]);

  const activeAlertCount  = alerts.length;
  const firedCount        = alerts.filter((a) => a.triggered).length;
  const hasNewFired       = firedAlerts.length > 0;

  return (
    <>
      <header className="flex items-center justify-between px-5 py-2.5 shrink-0 z-10" style={{ background: "rgba(255,255,255,0.02)", backdropFilter: "blur(20px)" }}>
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-gradient-electric rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-black">⚡</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">Pacifica Nexus</h1>
          </div>
        </div>

        {/* Center: account health */}
        {accountHealth && (
          <div className="hidden md:flex items-center gap-6 text-xs font-mono">
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase">Equity</p>
              <p className="text-white font-semibold">{formatUSD(accountHealth.equity)}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase">Available</p>
              <p className="text-neon-green font-semibold">{formatUSD(accountHealth.availableMargin)}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase">Unreal. PnL</p>
              <p className={cn("font-semibold", accountHealth.unrealizedPnl >= 0 ? "text-neon-green" : "text-danger")}>
                {accountHealth.unrealizedPnl >= 0 ? "+" : ""}{formatUSD(accountHealth.unrealizedPnl)}
              </p>
            </div>
          </div>
        )}

        {/* Right: alerts + wallet + agent key */}
        <div className="flex items-center gap-2 relative">
          {/* Funding alerts bell */}
          <div className="relative">
            <button
              onClick={() => setShowAlerts((v) => !v)}
              className={cn(
                "relative p-1.5 rounded-md transition-colors",
                hasNewFired
                  ? "text-warning hover:bg-warning/10"
                  : activeAlertCount > 0
                    ? "text-electric-300 hover:bg-electric/10"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              )}
              title="Funding Rate Alerts"
            >
              {hasNewFired || firedCount > 0
                ? <BellRing className="w-3.5 h-3.5" />
                : <Bell     className="w-3.5 h-3.5" />}
              {activeAlertCount > 0 && (
                <span
                  className={cn(
                    "absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center",
                    firedCount > 0 ? "bg-warning text-black" : "bg-electric text-white"
                  )}
                >
                  {activeAlertCount}
                </span>
              )}
            </button>

            {showAlerts && (
              <FundingAlertsPanel
                markets={markets}
                onClose={() => setShowAlerts(false)}
              />
            )}
          </div>

          {connected && wallet ? (
            <>
              <span className="hidden sm:inline text-[10px] font-mono text-slate-400 px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                {wallet.adapter.name} · {truncateAddress(publicKey?.toBase58() ?? "", 5)}
              </span>

              {/* Agent key */}
              {keyStored && agentPublicKey ? (
                <AgentBadge publicKey={agentPublicKey} onClear={clearAgent} />
              ) : (
                <button onClick={() => setShowModal(true)}
                  title="A session-scoped signing key that lets this terminal place orders without wallet popups. Stored only in sessionStorage — never transmitted."
                  className="flex items-center gap-1.5 bg-electric hover:bg-electric-600 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-electric animate-pulse">
                  <Key className="w-3 h-3" />
                  Authorize Agent Key
                </button>
              )}

              <button onClick={() => disconnect()}
                className="text-slate-500 hover:text-danger transition-colors p-1.5 rounded-md hover:bg-danger/10"
                title="Disconnect">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button onClick={() => openWalletModal(true)}
              className="flex items-center gap-2 bg-electric hover:bg-electric-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shadow-electric">
              <Wallet className="w-3.5 h-3.5" />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Onboarding hint: wallet connected but no agent key yet */}
      {connected && !keyStored && (
        <div className="flex items-center gap-2 px-5 py-1.5 text-[10px] font-mono text-slate-400" style={{ background: "rgba(77,143,255,0.06)", borderBottom: "1px solid rgba(77,143,255,0.12)" }}>
          <Key className="w-3 h-3 text-electric-300 shrink-0" />
          <span>
            Wallet connected — click{" "}
            <span className="text-electric-300 font-semibold">Authorize Agent Key</span>{" "}
            to enable one-click trading.{" "}
            <span className="text-slate-500">
              An Agent Key is a session-scoped signing key that lets the terminal submit orders without wallet popups — it never leaves your browser.
            </span>
          </span>
        </div>
      )}

      {/* Step 1: Agent Key Registration Banner */}
      {hasAgent && !isCheckingAgentKey && !agentKeyRegistered && (
        <div className="flex items-center justify-between px-5 py-2 bg-warning/10 text-xs">
          <div className="flex items-center gap-2 text-warning">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              <span className="font-bold text-white">Authorize agent key</span> — your wallet must sign once to allow this key to trade on its behalf.
            </span>
          </div>
          <button
            onClick={() => registerAgentKey().catch((e) => console.error("[RegisterKey]", e))}
            disabled={isRegisteringAgentKey}
            className="ml-4 shrink-0 flex items-center gap-1.5 bg-warning hover:bg-warning/80 disabled:opacity-50 text-black font-semibold px-3 py-1 rounded-lg transition-colors text-[11px]">
            <Key className="w-3 h-3" />
            {isRegisteringAgentKey ? "Authorizing…" : "Authorize"}
          </button>
        </div>
      )}

      {/* Step 2: Builder Code Approval Banner */}
      {hasAgent && agentKeyRegistered && !isCheckingApproval && !builderApproved && (
        <div className="flex items-center justify-between px-5 py-2 bg-electric/10 text-xs">
          <div className="flex items-center gap-2 text-electric-300">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>
              Approve <span className="font-bold text-white">Pacifica</span> builder code to enable trading rewards. One-time.
            </span>
          </div>
          <button onClick={() => approveBuilderCode().catch(console.error)}
            disabled={isApprovingBuilderCode}
            className="ml-4 shrink-0 flex items-center gap-1.5 bg-electric hover:bg-electric-600 disabled:opacity-50 text-white font-semibold px-3 py-1 rounded-lg transition-colors text-[11px]">
            <Key className="w-3 h-3" />
            {isApprovingBuilderCode ? "Approving…" : "Approve Now"}
          </button>
        </div>
      )}

      {/* Funding Rate Ticker */}
      <FundingTicker markets={markets} />

      {showModal && (
        <AgentKeyModal
          onImport={handleImport}
          onClose={() => setShowModal(false)}
          hasSolanaWallet={!!walletAddress}
        />
      )}
    </>
  );
}
