import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { getVoyagePermission, type AuthUser } from "@/lib/permissions";

/**
 * GET /api/voyages/[id]/pdf
 *
 * Returns all voyage data needed for client-side PDF generation:
 * - Voyage details, vessel, calculation, recommendation
 * - Sensitivity analysis data (all 4 tabs + scenarios)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;

    // Check permission
    const permission = await getVoyagePermission(user, id);
    if (!permission) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }

    // Fetch full voyage data
    const voyage = await prisma.voyage.findUnique({
      where: { id },
      include: {
        vessel: true,
        calculations: true,
        recommendations: true,
      },
    });

    if (!voyage) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }

    // Fetch sensitivity data in parallel
    let sensitivityData = null;
    try {
      // Import sensitivity calculators
      const { calculateVoyage } = await import("@/lib/calculations/voyage");
      const {
        bunkerPriceSensitivity,
        freightRateSensitivity,
        speedSensitivity,
        timeSensitivity,
        generateCaseScenarios,
      } = await import("@/lib/calculations/sensitivity");

      const portConsumptionWithCrane = voyage.vessel.portConsumptionWithCrane ?? 0;
      const portConsumptionWithoutCrane = voyage.vessel.portConsumptionWithoutCrane ?? 0;
      const portConsumption = voyage.useCrane
        ? (portConsumptionWithCrane || portConsumptionWithoutCrane)
        : (portConsumptionWithoutCrane || portConsumptionWithCrane);

      const vesselProfile = {
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

      // Calculate break-even rate
      const baseTempInputs = {
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
        freightRateUsd: undefined as number | undefined,
      };

      const baseCaseResult = calculateVoyage(vesselProfile, baseTempInputs);
      const breakEvenRate = baseCaseResult.profitability.breakEvenFreight;
      const calculationRate = voyage.freightRateUsd ?? breakEvenRate;

      const voyageInputs = {
        ...baseTempInputs,
        freightRateUsd: calculationRate,
      };

      sensitivityData = {
        bunkerPrice: bunkerPriceSensitivity(vesselProfile, voyageInputs, {
          min: voyage.bunkerPriceUsd * 0.7,
          max: voyage.bunkerPriceUsd * 1.3,
          step: voyage.bunkerPriceUsd * 0.05,
        }),
        freightRate: freightRateSensitivity(vesselProfile, voyageInputs, {
          min: (voyage.freightRateUsd || 10) * 0.7,
          max: (voyage.freightRateUsd || 30) * 1.3,
          step: (voyage.freightRateUsd || 20) * 0.05,
        }),
        speed: speedSensitivity(vesselProfile, voyageInputs, {
          min: voyage.vessel.ladenSpeed * 0.85,
          max: voyage.vessel.ladenSpeed * 1.1,
          step: 0.5,
        }),
        time: timeSensitivity(vesselProfile, voyageInputs, {
          min: -2,
          max: 5,
          step: 1,
        }),
        scenarios: generateCaseScenarios(vesselProfile, voyageInputs),
      };
    } catch (err) {
      console.error("Failed to calculate sensitivity for PDF:", err);
    }

    // Get org info for branding
    let orgName: string | undefined;
    let orgLogoUrl: string | undefined;
    if (user.activeOrgId) {
      try {
        const { clerkClient } = await import("@clerk/nextjs/server");
        const client = await clerkClient();
        const org = await client.organizations.getOrganization({ organizationId: user.activeOrgId });
        orgName = org.name;
        orgLogoUrl = org.imageUrl;
      } catch {
        // proceed without org info
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        voyage: {
          loadPort: voyage.loadPort,
          dischargePort: voyage.dischargePort,
          openPort: voyage.openPort,
          voyageLegs: voyage.voyageLegs,
          cargoQuantityMt: voyage.cargoQuantityMt,
          cargoType: voyage.cargoType,
          stowageFactor: voyage.stowageFactor,
          ballastDistanceNm: voyage.ballastDistanceNm,
          ladenDistanceNm: voyage.ladenDistanceNm,
          loadPortDays: voyage.loadPortDays,
          dischargePortDays: voyage.dischargePortDays,
          waitingDays: voyage.waitingDays,
          idleDays: voyage.idleDays,
          bunkerPriceUsd: voyage.bunkerPriceUsd,
          bunkerFuelType: voyage.bunkerFuelType,
          fuelPrices: voyage.fuelPrices,
          freightRateUsd: voyage.freightRateUsd,
          freightRateUnit: voyage.freightRateUnit,
          brokeragePercent: voyage.brokeragePercent,
          commissionPercent: voyage.commissionPercent,
          additionalCosts: voyage.additionalCosts,
          pdaCosts: voyage.pdaCosts ?? 0,
          lubOilCosts: voyage.lubOilCosts ?? 0,
          canalType: voyage.canalType ?? "NONE",
          canalTolls: voyage.canalTolls,
          useEcoSpeed: voyage.useEcoSpeed,
          weatherRiskMultiplier: voyage.weatherRiskMultiplier,
          euEtsApplicable: voyage.euEtsApplicable ?? false,
          euEtsPercentage: voyage.euEtsPercentage ?? 0,
          status: voyage.status,
          createdAt: voyage.createdAt.toISOString(),
          updatedAt: voyage.updatedAt.toISOString(),
        },
        vessel: {
          name: voyage.vessel.name,
          vesselType: voyage.vessel.vesselType,
          dwt: voyage.vessel.dwt,
          imoNumber: voyage.vessel.imoNumber,
          ladenSpeed: voyage.vessel.ladenSpeed,
          ballastSpeed: voyage.vessel.ballastSpeed,
          ladenConsumption: voyage.vessel.ladenConsumption,
          ballastConsumption: voyage.vessel.ballastConsumption,
          dailyOpex: voyage.vessel.dailyOpex,
          hasScrubber: voyage.vessel.hasScrubber ?? false,
          vesselConstant: voyage.vessel.vesselConstant,
          dailyTcHireRate: voyage.vessel.dailyTcHireRate,
          commercialControl: voyage.vessel.commercialControl ?? "OWNED",
        },
        calculation: voyage.calculations ? {
          ballastSeaDays: voyage.calculations.ballastSeaDays,
          ladenSeaDays: voyage.calculations.ladenSeaDays,
          totalSeaDays: voyage.calculations.totalSeaDays,
          totalPortDays: voyage.calculations.totalPortDays,
          totalVoyageDays: voyage.calculations.totalVoyageDays,
          ballastBunkerMt: voyage.calculations.ballastBunkerMt,
          ladenBunkerMt: voyage.calculations.ladenBunkerMt,
          portBunkerMt: voyage.calculations.portBunkerMt,
          totalBunkerMt: voyage.calculations.totalBunkerMt,
          totalBunkerCost: voyage.calculations.totalBunkerCost,
          opexCost: voyage.calculations.opexCost,
          canalCost: voyage.calculations.canalCost,
          brokerageCost: voyage.calculations.brokerageCost,
          commissionCost: voyage.calculations.commissionCost,
          additionalCost: voyage.calculations.additionalCost,
          totalVoyageCost: voyage.calculations.totalVoyageCost,
          grossRevenue: voyage.calculations.grossRevenue,
          netRevenue: voyage.calculations.netRevenue,
          voyagePnl: voyage.calculations.voyagePnl,
          tce: voyage.calculations.tce,
          breakEvenFreight: voyage.calculations.breakEvenFreight,
          tcHireCost: voyage.calculations.tcHireCost,
          grossTce: voyage.calculations.grossTce,
          netTce: voyage.calculations.netTce,
          totalCO2Mt: voyage.calculations.totalCO2Mt,
          euEtsCost: voyage.calculations.euEtsCost,
          euEtsPercentage: voyage.calculations.euEtsPercentage,
          ciiAttained: voyage.calculations.ciiAttained,
          ciiRequired: voyage.calculations.ciiRequired,
          ciiRating: voyage.calculations.ciiRating,
        } : null,
        recommendation: voyage.recommendations ? {
          breakEvenFreight: voyage.recommendations.breakEvenFreight,
          targetFreight: voyage.recommendations.targetFreight,
          minMarketFreight: voyage.recommendations.minMarketFreight,
          maxMarketFreight: voyage.recommendations.maxMarketFreight,
          recommendedFreight: voyage.recommendations.recommendedFreight,
          targetMarginPercent: voyage.recommendations.targetMarginPercent,
          targetMarginUsd: voyage.recommendations.targetMarginUsd,
          overallRisk: voyage.recommendations.overallRisk,
          bunkerVolatilityRisk: voyage.recommendations.bunkerVolatilityRisk,
          weatherRisk: voyage.recommendations.weatherRisk,
          marketAlignmentRisk: voyage.recommendations.marketAlignmentRisk,
          confidenceScore: voyage.recommendations.confidenceScore,
          explanation: voyage.recommendations.explanation,
          recommendation: voyage.recommendations.recommendation,
        } : null,
        sensitivity: sensitivityData,
        orgName,
        orgLogoUrl,
      },
    });
  } catch (error) {
    console.error("Error fetching voyage PDF data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch voyage data for PDF" },
      { status: 500 }
    );
  }
}
