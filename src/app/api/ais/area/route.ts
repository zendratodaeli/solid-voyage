import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// ═══════════════════════════════════════════════════════════════════
// AIS Area Search — Nearby vessels within radius
// Uses NavAPI when tokens are available, otherwise returns mock data
// ═══════════════════════════════════════════════════════════════════

const NAVAPI_KEY = process.env.NAVAPI_KEY;

// Ship types for mock data variety
const MOCK_SHIP_TYPES = [
  { type: "Cargo", prefix: "MV" },
  { type: "Tanker", prefix: "MT" },
  { type: "Container", prefix: "MSC" },
  { type: "Bulk Carrier", prefix: "MV" },
  { type: "Fishing", prefix: "FV" },
  { type: "Tug", prefix: "TUG" },
  { type: "Passenger", prefix: "MS" },
];

const MOCK_FLAGS = ["Panama", "Liberia", "Marshall Islands", "Singapore", "Norway", "Malta", "Bahamas", "Greece"];
const MOCK_NAMES = [
  "Pacific Explorer", "Nordic Spirit", "Atlantic Pearl", "Star Navigator",
  "Ocean Fortune", "Golden Dragon", "Sea Pioneer", "Crystal Bay",
  "Iron Eagle", "Coral Queen", "Southern Cross", "Northern Light",
  "Dawn Carrier", "Horizon Trader", "Silver Wave", "Blue Marlin",
];

function generateMockVessels(centerLat: number, centerLon: number, radiusNm: number, count: number) {
  const vessels = [];
  for (let i = 0; i < count; i++) {
    // Random position within radius (converted from NM to degrees approx)
    const angleDeg = Math.random() * 360;
    const distNm = Math.random() * radiusNm;
    const dLat = (distNm / 60) * Math.cos(angleDeg * Math.PI / 180);
    const dLon = (distNm / 60) * Math.sin(angleDeg * Math.PI / 180) / Math.cos(centerLat * Math.PI / 180);

    const shipInfo = MOCK_SHIP_TYPES[Math.floor(Math.random() * MOCK_SHIP_TYPES.length)];
    const name = `${shipInfo.prefix} ${MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)]}`;
    const flag = MOCK_FLAGS[Math.floor(Math.random() * MOCK_FLAGS.length)];

    vessels.push({
      name,
      mmsi: `${200000000 + Math.floor(Math.random() * 600000000)}`,
      imo: `${9000000 + Math.floor(Math.random() * 999999)}`,
      shipType: shipInfo.type,
      flag,
      lat: centerLat + dLat,
      lon: centerLon + dLon,
      speed: Math.round((Math.random() * 18 + 2) * 10) / 10, // 2-20 knots
      heading: Math.floor(Math.random() * 360),
      course: Math.floor(Math.random() * 360),
      distanceNm: Math.round(distNm * 10) / 10,
      bearing: Math.round(angleDeg),
      draught: Math.round((Math.random() * 10 + 4) * 10) / 10,
      length: Math.round(Math.random() * 250 + 50),
      destination: ["Rotterdam", "Singapore", "Suez", "Houston", "Shanghai", "Fujairah"][Math.floor(Math.random() * 6)],
      objectType: shipInfo.type === "Fishing" ? "fishing" : shipInfo.type === "Tug" ? "tug" : "vessel",
    });
  }
  return vessels;
}

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat") || "0");
    const lon = parseFloat(searchParams.get("lon") || "0");
    const radiusNm = parseFloat(searchParams.get("radius") || "20");

    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json({ error: "Invalid lat/lon" }, { status: 400 });
    }

    // Try real NavAPI first
    if (NAVAPI_KEY) {
      try {
        // NavAPI area search endpoint
        const navRes = await fetch(
          `https://api.navapi.io/v1/ais/area?lat=${lat}&lon=${lon}&radius=${radiusNm}`,
          {
            headers: { Authorization: `Bearer ${NAVAPI_KEY}` },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (navRes.ok) {
          const navData = await navRes.json();
          return NextResponse.json({
            success: true,
            source: "navapi",
            data: navData.vessels || navData.data || [],
          });
        }
      } catch (err) {
        console.warn("[AIS_AREA] NavAPI failed, falling back to mock:", err);
      }
    }

    // Fall back to mock data (3-8 random vessels)
    const count = Math.floor(Math.random() * 6) + 3;
    const mockVessels = generateMockVessels(lat, lon, radiusNm, count);

    return NextResponse.json({
      success: true,
      source: "mock",
      data: mockVessels,
    });
  } catch (error) {
    console.error("[AIS_AREA] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch nearby vessels" },
      { status: 500 }
    );
  }
}
