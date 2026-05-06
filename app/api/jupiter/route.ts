import { NextRequest, NextResponse } from "next/server";

// API key is optional — Jupiter price API works without one (rate-limited but functional).
const JUPITER_API_KEY = process.env.JUPITER_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) return NextResponse.json({}, { status: 400 });

  const headers: Record<string, string> = {};
  if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;

  const res = await fetch(`https://api.jup.ag/price/v3?ids=${ids}`, {
    headers,
    next: { revalidate: 5 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Jupiter error ${res.status}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
