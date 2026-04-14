/**
 * NavAPI Route Calculation API Route
 * 
 * POST /api/navapi/route
 * 
 * Body: { startPortCode: string, endPortCode: string, options?: { secaAvoidance?: number } }
 * 
 * Returns complete voyage route with ECA breakdown
 * 
 * Rate limited: Free orgs get 3 calculations/day, Paid orgs unlimited
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { calculateVoyageRoute, calculateSingleRoute } from "@/lib/navapi-client";
import {
  isPaidOrg,
  checkUsageLimit,
  incrementUsage,
} from "@/lib/billing";
import { apiRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // ─── Server-side Rate Limiting (abuse prevention) ─────────
    const { orgId, userId } = await auth();
    const blocked = apiRateLimit(request, userId, WRITE_RATE_LIMIT);
    if (blocked) return blocked;

    // ─── Freemium Usage Limiting ──────────────────────────────

    if (orgId) {
      const paid = await isPaidOrg();

      if (!paid) {
        const usage = await checkUsageLimit(orgId, "route_planner");

        if (!usage.allowed) {
          return NextResponse.json(
            {
              error: "limit_reached",
              message: "You've reached your daily limit of 3 free route calculations. Upgrade to Solid Starter for unlimited access.",
              used: usage.used,
              limit: usage.limit,
            },
            { status: 429 }
          );
        }
      }
    }

    const body = await request.json();
    const { 
      startPortCode, endPortCode, 
      startLat, startLon, endLat, endLon, 
      options,
      etd,     // Estimated Time of Departure (ISO string)
      draft,   // Vessel draft in meters
      excludeAreas  // NavAPI Area IDs to exclude for canal avoidance
    } = body;

    // Validate input
    const hasStartPort = startPortCode && startPortCode.length > 0;
    const hasStartCoords = startLat !== undefined && startLon !== undefined;
    const hasEndPort = endPortCode && endPortCode.length > 0;
    const hasEndCoords = endLat !== undefined && endLon !== undefined;

    if (!hasStartPort && !hasStartCoords) {
      return NextResponse.json(
        { error: "Start point required (port code or coordinates)" },
        { status: 400 }
      );
    }

    if (!hasEndPort && !hasEndCoords) {
      return NextResponse.json(
        { error: "End point required (port code or coordinates)" },
        { status: 400 }
      );
    }

    let result;

    // If we have port codes, use the combined voyage route function
    if (hasStartPort && hasEndPort) {
      result = await calculateVoyageRoute(startPortCode, endPortCode, {
        ...options,
        etd,
        draft: draft ? parseFloat(draft) : undefined,
        excludeAreas: excludeAreas?.map((a: string | number) => Number(a)),
      });
    } else {
      // Otherwise, use single route with coordinates
      result = await calculateSingleRoute({
        startPortCode: hasStartPort ? startPortCode : undefined,
        startLat: hasStartCoords ? startLat : undefined,
        startLon: hasStartCoords ? startLon : undefined,
        endPortCode: hasEndPort ? endPortCode : undefined,
        endLat: hasEndCoords ? endLat : undefined,
        endLon: hasEndCoords ? endLon : undefined,
        secaAvoidance: options?.secaAvoidance ?? 0,
        aslCompliance: options?.aslCompliance ?? 0,
        etd,
        draft: draft ? parseFloat(draft) : undefined,
        excludeAreas: excludeAreas?.map((a: string | number) => Number(a)),
      });
    }

    // ─── Increment usage after successful calculation ───────────
    if (orgId) {
      const paid = await isPaidOrg();
      if (!paid) {
        await incrementUsage(orgId, "route_planner");
      }
    }

    // If we used port codes, return as-is
    if (hasStartPort && hasEndPort) {
      return NextResponse.json(result);
    }

    // Transform to match VoyageRouteResult interface
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const singleResult = result as any;
    const canalDistanceNm = singleResult.canalDistance || 0;
    const ecaDistanceNm = singleResult.secaDistance || 0;
    
    return NextResponse.json({
      success: singleResult.success,
      totalDistanceNm: singleResult.totalDistance,
      ecaDistanceNm,
      canalDistanceNm,
      effectiveEcaDistanceNm: ecaDistanceNm + canalDistanceNm, // For bunker calculation
      nonEcaDistanceNm: singleResult.nonSecaDistance,
      waypoints: singleResult.waypoints,
      geometry: singleResult.geometry,
      error: singleResult.error,
      draftWarning: singleResult.draftWarning,  // Warning if route violates draft restrictions
    });
  } catch (error) {
    console.error("Route calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate route" },
      { status: 500 }
    );
  }
}
