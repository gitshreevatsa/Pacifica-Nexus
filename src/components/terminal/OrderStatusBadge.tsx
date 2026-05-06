"use client";

/**
 * OrderStatusBadge
 *
 * Shows the real-time lifecycle state of an order placed this session.
 * Reads from orderLifecycleStore — renders nothing if the orderId is not tracked.
 *
 * Usage:
 *   <OrderStatusBadge orderId={entry.orderId} />
 */

import { useOrderLifecycleStore, type OrderLifecycleStatus } from "@/stores/orderLifecycleStore";

const STATUS_STYLES: Record<OrderLifecycleStatus, { label: string; color: string; bg: string }> = {
  submitting:       { label: "Sending…",   color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  accepted:         { label: "Accepted",   color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
  partially_filled: { label: "Partial ↗",  color: "#fbbf24", bg: "rgba(251,191,36,0.1)"  },
  cancel_pending:   { label: "Cancelling…",color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  filled:           { label: "Filled ✓",   color: "#00ff87", bg: "rgba(0,255,135,0.1)"   },
  cancelled:        { label: "Cancelled",  color: "#ff3b5c", bg: "rgba(255,59,92,0.1)"   },
  rejected:         { label: "Rejected",   color: "#f97316", bg: "rgba(249,115,22,0.1)"  },
  expired:          { label: "Expired",    color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  failed_reconcile: { label: "Reconcile?", color: "#f97316", bg: "rgba(249,115,22,0.1)"  },
};

interface Props {
  orderId: number | null | undefined;
}

export function OrderStatusBadge({ orderId }: Props) {
  const entry = useOrderLifecycleStore((s) =>
    orderId != null ? s.getByOrderId(orderId) : undefined
  );

  if (!entry) return null;

  const style = STATUS_STYLES[entry.status];

  return (
    <span
      className="text-[8px] font-mono font-semibold px-1 py-0.5 rounded"
      style={{ color: style.color, background: style.bg }}
      title={`Order #${orderId} — ${entry.status}`}
    >
      {style.label}
    </span>
  );
}
