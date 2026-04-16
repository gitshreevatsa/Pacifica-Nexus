/**
 * pacifica-ws.ts
 *
 * Module-level singleton WebSocket for wss://ws.pacifica.fi/ws.
 * All hooks (useWhaleStream, useOrderbookStream, …) share one connection.
 * Subscribers register a callback; the WS auto-reconnects with back-off.
 */

const WS_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_PACIFICA_WS_URL ?? "wss://ws.pacifica.fi/ws")
    : "";

const RECONNECT_BASE = 2_000;
const RECONNECT_MAX  = 30_000;
const PING_INTERVAL  = 30_000;

type MsgHandler = (msg: unknown) => void;

const subscribers = new Set<MsgHandler>();
const onConnectCallbacks = new Set<() => void>();

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectDelay = RECONNECT_BASE;
let started = false;

function connect() {
  if (typeof window === "undefined" || !WS_URL) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    reconnectDelay = RECONNECT_BASE;
    onConnectCallbacks.forEach((cb) => cb());
    pingTimer = setInterval(
      () => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ method: "ping" })),
      PING_INTERVAL
    );
  };

  ws.onmessage = (ev: MessageEvent) => {
    let msg: unknown;
    try { msg = JSON.parse(ev.data as string); } catch { return; }
    subscribers.forEach((cb) => cb(msg));
  };

  ws.onclose = () => {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);
      connect();
    }, reconnectDelay);
  };

  ws.onerror = () => ws?.close();
}

/** Ensure the singleton connection is started (idempotent). */
export function ensureConnected() {
  if (started) return;
  started = true;
  connect();
}

/** Register a message handler. Returns unsubscribe fn. */
export function onMessage(handler: MsgHandler): () => void {
  subscribers.add(handler);
  return () => subscribers.delete(handler);
}

/**
 * Register a callback to fire every time the WS (re)connects.
 * Used to re-send subscriptions after reconnect.
 * Returns unsubscribe fn.
 */
export function onConnect(cb: () => void): () => void {
  onConnectCallbacks.add(cb);
  // If already open, fire immediately
  if (ws?.readyState === WebSocket.OPEN) cb();
  return () => onConnectCallbacks.delete(cb);
}

/** Send a subscription message (no-op if socket is not open). */
export function wsSend(payload: unknown) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function isConnected() {
  return ws?.readyState === WebSocket.OPEN;
}
