/**
 * agentKeyStore.ts
 * Shared Zustand store for the agent keypair so all usePacifica() instances
 * see the same key state without needing a full page refresh.
 */

import { create } from "zustand";
import { loadAgentKeypair, storeAgentKeypair, clearAgentKeypair, type AgentKeypair } from "@/lib/signing";

interface AgentKeyState {
  publicKey: string | null;
  setKeypair: (kp: AgentKeypair) => void;
  clearKeypair: () => void;
}

export const useAgentKeyStore = create<AgentKeyState>((set) => ({
  // Initialize from localStorage so state is correct on first mount
  publicKey: typeof window !== "undefined" ? (loadAgentKeypair()?.publicKey ?? null) : null,

  setKeypair: (kp) => {
    storeAgentKeypair(kp);
    set({ publicKey: kp.publicKey });
  },

  clearKeypair: () => {
    clearAgentKeypair();
    set({ publicKey: null });
  },
}));
