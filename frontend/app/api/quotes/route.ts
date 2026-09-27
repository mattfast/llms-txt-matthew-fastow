import { NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** Proxies to the FastAPI backend so the browser only ever talks to same-origin /api routes
 * for public, unauthenticated data like the homepage quote. */
export async function GET() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/quotes/random`, { cache: "no-store" });
    if (!res.ok) throw new Error("backend error");
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ quote: null }, { status: 502 });
  }
}
