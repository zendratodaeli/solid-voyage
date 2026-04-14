/**
 * Maritime Intelligence — Unified Route Intelligence Engine
 *
 * Server action that fetches MaritimeIntelligence once and runs all
 * calculation engines to produce a comprehensive route cost analysis.
 *
 * This is the single entry point for the Multi-Route AI system.
 * Each route variant calls this function to get full cost/risk data.
 */

"use server";

import { prisma } from "@/lib/prisma";
import { estimateAllCanalTolls, type CanalTollEstimate } from "@/lib/calculations/canal-tolls";
import { estimateWarRisk, estimateHullValue, type WarRiskEstimate, type HullValueEstimate } from "@/lib/calculations/war-risk";
import { assessCargoRisk, estimateCargoValue, type CargoRiskAssessment, type CargoValueEstimate } from "@/lib/calculations/cargo-risk";
import { assessPortCongestion, type VoyageCongestionImpact } from "@/lib/calculations/port-congestion";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface RouteIntelligenceInput {
  /** Canals detected on this route (e.g. ["Suez Canal"]) */
  detectedCanals: string[];
  /** HRA zones detected on this route */
  hraZones: string[];
  /** Total distance through HRA zones (NM) */
  hraDistanceNm: number;

  /** Vessel data */
  vessel: {
    vesselType?: string;
    netTonnage?: number;
    grossTonnage?: number;
    dwt?: number;
    teuCapacity?: number;
    yearBuilt?: number;
    hullValue?: number | null;
    dailyOpex?: number;
  };

  /** Cargo data */
  cargo?: {
    type: string;
    quantityMt: number;
  };

  /** Voyage ports for congestion analysis */
  ports?: { name: string; locode?: string }[];

  /** Whether the vessel is laden or in ballast */
  laden?: boolean;

  /** Weather severity from weather-risk.ts */
  weatherSeverity?: "calm" | "moderate" | "rough" | "severe";

  /** Total estimated voyage duration in days */
  voyageDays?: number;
}

export interface RouteIntelligenceResult {
  /** Canal toll estimates */
  canalTolls: {
    estimates: CanalTollEstimate[];
    totalUsd: number;
  };

  /** War risk assessment */
  warRisk: WarRiskEstimate;

  /** Hull value estimate used across calculations */
  hullValue: HullValueEstimate;

  /** Cargo value and risk assessment (if cargo data provided) */
  cargoRisk: CargoRiskAssessment | null;

  /** Cargo value estimate (if cargo data provided) */
  cargoValue: CargoValueEstimate | null;

  /** Port congestion analysis (if port data provided) */
  portCongestion: VoyageCongestionImpact | null;

  /** Total additional voyage costs from intelligence (canal + war risk + congestion) */
  totalAdditionalCostsUsd: number;

  /** Data freshness */
  dataAsOf: string;
  updatedBy: string | null;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SERVER ACTION
// ═══════════════════════════════════════════════════════════════════

const SINGLETON_ID = "maritime_intelligence";

/**
 * Fetch MaritimeIntelligence and compute all route cost/risk metrics.
 *
 * Returns null if MaritimeIntelligence has not been seeded yet.
 */
export async function computeRouteIntelligence(
  input: RouteIntelligenceInput,
): Promise<RouteIntelligenceResult | null> {
  // Fetch MaritimeIntelligence singleton
  const intel = await prisma.maritimeIntelligence.findUnique({
    where: { id: SINGLETON_ID },
  });

  if (!intel) {
    console.warn("[RouteIntelligence] MaritimeIntelligence not seeded — returning null");
    return null;
  }

  // ── Canal Tolls ──────────────────────────────────────────────────
  const canalTolls = estimateAllCanalTolls(
    input.detectedCanals,
    {
      netTonnage: input.vessel.netTonnage,
      grossTonnage: input.vessel.grossTonnage,
      vesselType: input.vessel.vesselType,
      teuCapacity: input.vessel.teuCapacity,
    },
    input.laden ?? true,
    intel,
  );

  // ── Hull Value ───────────────────────────────────────────────────
  const hullValue = estimateHullValue(
    {
      hullValue: input.vessel.hullValue,
      vesselType: input.vessel.vesselType,
      dwt: input.vessel.dwt,
      yearBuilt: input.vessel.yearBuilt,
    },
    intel,
  );

  // ── War Risk ─────────────────────────────────────────────────────
  const warRisk = estimateWarRisk(
    input.hraZones,
    {
      hullValue: input.vessel.hullValue,
      vesselType: input.vessel.vesselType,
      dwt: input.vessel.dwt,
      yearBuilt: input.vessel.yearBuilt,
    },
    intel,
  );

  // ── Cargo Risk ───────────────────────────────────────────────────
  let cargoRisk: CargoRiskAssessment | null = null;
  let cargoValue: CargoValueEstimate | null = null;

  if (input.cargo && input.cargo.quantityMt > 0) {
    cargoValue = estimateCargoValue(
      input.cargo.type,
      input.cargo.quantityMt,
      intel,
    );

    cargoRisk = assessCargoRisk(
      input.cargo.type,
      input.cargo.quantityMt,
      input.hraZones,
      input.hraDistanceNm,
      input.weatherSeverity || "moderate",
      input.voyageDays || 20,
      intel,
    );
  }

  // ── Port Congestion ──────────────────────────────────────────────
  let portCongestion: VoyageCongestionImpact | null = null;

  if (input.ports && input.ports.length > 0) {
    const dailyOpex = input.vessel.dailyOpex || 8000; // Default $8K/day
    portCongestion = assessPortCongestion(input.ports, dailyOpex, intel);
  }

  // ── Total Additional Costs ───────────────────────────────────────
  const totalAdditionalCostsUsd =
    canalTolls.totalUsd +
    warRisk.premiumUsd +
    (portCongestion?.estimatedCostUsd || 0);

  return {
    canalTolls,
    warRisk,
    hullValue,
    cargoRisk,
    cargoValue,
    portCongestion,
    totalAdditionalCostsUsd,
    dataAsOf: intel.lastUpdatedAt.toISOString(),
    updatedBy: intel.updatedBy,
  };
}

/**
 * Lightweight fetch of just the MaritimeIntelligence data.
 * Useful for UI components that need raw values.
 */
export async function getMaritimeIntelligence() {
  return prisma.maritimeIntelligence.findUnique({
    where: { id: SINGLETON_ID },
  });
}
