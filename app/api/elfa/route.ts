/**
 * app/api/elfa/route.ts
 * Server-side proxy for Elfa AI API.
 * Keeps ELFA_AI_API_KEY out of the browser bundle.
 *
 * GET  /api/elfa?path=/v2/aggregations/trending-tokens&...  → data endpoints
 * POST /api/elfa  { path: "/v2/chat", ...body }             → chat endpoint
 */

import { NextRequest, NextResponse } from "next/server";

const ELFA_BASE_URL = "https://api.elfa.ai";
const ELFA_API_KEY = process.env.ELFA_AI_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Missing path param" }, { status: 400 });
  }

  if (!ELFA_API_KEY) {
    return NextResponse.json(
      { error: "ELFA_AI_API_KEY not configured on server" },
      { status: 503 },
    );
  }

  // Forward all params except "path" to Elfa
  const upstream = new URL(`${ELFA_BASE_URL}${path}`);
  searchParams.forEach((value, key) => {
    if (key !== "path") upstream.searchParams.set(key, value);
  });

  try {
    const res = await fetch(upstream.toString(), {
      headers: {
        "x-elfa-api-key": ELFA_API_KEY,
        "Content-Type": "application/json",
      },
      // Cache at the Next.js Data Cache layer for 5 minutes
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Elfa upstream error ${res.status}`, detail: text },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Elfa AI", detail: String(err) },
      { status: 502 },
    );
  }
}

// ─── POST — Elfa Chat (/v2/chat) ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!ELFA_API_KEY) {
    return NextResponse.json(
      { error: "ELFA_AI_API_KEY not configured on server" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { path: endpointPath = "/v2/chat", ...chatBody } = body;

  try {
    const res = await fetch(`${ELFA_BASE_URL}${endpointPath}`, {
      method: "POST",
      headers: {
        "x-elfa-api-key": ELFA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatBody),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Elfa upstream error ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Elfa AI", detail: String(err) },
      { status: 502 }
    );
  }
}
