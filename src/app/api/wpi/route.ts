/**
 * World Port Index API Proxy
 *
 * Fetches the NGA World Port Index (Pub 150) and returns a slimmed-down
 * payload suitable for map rendering. The upstream response is ~15 MB;
 * we extract only the fields needed for markers (~300 KB).
 *
 * Port dots are placed at the NGA coordinates which represent the actual
 * port/terminal location. Alternate names are passed through so popups
 * can show users which terminal the port refers to.
 *
 * Cached server-side for 24 hours via Next.js revalidation.
 */

import { NextResponse } from "next/server";

const WPI_URL =
  "https://msi.nga.mil/api/publications/world-port-index?output=json";

/** Minimal port shape sent to the client */
interface SlimPort {
  /** NGA port number (unique identifier) */
  n: number;
  /** Port name (NGA official name) */
  p: string;
  /** Country name */
  c: string;
  /** Latitude (decimal degrees) — actual port location */
  y: number;
  /** Longitude (decimal degrees) — actual port location */
  x: number;
  /** Harbor size: V(ery small) | S(mall) | M(edium) | L(arge) */
  s: string;
  /** UN/LOCODE (e.g. "US LAX") — may be null */
  u: string | null;
  /** Water body description */
  w: string | null;
  /** Region name */
  r: string | null;
  /** Alternate names (semicolon-separated), if available */
  a: string | null;
}

export async function GET() {
  try {
    const res = await fetch(WPI_URL, {
      next: { revalidate: 86_400 }, // cache 24 h
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `NGA WPI upstream error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const raw: any[] = data?.ports ?? [];

    // Slim the payload — keep only what the map layer needs
    const ports: SlimPort[] = raw
      .filter(
        (p: any) =>
          typeof p.ycoord === "number" &&
          typeof p.xcoord === "number" &&
          p.portName
      )
      .map((p: any) => ({
        n: p.portNumber,
        p: p.portName,
        c: p.countryName ?? "",
        y: p.ycoord,
        x: p.xcoord,
        s: p.harborSize ?? "V",
        u: p.unloCode ?? null,
        w: p.dodWaterBody ?? null,
        r: p.regionName ?? null,
        a: p.alternateName ?? null,
      }));

    return NextResponse.json(
      { ports, count: ports.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      }
    );
  } catch (err) {
    console.error("[WPI] Failed to fetch World Port Index:", err);
    return NextResponse.json(
      { error: "Failed to fetch World Port Index" },
      { status: 500 }
    );
  }
}
