import { NextResponse } from "next/server";
import { getSecaSegments, type RouteWaypoint } from "@/lib/navapi-client";

/**
 * API Route: POST /api/navapi/secasegments
 * 
 * Calls NavAPI's /calc/SecaSegments endpoint to get authoritative
 * SECA (Sulphur Emission Control Area) zone classification for a route.
 * 
 * This provides the accurate breakdown of SECA vs Non-SECA distances
 * based on the official IMO SECA zone boundaries.
 * 
 * SECA Zones (per IMO):
 * - Baltic Sea
 * - North Sea
 * - North American ECA
 * - US Caribbean ECA
 * 
 * NOTE: Canals (Suez, Corinth, etc.) are NOT SECA zones!
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { waypoints } = body;

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return NextResponse.json(
        { error: "At least 2 waypoints required" },
        { status: 400 }
      );
    }

    // Convert to RouteWaypoint format
    const routeWaypoints: RouteWaypoint[] = waypoints.map((wp: { lat: number; lon: number }) => ({
      lat: wp.lat,
      lon: wp.lon,
    }));

    console.log("[SecaSegments API] Received", routeWaypoints.length, "waypoints");
    console.log("[SecaSegments API] First waypoint:", routeWaypoints[0]);
    console.log("[SecaSegments API] Last waypoint:", routeWaypoints[routeWaypoints.length - 1]);

    // Call NavAPI SecaSegments endpoint
    const result = await getSecaSegments(routeWaypoints);

    console.log("[SecaSegments API] Result:", {
      success: result.success,
      totalSecaDistance: result.totalSecaDistance,
      totalNonSecaDistance: result.totalNonSecaDistance,
      segmentsCount: result.segments?.length || 0,
      error: result.error,
    });

    return NextResponse.json({
      success: result.success,
      segments: result.segments,
      totalSecaDistance: result.totalSecaDistance,
      totalNonSecaDistance: result.totalNonSecaDistance,
      error: result.error,
    });
  } catch (error) {
    console.error("SecaSegments API error:", error);
    return NextResponse.json(
      { error: "Failed to get SECA segments" },
      { status: 500 }
    );
  }
}
