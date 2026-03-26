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
} from "lucide-react";
import { usePacifica } from "@/hooks/usePacifica";
import { truncateAddress, formatUSD } from "@/lib/utils";
import { cn } from "@/lib/utils";

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
      <div className="bg-midnight border border-surface-border rounded-xl w-full max-w-md mx-4 p-6 shadow-electric animate-fade-in">
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
          <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-[11px] text-warning leading-relaxed">
              Connect your wallet first — the agent key must match the wallet registered at Pacifica.
            </p>
          </div>
        )}

        <div className="bg-surface-overlay rounded-lg p-3 mb-4 space-y-2">
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
            className="w-full bg-surface-raised border border-surface-border text-white text-xs font-mono rounded-lg px-3 py-2.5 pr-10 focus:outline-none focus:border-electric/60 placeholder:text-slate-600"
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
    <div className="flex items-center gap-1.5 bg-neon-green/5 border border-neon-green/25 rounded-full px-2.5 py-1 text-[10px] font-mono"
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

  const [showModal, setShowModal] = useState(false);

  const handleImport = useCallback((key: string) => { importKey(key); }, [importKey]);

  return (
    <>
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-surface-border bg-midnight shrink-0 z-10">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-gradient-electric rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-black">PN</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">Pacifica Nexus</h1>
            <p className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Builder: POINTPULSE</p>
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

        {/* Right: wallet + agent key */}
        <div className="flex items-center gap-2">
          {connected && wallet ? (
            <>
              <span className="hidden sm:inline text-[10px] font-mono text-slate-400 bg-surface-raised px-2.5 py-1 rounded-full border border-surface-border">
                {wallet.adapter.name} · {truncateAddress(publicKey?.toBase58() ?? "", 5)}
              </span>

              {/* Agent key */}
              {keyStored && agentPublicKey ? (
                <AgentBadge publicKey={agentPublicKey} onClear={clearAgent} />
              ) : (
                <button onClick={() => setShowModal(true)}
                  className="flex items-center gap-1.5 bg-electric hover:bg-electric-600 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-electric">
                  <Key className="w-3 h-3" />
                  Agent Key
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

      {/* Step 1: Agent Key Registration Banner */}
      {hasAgent && !isCheckingAgentKey && !agentKeyRegistered && (
        <div className="flex items-center justify-between px-5 py-2 bg-warning/10 border-b border-warning/30 text-xs">
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
        <div className="flex items-center justify-between px-5 py-2 bg-electric/10 border-b border-electric/30 text-xs">
          <div className="flex items-center gap-2 text-electric-300">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>
              Approve <span className="font-bold text-white">POINTPULSE</span> builder code to enable trading rewards. One-time.
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
