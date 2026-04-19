/**
 * Weather Routing Conditions Proxy
 *
 * Proxies GET /api/weather-routing/conditions?lat=X&lon=Y
 * to the Python engine's GET /conditions endpoint.
 *
 * Returns maritime conditions (currents, ice, navigability) that
 * supplement Open-Meteo's atmospheric data with ocean-physics intelligence.
 */
import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL = process.env.WEATHER_ENGINE_URL || "http://localhost:8001";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  const vesselSpeed = req.nextUrl.searchParams.get("vessel_speed") || "12.5";

  if (!lat || !lon) {
    return NextResponse.json(
      { success: false, error: "lat and lon query parameters are required" },
      { status: 400 }
    );
  }

  try {
    const url = `${ENGINE_URL}/conditions?lat=${lat}&lon=${lon}&vessel_speed=${vesselSpeed}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Engine returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    // Engine offline — return graceful fallback
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
