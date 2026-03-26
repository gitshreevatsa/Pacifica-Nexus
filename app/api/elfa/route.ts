/**
 * app/api/elfa/route.ts
 * Server-side proxy for Elfa AI API.
 * Keeps ELFA_AI_API_KEY out of the browser bundle.
 *
 * Usage: GET /api/elfa?path=/whale-alerts&asset=SOL&limit=15
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
      { status: 503 }
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
      next: { revalidate: 10 },
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
