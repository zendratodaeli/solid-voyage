import { NextRequest, NextResponse } from "next/server";
import { runOptimizer, type OptimizeTarget } from "@/lib/calculations/voyage-optimizer";
import type { VesselProfile, VoyageInputs } from "@/lib/calculations/voyage";

/**
 * POST /api/voyage-optimizer
 * 
 * Runs the Smart Voyage Optimizer — sweeps speed × eco mode
 * combinations and returns ranked results.
 * 
 * Body: {
 *   vessel: VesselProfile,
 *   voyageInputs: VoyageInputs (base inputs with distances),
 *   optimizeFor: "maxTCE" | "minCost" | "minBunker" | "minDays",
 *   includeEco: boolean,
 *   freightRateUsd?: number,
 *   cargoQuantityMt: number,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const {
      vessel,
      voyageInputs,
      optimizeFor = "maxTCE",
      includeEco = true,
      freightRateUsd,
      cargoQuantityMt,
    } = body;

    // Validate required fields
    if (!vessel || !voyageInputs) {
      return NextResponse.json(
        { success: false, error: "Missing vessel or voyageInputs" },
        { status: 400 }
      );
    }

    if (!cargoQuantityMt || cargoQuantityMt <= 0) {
      return NextResponse.json(
        { success: false, error: "Cargo quantity must be greater than 0" },
        { status: 400 }
      );
    }

    // Validate optimizeFor
    const validTargets: OptimizeTarget[] = ["maxTCE", "minCost", "minBunker", "minDays"];
    if (!validTargets.includes(optimizeFor)) {
      return NextResponse.json(
        { success: false, error: `Invalid optimizeFor: ${optimizeFor}` },
        { status: 400 }
      );
    }

    // Run optimizer
    const output = runOptimizer(
      vessel as VesselProfile,
      voyageInputs as VoyageInputs,
      {
        optimizeFor,
        includeEco,
        freightRateUsd,
        cargoQuantityMt,
      }
    );

    // Strip fullResult from response to reduce payload size
    const results = output.results.map(({ fullResult, ...rest }) => rest);

    return NextResponse.json({
      success: true,
      data: results,
      metadata: output.metadata,
    });
  } catch (error) {
    console.error("Optimizer error:", error);
    return NextResponse.json(
      { success: false, error: "Optimization failed" },
      { status: 500 }
    );
  }
}
