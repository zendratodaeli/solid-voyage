import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing lat/lon parameters" }, { status: 400 });
  }

  // Use the engine proxy host or default to localhost
  const engineHost = process.env.WEATHER_ENGINE_URL || "http://127.0.0.1:8001";
  
  try {
    const url = `${engineHost}/forecast-series?lat=${lat}&lon=${lon}`;
    
    // Pass the request to the Python engine
    const response = await fetch(url, {
      // Don't cache deeply; let next.js cache logic handle if needed
      // or set standard short cache if we expect frequent matching queries
      next: { revalidate: 3600 } 
    });

    if (!response.ok) {
      if (response.status === 503 || response.status === 404) {
        return NextResponse.json(
          { error: "Weather engine unavailable or data not ready" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: `Engine returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("[ForecastProxy] Error calling weather engine:", error);
    return NextResponse.json(
      { error: "Failed to connect to weather engine" },
      { status: 503 }
    );
  }
}
