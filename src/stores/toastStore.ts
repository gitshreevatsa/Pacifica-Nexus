import { create } from "zustand";

interface ToastState {
  message: string | null;
  variant: "info" | "error" | "success";
  show: (msg: string, variant?: "info" | "error" | "success") => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: "info",
  show: (msg, variant = "info") => {
    set({ message: msg, variant });
    setTimeout(() => set({ message: null }), 4_000);
  },
  clear: () => set({ message: null }),
}));

/** Call this outside React (e.g. in mutation onError callbacks). */
export const toast = {
  error: (msg: string) => useToastStore.getState().show(msg, "error"),
  success: (msg: string) => useToastStore.getState().show(msg, "success"),
  info: (msg: string) => useToastStore.getState().show(msg, "info"),
};
