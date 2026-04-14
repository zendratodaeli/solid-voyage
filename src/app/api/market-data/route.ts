/**
 * Market Data API (Org-Scoped)
 * 
 * GET: Fetch org's pricing (auto-seed from SystemPricing if first access)
 * PUT: Update org's own fuel prices and carbon factors
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validation schema for updating prices and carbon factors
const UpdatePricingSchema = z.object({
  // Fuel Prices
  globalLSMGOAverage: z.number().min(0).optional(),
  globalVLSFOAverage: z.number().min(0).optional(),
  globalIFO380Average: z.number().min(0).optional(),
  globalIFO180Average: z.number().min(0).optional(),
  globalLNGAverage: z.number().min(0).optional(),
  globalEUAPrice: z.number().min(0).optional(),
  // Carbon Factors (MT CO2 per MT Fuel)
  carbonFactorVLSFO: z.number().min(0).optional(),
  carbonFactorLSMGO: z.number().min(0).optional(),
  carbonFactorIFO380: z.number().min(0).optional(),
  carbonFactorIFO180: z.number().min(0).optional(),
  carbonFactorLNG: z.number().min(0).optional(),
  carbonFactorMETHANOL: z.number().min(0).optional(),
  carbonFactorAMMONIA: z.number().min(0).optional(),
});

const SYSTEM_PRICING_ID = "system_pricing";

// Default values (fallback if SystemPricing doesn't exist either)
const DEFAULT_PRICING = {
  globalLSMGOAverage: 0,
  globalVLSFOAverage: 0,
  globalIFO380Average: 0,
  globalIFO180Average: 0,
  globalLNGAverage: 0,
  globalEUAPrice: 75.00,
  carbonFactorVLSFO: 3.114,
  carbonFactorLSMGO: 3.206,
  carbonFactorIFO380: 3.114,
  carbonFactorIFO180: 3.114,
  carbonFactorLNG: 3.160,
  carbonFactorMETHANOL: 1.375,
  carbonFactorAMMONIA: 0.050,
};

/**
 * GET /api/market-data
 * 
 * Returns the org's pricing. If no OrgPricing exists yet,
 * seeds it from SystemPricing (copy-on-first-access).
 */
export async function GET() {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Organization required" }, { status: 401 });
    }

    // 1. Check if org already has its own pricing
    let orgPricing = await prisma.orgPricing.findUnique({
      where: { orgId },
    });

    if (orgPricing) {
      return NextResponse.json(orgPricing);
    }

    // 2. No org pricing yet — seed from SystemPricing
    let seedData = { ...DEFAULT_PRICING };

    try {
      const systemPricing = await prisma.systemPricing.findUnique({
        where: { id: SYSTEM_PRICING_ID },
      });

      if (systemPricing) {
        seedData = {
          globalLSMGOAverage: systemPricing.globalLSMGOAverage,
          globalVLSFOAverage: systemPricing.globalVLSFOAverage,
          globalIFO380Average: systemPricing.globalIFO380Average,
          globalIFO180Average: systemPricing.globalIFO180Average,
          globalLNGAverage: systemPricing.globalLNGAverage,
          globalEUAPrice: systemPricing.globalEUAPrice,
          carbonFactorVLSFO: systemPricing.carbonFactorVLSFO,
          carbonFactorLSMGO: systemPricing.carbonFactorLSMGO,
          carbonFactorIFO380: systemPricing.carbonFactorIFO380,
          carbonFactorIFO180: systemPricing.carbonFactorIFO180,
          carbonFactorLNG: systemPricing.carbonFactorLNG,
          carbonFactorMETHANOL: systemPricing.carbonFactorMETHANOL,
          carbonFactorAMMONIA: systemPricing.carbonFactorAMMONIA,
        };
      }
    } catch {
      // SystemPricing might not exist yet — use defaults
    }

    // 3. Create org pricing record with seeded values
    orgPricing = await prisma.orgPricing.create({
      data: {
        orgId,
        ...seedData,
      },
    });

    return NextResponse.json(orgPricing);
  } catch (error) {
    console.error("Error fetching org market data:", error);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/market-data
 * 
 * Update the org's own pricing benchmarks.
 */
export async function PUT(request: Request) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Organization required" }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const result = UpdatePricingSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    // Upsert to handle edge case where org pricing doesn't exist yet
    const updatedPricing = await prisma.orgPricing.upsert({
      where: { orgId },
      update: {
        ...result.data,
        updatedBy: body.updatedBy || null,
      },
      create: {
        orgId,
        ...DEFAULT_PRICING,
        ...result.data,
        updatedBy: body.updatedBy || null,
      },
    });

    return NextResponse.json(updatedPricing);
  } catch (error) {
    console.error("Error updating org market data:", error);
    return NextResponse.json(
      { error: "Failed to update market data" },
      { status: 500 }
    );
  }
}
