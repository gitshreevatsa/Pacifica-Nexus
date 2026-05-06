import { create } from "zustand";
import type { AgentKeypair } from "@/lib/signing";

interface AgentKeyState {
  /** Public key — safe to display in UI. */
  publicKey:  string | null;
  /** Private key — held ONLY in memory, never persisted to localStorage. */
  privateKey: string | null;
  setKeypair:  (kp: AgentKeypair) => void;
  clearKeypair: () => void;
}

export const useAgentKeyStore = create<AgentKeyState>((set) => ({
  publicKey:  null,
  privateKey: null,

  setKeypair: (kp) => {
    set({ publicKey: kp.publicKey, privateKey: kp.privateKey });
  },

  clearKeypair: () => {
    set({ publicKey: null, privateKey: null });
  },
}));
