"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { type ReactNode } from "react";
import { PRIVY_APP_ID, privyConfig } from "@/lib/privy";

export default function PrivyProvider({ children }: { children: ReactNode }) {
  return (
    <BasePrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      {children}
    </BasePrivyProvider>
  );
}
