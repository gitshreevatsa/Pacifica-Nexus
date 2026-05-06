"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, AlertCircle, Trash2 } from "lucide-react";
import { loadVault, decryptKey, deleteVault } from "@/lib/keyVault";
import { importAgentKey, type AgentKeypair } from "@/lib/signing";
import { trackUnlockFailed } from "@/lib/telemetry";

interface UnlockKeyModalProps {
  onUnlock: (kp: AgentKeypair) => void;
  /** Called after the vault is wiped so the parent can show the import flow. */
  onReplaceKey: () => void;
}

/**
 * Shown at app load when an encrypted vault exists in localStorage
 * but the decrypted key is not yet in memory (e.g. after page refresh).
 * The user enters their passphrase — the private key never leaves memory.
 *
 * "Use a different key" wipes the vault and returns to the import flow,
 * covering: forgot passphrase, new account, new API key.
 */
export default function UnlockKeyModal({ onUnlock, onReplaceKey }: UnlockKeyModalProps) {
  const [passphrase,    setPassphrase]   = useState("");
  const [showPass,      setShowPass]     = useState(false);
  const [error,         setError]        = useState("");
  const [loading,       setLoading]      = useState(false);
  const [confirmWipe,   setConfirmWipe]  = useState(false);
  const [failCount,     setFailCount]    = useState(0);

  const handleUnlock = async () => {
    if (!passphrase) { setError("Enter your passphrase."); return; }
    const vault = loadVault();
    if (!vault) { setError("No vault found — please re-import your key."); return; }

    setLoading(true);
    setError("");
    try {
      const privKeyB58 = await decryptKey(vault, passphrase);
      const kp = importAgentKey(privKeyB58);
      onUnlock(kp);
    } catch (e) {
      const next = failCount + 1;
      setFailCount(next);
      trackUnlockFailed(next);
      setError(e instanceof Error ? e.message : "Wrong passphrase — try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleUnlock();
  };

  const handleWipe = () => {
    deleteVault();
    onReplaceKey();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="rounded-2xl w-full max-w-sm mx-4 p-6 animate-fade-in"
        style={{ background: "rgba(8,8,8,0.97)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        {confirmWipe ? (
          /* ── Confirm wipe ── */
          <>
            <div className="flex flex-col items-center gap-2 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,59,48,0.15)" }}>
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <h3 className="text-base font-bold text-white">Remove stored key?</h3>
              <p className="text-xs text-slate-400 text-center">
                This deletes the encrypted vault from this device. Your private key is unaffected — you can re-import it with a new passphrase.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmWipe(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-300 transition-colors"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleWipe}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors bg-danger hover:bg-danger/80"
              >
                Remove & re-import
              </button>
            </div>
          </>
        ) : (
          /* ── Unlock form ── */
          <>
            <div className="flex flex-col items-center gap-2 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,98,255,0.15)" }}>
                <Lock className="w-5 h-5 text-electric" />
              </div>
              <h3 className="text-base font-bold text-white">Unlock Agent Key</h3>
              <p className="text-xs text-slate-400 text-center">
                Enter your passphrase to decrypt your agent key for this session.
                The key is held in memory only and cleared on refresh.
              </p>
            </div>

            <div className="relative mb-3">
              <input
                type={showPass ? "text" : "password"}
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="Session passphrase…"
                autoFocus
                className="w-full text-white text-xs font-mono rounded-lg px-3 py-2.5 pr-10 focus:outline-none placeholder:text-slate-600"
                style={{ background: "rgba(255,255,255,0.05)" }}
              />
              <button
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {error && (
              <p className="text-danger text-[11px] mb-3 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {error}
              </p>
            )}

            <button
              onClick={handleUnlock}
              disabled={loading || !passphrase}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 mb-3"
              style={{ background: loading ? "rgba(0,98,255,0.4)" : "rgba(0,98,255,0.9)", color: "#fff" }}
            >
              {loading ? "Decrypting…" : "Unlock"}
            </button>

            <button
              onClick={() => setConfirmWipe(true)}
              className="w-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors py-1"
            >
              Forgot passphrase or want to use a different key?
            </button>
          </>
        )}
      </div>
    </div>
  );
}
