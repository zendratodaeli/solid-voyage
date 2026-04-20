import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/multi-route-forecast
 *
 * Proxies to the Python engine's /multi-route-forecast endpoint.
 * Compares weather impact across multiple route alternatives, returning
 * per-route delay, fuel, CO2, risk level, and an AI-driven recommendation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate minimum required fields
    if (!body.routes || !Array.isArray(body.routes) || body.routes.length < 1) {
      return NextResponse.json(
        { error: "At least 1 route required" },
        { status: 400 }
      );
    }
    if (!body.etd) {
      return NextResponse.json(
        { error: "ETD (Estimated Time of Departure) required" },
        { status: 400 }
      );
    }

    const engineHost = process.env.WEATHER_ENGINE_HOST || "http://127.0.0.1:8001";
    const url = `${engineHost}/multi-route-forecast`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 503) {
        return NextResponse.json(
          { error: "Weather engine unavailable or forecast data not ready" },
          { status: 503 }
        );
      }
      const errorText = await response.text();
      console.error(`[MultiRouteForecastProxy] Engine error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `Engine returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("[MultiRouteForecastProxy] Error:", error);
    return NextResponse.json(
      { error: "Failed to connect to weather engine" },
      { status: 503 }
    );
  }
}
