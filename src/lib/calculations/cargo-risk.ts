/**
 * Cargo Value & Risk Assessment Engine
 *
 * Estimates cargo value from commodity type and calculates
 * value-at-risk considering piracy, weather, and transit duration.
 *
 * Reads commodity benchmark prices from MaritimeIntelligence.
 *
 * Sources: Trading Economics, Platts, CBOT (commodity prices).
 */

import type { MaritimeIntelligence } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CargoValueEstimate {
  /** Total estimated cargo value in USD */
  totalValueUsd: number;
  /** Price per metric ton used */
  pricePerMt: number;
  /** Cargo quantity in MT */
  quantityMt: number;
  /** Commodity type matched */
  commodityType: string;
  /** Whether price was from matched commodity or default */
  priceSource: "matched" | "default";
}

export interface CargoRiskAssessment {
  /** Estimated cargo value */
  cargoValue: CargoValueEstimate;
  /** Total dollar value at risk */
  riskExposureUsd: number;
  /** Risk as percentage of cargo value */
  riskPercent: number;
  /** Individual risk factors with impacts */
  factors: RiskFactor[];
}

export interface RiskFactor {
  /** Risk factor name */
  name: string;
  /** Impact as a fraction (0.001 = 0.1% risk) */
  impact: number;
  /** Dollar exposure for this factor */
  exposureUsd: number;
  /** Human-readable description */
  description: string;
  /** Severity for UI coloring */
  severity: "low" | "moderate" | "high";
}

// ═══════════════════════════════════════════════════════════════════
// COMMODITY MATCHING
// ═══════════════════════════════════════════════════════════════════

type CommodityKey =
  | "commodityIronOre"
  | "commodityCoalThermal"
  | "commodityCoalCoking"
  | "commodityGrainWheat"
  | "commodityGrainCorn"
  | "commoditySoybeans"
  | "commodityCrudeOil"
  | "commodityCleanProducts"
  | "commodityLNG"
  | "commodityLPG"
  | "commoditySteel"
  | "commodityFertilizer"
  | "commodityCement"
  | "commodityContainerAvg"
  | "commodityDefault";

/** Map common cargo descriptions to MaritimeIntelligence commodity fields */
const COMMODITY_MAP: Record<string, CommodityKey> = {
  // Iron ore
  "iron ore": "commodityIronOre",
  "iron": "commodityIronOre",
  "ore": "commodityIronOre",
  "fines": "commodityIronOre",
  "pellets": "commodityIronOre",
  "bauxite": "commodityIronOre",

  // Coal
  "coal": "commodityCoalThermal",
  "thermal coal": "commodityCoalThermal",
  "steam coal": "commodityCoalThermal",
  "coking coal": "commodityCoalCoking",
  "met coal": "commodityCoalCoking",
  "metallurgical coal": "commodityCoalCoking",

  // Grains
  "wheat": "commodityGrainWheat",
  "grain": "commodityGrainWheat",
  "barley": "commodityGrainWheat",
  "corn": "commodityGrainCorn",
  "maize": "commodityGrainCorn",
  "soybeans": "commoditySoybeans",
  "soybean": "commoditySoybeans",
  "soya": "commoditySoybeans",

  // Petroleum
  "crude oil": "commodityCrudeOil",
  "crude": "commodityCrudeOil",
  "petroleum": "commodityCrudeOil",
  "clean products": "commodityCleanProducts",
  "gasoil": "commodityCleanProducts",
  "naphtha": "commodityCleanProducts",
  "diesel": "commodityCleanProducts",
  "jet fuel": "commodityCleanProducts",
  "gasoline": "commodityCleanProducts",
  "fuel oil": "commodityCleanProducts",

  // Gas
  "lng": "commodityLNG",
  "liquefied natural gas": "commodityLNG",
  "lpg": "commodityLPG",
  "liquefied petroleum gas": "commodityLPG",
  "propane": "commodityLPG",
  "butane": "commodityLPG",

  // Steel & minerals
  "steel": "commoditySteel",
  "steel coil": "commoditySteel",
  "hrc": "commoditySteel",
  "rebar": "commoditySteel",

  // Fertilizer
  "fertilizer": "commodityFertilizer",
  "urea": "commodityFertilizer",
  "dap": "commodityFertilizer",
  "potash": "commodityFertilizer",
  "phosphate": "commodityFertilizer",

  // Cement
  "cement": "commodityCement",
  "clinker": "commodityCement",

  // Container
  "container": "commodityContainerAvg",
  "containers": "commodityContainerAvg",
  "general cargo": "commodityDefault",
};

// ═══════════════════════════════════════════════════════════════════
// CARGO VALUE ESTIMATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Match a cargo description to a commodity price from MaritimeIntelligence.
 * Uses fuzzy key matching against common cargo terms.
 */
export function estimateCargoValue(
  cargoType: string,
  quantityMt: number,
  intel: MaritimeIntelligence,
): CargoValueEstimate {
  const normalizedType = cargoType.toLowerCase().trim();

  // Try exact match first, then partial match
  let commodityField: CommodityKey | undefined;
  let matchedType = cargoType;

  // Exact match
  if (COMMODITY_MAP[normalizedType]) {
    commodityField = COMMODITY_MAP[normalizedType];
    matchedType = normalizedType;
  } else {
    // Partial match — find the first key that appears in the cargo type
    for (const [keyword, field] of Object.entries(COMMODITY_MAP)) {
      if (normalizedType.includes(keyword)) {
        commodityField = field;
        matchedType = keyword;
        break;
      }
    }
  }

  const isMatched = !!commodityField;
  const field = commodityField || "commodityDefault";
  const pricePerMt = (intel[field] as number) || intel.commodityDefault;

  return {
    totalValueUsd: Math.round(pricePerMt * quantityMt),
    pricePerMt,
    quantityMt,
    commodityType: isMatched ? matchedType : "Unknown (default)",
    priceSource: isMatched ? "matched" : "default",
  };
}

// ═══════════════════════════════════════════════════════════════════
// CARGO RISK ASSESSMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate cargo value at risk combining multiple risk factors.
 *
 * @param cargoType       Cargo description (e.g. "Iron Ore", "Crude Oil")
 * @param quantityMt      Cargo quantity in metric tons
 * @param hraZones        HRA zones detected on route
 * @param hraDistanceNm   Total distance through HRA zones
 * @param weatherSeverity Weather severity ("calm" | "moderate" | "rough" | "severe")
 * @param voyageDays      Total voyage duration in days
 * @param intel           MaritimeIntelligence singleton
 */
export function assessCargoRisk(
  cargoType: string,
  quantityMt: number,
  hraZones: string[],
  hraDistanceNm: number,
  weatherSeverity: "calm" | "moderate" | "rough" | "severe",
  voyageDays: number,
  intel: MaritimeIntelligence,
): CargoRiskAssessment {
  const cargoValue = estimateCargoValue(cargoType, quantityMt, intel);
  const totalValue = cargoValue.totalValueUsd;
  const factors: RiskFactor[] = [];

  // Factor 1: Base transit risk (always present — standard marine insurance basis)
  factors.push({
    name: "Base Transit Risk",
    impact: 0.0005,
    exposureUsd: Math.round(totalValue * 0.0005),
    description: "Standard marine cargo insurance basis rate",
    severity: "low",
  });

  // Factor 2: Piracy zone exposure
  if (hraDistanceNm > 0 && hraZones.length > 0) {
    const piracyImpact = hraZones.some(z => z.includes("Gulf of Aden")) ? 0.003 : 0.002;
    factors.push({
      name: "Piracy Zone Exposure",
      impact: piracyImpact,
      exposureUsd: Math.round(totalValue * piracyImpact),
      description: `${Math.round(hraDistanceNm)} NM through ${hraZones.join(", ")}`,
      severity: "high",
    });
  }

  // Factor 3: Weather risk
  const weatherImpacts: Record<string, { impact: number; severity: RiskFactor["severity"] }> = {
    calm: { impact: 0, severity: "low" },
    moderate: { impact: 0.0003, severity: "low" },
    rough: { impact: 0.001, severity: "moderate" },
    severe: { impact: 0.003, severity: "high" },
  };
  const weatherFactor = weatherImpacts[weatherSeverity] || weatherImpacts.moderate;
  if (weatherFactor.impact > 0) {
    factors.push({
      name: "Weather Risk",
      impact: weatherFactor.impact,
      exposureUsd: Math.round(totalValue * weatherFactor.impact),
      description: `${weatherSeverity} sea conditions — elevated cargo damage probability`,
      severity: weatherFactor.severity,
    });
  }

  // Factor 4: Extended transit risk (voyages > 30 days)
  if (voyageDays > 30) {
    const transitImpact = Math.min(0.001, (voyageDays - 30) * 0.00005);
    factors.push({
      name: "Extended Transit",
      impact: transitImpact,
      exposureUsd: Math.round(totalValue * transitImpact),
      description: `${Math.round(voyageDays)} day voyage — prolonged exposure`,
      severity: voyageDays > 45 ? "moderate" : "low",
    });
  }

  // Factor 5: High-value cargo premium (cargo > $20M gets additional risk exposure)
  if (totalValue > 20_000_000) {
    factors.push({
      name: "High-Value Cargo",
      impact: 0.0005,
      exposureUsd: Math.round(totalValue * 0.0005),
      description: `Cargo valued at $${(totalValue / 1e6).toFixed(1)}M — concentrated risk`,
      severity: "moderate",
    });
  }

  // Sum up total risk
  const totalRiskPercent = factors.reduce((sum, f) => sum + f.impact, 0);

  return {
    cargoValue,
    riskExposureUsd: Math.round(totalValue * totalRiskPercent),
    riskPercent: Math.round(totalRiskPercent * 10000) / 100, // % with 2 decimals
    factors,
  };
}
