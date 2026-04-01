import type { Metadata, Viewport } from "next";
import "./globals.css";
import PrivyProvider from "@/components/providers/PrivyProvider";
import QueryProvider from "@/components/providers/QueryProvider";
import SolanaWalletProvider from "@/components/providers/SolanaWalletProvider";

export const metadata: Metadata = {
  title: "Pacifica Nexus | Alpha Terminal",
  description:
    "Actionable analytics terminal for the Pacifica Perpetual DEX.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#080B14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <PrivyProvider>
          <SolanaWalletProvider>
            <QueryProvider>{children}</QueryProvider>
          </SolanaWalletProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
