/**
 * Canal Toll Estimation Engine
 *
 * Reads tariff rates from MaritimeIntelligence database and calculates
 * estimated transit fees for Suez, Panama, and Kiel canals.
 *
 * Accuracy: ±10-15% of actual toll — professionally acceptable for
 * voyage feasibility studies and route comparison.
 *
 * Sources: SCA Toll Circular 2025/2026, ACP FY2026, WSV Germany.
 */

import type { MaritimeIntelligence } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CanalTollEstimate {
  canal: "suez" | "panama" | "kiel";
  estimatedCostUsd: number;
  basis: string;
  confidence: "estimate" | "indicative";
  breakdown?: { tier: string; tonnage: number; rate: number; cost: number }[];
}

export interface CanalTollInput {
  /** Which canal was detected on this route */
  canal: "suez" | "panama" | "kiel";
  /** Vessel net tonnage (for Suez/Panama) */
  netTonnage?: number;
  /** Vessel gross tonnage (for Kiel) */
  grossTonnage?: number;
  /** Vessel type string (e.g. "BULK_CARRIER", "TANKER", "VLCC") */
  vesselType?: string;
  /** Container TEU capacity (for Panama container vessels) */
  teuCapacity?: number;
  /** Whether vessel is laden or in ballast */
  laden?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// SUEZ CANAL — SCA Tariff (tiered SCNT brackets)
// ═══════════════════════════════════════════════════════════════════

function estimateSuezToll(
  netTonnage: number,
  vesselType: string,
  laden: boolean,
  intel: MaritimeIntelligence,
): CanalTollEstimate {
  // Build tier brackets from MaritimeIntelligence
  const tiers = [
    { maxNT: 5000,     rate: intel.suezTier1Rate, label: "0–5,000 SCNT" },
    { maxNT: 10000,    rate: intel.suezTier2Rate, label: "5,001–10,000" },
    { maxNT: 20000,    rate: intel.suezTier3Rate, label: "10,001–20,000" },
    { maxNT: 30000,    rate: intel.suezTier4Rate, label: "20,001–30,000" },
    { maxNT: Infinity, rate: intel.suezTier5Rate, label: "30,000+" },
  ];

  let totalToll = 0;
  let remaining = netTonnage;
  let prevMax = 0;
  const breakdown: CanalTollEstimate["breakdown"] = [];

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierWidth = tier.maxNT === Infinity ? remaining : tier.maxNT - prevMax;
    const applicable = Math.min(remaining, tierWidth);
    const cost = applicable * tier.rate;
    totalToll += cost;
    breakdown.push({
      tier: tier.label,
      tonnage: applicable,
      rate: tier.rate,
      cost: Math.round(cost),
    });
    remaining -= applicable;
    prevMax = tier.maxNT;
  }

  // Ballast discount
  if (!laden && intel.suezBallastDiscount > 0) {
    totalToll *= (1 - intel.suezBallastDiscount / 100);
  }

  // Tanker surcharge
  const isTanker =
    vesselType.includes("TANKER") ||
    vesselType === "VLCC" ||
    vesselType.includes("SUEZMAX") ||
    vesselType.includes("AFRAMAX");
  if (isTanker && intel.suezTankerSurcharge > 0) {
    totalToll *= (1 + intel.suezTankerSurcharge / 100);
  }

  return {
    canal: "suez",
    estimatedCostUsd: Math.round(totalToll),
    basis: `NT ${netTonnage.toLocaleString()}, ${laden ? "laden" : "ballast"}${isTanker ? ", tanker surcharge" : ""}`,
    confidence: "estimate",
    breakdown,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PANAMA CANAL — ACP Tariff (NT-based + per-TEU for containers)
// ═══════════════════════════════════════════════════════════════════

function estimatePanamaToll(
  netTonnage: number,
  vesselType: string,
  teuCapacity: number | undefined,
  intel: MaritimeIntelligence,
): CanalTollEstimate {
  // Container vessels: per TEU pricing
  if (teuCapacity && teuCapacity > 0) {
    const isNeopanamax = teuCapacity > 5100;
    const costPerTeu = isNeopanamax
      ? intel.panamaContainerNeopanamax
      : intel.panamaContainerPanamax;

    return {
      canal: "panama",
      estimatedCostUsd: Math.round(teuCapacity * costPerTeu),
      basis: `${teuCapacity.toLocaleString()} TEU × $${costPerTeu}/TEU (${isNeopanamax ? "Neopanamax" : "Panamax"})`,
      confidence: "estimate",
    };
  }

  // Non-container: tiered NT-based tariff
  const tiers = [
    { maxNT: 10000,    rate: intel.panamaTier1Rate, label: "0–10,000 NT" },
    { maxNT: 20000,    rate: intel.panamaTier2Rate, label: "10,001–20,000" },
    { maxNT: Infinity, rate: intel.panamaTier3Rate, label: "20,000+" },
  ];

  let totalToll = 0;
  let remaining = netTonnage;
  let prevMax = 0;
  const breakdown: CanalTollEstimate["breakdown"] = [];

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierWidth = tier.maxNT === Infinity ? remaining : tier.maxNT - prevMax;
    const applicable = Math.min(remaining, tierWidth);
    const cost = applicable * tier.rate;
    totalToll += cost;
    breakdown.push({
      tier: tier.label,
      tonnage: applicable,
      rate: tier.rate,
      cost: Math.round(cost),
    });
    remaining -= applicable;
    prevMax = tier.maxNT;
  }

  return {
    canal: "panama",
    estimatedCostUsd: Math.round(totalToll),
    basis: `NT ${netTonnage.toLocaleString()} (bulk/tanker tariff)`,
    confidence: "estimate",
    breakdown,
  };
}

// ═══════════════════════════════════════════════════════════════════
// KIEL CANAL — WSV Tariff (GT-based, EUR → USD)
// ═══════════════════════════════════════════════════════════════════

function estimateKielToll(
  grossTonnage: number,
  intel: MaritimeIntelligence,
): CanalTollEstimate {
  const eurCost = (grossTonnage / 1000) * intel.kielRatePer1000GT;
  const eurToUsd = intel.eurUsdRate > 0 ? intel.eurUsdRate : 1.10;
  const usdCost = eurCost * eurToUsd;

  return {
    canal: "kiel",
    estimatedCostUsd: Math.round(usdCost),
    basis: `GT ${grossTonnage.toLocaleString()} × €${intel.kielRatePer1000GT}/1000 GT × ${eurToUsd} EUR/USD`,
    confidence: "estimate",
  };
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Estimate canal transit toll given vessel parameters and detected canal.
 * Reads all tariff rates from the MaritimeIntelligence database record.
 *
 * @param input  Canal type, vessel tonnage, type, and cargo status
 * @param intel  MaritimeIntelligence singleton from database
 * @returns      Estimated cost with breakdown and confidence level
 */
export function estimateCanalToll(
  input: CanalTollInput,
  intel: MaritimeIntelligence,
): CanalTollEstimate | null {
  switch (input.canal) {
    case "suez":
      if (!input.netTonnage) return null;
      return estimateSuezToll(
        input.netTonnage,
        input.vesselType || "",
        input.laden ?? true,
        intel,
      );
    case "panama":
      if (!input.netTonnage) return null;
      return estimatePanamaToll(
        input.netTonnage,
        input.vesselType || "",
        input.teuCapacity,
        intel,
      );
    case "kiel":
      if (!input.grossTonnage) return null;
      return estimateKielToll(input.grossTonnage, intel);
    default:
      return null;
  }
}

/**
 * Estimate all canal tolls for a list of detected canals in one call.
 */
export function estimateAllCanalTolls(
  detectedCanals: string[],
  vessel: {
    netTonnage?: number;
    grossTonnage?: number;
    vesselType?: string;
    teuCapacity?: number;
  },
  laden: boolean,
  intel: MaritimeIntelligence,
): { estimates: CanalTollEstimate[]; totalUsd: number } {
  const estimates: CanalTollEstimate[] = [];
  let totalUsd = 0;

  for (const canal of detectedCanals) {
    const canalKey = canal.toLowerCase().includes("suez")
      ? "suez"
      : canal.toLowerCase().includes("panama")
        ? "panama"
        : canal.toLowerCase().includes("kiel")
          ? "kiel"
          : null;

    if (!canalKey) continue;

    const estimate = estimateCanalToll(
      {
        canal: canalKey,
        netTonnage: vessel.netTonnage,
        grossTonnage: vessel.grossTonnage,
        vesselType: vessel.vesselType,
        teuCapacity: vessel.teuCapacity,
        laden,
      },
      intel,
    );

    if (estimate) {
      estimates.push(estimate);
      totalUsd += estimate.estimatedCostUsd;
    }
  }

  return { estimates, totalUsd };
}
