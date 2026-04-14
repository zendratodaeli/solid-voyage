/**
 * Weather Routing API Proxy
 *
 * Proxies requests from the Next.js frontend to the Python Weather Routing Engine.
 * This keeps the engine URL configurable and allows adding auth in the future.
 */
import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL = process.env.WEATHER_ENGINE_URL || "http://localhost:8001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${ENGINE_URL}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000), // 15s timeout for routing
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || "Routing engine error" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    // Engine is down or unreachable — this is expected when not running locally
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      return NextResponse.json(
        { success: false, error: "Weather routing engine is not running" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: `Weather routing proxy error: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const response = await fetch(`${ENGINE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: "offline", graph_loaded: false },
      { status: 503 }
    );
  }
}
