/**
 * Platform — Maritime Intelligence API (Super Admin Only)
 *
 * Manages the MaritimeIntelligence singleton — canal tariffs,
 * war risk rates, hull values, commodity values, port congestion,
 * and currency rates.
 *
 * GET: Fetch current intelligence data (upsert if not exists)
 * PUT: Update any subset of fields (super admin only)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { z } from "zod";

const SINGLETON_ID = "maritime_intelligence";

// Validation schema — all fields optional (partial update support)
const UpdateSchema = z.object({
  // Canal Tariffs
  suezTier1Rate: z.number().min(0).optional(),
  suezTier2Rate: z.number().min(0).optional(),
  suezTier3Rate: z.number().min(0).optional(),
  suezTier4Rate: z.number().min(0).optional(),
  suezTier5Rate: z.number().min(0).optional(),
  suezBallastDiscount: z.number().min(0).max(100).optional(),
  suezTankerSurcharge: z.number().min(0).max(100).optional(),
  panamaTier1Rate: z.number().min(0).optional(),
  panamaTier2Rate: z.number().min(0).optional(),
  panamaTier3Rate: z.number().min(0).optional(),
  panamaContainerPanamax: z.number().min(0).optional(),
  panamaContainerNeopanamax: z.number().min(0).optional(),
  kielRatePer1000GT: z.number().min(0).optional(),

  // War Risk & Piracy
  gulfAdenRiskScore: z.number().int().min(1).max(10).optional(),
  gulfAdenRiskLevel: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).optional(),
  gulfAdenIncidents12m: z.number().int().min(0).optional(),
  gulfAdenWarRiskRate: z.number().min(0).optional(),
  gulfAdenArmedGuards: z.enum(["NONE", "RECOMMENDED", "MANDATORY"]).optional(),
  westAfricaRiskScore: z.number().int().min(1).max(10).optional(),
  westAfricaRiskLevel: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).optional(),
  westAfricaIncidents12m: z.number().int().min(0).optional(),
  westAfricaWarRiskRate: z.number().min(0).optional(),
  westAfricaArmedGuards: z.enum(["NONE", "RECOMMENDED", "MANDATORY"]).optional(),
  malaccaRiskScore: z.number().int().min(1).max(10).optional(),
  malaccaRiskLevel: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).optional(),
  malaccaIncidents12m: z.number().int().min(0).optional(),
  malaccaWarRiskRate: z.number().min(0).optional(),
  malaccaArmedGuards: z.enum(["NONE", "RECOMMENDED", "MANDATORY"]).optional(),

  // Hull Values
  hullValueCapesize: z.number().min(0).optional(),
  hullValuePanamax: z.number().min(0).optional(),
  hullValueSupramax: z.number().min(0).optional(),
  hullValueHandysize: z.number().min(0).optional(),
  hullValueVLCC: z.number().min(0).optional(),
  hullValueSuezmax: z.number().min(0).optional(),
  hullValueAframax: z.number().min(0).optional(),
  hullValueMRTanker: z.number().min(0).optional(),
  hullValueLNGCarrier: z.number().min(0).optional(),
  hullValueContainerFeeder: z.number().min(0).optional(),
  hullValueContainerPanamax: z.number().min(0).optional(),
  hullValueGeneralCargo: z.number().min(0).optional(),
  hullValueAgeDepreciation: z.number().min(0).max(20).optional(),
  hullValueMinAgeFactor: z.number().min(0).max(1).optional(),

  // Commodity Values
  commodityIronOre: z.number().min(0).optional(),
  commodityCoalThermal: z.number().min(0).optional(),
  commodityCoalCoking: z.number().min(0).optional(),
  commodityGrainWheat: z.number().min(0).optional(),
  commodityGrainCorn: z.number().min(0).optional(),
  commoditySoybeans: z.number().min(0).optional(),
  commodityCrudeOil: z.number().min(0).optional(),
  commodityCleanProducts: z.number().min(0).optional(),
  commodityLNG: z.number().min(0).optional(),
  commodityLPG: z.number().min(0).optional(),
  commoditySteel: z.number().min(0).optional(),
  commodityFertilizer: z.number().min(0).optional(),
  commodityCement: z.number().min(0).optional(),
  commodityContainerAvg: z.number().min(0).optional(),
  commodityDefault: z.number().min(0).optional(),

  // Port Congestion
  congestionChinaQingdao: z.number().min(0).optional(),
  congestionChinaTianjin: z.number().min(0).optional(),
  congestionChinaQinhuangdao: z.number().min(0).optional(),
  congestionAustNewcastle: z.number().min(0).optional(),
  congestionAustPortHedland: z.number().min(0).optional(),
  congestionBrazilSantos: z.number().min(0).optional(),
  congestionBrazilTubarao: z.number().min(0).optional(),
  congestionIndiaMundra: z.number().min(0).optional(),
  congestionIndiaKandla: z.number().min(0).optional(),
  congestionUSGulfHouston: z.number().min(0).optional(),
  congestionRotterdam: z.number().min(0).optional(),
  congestionSingapore: z.number().min(0).optional(),

  // Currency
  eurUsdRate: z.number().min(0).optional(),
  gbpUsdRate: z.number().min(0).optional(),
  nokUsdRate: z.number().min(0).optional(),
});

/**
 * GET /api/platform/maritime-intelligence
 * Fetch current maritime intelligence data, create with defaults if not exists.
 */
export async function GET() {
  try {
    await requireSuperAdmin();

    const data = await prisma.maritimeIntelligence.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/platform/maritime-intelligence
 * Update any subset of maritime intelligence fields.
 */
export async function PUT(request: Request) {
  try {
    const email = await requireSuperAdmin();
    const body = await request.json();

    const result = UpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const updated = await prisma.maritimeIntelligence.upsert({
      where: { id: SINGLETON_ID },
      update: {
        ...result.data,
        updatedBy: email,
      },
      create: {
        id: SINGLETON_ID,
        ...result.data,
        updatedBy: email,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update maritime intelligence";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
