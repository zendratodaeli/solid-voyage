/**
 * Platform — Global Market Data API (Super Admin Only)
 * 
 * Manages the SystemPricing singleton — the global fuel benchmarks
 * that serve as defaults for all organizations.
 * 
 * GET: Fetch current system pricing (upsert if not exists)
 * PUT: Update global fuel prices and carbon factors (super admin only)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
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

// Default values
const DEFAULT_PRICING = {
  // Fuel Prices
  globalLSMGOAverage: 0,
  globalVLSFOAverage: 0,
  globalIFO380Average: 0,
  globalIFO180Average: 0,
  globalLNGAverage: 0,
  globalEUAPrice: 75.00,
  // Carbon Factors (IMO MEPC.308 defaults)
  carbonFactorVLSFO: 3.114,
  carbonFactorLSMGO: 3.206,
  carbonFactorIFO380: 3.114,
  carbonFactorIFO180: 3.114,
  carbonFactorLNG: 3.160,
  carbonFactorMETHANOL: 1.375,
  carbonFactorAMMONIA: 0.050,
};

/**
 * GET /api/platform/market-data
 * Fetch current system pricing, create default if not exists.
 * Super admin only.
 */
export async function GET() {
  try {
    await requireSuperAdmin();

    // Upsert to ensure pricing record always exists
    const pricing = await prisma.systemPricing.upsert({
      where: { id: SYSTEM_PRICING_ID },
      update: {},
      create: {
        id: SYSTEM_PRICING_ID,
        ...DEFAULT_PRICING,
      },
    });

    return NextResponse.json(pricing);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/platform/market-data
 * Update global fuel prices and carbon factors.
 * Super admin only.
 */
export async function PUT(request: Request) {
  try {
    const email = await requireSuperAdmin();
    const body = await request.json();
    
    // Validate input
    const result = UpdatePricingSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const updatedPricing = await prisma.systemPricing.upsert({
      where: { id: SYSTEM_PRICING_ID },
      update: {
        ...result.data,
        updatedBy: email,
      },
      create: {
        id: SYSTEM_PRICING_ID,
        ...DEFAULT_PRICING,
        ...result.data,
        updatedBy: email,
      },
    });

    return NextResponse.json(updatedPricing);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update market data";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
