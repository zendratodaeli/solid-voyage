import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/route-forecast
 *
 * Proxies to the Python engine's /route-forecast endpoint.
 * Accepts NavAPI waypoints + ETD + vessel params, returns time-aware
 * weather forecasts at each waypoint with vessel-specific speed penalties.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate minimum required fields
    if (!body.waypoints || !Array.isArray(body.waypoints) || body.waypoints.length < 2) {
      return NextResponse.json(
        { error: "At least 2 waypoints required" },
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
    const url = `${engineHost}/route-forecast`;

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
      console.error(`[RouteForecastProxy] Engine error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `Engine returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("[RouteForecastProxy] Error:", error);
    return NextResponse.json(
      { error: "Failed to connect to weather engine" },
      { status: 503 }
    );
  }
}
