/**
 * Usage API Route
 * 
 * GET /api/usage
 * 
 * Returns the current org's daily usage counts for the frontend counter.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUsageCount } from "@/lib/billing";

export async function GET() {
  try {
    const { orgId } = await auth();

    if (!orgId) {
      return NextResponse.json(
        { error: "No active organization" },
        { status: 401 }
      );
    }

    const routePlanner = await getUsageCount(orgId, "route_planner");

    return NextResponse.json({
      success: true,
      data: {
        routePlanner,
      },
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }
}
