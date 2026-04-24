import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// ═══════════════════════════════════════════════════════════════════
// AIS Vessel Position — Single vessel tracking via Datalastic
// GET /api/ais/vessel?mmsi=XXX or ?imo=XXX
// Datalastic: https://api.datalastic.com/api/v0/vessel
// ═══════════════════════════════════════════════════════════════════

const DATALASTIC_API_KEY = process.env.DATALASTIC_API_KEY;
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_AIS === "true";

interface DatalasticVesselResponse {
  data?: {
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
    width?: number;
    last_position_epoch?: number;
    last_position_UTC?: string;
    eta?: string;
    current_port?: string;
    navigational_status?: string;
  };
  meta?: {
    success?: boolean;
  };
}

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mmsi = searchParams.get("mmsi");
    const imo = searchParams.get("imo");

    if (!mmsi && !imo) {
      return NextResponse.json(
        { error: "Provide mmsi or imo parameter" },
        { status: 400 }
      );
    }

    // ── Try Datalastic ──
    if (DATALASTIC_API_KEY && !USE_MOCK) {
      try {
        const params = new URLSearchParams({ "api-key": DATALASTIC_API_KEY });
        if (mmsi) params.set("mmsi", mmsi);
        else if (imo) params.set("imo", imo);

        const url = `https://api.datalastic.com/api/v0/vessel?${params.toString()}`;

        const res = await fetch(url, {
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const json: DatalasticVesselResponse = await res.json();

          if (json.data) {
            const v = json.data;
            return NextResponse.json({
              success: true,
              source: "datalastic",
              data: {
                name: v.name || "Unknown",
                mmsi: v.mmsi || mmsi || "",
                imo: v.imo || imo || "",
                lat: v.latitude || 0,
                lon: v.longitude || 0,
                speed: v.speed || 0,
                heading: v.heading || 0,
                course: v.course || 0,
                shipType: v.type_specific || v.type || "",
                flag: v.flag || "",
                destination: v.destination || "",
                draught: v.draught || 0,
                length: v.length || 0,
                width: v.width || 0,
                eta: v.eta || null,
                currentPort: v.current_port || null,
                navStatus: v.navigational_status || null,
                lastPositionUTC: v.last_position_UTC || null,
                lastPositionEpoch: v.last_position_epoch || null,
              },
            });
          }
        } else {
          const errText = await res.text().catch(() => "");
          console.warn(`[AIS_VESSEL] Datalastic HTTP ${res.status}: ${errText}`);
        }
      } catch (err) {
        console.warn("[AIS_VESSEL] Datalastic failed:", err);
      }
    }

    // ── Mock fallback ──
    return NextResponse.json({
      success: true,
      source: "mock",
      data: {
        name: "Mock Vessel",
        mmsi: mmsi || "000000000",
        imo: imo || "0000000",
        lat: 53.5 + (Math.random() - 0.5) * 2,
        lon: 9.9 + (Math.random() - 0.5) * 2,
        speed: Math.round(Math.random() * 12 + 4),
        heading: Math.floor(Math.random() * 360),
        course: Math.floor(Math.random() * 360),
        shipType: "Cargo",
        flag: "Germany",
        destination: "Hamburg",
        draught: 8.5,
        length: 140,
        width: 21,
        eta: null,
        currentPort: null,
        navStatus: "Under way using engine",
        lastPositionUTC: new Date().toISOString(),
        lastPositionEpoch: Math.floor(Date.now() / 1000),
      },
    });
  } catch (error) {
    console.error("[AIS_VESSEL] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch vessel position" },
      { status: 500 }
    );
  }
}
