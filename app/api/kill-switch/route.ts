import { NextResponse } from "next/server";

/**
 * GET /api/kill-switch
 *
 * Remote kill switch endpoint. Clients poll this every 30 seconds.
 * When this returns { halted: true }, the client-side killSwitchStore
 * is activated and all trading mutations are blocked.
 *
 * To halt trading WITHOUT a redeploy:
 *   1. In Vercel dashboard → Project → Settings → Environment Variables
 *   2. Add or update: KILL_SWITCH=true (server-only, NOT NEXT_PUBLIC_)
 *   3. Vercel serverless functions read env vars at invocation time,
 *      so this takes effect on the NEXT request — no rebuild needed.
 *   4. Set KILL_SWITCH_REASON="Exchange maintenance 14:00–15:00 UTC"
 *      for a user-visible message.
 *
 * Note: KILL_SWITCH is server-side only (no NEXT_PUBLIC_ prefix) so the
 * value is never exposed in the client bundle. Only this route reads it.
 *
 * Response shape:
 *   { halted: boolean; reason: string; checkedAt: number }
 */
export const dynamic = "force-dynamic"; // always read fresh env vars

export async function GET() {
  const halted = process.env.KILL_SWITCH === "true";
  const reason =
    process.env.KILL_SWITCH_REASON ||
    "Trading temporarily suspended — please check back soon";

  return NextResponse.json(
    { halted, reason, checkedAt: Date.now() },
    {
      status: 200,
      headers: {
        // Don't let CDNs or browsers cache this — must always be fresh
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
