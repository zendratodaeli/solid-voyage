/**
 * NavAPI Port Search API Route
 * 
 * GET /api/navapi/ports?q={query}
 * 
 * Returns expanded port aliases for autocomplete
 */

import { NextResponse } from "next/server";
import { searchPorts } from "@/lib/navapi-client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
      return NextResponse.json({ ports: [] });
    }

    const ports = await searchPorts(query);

    return NextResponse.json({ ports });
  } catch (error) {
    console.error("Port search error:", error);
    return NextResponse.json(
      { error: "Failed to search ports" },
      { status: 500 }
    );
  }
}
