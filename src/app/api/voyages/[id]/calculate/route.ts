import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { calculateVoyage, VesselProfile, VoyageInputs } from "@/lib/calculations/voyage";
import { 
  generateFreightRecommendation, 
  MarketData, 
  RecommendationConfig 
} from "@/lib/calculations/freight";
import { 
  DEFAULT_TARGET_MARGIN_PERCENT, 
  DEFAULT_BUNKER_HISTORICAL_AVG 
} from "@/lib/constants";
import { getVoyagePermission, type AuthUser } from "@/lib/permissions";
import { checkEUETS, calculateCO2Emissions, type AllFuelType } from "@/lib/calculations/compliance-engine";
import { calculateVoyageCiiImpact } from "@/lib/calculations/cii-calculator";
import { sendCalculationNotification } from "@/lib/calculation-notification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const body = await request.json();
    
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
    
    // Build vessel profile from database
    // Determine port consumption based on useCrane toggle:
    // - For load/discharge: use crane consumption if useCrane=true
    // - For waiting/idle: always use no-crane consumption
    const portConsumptionWithCrane = voyage.vessel.portConsumptionWithCrane ?? 0;
    const portConsumptionWithoutCrane = voyage.vessel.portConsumptionWithoutCrane ?? 0;
    
    // Use the appropriate port consumption for the main calculation
    // (load/discharge port operations)
    const portConsumption = voyage.useCrane 
      ? (portConsumptionWithCrane || portConsumptionWithoutCrane)
      : (portConsumptionWithoutCrane || portConsumptionWithCrane);
    
    const vesselProfile: VesselProfile = {
      // Speed & Consumption
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
      // Bulk carrier
      grainCapacity: voyage.vessel.grainCapacity ?? undefined,
      baleCapacity: voyage.vessel.baleCapacity ?? undefined,
      // Container
      teuCapacity: voyage.vessel.teuCapacity ?? undefined,
      // LNG/LPG
      cargoTankCapacityCbm: voyage.vessel.cargoTankCapacityCbm ?? undefined,
      boilOffRate: voyage.vessel.boilOffRate ?? undefined,
      heelQuantity: voyage.vessel.heelQuantity ?? undefined,
    };
    
    // Build voyage inputs with defaults for optional fields
    const voyageInputs: VoyageInputs = {
      ballastDistanceNm: voyage.ballastDistanceNm,
      ladenDistanceNm: voyage.ladenDistanceNm,
      loadPortDays: voyage.loadPortDays,
      dischargePortDays: voyage.dischargePortDays,
      waitingDays: voyage.waitingDays,
      idleDays: voyage.idleDays,
      cargoQuantityMt: voyage.cargoQuantityMt,
      useEcoSpeed: voyage.useEcoSpeed,
      // Speed overrides
      overrideLadenSpeed: voyage.overrideLadenSpeed ?? undefined,
      overrideBallastSpeed: voyage.overrideBallastSpeed ?? undefined,
      canalTolls: voyage.canalTolls,
      bunkerPriceUsd: voyage.bunkerPriceUsd ?? 550, // Default bunker price if not set
      // Multi-fuel support
      fuelPrices: voyage.fuelPrices as Record<string, number> | undefined,
      ballastFuelType: voyage.ballastFuelType ?? voyage.vessel.ballastFuelType ?? "VLSFO",
      ladenFuelType: voyage.ladenFuelType ?? voyage.vessel.ladenFuelType ?? "VLSFO",
      portFuelType: voyage.portFuelType ?? voyage.vessel.portFuelType ?? "LSMGO",
      brokeragePercent: voyage.brokeragePercent,
      commissionPercent: voyage.commissionPercent,
      additionalCosts: voyage.additionalCosts,
      pdaCosts: voyage.pdaCosts,
      lubOilCosts: voyage.lubOilCosts,
      weatherRiskMultiplier: voyage.weatherRiskMultiplier,
      freightRateUsd: body.freightRateUsd ?? voyage.freightRateUsd ?? undefined,
      // Extended freight
      freightRateUnit: voyage.freightRateUnit ?? "PER_MT",
      stowageFactor: voyage.stowageFactor ?? undefined,
    };
    
    // Calculate voyage profitability
    const calculation = calculateVoyage(vesselProfile, voyageInputs);
    
    // ─── EU ETS + CO₂ + CII ─────────────────────────────────────────
    // EU ETS detection from stored country codes
    const euEts = checkEUETS(
      voyage.loadPortCountryCode || "",
      voyage.dischargePortCountryCode || ""
    );
    
    // CO₂ emissions from fuel breakdown
    const co2Emissions = calculateCO2Emissions([
      { fuelType: (voyageInputs.ladenFuelType || "VLSFO") as AllFuelType, amountMt: calculation.bunker.ladenBunkerMt },
      { fuelType: (voyageInputs.ballastFuelType || "VLSFO") as AllFuelType, amountMt: calculation.bunker.ballastBunkerMt },
      { fuelType: (voyageInputs.portFuelType || "LSMGO") as AllFuelType, amountMt: calculation.bunker.portBunkerMt },
    ]);
    
    // EU ETS carbon tax cost (default EUA price €75/tCO₂ — 2024-2026 market average)
    const euaPrice = 75;
    const euEtsCost = euEts.applicable 
      ? co2Emissions.totalCO2Mt * (euEts.percentage / 100) * euaPrice 
      : 0;
    
    // CII impact for this voyage
    const totalDistance = voyage.ballastDistanceNm + voyage.ladenDistanceNm;
    const ciiImpact = calculateVoyageCiiImpact(
      co2Emissions.totalCO2Mt,
      voyage.vessel.dwt,
      totalDistance,
      voyage.vessel.vesselType
    );
    
    // ─── TC-In Hire Deduction ────────────────────────────────────────
    const dailyTcHireRate = voyage.vessel.dailyTcHireRate ?? 0;
    const isTcIn = voyage.vessel.commercialControl === "TIME_CHARTER" && dailyTcHireRate > 0;
    const tcHireCost = isTcIn ? dailyTcHireRate * calculation.duration.totalVoyageDays : 0;
    
    // Gross TCE = before hire deduction (current `tce`)
    const grossTce = calculation.profitability.tce;
    // Net TCE = after hire deduction
    const netTce = calculation.duration.totalVoyageDays > 0
      ? ((calculation.profitability.netRevenue ?? 0) - calculation.costs.totalVoyageCost - tcHireCost) / calculation.duration.totalVoyageDays
      : 0;
    
    // Adjust total voyage cost to include EU ETS
    const totalVoyageCostWithEts = calculation.costs.totalVoyageCost + euEtsCost;
    
    // Helper to handle NaN values for database storage
    const safeNumber = (val: number | null | undefined): number | null => {
      if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
        return null;
      }
      return val;
    };
    
    // Save calculation results
    await prisma.voyageCalculation.upsert({
      where: { voyageId: voyage.id },
      create: {
        voyage: { connect: { id: voyage.id } },
        ballastSeaDays: safeNumber(calculation.duration.ballastSeaDays) ?? 0,
        ladenSeaDays: safeNumber(calculation.duration.ladenSeaDays) ?? 0,
        totalSeaDays: safeNumber(calculation.duration.totalSeaDays) ?? 0,
        totalPortDays: safeNumber(calculation.duration.totalPortDays) ?? 0,
        totalVoyageDays: safeNumber(calculation.duration.totalVoyageDays) ?? 0,
        ballastBunkerMt: safeNumber(calculation.bunker.ballastBunkerMt) ?? 0,
        ladenBunkerMt: safeNumber(calculation.bunker.ladenBunkerMt) ?? 0,
        portBunkerMt: safeNumber(calculation.bunker.portBunkerMt) ?? 0,
        totalBunkerMt: safeNumber(calculation.bunker.totalBunkerMt) ?? 0,
        totalBunkerCost: safeNumber(calculation.bunker.totalBunkerCost) ?? 0,
        opexCost: safeNumber(calculation.costs.opexCost) ?? 0,
        canalCost: safeNumber(calculation.costs.canalCost) ?? 0,
        brokerageCost: safeNumber(calculation.costs.brokerageCost) ?? 0,
        commissionCost: safeNumber(calculation.costs.commissionCost) ?? 0,
        additionalCost: safeNumber(calculation.costs.additionalCost) ?? 0,
        totalVoyageCost: safeNumber(calculation.costs.totalVoyageCost) ?? 0,
        grossRevenue: safeNumber(calculation.profitability.grossRevenue),
        netRevenue: safeNumber(calculation.profitability.netRevenue),
        voyagePnl: safeNumber(calculation.profitability.voyagePnl),
        tce: safeNumber(calculation.profitability.tce) ?? 0,
        breakEvenFreight: safeNumber(calculation.profitability.breakEvenFreight) ?? 0,
        // TC-In Hire
        tcHireCost: safeNumber(tcHireCost),
        tcHireDailyRate: safeNumber(dailyTcHireRate) || null,
        grossTce: safeNumber(grossTce),
        netTce: safeNumber(isTcIn ? netTce : grossTce),
        // EU ETS + Carbon
        totalCO2Mt: safeNumber(co2Emissions.totalCO2Mt),
        euEtsCost: safeNumber(euEtsCost),
        euEtsPercentage: euEts.percentage,
        // CII Impact
        ciiAttained: safeNumber(ciiImpact.voyageCII),
        ciiRequired: safeNumber(ciiImpact.predictedAnnualCII),
        ciiRating: ciiImpact.predictedRating,
        ciiRatio: safeNumber(ciiImpact.voyageCII && ciiImpact.predictedAnnualCII ? ciiImpact.voyageCII / ciiImpact.predictedAnnualCII : null),
      },
      update: {
        ballastSeaDays: safeNumber(calculation.duration.ballastSeaDays) ?? 0,
        ladenSeaDays: safeNumber(calculation.duration.ladenSeaDays) ?? 0,
        totalSeaDays: safeNumber(calculation.duration.totalSeaDays) ?? 0,
        totalPortDays: safeNumber(calculation.duration.totalPortDays) ?? 0,
        totalVoyageDays: safeNumber(calculation.duration.totalVoyageDays) ?? 0,
        ballastBunkerMt: safeNumber(calculation.bunker.ballastBunkerMt) ?? 0,
        ladenBunkerMt: safeNumber(calculation.bunker.ladenBunkerMt) ?? 0,
        portBunkerMt: safeNumber(calculation.bunker.portBunkerMt) ?? 0,
        totalBunkerMt: safeNumber(calculation.bunker.totalBunkerMt) ?? 0,
        totalBunkerCost: safeNumber(calculation.bunker.totalBunkerCost) ?? 0,
        opexCost: safeNumber(calculation.costs.opexCost) ?? 0,
        canalCost: safeNumber(calculation.costs.canalCost) ?? 0,
        brokerageCost: safeNumber(calculation.costs.brokerageCost) ?? 0,
        commissionCost: safeNumber(calculation.costs.commissionCost) ?? 0,
        additionalCost: safeNumber(calculation.costs.additionalCost) ?? 0,
        totalVoyageCost: safeNumber(calculation.costs.totalVoyageCost) ?? 0,
        grossRevenue: safeNumber(calculation.profitability.grossRevenue),
        netRevenue: safeNumber(calculation.profitability.netRevenue),
        voyagePnl: safeNumber(calculation.profitability.voyagePnl),
        tce: safeNumber(calculation.profitability.tce) ?? 0,
        breakEvenFreight: safeNumber(calculation.profitability.breakEvenFreight) ?? 0,
        // TC-In Hire
        tcHireCost: safeNumber(tcHireCost),
        tcHireDailyRate: safeNumber(dailyTcHireRate) || null,
        grossTce: safeNumber(grossTce),
        netTce: safeNumber(isTcIn ? netTce : grossTce),
        // EU ETS + Carbon
        totalCO2Mt: safeNumber(co2Emissions.totalCO2Mt),
        euEtsCost: safeNumber(euEtsCost),
        euEtsPercentage: euEts.percentage,
        // CII Impact
        ciiAttained: safeNumber(ciiImpact.voyageCII),
        ciiRequired: safeNumber(ciiImpact.predictedAnnualCII),
        ciiRating: ciiImpact.predictedRating,
        ciiRatio: safeNumber(ciiImpact.voyageCII && ciiImpact.predictedAnnualCII ? ciiImpact.voyageCII / ciiImpact.predictedAnnualCII : null),
        calculatedAt: new Date(),
      },
    });
    
    // Generate freight recommendation
    const config: RecommendationConfig = {
      targetMarginPercent: body.targetMarginPercent ?? DEFAULT_TARGET_MARGIN_PERCENT,
      bunkerPriceHistoricalAvg: DEFAULT_BUNKER_HISTORICAL_AVG,
      currentMonth: new Date().getMonth() + 1,
    };
    
    // Try to get market benchmark (optional)
    let marketData: MarketData | null = null;
    const benchmark = await prisma.marketBenchmark.findFirst({
      where: { vesselType: voyage.vessel.vesselType },
      orderBy: { date: "desc" },
    });
    
    if (benchmark) {
      marketData = {
        minFreight: benchmark.freightRate * 0.9,
        maxFreight: benchmark.freightRate * 1.1,
        avgFreight: benchmark.freightRate,
      };
    }
    
    const recommendation = generateFreightRecommendation(
      vesselProfile,
      voyageInputs,
      marketData,
      config
    );
    
    // Save recommendation
    await prisma.freightRecommendation.upsert({
      where: { voyageId: voyage.id },
      create: {
        voyage: { connect: { id: voyage.id } },
        breakEvenFreight: safeNumber(recommendation.breakEvenFreight) ?? 0,
        targetFreight: safeNumber(recommendation.targetFreight) ?? 0,
        minMarketFreight: safeNumber(recommendation.minMarketFreight) ?? 0,
        maxMarketFreight: safeNumber(recommendation.maxMarketFreight) ?? 0,
        recommendedFreight: safeNumber(recommendation.recommendedFreight) ?? 0,
        targetMarginPercent: safeNumber(recommendation.targetMarginPercent) ?? 0,
        targetMarginUsd: safeNumber(recommendation.targetMarginUsd) ?? 0,
        overallRisk: recommendation.risk.overallRisk,
        bunkerVolatilityRisk: recommendation.risk.bunkerVolatilityRisk,
        weatherRisk: recommendation.risk.weatherRisk,
        marketAlignmentRisk: recommendation.risk.marketAlignmentRisk,
        confidenceScore: safeNumber(recommendation.confidenceScore) ?? 0,
        explanation: recommendation.explanation,
        assumptions: recommendation.assumptions,
        recommendation: recommendation.recommendation,
      },
      update: {
        breakEvenFreight: safeNumber(recommendation.breakEvenFreight) ?? 0,
        targetFreight: safeNumber(recommendation.targetFreight) ?? 0,
        minMarketFreight: safeNumber(recommendation.minMarketFreight) ?? 0,
        maxMarketFreight: safeNumber(recommendation.maxMarketFreight) ?? 0,
        recommendedFreight: safeNumber(recommendation.recommendedFreight) ?? 0,
        targetMarginPercent: safeNumber(recommendation.targetMarginPercent) ?? 0,
        targetMarginUsd: safeNumber(recommendation.targetMarginUsd) ?? 0,
        overallRisk: recommendation.risk.overallRisk,
        bunkerVolatilityRisk: recommendation.risk.bunkerVolatilityRisk,
        weatherRisk: recommendation.risk.weatherRisk,
        marketAlignmentRisk: recommendation.risk.marketAlignmentRisk,
        confidenceScore: safeNumber(recommendation.confidenceScore) ?? 0,
        explanation: recommendation.explanation,
        assumptions: recommendation.assumptions,
        recommendation: recommendation.recommendation,
        createdAt: new Date(),
      },
    });
    
    // ─── Unified Lifecycle: Always → NEW ──────────────────────
    // Calculate always transitions to NEW (evaluating).
    // The recommendation badge (STRONG_ACCEPT / REJECT / etc.) advises
    // the chartering manager, but the system never auto-rejects.
    const newStatus = "NEW";
    
    // Update voyage status
    await prisma.voyage.update({
      where: { id: voyage.id },
      data: { status: newStatus },
    });
    
    // ─── Email Notification to Org Admins (fire-and-forget) ────
    if (voyage.orgId) {
      try {
        // Use Clerk to get org admin emails
        const { clerkClient } = await import("@clerk/nextjs/server");
        const client = await clerkClient();
        const memberships = await client.organizations.getOrganizationMembershipList({
          organizationId: voyage.orgId,
          limit: 100,
        });
        
        const adminEmails: string[] = [];
        for (const m of memberships.data) {
          if (m.role === "org:admin" && m.publicUserData?.identifier) {
            adminEmails.push(m.publicUserData.identifier);
          }
        }

        if (adminEmails.length > 0) {
          const loadPort = voyage.loadPort || "";
          const dischargePort = voyage.dischargePort || "";
          const voyageRoute = loadPort && dischargePort ? `${loadPort} → ${dischargePort}` : `Voyage ${voyage.id.slice(0, 8)}`;
          
          // Determine the org slug for the URL
          const org = await prisma.organization.findUnique({
            where: { id: voyage.orgId },
            select: { slug: true },
          });
          
          // Fire-and-forget — don't await
          sendCalculationNotification({
            adminEmails,
            voyageRoute,
            voyageId: voyage.id,
            orgSlug: org?.slug || voyage.orgId,
            status: newStatus as "NEW" | "REJECTED",
            tce: calculation.profitability.tce ?? 0,
            voyagePnl: calculation.profitability.voyagePnl ?? null,
            breakEvenFreight: calculation.profitability.breakEvenFreight ?? 0,
            calculatedBy: user.name || user.email || "Unknown",
          }).catch(err => console.error("[Calc Notification] Error:", err));
        }
      } catch (emailErr) {
        console.error("[Calc Notification] Failed to get admins:", emailErr);
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        calculation,
        recommendation,
        status: newStatus,
      },
    });
  } catch (error) {
    console.error("Error calculating voyage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to calculate voyage" },
      { status: 500 }
    );
  }
}
