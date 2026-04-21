/**
 * Dynamic Re-routing Proxy
 *
 * Proxies POST /api/weather-routing/reroute
 * to the Python engine's POST /reroute endpoint.
 *
 * Accepts current vessel position + remaining waypoints,
 * returns weather advisories and re-routing recommendations.
 */
import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL = process.env.WEATHER_ENGINE_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch(`${ENGINE_URL}/reroute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { success: false, error: `Engine returned ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Maritime engine is offline",
        offline: true,
      },
      { status: 503 }
    );
  }
}
