"use client";

import { useState, useCallback } from "react";

export function useToast(duration = 3_000) {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = useCallback(
    (msg: string) => {
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), duration);
    },
    [duration]
  );
  return [toastMsg, showToast] as const;
}
