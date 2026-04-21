/**
 * Fleet Weather Monitoring Proxy
 *
 * Proxies POST /api/weather-routing/fleet-weather
 * to the Python engine's POST /fleet/weather endpoint.
 *
 * Accepts a list of vessel positions,
 * returns per-vessel weather snapshots + danger alerts.
 */
import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL = process.env.WEATHER_ENGINE_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch(`${ENGINE_URL}/fleet/weather`, {
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
