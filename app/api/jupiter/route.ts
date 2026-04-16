import { NextRequest, NextResponse } from "next/server";

const JUPITER_API_KEY = process.env.JUPITER_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) return NextResponse.json({}, { status: 400 });

  if (!JUPITER_API_KEY) {
    return NextResponse.json({ error: "JUPITER_API_KEY not configured" }, { status: 503 });
  }

  const res = await fetch(`https://api.jup.ag/price/v3?ids=${ids}`, {
    headers: { "x-api-key": JUPITER_API_KEY },
    next: { revalidate: 5 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Jupiter error ${res.status}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
