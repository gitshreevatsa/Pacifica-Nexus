/**
 * app/api/webhook/tradingview/route.ts
 *
 * POST — receives a TradingView alert, validates the shared secret, and fires
 *        a market or limit order using the per-user agentKey + walletAddress
 *        included in the alert body. No server-side keys needed per user.
 *
 * Required env var (server-side only):
 *   TRADINGVIEW_WEBHOOK_SECRET — shared string to prevent unauthorized POSTs
 *
 * Alert body (per user, sent from TradingView):
 *   { secret, agentKey, walletAddress, symbol, side, size, orderType?, price? }
 *
 * GET — returns recent in-memory event log (last 50 events).
 */

import { NextRequest, NextResponse } from "next/server";
import { PacificaClient } from "@/lib/pacifica-client";
import { importAgentKey } from "@/lib/signing";
import type { WebhookEvent } from "@/types";

export const dynamic = "force-dynamic";

const events: WebhookEvent[] = [];

function addEvent(evt: Omit<WebhookEvent, "id">): WebhookEvent {
  const entry: WebhookEvent = {
    ...evt,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  events.unshift(entry);
  if (events.length > 50) events.length = 50;
  return entry;
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    secret?: string;
    agentKey?: string;
    walletAddress?: string;
    symbol?: string;
    side?: "LONG" | "SHORT";
    size?: number;
    orderType?: "market" | "limit";
    price?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Secret validation (server-side) ────────────────────────────────────────
  const expectedSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { success: false, error: "TRADINGVIEW_WEBHOOK_SECRET not configured on server" },
      { status: 503 }
    );
  }
  if (!body.secret || body.secret !== expectedSecret) {
    return NextResponse.json({ success: false, error: "Invalid webhook secret" }, { status: 401 });
  }

  // ── Per-user credentials from alert body ────────────────────────────────────
  const { agentKey, walletAddress, symbol, side, size, orderType = "market", price } = body;

  if (!agentKey || typeof agentKey !== "string") {
    return NextResponse.json({ success: false, error: "Missing agentKey in alert body" }, { status: 400 });
  }
  if (!walletAddress || typeof walletAddress !== "string") {
    return NextResponse.json({ success: false, error: "Missing walletAddress in alert body" }, { status: 400 });
  }
  if (!symbol || typeof symbol !== "string") {
    return NextResponse.json({ success: false, error: "Missing symbol" }, { status: 400 });
  }
  if (side !== "LONG" && side !== "SHORT") {
    return NextResponse.json({ success: false, error: 'side must be "LONG" or "SHORT"' }, { status: 400 });
  }
  if (typeof size !== "number" || size <= 0) {
    return NextResponse.json({ success: false, error: "size must be a positive number" }, { status: 400 });
  }
  if (orderType === "limit" && typeof price !== "number") {
    return NextResponse.json({ success: false, error: "price required for limit orders" }, { status: 400 });
  }

  // ── Parse agent keypair ─────────────────────────────────────────────────────
  let keypair;
  try {
    keypair = importAgentKey(agentKey);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    addEvent({ timestamp: Date.now(), walletAddress, symbol, side, size, orderType, price, status: "error", error: `Key parse error: ${err}` });
    return NextResponse.json({ success: false, error: `Key parse error: ${err}` }, { status: 400 });
  }

  // ── Fire order ──────────────────────────────────────────────────────────────
  const client = new PacificaClient();
  client.setMainWallet(walletAddress);
  client.setAgentKeypair(keypair);

  try {
    const result = orderType === "limit"
      ? await client.createLimitOrder({ symbol, side, size, price })
      : await client.createMarketOrder({ symbol, side, size });

    const evt = addEvent({
      timestamp: Date.now(),
      walletAddress,
      symbol,
      side,
      size,
      orderType,
      price,
      status: "ok",
      orderId: result.order_id,
    });

    return NextResponse.json({ success: true, orderId: result.order_id, eventId: evt.id });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    addEvent({ timestamp: Date.now(), walletAddress, symbol, side, size, orderType, price, status: "error", error: err });
    return NextResponse.json({ success: false, error: err }, { status: 500 });
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json(events);
}
