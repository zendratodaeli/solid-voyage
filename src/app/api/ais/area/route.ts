import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// ═══════════════════════════════════════════════════════════════════
// AIS Area Search — Nearby vessels within radius
// Priority: Datalastic → Mock fallback
// Datalastic docs: https://datalastic.com/api-reference/
// ═══════════════════════════════════════════════════════════════════

const DATALASTIC_API_KEY = process.env.DATALASTIC_API_KEY;
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_AIS === "true";

// ─── Mock Data Config ────────────────────────────────────────────
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
      speed: Math.round((Math.random() * 18 + 2) * 10) / 10,
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

// ─── Datalastic Response Normalizer ──────────────────────────────
interface DatalasticVessel {
  uuid?: string;
  name?: string;
  mmsi?: string;
  imo?: string;
  latitude?: number;
  longitude?: number;
  speed?: number;
  course?: number;
  heading?: number;
  type_specific?: string;
  type?: string;
  flag?: string;
  destination?: string;
  draught?: number;
  length?: number;
  last_position_epoch?: number;
}

function normalizeDatalasticVessel(v: DatalasticVessel, centerLat: number, centerLon: number) {
  const lat = v.latitude || 0;
  const lon = v.longitude || 0;

  // Haversine distance from center
  const R = 3440.065; // NM
  const dLat = (lat - centerLat) * Math.PI / 180;
  const dLon = (lon - centerLon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const distanceNm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Bearing from center
  const y = Math.sin(dLon) * Math.cos(lat * Math.PI / 180);
  const x = Math.cos(centerLat * Math.PI / 180) * Math.sin(lat * Math.PI / 180) -
    Math.sin(centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.cos(dLon);
  const bearing = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;

  return {
    name: v.name || "Unknown",
    mmsi: v.mmsi || "",
    imo: v.imo || "",
    shipType: v.type_specific || v.type || "Unknown",
    flag: v.flag || "",
    lat,
    lon,
    speed: v.speed || 0,
    heading: v.heading || 0,
    course: v.course || 0,
    distanceNm: Math.round(distanceNm * 10) / 10,
    bearing: Math.round(bearing),
    draught: v.draught || 0,
    length: v.length || 0,
    destination: v.destination || "",
    objectType: "vessel",
  };
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
    const radiusNm = Math.min(parseFloat(searchParams.get("radius") || "20"), 50); // Datalastic max: 50 NM

    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json({ error: "Invalid lat/lon" }, { status: 400 });
    }

    // ── Try Datalastic first (unless forced to mock) ──
    if (DATALASTIC_API_KEY && !USE_MOCK) {
      try {
        const datalasticUrl = `https://api.datalastic.com/api/v0/vessel_inradius?api-key=${DATALASTIC_API_KEY}&lat=${lat}&lon=${lon}&radius=${radiusNm}`;

        const res = await fetch(datalasticUrl, {
          signal: AbortSignal.timeout(12000),
        });

        if (res.ok) {
          const json = await res.json();
          const vessels = Array.isArray(json.data)
            ? json.data.map((v: DatalasticVessel) => normalizeDatalasticVessel(v, lat, lon))
            : [];

          return NextResponse.json({
            success: true,
            source: "datalastic",
            count: vessels.length,
            data: vessels,
          });
        } else {
          const errText = await res.text().catch(() => "");
          console.warn(`[AIS_AREA] Datalastic HTTP ${res.status}: ${errText}`);
        }
      } catch (err) {
        console.warn("[AIS_AREA] Datalastic failed, falling back to mock:", err);
      }
    }

    // ── Fall back to mock data (3-8 random vessels) ──
    const count = Math.floor(Math.random() * 6) + 3;
    const mockVessels = generateMockVessels(lat, lon, radiusNm, count);

    return NextResponse.json({
      success: true,
      source: "mock",
      count: mockVessels.length,
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
