/**
 * Icebergs Proxy
 *
 * Proxies GET /api/weather-routing/icebergs to the Python engine's /icebergs endpoint.
 * Returns IIP iceberg data including limit polygon and bulletin positions.
 */
import { NextResponse } from "next/server";

const ENGINE_URL = process.env.WEATHER_ENGINE_URL || "http://localhost:8001";

export async function GET() {
  try {
    const response = await fetch(`${ENGINE_URL}/icebergs`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { available: false, count: 0, source: "error" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { available: false, count: 0, source: "offline" },
      { status: 503 }
    );
  }
}
