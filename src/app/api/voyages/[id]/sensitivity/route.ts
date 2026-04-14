import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { VesselProfile, VoyageInputs, calculateVoyage } from "@/lib/calculations/voyage";
import { 
  bunkerPriceSensitivity, 
  freightRateSensitivity, 
  speedSensitivity,
  timeSensitivity,
  generateCaseScenarios 
} from "@/lib/calculations/sensitivity";
import { getVoyagePermission, type AuthUser } from "@/lib/permissions";

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
      // Dimensions & Capacity
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
    
    // Step 1: Build voyage inputs WITHOUT freight rate first to calculate break-even
    const baseTempInputs: VoyageInputs = {
      ballastDistanceNm: voyage.ballastDistanceNm,
      ladenDistanceNm: voyage.ladenDistanceNm,
      loadPortDays: voyage.loadPortDays,
      dischargePortDays: voyage.dischargePortDays,
      waitingDays: voyage.waitingDays,
      idleDays: voyage.idleDays,
      cargoQuantityMt: voyage.cargoQuantityMt,
      useEcoSpeed: voyage.useEcoSpeed,
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
      pdaCosts: voyage.pdaCosts ?? 0,
      lubOilCosts: voyage.lubOilCosts ?? 0,
      weatherRiskMultiplier: voyage.weatherRiskMultiplier,
      freightRateUsd: undefined, // Calculate break-even first
    };
    
    // Calculate break-even rate from base case
    const baseCaseResult = calculateVoyage(vesselProfile, baseTempInputs);
    const breakEvenRate = baseCaseResult.profitability.breakEvenFreight;
    
    // Step 2: Define Calculation_Rate
    // IF User_Input exists -> Calculation_Rate = User_Input
    // IF User_Input is Empty -> Calculation_Rate = Break-Even Rate
    const calculationRate = voyage.freightRateUsd ?? breakEvenRate;
    
    // Build voyage inputs with the calculation rate for all scenarios
    const voyageInputs: VoyageInputs = {
      ...baseTempInputs,
      freightRateUsd: calculationRate,
    };
    
    // Run sensitivity analyses
    const bunkerSensitivity = bunkerPriceSensitivity(
      vesselProfile,
      voyageInputs,
      {
        min: voyage.bunkerPriceUsd * 0.7,
        max: voyage.bunkerPriceUsd * 1.3,
        step: voyage.bunkerPriceUsd * 0.05,
      }
    );
    
    const freightSensitivity = freightRateSensitivity(
      vesselProfile,
      voyageInputs,
      {
        min: (voyage.freightRateUsd || 10) * 0.7,
        max: (voyage.freightRateUsd || 30) * 1.3,
        step: (voyage.freightRateUsd || 20) * 0.05,
      }
    );
    
    const ladenSpeedSensitivity = speedSensitivity(
      vesselProfile,
      voyageInputs,
      {
        min: voyage.vessel.ladenSpeed * 0.85,
        max: voyage.vessel.ladenSpeed * 1.1,
        step: 0.5,
      }
    );
    
    const portTimeSensitivity = timeSensitivity(
      vesselProfile,
      voyageInputs,
      {
        min: -2,
        max: 5,
        step: 1,
      }
    );
    
    // Generate scenario comparisons
    const scenarios = generateCaseScenarios(vesselProfile, voyageInputs);
    
    return NextResponse.json({
      success: true,
      data: {
        bunkerPrice: bunkerSensitivity,
        freightRate: freightSensitivity,
        speed: ladenSpeedSensitivity,
        time: portTimeSensitivity,
        scenarios,
      },
    });
  } catch (error) {
    console.error("Error running sensitivity analysis:", error);
    return NextResponse.json(
      { success: false, error: "Failed to run sensitivity analysis" },
      { status: 500 }
    );
  }
}
