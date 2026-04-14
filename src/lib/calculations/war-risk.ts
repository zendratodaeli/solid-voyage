/**
 * War Risk & Piracy Intelligence Engine
 *
 * Calculates war risk insurance premiums and provides enriched
 * piracy risk assessments by reading from MaritimeIntelligence.
 *
 * Core formula: Hull Value × Zone Risk Rate = Premium per Transit
 *
 * Sources: JWC Listed Areas, IMB Piracy Reporting Centre,
 * Baltic Exchange hull values, Clarksons valuations.
 */

import type { MaritimeIntelligence } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface WarRiskEstimate {
  /** Total additional war risk premium in USD */
  premiumUsd: number;
  /** Rate as percentage of hull value */
  ratePercent: number;
  /** Hull value used for calculation */
  hullValueUsd: number;
  /** Whether hull value was from vessel data or estimated */
  hullValueSource: "vessel" | "benchmark" | "fallback";
  /** Human-readable basis string */
  basis: string;
  /** Per-zone breakdown */
  zones: ZoneRiskProfile[];
}

export interface ZoneRiskProfile {
  /** Zone name (matches hra-zones.json) */
  name: string;
  /** Risk score 1-10 */
  riskScore: number;
  /** Risk level classification */
  riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  /** Number of incidents in last 12 months */
  incidents12m: number;
  /** War risk premium rate as % of hull */
  warRiskRatePercent: number;
  /** Premium in USD for this zone */
  premiumUsd: number;
  /** Armed guard recommendation */
  armedGuards: "NONE" | "RECOMMENDED" | "MANDATORY";
  /** Security advisory measures */
  securityMeasures: string[];
}

export interface HullValueEstimate {
  /** Estimated hull value in USD */
  valueUsd: number;
  /** Source of the estimate */
  source: "vessel" | "benchmark" | "fallback";
  /** Basis description */
  basis: string;
}

// ═══════════════════════════════════════════════════════════════════
// VESSEL TYPE MAPPING
// ═══════════════════════════════════════════════════════════════════

/** Known vessel type strings → MaritimeIntelligence hull value field */
type HullValueKey =
  | "hullValueCapesize"
  | "hullValuePanamax"
  | "hullValueSupramax"
  | "hullValueHandysize"
  | "hullValueVLCC"
  | "hullValueSuezmax"
  | "hullValueAframax"
  | "hullValueMRTanker"
  | "hullValueLNGCarrier"
  | "hullValueContainerFeeder"
  | "hullValueContainerPanamax"
  | "hullValueGeneralCargo";

const VESSEL_TYPE_MAP: Record<string, HullValueKey> = {
  // Bulk carriers
  CAPESIZE: "hullValueCapesize",
  CAPE: "hullValueCapesize",
  PANAMAX: "hullValuePanamax",
  KAMSARMAX: "hullValuePanamax",
  SUPRAMAX: "hullValueSupramax",
  ULTRAMAX: "hullValueSupramax",
  HANDYSIZE: "hullValueHandysize",
  HANDYMAX: "hullValueSupramax",
  BULK_CARRIER: "hullValuePanamax", // Default to Panamax for generic bulk

  // Tankers
  VLCC: "hullValueVLCC",
  SUEZMAX: "hullValueSuezmax",
  AFRAMAX: "hullValueAframax",
  MR_TANKER: "hullValueMRTanker",
  MR: "hullValueMRTanker",
  TANKER: "hullValueAframax", // Default to Aframax for generic tanker
  PRODUCT_TANKER: "hullValueMRTanker",
  CRUDE_TANKER: "hullValueSuezmax",
  OIL_TANKER: "hullValueAframax",

  // LNG/LPG
  LNG_CARRIER: "hullValueLNGCarrier",
  LNG: "hullValueLNGCarrier",
  LPG_CARRIER: "hullValueMRTanker", // Approximate
  LPG: "hullValueMRTanker",

  // Container
  CONTAINER: "hullValueContainerPanamax",
  CONTAINER_FEEDER: "hullValueContainerFeeder",
  CONTAINER_PANAMAX: "hullValueContainerPanamax",
  FEEDER: "hullValueContainerFeeder",

  // General cargo
  GENERAL_CARGO: "hullValueGeneralCargo",
  MPP: "hullValueGeneralCargo",
  MULTI_PURPOSE: "hullValueGeneralCargo",
  BREAKBULK: "hullValueGeneralCargo",
  RO_RO: "hullValueGeneralCargo",
};

// ═══════════════════════════════════════════════════════════════════
// HULL VALUE ESTIMATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Estimate hull value for a vessel.
 *
 * Priority:
 * 1. Vessel's own `hullValue` field (if provided)
 * 2. MaritimeIntelligence benchmark by vessel type × age depreciation
 * 3. DWT-based fallback ($800/DWT)
 */
export function estimateHullValue(
  vessel: {
    hullValue?: number | null;
    vesselType?: string;
    dwt?: number;
    yearBuilt?: number;
  },
  intel: MaritimeIntelligence,
): HullValueEstimate {
  // Priority 1: Vessel has its own hull value
  if (vessel.hullValue && vessel.hullValue > 0) {
    return {
      valueUsd: vessel.hullValue,
      source: "vessel",
      basis: `Owner-provided hull value`,
    };
  }

  // Priority 2: Benchmark from MaritimeIntelligence by vessel type
  const typeKey = vessel.vesselType?.toUpperCase().replace(/[\s-]/g, "_") || "";
  const benchmarkField = VESSEL_TYPE_MAP[typeKey];

  if (benchmarkField) {
    const benchmarkValue = intel[benchmarkField] as number;

    if (benchmarkValue > 0) {
      // Apply age depreciation
      let ageFactor = 1.0;
      if (vessel.yearBuilt) {
        const age = new Date().getFullYear() - vessel.yearBuilt;
        const depreciationRate = intel.hullValueAgeDepreciation / 100;
        const minFactor = intel.hullValueMinAgeFactor;
        ageFactor = Math.max(minFactor, 1 - age * depreciationRate);
      } else {
        // Unknown age → assume 75% of benchmark (conservative)
        ageFactor = 0.75;
      }

      const adjustedValue = Math.round(benchmarkValue * ageFactor);
      const ageNote = vessel.yearBuilt
        ? `${new Date().getFullYear() - vessel.yearBuilt}y old, ${(ageFactor * 100).toFixed(0)}% factor`
        : "age unknown, 75% factor";

      return {
        valueUsd: adjustedValue,
        source: "benchmark",
        basis: `${typeKey} benchmark $${(benchmarkValue / 1e6).toFixed(0)}M × ${ageNote}`,
      };
    }
  }

  // Priority 3: DWT-based fallback
  if (vessel.dwt && vessel.dwt > 0) {
    const fallbackValue = Math.round(vessel.dwt * 800);
    return {
      valueUsd: fallbackValue,
      source: "fallback",
      basis: `DWT ${vessel.dwt.toLocaleString()} × $800/DWT (generic estimate)`,
    };
  }

  // Absolute fallback
  return {
    valueUsd: 30_000_000,
    source: "fallback",
    basis: "Default $30M (no vessel data available)",
  };
}

// ═══════════════════════════════════════════════════════════════════
// ZONE RISK PROFILES
// ═══════════════════════════════════════════════════════════════════

/**
 * Get enriched risk profile for a specific HRA zone.
 * Zone names match hra-zones.json properties.name values.
 */
export function getZoneRiskProfile(
  zoneName: string,
  hullValueUsd: number,
  intel: MaritimeIntelligence,
): ZoneRiskProfile | null {
  // Map zone names from hra-zones.json to MaritimeIntelligence fields
  if (zoneName.includes("Gulf of Aden")) {
    return {
      name: zoneName,
      riskScore: intel.gulfAdenRiskScore,
      riskLevel: intel.gulfAdenRiskLevel as ZoneRiskProfile["riskLevel"],
      incidents12m: intel.gulfAdenIncidents12m,
      warRiskRatePercent: intel.gulfAdenWarRiskRate,
      premiumUsd: Math.round(hullValueUsd * (intel.gulfAdenWarRiskRate / 100)),
      armedGuards: intel.gulfAdenArmedGuards as ZoneRiskProfile["armedGuards"],
      securityMeasures: [
        "Register with UKMTO before transit",
        "Implement BMP5 (Best Management Practices)",
        "Maintain 24h bridge watch with additional lookouts",
        "Deploy razor wire on accessible areas",
        "Prepare safe room / citadel",
        "Consider embarking armed security team",
      ],
    };
  }

  if (zoneName.includes("West Africa")) {
    return {
      name: zoneName,
      riskScore: intel.westAfricaRiskScore,
      riskLevel: intel.westAfricaRiskLevel as ZoneRiskProfile["riskLevel"],
      incidents12m: intel.westAfricaIncidents12m,
      warRiskRatePercent: intel.westAfricaWarRiskRate,
      premiumUsd: Math.round(hullValueUsd * (intel.westAfricaWarRiskRate / 100)),
      armedGuards: intel.westAfricaArmedGuards as ZoneRiskProfile["armedGuards"],
      securityMeasures: [
        "Report to MDAT-GoG before entering region",
        "Activate Ship Security Alert System (SSAS)",
        "Maintain high speed through anchorages",
        "Deploy anti-boarding measures (razor wire, water cannons)",
        "Keep citadel provisions for 72 hours",
      ],
    };
  }

  if (zoneName.includes("Malacca") || zoneName.includes("Singapore")) {
    return {
      name: zoneName,
      riskScore: intel.malaccaRiskScore,
      riskLevel: intel.malaccaRiskLevel as ZoneRiskProfile["riskLevel"],
      incidents12m: intel.malaccaIncidents12m,
      warRiskRatePercent: intel.malaccaWarRiskRate,
      premiumUsd: Math.round(hullValueUsd * (intel.malaccaWarRiskRate / 100)),
      armedGuards: intel.malaccaArmedGuards as ZoneRiskProfile["armedGuards"],
      securityMeasures: [
        "Maintain vigilant anti-piracy watch (especially at night)",
        "Secure all access points to accommodation",
        "Use deck lighting and CCTV monitoring",
        "Report incidents to Singapore VTIS / MSCC",
      ],
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate total war risk premium for a voyage based on HRA zone exposure.
 *
 * @param hraZones    List of HRA zone names detected on the route
 * @param vessel      Vessel info for hull value estimation
 * @param intel       MaritimeIntelligence singleton from database
 * @returns           War risk estimate with per-zone breakdown
 */
export function estimateWarRisk(
  hraZones: string[],
  vessel: {
    hullValue?: number | null;
    vesselType?: string;
    dwt?: number;
    yearBuilt?: number;
  },
  intel: MaritimeIntelligence,
): WarRiskEstimate {
  // Step 1: Estimate hull value
  const hullEstimate = estimateHullValue(vessel, intel);

  // Step 2: Get risk profiles for each zone
  const zoneProfiles: ZoneRiskProfile[] = [];
  for (const zoneName of hraZones) {
    const profile = getZoneRiskProfile(zoneName, hullEstimate.valueUsd, intel);
    if (profile) {
      zoneProfiles.push(profile);
    }
  }

  // Step 3: Calculate total premium
  // Industry standard: take the HIGHEST zone rate (not cumulative)
  // because war risk is typically per-transit, not per-zone
  const maxRate = zoneProfiles.length > 0
    ? Math.max(...zoneProfiles.map(z => z.warRiskRatePercent))
    : 0;
  const totalPremium = Math.round(hullEstimate.valueUsd * (maxRate / 100));

  return {
    premiumUsd: totalPremium,
    ratePercent: maxRate,
    hullValueUsd: hullEstimate.valueUsd,
    hullValueSource: hullEstimate.source,
    basis: `${maxRate.toFixed(3)}% of $${(hullEstimate.valueUsd / 1e6).toFixed(1)}M hull (${hullEstimate.basis})`,
    zones: zoneProfiles,
  };
}
