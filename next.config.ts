import type { NextConfig } from "next";

/**
 * Security headers applied to every route.
 *
 * CSP is currently in Report-Only mode (Content-Security-Policy-Report-Only).
 * Check browser console for violations, then switch to Content-Security-Policy
 * once you've confirmed no legitimate resources are being blocked.
 *
 * Domains to allow-list were identified from the architecture:
 *  - Privy: auth.privy.io, *.privy.io (iframes + scripts)
 *  - Pacifica WS: wss://ws.pacifica.fi
 *  - Pacifica REST: https://api.pacifica.fi (via server-side client)
 *  - Jupiter price API: proxied server-side (/api/jupiter) — no direct client fetch
 *  - Elfa AI: proxied server-side (/api/elfa) — no direct client fetch
 *  - Solana wallet adapters load scripts from their own CDNs
 */
const CSP = [
  "default-src 'self'",
  // Scripts: self + Privy SDK + inline scripts Next.js needs
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.privy.io https://auth.privy.io",
  // Styles: self + inline (Tailwind generates inline styles)
  "style-src 'self' 'unsafe-inline'",
  // Images: self + data URIs (charts, icons)
  "img-src 'self' data: blob:",
  // Fonts: self
  "font-src 'self'",
  // Connect: self + Pacifica WS + Privy API + Solana RPC
  "connect-src 'self' wss://ws.pacifica.fi https://*.pacifica.fi https://*.privy.io https://auth.privy.io https://api.mainnet-beta.solana.com wss://api.mainnet-beta.solana.com https://*.helius-rpc.com wss://*.helius-rpc.com",
  // Frames: Privy uses iframes for embedded wallets
  "frame-src 'self' https://*.privy.io https://auth.privy.io",
  // Workers: self (Next.js)
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  {
    // Report-Only — won't block anything, but logs violations to console.
    // Change to "Content-Security-Policy" after auditing with real traffic.
    key: "Content-Security-Policy-Report-Only",
    value: CSP,
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
