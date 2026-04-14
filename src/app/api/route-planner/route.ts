/**
 * Route Planner API - Calculate Route
 * 
 * POST /api/route-planner
 * Calculates multi-leg voyage route with ECA/HRA detection.
 * Uses custom maritime waypoints for realistic sea routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateMultiLegRoute, PortPoint } from "@/lib/calculations/route-planner";

// Validation schema
const waypointSchema = z.object({
  id: z.string(),
  name: z.string(),
  locode: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  passagePolyline: z.array(z.tuple([z.number(), z.number()])).optional().nullable(),
  passageDistanceNm: z.number().optional(),
});

const calculateRouteSchema = z.object({
  waypoints: z.array(waypointSchema).min(2, "At least 2 waypoints required"),
  avgSpeedKnots: z.number().positive().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Debug: Log incoming waypoints to check polyline
    console.log("[API DEBUG] Received waypoints:");
    body.waypoints?.forEach((w: { name?: string; locode?: string; passagePolyline?: unknown }) => {
      console.log(`  - ${w.name} (${w.locode}), hasPolyline: ${!!w.passagePolyline}, polylineLength: ${Array.isArray(w.passagePolyline) ? w.passagePolyline.length : 0}`);
    });
    
    // Validate input
    const validated = calculateRouteSchema.parse(body);
    
    // Calculate multi-leg route using custom maritime waypoints
    const result = calculateMultiLegRoute(
      validated.waypoints as PortPoint[],
      validated.avgSpeedKnots
    );
    
    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalDistanceNm: result.totalDistanceNm,
          totalECADistanceNm: result.totalECADistanceNm,
          totalHRADistanceNm: result.totalHRADistanceNm,
          estimatedDays: result.estimatedDays,
          openSeaDistanceNm: result.totalDistanceNm - result.totalECADistanceNm,
        },
        legs: result.legs.map((leg, index) => ({
          legNumber: index + 1,
          from: {
            name: leg.from.name,
            locode: leg.from.locode,
            coordinates: [leg.from.longitude, leg.from.latitude],
          },
          to: {
            name: leg.to.name,
            locode: leg.to.locode,
            coordinates: [leg.to.longitude, leg.to.latitude],
          },
          distanceNm: leg.distanceNm,
          ecaDistanceNm: leg.ecaDistanceNm,
          hraDistanceNm: leg.hraDistanceNm,
          isFullECA: leg.isFullECA,
          ecaZones: leg.ecaZones,
          hraZones: leg.hraZones,
          geometry: leg.geometry,
        })),
        zones: {
          eca: result.allECAZones,
          hra: result.allHRAZones,
        },
        warnings: result.hraWarnings,
      },
    });
  } catch (error) {
    console.error("Route calculation error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: "Failed to calculate route" },
      { status: 500 }
    );
  }
}
