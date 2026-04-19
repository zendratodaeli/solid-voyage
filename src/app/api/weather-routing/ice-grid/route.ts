/**
 * Ice Grid Proxy
 *
 * Proxies GET /api/weather-routing/ice-grid to the Python engine's /ice-grid endpoint.
 * Returns ice concentration grid cells for rendering on the frontend map.
 */
import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL = process.env.WEATHER_ENGINE_URL || "http://localhost:8001";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();

  try {
    const response = await fetch(`${ENGINE_URL}/ice-grid?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { cells: [], source: "error", count: 0 },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { cells: [], source: "offline", count: 0 },
      { status: 503 }
    );
  }
}
