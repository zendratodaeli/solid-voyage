/**
 * Voyage Calculation Tools for AI Copilot
 * 
 * Wraps the existing voyage calculation engine, optimizer,
 * and sensitivity analysis as AI-callable tools. Compatible with AI SDK v6.
 */

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  calculateVoyage,
  type VesselProfile,
  type VoyageInputs,
} from "@/lib/calculations/voyage";
import { runOptimizer, type OptimizeTarget } from "@/lib/calculations/voyage-optimizer";
import {
  bunkerPriceSensitivity,
  generateCaseScenarios,
} from "@/lib/calculations/sensitivity";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function toVesselProfile(vessel: any): VesselProfile {
  return {
    ladenSpeed: vessel.ladenSpeed,
    ballastSpeed: vessel.ballastSpeed,
    ladenConsumption: vessel.ladenConsumption,
    ballastConsumption: vessel.ballastConsumption,
    portConsumption: vessel.portConsumptionWithoutCrane ?? 2.5,
    dailyOpex: vessel.dailyOpex ?? 0,
    ecoLadenSpeed: vessel.ecoLadenSpeed ?? undefined,
    ecoBallastSpeed: vessel.ecoBallastSpeed ?? undefined,
    ecoLadenConsumption: vessel.ecoLadenConsumption ?? undefined,
    ecoBallastConsumption: vessel.ecoBallastConsumption ?? undefined,
    dwt: vessel.dwt ?? undefined,
    vesselConstant: vessel.vesselConstant ?? undefined,
    loa: vessel.loa ?? undefined,
    beam: vessel.beam ?? undefined,
    summerDraft: vessel.summerDraft ?? undefined,
    grossTonnage: vessel.grossTonnage ?? undefined,
    netTonnage: vessel.netTonnage ?? undefined,
    grainCapacity: vessel.grainCapacity ?? undefined,
    baleCapacity: vessel.baleCapacity ?? undefined,
    teuCapacity: vessel.teuCapacity ?? undefined,
    cargoTankCapacityCbm: vessel.cargoTankCapacityCbm ?? undefined,
    boilOffRate: vessel.boilOffRate ?? undefined,
    heelQuantity: vessel.heelQuantity ?? undefined,
  };
}

function makeVoyageInputs(p: {
  ballastDistanceNm: number;
  ladenDistanceNm: number;
  cargoQuantityMt: number;
  loadPortDays?: number;
  dischargePortDays?: number;
  waitingDays?: number;
  bunkerPriceUsd?: number;
  freightRateUsd?: number;
  useEcoSpeed?: boolean;
  canalTolls?: number;
  brokeragePercent?: number;
  commissionPercent?: number;
  weatherRiskMultiplier?: number;
}): VoyageInputs {
  return {
    ballastDistanceNm: p.ballastDistanceNm,
    ladenDistanceNm: p.ladenDistanceNm,
    cargoQuantityMt: p.cargoQuantityMt,
    loadPortDays: p.loadPortDays ?? 2,
    dischargePortDays: p.dischargePortDays ?? 2,
    waitingDays: p.waitingDays ?? 0,
    idleDays: 0,
    bunkerPriceUsd: p.bunkerPriceUsd ?? 550,
    freightRateUsd: p.freightRateUsd,
    useEcoSpeed: p.useEcoSpeed ?? false,
    canalTolls: p.canalTolls ?? 0,
    brokeragePercent: p.brokeragePercent ?? 1.25,
    commissionPercent: p.commissionPercent ?? 3.75,
    additionalCosts: 0,
    pdaCosts: 0,
    lubOilCosts: 0,
    weatherRiskMultiplier: p.weatherRiskMultiplier ?? 1.05,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════

const findVesselsSchema = z.object({
  orgId: z.string().describe("The organization's Clerk ID"),
  minDwt: z.number().optional().describe("Minimum deadweight tonnage (MT)"),
  maxDwt: z.number().optional().describe("Maximum deadweight tonnage (MT)"),
  vesselType: z.string().optional().describe("Vessel type filter (e.g. CAPESIZE, SUPRAMAX)"),
  nameSearch: z.string().optional().describe("Search by vessel name (partial match)"),
});

const vesselIdSchema = z.object({
  vesselId: z.string().describe("The vessel's database ID"),
});

const calcVoyageSchema = z.object({
  vesselId: z.string().describe("The vessel's database ID"),
  ballastDistanceNm: z.number().describe("Ballast leg distance in nautical miles"),
  ladenDistanceNm: z.number().describe("Laden leg distance in nautical miles"),
  cargoQuantityMt: z.number().describe("Cargo quantity in metric tonnes"),
  loadPortDays: z.number().optional().describe("Days at load port (default: 2)"),
  dischargePortDays: z.number().optional().describe("Days at discharge port (default: 2)"),
  waitingDays: z.number().optional().describe("Waiting days (default: 0)"),
  bunkerPriceUsd: z.number().optional().describe("Bunker price in USD/MT VLSFO (default: 550)"),
  freightRateUsd: z.number().optional().describe("Offered freight rate in USD/MT"),
  useEcoSpeed: z.boolean().optional().describe("Use eco speed profile (default: false)"),
  canalTolls: z.number().optional().describe("Canal toll costs in USD (default: 0)"),
  brokeragePercent: z.number().optional().describe("Brokerage % (default: 1.25)"),
  commissionPercent: z.number().optional().describe("Commission % (default: 3.75)"),
  weatherRiskMultiplier: z.number().optional().describe("Weather risk factor (default: 1.05)"),
});

const optimizeSchema = z.object({
  vesselId: z.string().describe("The vessel's database ID"),
  ballastDistanceNm: z.number().describe("Ballast distance in NM"),
  ladenDistanceNm: z.number().describe("Laden distance in NM"),
  cargoQuantityMt: z.number().describe("Cargo quantity in MT"),
  bunkerPriceUsd: z.number().optional().describe("Bunker price USD/MT (default: 550)"),
  freightRateUsd: z.number().optional().describe("Freight rate USD/MT"),
  optimizeFor: z.enum(["maxTCE", "minCost", "minBunker", "minDays"]).optional().describe("Optimize target (default: maxTCE)"),
});

const bunkerSensitivitySchema = z.object({
  vesselId: z.string(),
  ballastDistanceNm: z.number(),
  ladenDistanceNm: z.number(),
  cargoQuantityMt: z.number(),
  currentBunkerPrice: z.number().describe("Current bunker price USD/MT"),
  freightRateUsd: z.number().optional(),
});

const scenariosSchema = z.object({
  vesselId: z.string(),
  ballastDistanceNm: z.number(),
  ladenDistanceNm: z.number(),
  cargoQuantityMt: z.number(),
  bunkerPriceUsd: z.number().optional().describe("Bunker price USD/MT (default: 550)"),
  freightRateUsd: z.number().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════

export const voyageTools = {
  findVessels: tool({
    description:
      "Search the organization's vessel fleet by capacity (DWT), vessel type, or name. " +
      "Use this when the user mentions a cargo quantity to find vessels that can carry it.",
    inputSchema: findVesselsSchema,
    execute: async (input: z.infer<typeof findVesselsSchema>) => {
      const where: any = { orgId: input.orgId };
      if (input.minDwt) where.dwt = { ...where.dwt, gte: input.minDwt };
      if (input.maxDwt) where.dwt = { ...where.dwt, lte: input.maxDwt };
      if (input.vesselType) where.vesselType = input.vesselType;
      if (input.nameSearch) where.name = { contains: input.nameSearch, mode: "insensitive" };

      const vessels = await prisma.vessel.findMany({
        where,
        select: {
          id: true, name: true, imoNumber: true, mmsiNumber: true,
          vesselType: true, dwt: true, ladenSpeed: true, ballastSpeed: true,
          ladenConsumption: true, ballastConsumption: true,
          portConsumptionWithoutCrane: true, dailyOpex: true,
          ecoLadenSpeed: true, ecoBallastSpeed: true,
          ecoLadenConsumption: true, ecoBallastConsumption: true,
          summerDraft: true, commercialControl: true, hasScrubber: true,
        },
        take: 10,
      });

      return {
        count: vessels.length,
        vessels: vessels.map((v) => ({
          id: v.id, name: v.name, imo: v.imoNumber, mmsi: v.mmsiNumber,
          type: v.vesselType, dwt: v.dwt, ladenSpeed: v.ladenSpeed,
          ballastSpeed: v.ballastSpeed, dailyOpex: v.dailyOpex,
          summerDraft: v.summerDraft, hasScrubber: v.hasScrubber,
          control: v.commercialControl,
        })),
      };
    },
  }),

  getVesselDetails: tool({
    description:
      "Get complete details of a specific vessel by its ID, including speed profiles, " +
      "consumption data, dimensions, and capacity information.",
    inputSchema: vesselIdSchema,
    execute: async (input: z.infer<typeof vesselIdSchema>) => {
      const vessel = await prisma.vessel.findUnique({ where: { id: input.vesselId } });
      if (!vessel) return { error: "Vessel not found" };
      return {
        id: vessel.id, name: vessel.name, imo: vessel.imoNumber, mmsi: vessel.mmsiNumber,
        type: vessel.vesselType, dwt: vessel.dwt,
        ladenSpeed: vessel.ladenSpeed, ballastSpeed: vessel.ballastSpeed,
        ladenConsumption: vessel.ladenConsumption, ballastConsumption: vessel.ballastConsumption,
        portConsumption: vessel.portConsumptionWithoutCrane, dailyOpex: vessel.dailyOpex,
        summerDraft: vessel.summerDraft, profile: toVesselProfile(vessel),
      };
    },
  }),

  calculateVoyageProfitability: tool({
    description:
      "Calculate complete voyage profitability including duration, bunker consumption, " +
      "costs, TCE, P&L, and break-even freight. The core calculation tool.",
    inputSchema: calcVoyageSchema,
    execute: async (input: z.infer<typeof calcVoyageSchema>) => {
      const vessel = await prisma.vessel.findUnique({ where: { id: input.vesselId } });
      if (!vessel) return { error: "Vessel not found" };

      const vesselProfile = toVesselProfile(vessel);
      const inputs = makeVoyageInputs(input);
      const result = calculateVoyage(vesselProfile, inputs);

      return {
        vesselName: vessel.name, vesselDwt: vessel.dwt,
        summary: result.summary, duration: result.duration,
        bunker: { totalBunkerMt: result.bunker.totalBunkerMt, totalBunkerCost: result.bunker.totalBunkerCost },
        costs: { totalVoyageCost: result.costs.totalVoyageCost, bunkerCost: result.costs.bunkerCost, opexCost: result.costs.opexCost },
        profitability: result.profitability,
        cargoIntake: result.cargoIntake,
      };
    },
  }),

  optimizeVoyageSpeed: tool({
    description:
      "Run the voyage speed optimizer to find the best speed for maximum TCE, minimum cost, " +
      "minimum bunker, or minimum days. Returns top 5 ranked.",
    inputSchema: optimizeSchema,
    execute: async (input: z.infer<typeof optimizeSchema>) => {
      const vessel = await prisma.vessel.findUnique({ where: { id: input.vesselId } });
      if (!vessel) return { error: "Vessel not found" };

      const vesselProfile = toVesselProfile(vessel);
      const baseInputs = makeVoyageInputs(input);

      const output = runOptimizer(vesselProfile, baseInputs, {
        optimizeFor: (input.optimizeFor ?? "maxTCE") as OptimizeTarget,
        includeEco: true,
        freightRateUsd: input.freightRateUsd,
        cargoQuantityMt: input.cargoQuantityMt,
      });

      return {
        vesselName: vessel.name,
        optimizeFor: input.optimizeFor ?? "maxTCE",
        baselineTce: output.metadata.baselineTce,
        baselineCost: output.metadata.baselineCost,
        totalCombinations: output.metadata.totalCombinations,
        top5: output.results.slice(0, 5).map((r) => ({
          rank: r.rank, speed: r.speed, mode: r.mode,
          seaDays: r.seaDays, totalVoyageDays: r.totalVoyageDays,
          bunkerMt: r.bunkerMt, bunkerCost: r.bunkerCost,
          totalVoyageCost: r.totalVoyageCost, tce: r.tce,
          voyagePnl: r.voyagePnl, savingsVsBaseline: r.savingsVsBaseline,
        })),
      };
    },
  }),

  analyzeBunkerSensitivity: tool({
    description:
      "Analyze how bunker price changes affect voyage P&L and TCE. " +
      "Returns a table of P&L at different bunker price points.",
    inputSchema: bunkerSensitivitySchema,
    execute: async (input: z.infer<typeof bunkerSensitivitySchema>) => {
      const vessel = await prisma.vessel.findUnique({ where: { id: input.vesselId } });
      if (!vessel) return { error: "Vessel not found" };

      const vesselProfile = toVesselProfile(vessel);
      const inputs = makeVoyageInputs({ ...input, bunkerPriceUsd: input.currentBunkerPrice });

      const result = bunkerPriceSensitivity(vesselProfile, inputs, {
        min: Math.max(300, input.currentBunkerPrice * 0.8),
        max: input.currentBunkerPrice * 1.2,
        step: 25,
      });

      return {
        vesselName: vessel.name,
        variable: result.variable,
        baseValue: result.baseValue,
        impactPerUnit: result.impactPerUnit,
        description: result.description,
        points: result.points.map((p) => ({
          bunkerPrice: p.value, pnl: p.pnl, tce: p.tce, breakEven: p.breakEven,
        })),
      };
    },
  }),

  generateScenarios: tool({
    description:
      "Generate best/base/worst case scenario comparisons for a voyage.",
    inputSchema: scenariosSchema,
    execute: async (input: z.infer<typeof scenariosSchema>) => {
      const vessel = await prisma.vessel.findUnique({ where: { id: input.vesselId } });
      if (!vessel) return { error: "Vessel not found" };

      const vesselProfile = toVesselProfile(vessel);
      const inputs = makeVoyageInputs(input);
      const scenarios = generateCaseScenarios(vesselProfile, inputs);

      return {
        vesselName: vessel.name,
        scenarios: scenarios.map((s) => ({
          name: s.name, description: s.description,
          tce: s.result.tce, totalVoyageCost: s.result.totalVoyageCost,
          voyagePnl: s.result.voyagePnl, totalVoyageDays: s.result.totalVoyageDays,
          differenceVsBase: s.difference,
        })),
      };
    },
  }),
};
