import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { calculateVoyage, VesselProfile, VoyageInputs } from "@/lib/calculations/voyage";
import type { Prisma } from "@prisma/client";
import { getVoyagePermission, canModifyVoyage, canDeleteVoyage, type AuthUser } from "@/lib/permissions";

const createScenarioSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  overrides: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

// GET - List scenarios for a voyage
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    
    // Check voyage access
    const permission = await getVoyagePermission(user, id);
    if (!permission) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }
    
    // Get all scenarios for this voyage
    const scenarios = await prisma.scenario.findMany({
      where: { voyageId: id },
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json({ success: true, data: scenarios });
  } catch (error) {
    console.error("Error fetching scenarios:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scenarios" },
      { status: 500 }
    );
  }
}

// POST - Create a new scenario
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const body = await request.json();
    
    // Validate input
    const validatedData = createScenarioSchema.parse(body);
    
    // Check voyage access (need modify permission to create scenarios)
    const permission = await getVoyagePermission(user, id);
    if (!permission || !canModifyVoyage(permission)) {
      return NextResponse.json(
        { success: false, error: permission ? "Insufficient permissions" : "Voyage not found" },
        { status: permission ? 403 : 404 }
      );
    }
    
    // Get voyage with vessel data
    const voyage = await prisma.voyage.findUnique({
      where: { id },
      include: { vessel: true },
    });
    
    if (!voyage) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }
    
    // Build vessel profile - use port consumption based on useCrane toggle
    const portConsumptionWithCrane = voyage.vessel.portConsumptionWithCrane ?? 0;
    const portConsumptionWithoutCrane = voyage.vessel.portConsumptionWithoutCrane ?? 0;
    
    // Use the appropriate port consumption based on voyage.useCrane
    const portConsumption = voyage.useCrane 
      ? (portConsumptionWithCrane || portConsumptionWithoutCrane)
      : (portConsumptionWithoutCrane || portConsumptionWithCrane);
    
    const vesselProfile: VesselProfile = {
      ladenSpeed: voyage.vessel.ladenSpeed,
      ballastSpeed: voyage.vessel.ballastSpeed,
      ladenConsumption: voyage.vessel.ladenConsumption ?? 0,
      ballastConsumption: voyage.vessel.ballastConsumption ?? 0,
      portConsumption,
      dailyOpex: voyage.vessel.dailyOpex ?? 0,
      ecoLadenSpeed: voyage.vessel.ecoLadenSpeed ?? undefined,
      ecoBallastSpeed: voyage.vessel.ecoBallastSpeed ?? undefined,
      ecoLadenConsumption: voyage.vessel.ecoLadenConsumption ?? undefined,
      ecoBallastConsumption: voyage.vessel.ecoBallastConsumption ?? undefined,
      dwt: voyage.vessel.dwt,
      vesselConstant: voyage.vessel.vesselConstant ?? undefined,
      loa: voyage.vessel.loa ?? undefined,
      beam: voyage.vessel.beam ?? undefined,
      summerDraft: voyage.vessel.summerDraft ?? undefined,
      grossTonnage: voyage.vessel.grossTonnage ?? undefined,
      netTonnage: voyage.vessel.netTonnage ?? undefined,
      grainCapacity: voyage.vessel.grainCapacity ?? undefined,
      baleCapacity: voyage.vessel.baleCapacity ?? undefined,
      teuCapacity: voyage.vessel.teuCapacity ?? undefined,
      cargoTankCapacityCbm: voyage.vessel.cargoTankCapacityCbm ?? undefined,
      boilOffRate: voyage.vessel.boilOffRate ?? undefined,
      heelQuantity: voyage.vessel.heelQuantity ?? undefined,
    };
    
    // Build base voyage inputs
    const baseInputs: VoyageInputs = {
      ballastDistanceNm: voyage.ballastDistanceNm,
      ladenDistanceNm: voyage.ladenDistanceNm,
      loadPortDays: voyage.loadPortDays,
      dischargePortDays: voyage.dischargePortDays,
      waitingDays: voyage.waitingDays,
      idleDays: voyage.idleDays,
      cargoQuantityMt: voyage.cargoQuantityMt,
      useEcoSpeed: voyage.useEcoSpeed,
      overrideLadenSpeed: voyage.overrideLadenSpeed ?? undefined,
      overrideBallastSpeed: voyage.overrideBallastSpeed ?? undefined,
      canalTolls: voyage.canalTolls,
      bunkerPriceUsd: voyage.bunkerPriceUsd,
      // Multi-fuel support
      fuelPrices: voyage.fuelPrices as Record<string, number> | undefined,
      ballastFuelType: voyage.ballastFuelType ?? voyage.vessel.ballastFuelType ?? "VLSFO",
      ladenFuelType: voyage.ladenFuelType ?? voyage.vessel.ladenFuelType ?? "VLSFO",
      portFuelType: voyage.portFuelType ?? voyage.vessel.portFuelType ?? "LSMGO",
      brokeragePercent: voyage.brokeragePercent,
      commissionPercent: voyage.commissionPercent,
      additionalCosts: voyage.additionalCosts,
      weatherRiskMultiplier: voyage.weatherRiskMultiplier,
      freightRateUsd: voyage.freightRateUsd ?? undefined,
      freightRateUnit: voyage.freightRateUnit ?? "PER_MT",
      stowageFactor: voyage.stowageFactor ?? undefined,
      pdaCosts: voyage.pdaCosts ?? undefined,
      lubOilCosts: voyage.lubOilCosts ?? undefined,
    };
    
    // Apply overrides
    const overrides = validatedData.overrides as Record<string, number | string | boolean>;
    
    // If bunkerPriceUsd is overridden and we have multi-fuel prices, scale all fuel prices proportionally
    if (overrides.bunkerPriceUsd && baseInputs.fuelPrices && Object.keys(baseInputs.fuelPrices).length > 0) {
      const ratio = Number(overrides.bunkerPriceUsd) / baseInputs.bunkerPriceUsd;
      const scaledFuelPrices: Record<string, number> = {};
      for (const [fuel, price] of Object.entries(baseInputs.fuelPrices)) {
        scaledFuelPrices[fuel] = (price as number) * ratio;
      }
      overrides.fuelPrices = scaledFuelPrices as unknown as number; // stored as Json
    }
    
    const modifiedInputs: VoyageInputs = {
      ...baseInputs,
      ...overrides as unknown as Partial<VoyageInputs>,
    };
    
    // Calculate scenario results
    const result = calculateVoyage(vesselProfile, modifiedInputs);
    
    // Save scenario
    const scenario = await prisma.scenario.create({
      data: {
        userId: user.id,
        orgId: user.activeOrgId,
        voyageId: id,
        name: validatedData.name,
        description: validatedData.description,
        overrides: validatedData.overrides as Prisma.InputJsonValue,
        results: {
          totalVoyageDays: result.duration.totalVoyageDays,
          totalBunkerMt: result.bunker.totalBunkerMt,
          totalBunkerCost: result.bunker.totalBunkerCost,
          totalVoyageCost: result.costs.totalVoyageCost,
          tce: result.profitability.tce,
          breakEvenFreight: result.profitability.breakEvenFreight,
          voyagePnl: result.profitability.voyagePnl,
        },
      },
    });
    
    return NextResponse.json({ success: true, data: scenario }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating scenario:", error);
    
    if (error && typeof error === 'object' && 'name' in error && error.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: "Failed to create scenario" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a specific scenario or all for a voyage
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id: voyageId } = await params;
    
    // Parse optional scenarioId from query string
    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get("scenarioId");
    
    // Get the voyage to check ownership
    const voyage = await prisma.voyage.findUnique({
      where: { id: voyageId },
      select: { userId: true, orgId: true },
    });
    
    if (!voyage) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }
    
    const isVoyageOwner = voyage.userId === user.id;
    
    if (scenarioId) {
      // Deleting a specific scenario
      const scenario = await prisma.scenario.findUnique({
        where: { id: scenarioId },
        select: { userId: true, voyageId: true },
      });
      
      if (!scenario || scenario.voyageId !== voyageId) {
        return NextResponse.json(
          { success: false, error: "Scenario not found" },
          { status: 404 }
        );
      }
      
      // Voyage owner can delete any scenario; others can only delete their own
      const isScenarioOwner = scenario.userId === user.id;
      if (!isVoyageOwner && !isScenarioOwner) {
        return NextResponse.json(
          { success: false, error: "You can only delete your own scenarios" },
          { status: 403 }
        );
      }
      
      await prisma.scenario.delete({ where: { id: scenarioId } });
    } else {
      // Deleting all scenarios — only voyage owner can do this
      if (!isVoyageOwner) {
        return NextResponse.json(
          { success: false, error: "Only the voyage owner can delete all scenarios" },
          { status: 403 }
        );
      }
      
      await prisma.scenario.deleteMany({ where: { voyageId } });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting scenarios:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete scenarios" },
      { status: 500 }
    );
  }
}
