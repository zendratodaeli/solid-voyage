/**
 * Compliance Engine
 * 
 * Logic for EU ETS, fuel cost estimation, and CO2 emissions calculations.
 * Supports multi-fuel vessels (VLSFO, LSMGO, IFO180, IFO380, LNG).
 */

import { isEUETSCountry } from "@/data/eu-member-states";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type MainFuelType = "VLSFO" | "LSMGO" | "IFO380" | "IFO180" | "LNG";
export type AllFuelType = MainFuelType | "METHANOL" | "AMMONIA" | "MGO" | "HFO" | "HSFO" | "ULSFO" | "HYDROGEN";

export interface FuelPrices {
  vlsfo: number;
  lsmgo: number;
  ifo380: number;
  ifo180: number;
  lng: number;
}

export interface BunkerCostResult {
  seaCost: number;
  ecaCost: number;
  total: number;
  seaFuelMt: number;
  ecaFuelMt: number;
  totalFuelMt: number;
  ecaFuelLabel: string;   // Dynamic label: "AMMONIA", "LNG", "LSMGO", etc.
}

export interface EUETSResult {
  applicable: boolean;
  percentage: 0 | 50 | 100;
  reason: string;
}

export interface CO2EmissionsResult {
  totalCO2Mt: number;
  breakdown: { fuelType: string; amountMt: number; co2Mt: number }[];
}

// ═══════════════════════════════════════════════════════════════════
// CARBON FACTORS (IMO MEPC.308 - Default Values)
// ═══════════════════════════════════════════════════════════════════

// Default values - can be overridden by database values
export const DEFAULT_CARBON_FACTORS: Record<string, number> = {
  VLSFO: 3.114,     // 0.5% Sulfur
  LSMGO: 3.206,     // 0.1% Sulfur (ECA compliant)
  MGO: 3.206,       // Marine Gas Oil (ECA compliant) - same as LSMGO per IMO
  IFO380: 3.114,    // Heavy Fuel Oil (Requires Scrubber)
  IFO180: 3.114,    // Intermediate Fuel Oil
  HFO: 3.114,       // Heavy Fuel Oil
  HSFO: 3.114,      // High Sulfur Fuel Oil
  ULSFO: 3.151,     // Ultra Low Sulfur Fuel Oil
  LNG: 3.160,       // Low Carbon
  METHANOL: 1.375,  // Alternative
  AMMONIA: 0.050,   // Very Low Carbon
  HYDROGEN: 0.000,  // Zero Carbon
};

// Re-export for backward compatibility
export const CARBON_FACTORS = DEFAULT_CARBON_FACTORS;

// ═══════════════════════════════════════════════════════════════════
// EU ETS LOGIC
// ═══════════════════════════════════════════════════════════════════

/**
 * Check EU ETS applicability based on origin and destination ports
 * 
 * Rules:
 * - Both ports in EU/EEA: 100% of emissions taxable
 * - One port in EU/EEA: 50% of emissions taxable
 * - Neither port in EU/EEA: 0% taxable
 */
export function checkEUETS(
  originCountryCode: string,
  destinationCountryCode: string
): EUETSResult {
  const originInEU = isEUETSCountry(originCountryCode);
  const destInEU = isEUETSCountry(destinationCountryCode);

  if (originInEU && destInEU) {
    return {
      applicable: true,
      percentage: 100,
      reason: "Both ports are in EU/EEA - 100% of emissions taxable",
    };
  }

  if (originInEU || destInEU) {
    return {
      applicable: true,
      percentage: 50,
      reason: "One port is in EU/EEA - 50% of emissions taxable",
    };
  }

  return {
    applicable: false,
    percentage: 0,
    reason: "Neither port is in EU/EEA - EU ETS does not apply",
  };
}

// ═══════════════════════════════════════════════════════════════════
// COST ESTIMATION LOGIC
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate bunker cost for a voyage
 * 
 * Logic:
 * - In ECA zones: LNG vessels continue with LNG, oil vessels must switch to LSMGO
 * - Outside ECA: Use selected main fuel type
 */
export function calculateBunkerCost(params: {
  seaDistanceNm: number;      // Distance outside ECA
  ecaDistanceNm: number;      // Distance inside ECA
  speedKnots: number;         // Average speed
  dailyConsumptionMt: number; // Fuel consumption per day (main fuel)
  mainFuelType: MainFuelType; // User's main fuel selection
  prices: FuelPrices;         // Current market prices
  ecaFuelType?: string;       // Dynamic ECA fuel (e.g. "AMMONIA", "LNG")
  ecaFuelPrice?: number;      // Price per MT for the ECA fuel
  ecaDailyConsumptionMt?: number; // ECA fuel consumption (from vessel profile)
}): BunkerCostResult {
  const {
    seaDistanceNm,
    ecaDistanceNm,
    speedKnots,
    dailyConsumptionMt,
    mainFuelType,
    prices,
    ecaFuelType,
    ecaFuelPrice,
    ecaDailyConsumptionMt,
  } = params;

  // Calculate days at sea for each segment
  const seaDays = speedKnots > 0 ? seaDistanceNm / (speedKnots * 24) : 0;
  const ecaDays = speedKnots > 0 ? ecaDistanceNm / (speedKnots * 24) : 0;

  // Determine sea fuel price based on main fuel type
  let seaPrice = 0;
  switch (mainFuelType) {
    case "VLSFO":
      seaPrice = prices.vlsfo;
      break;
    case "LSMGO":
      seaPrice = prices.lsmgo;
      break;
    case "IFO380":
      seaPrice = prices.ifo380;
      break;
    case "IFO180":
      seaPrice = prices.ifo180;
      break;
    case "LNG":
      seaPrice = prices.lng;
      break;
  }

  // Determine ECA fuel price
  // Priority: explicit ecaFuelPrice > same fuel if already compliant > LSMGO fallback
  let ecaPrice: number;
  let resolvedEcaLabel: string;

  if (ecaFuelType && ecaFuelPrice !== undefined) {
    // Dynamic: use the vessel's auto-selected SECA fuel
    ecaPrice = ecaFuelPrice;
    resolvedEcaLabel = ecaFuelType;
  } else if (mainFuelType === "LNG" || mainFuelType === "LSMGO") {
    // Already ECA compliant - continue with same fuel
    ecaPrice = seaPrice;
    resolvedEcaLabel = mainFuelType;
  } else {
    // Fallback: switch to LSMGO
    ecaPrice = prices.lsmgo;
    resolvedEcaLabel = "LSMGO";
  }

  // Calculate fuel consumption
  // Use ECA-specific consumption from vessel profile if available
  const effectiveEcaConsumption = ecaDailyConsumptionMt ?? dailyConsumptionMt;
  const seaFuelMt = seaDays * dailyConsumptionMt;
  const ecaFuelMt = ecaDays * effectiveEcaConsumption;

  // Calculate costs
  const seaCost = seaFuelMt * seaPrice;
  const ecaCost = ecaFuelMt * ecaPrice;

  return {
    seaCost,
    ecaCost,
    total: seaCost + ecaCost,
    seaFuelMt,
    ecaFuelMt,
    totalFuelMt: seaFuelMt + ecaFuelMt,
    ecaFuelLabel: resolvedEcaLabel,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CO2 EMISSIONS LOGIC
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate CO2 emissions based on fuel consumption
 * Uses IMO MEPC.308 carbon factors (can be overridden with custom factors)
 */
export function calculateCO2Emissions(
  consumption: { fuelType: AllFuelType; amountMt: number }[],
  customCarbonFactors?: Partial<Record<AllFuelType, number>>
): CO2EmissionsResult {
  // Merge custom factors with defaults
  const carbonFactors = { ...DEFAULT_CARBON_FACTORS, ...customCarbonFactors };
  
  const breakdown = consumption.map((item) => {
    const factor = carbonFactors[item.fuelType] || 3.114;
    return {
      fuelType: item.fuelType,
      amountMt: item.amountMt,
      co2Mt: item.amountMt * factor,
    };
  });

  const totalCO2Mt = breakdown.reduce((sum, item) => sum + item.co2Mt, 0);

  return { totalCO2Mt, breakdown };
}

/**
 * Calculate CO2 for a voyage based on bunker consumption result
 * @param ecaFuelType - Optional ECA fuel type (defaults to LSMGO if not using LNG/LSMGO)
 */
export function calculateVoyageCO2(
  bunkerResult: BunkerCostResult,
  mainFuelType: MainFuelType,
  customCarbonFactors?: Partial<Record<AllFuelType, number>>,
  ecaFuelType?: AllFuelType
): CO2EmissionsResult {
  const consumption: { fuelType: AllFuelType; amountMt: number }[] = [];

  if (bunkerResult.seaFuelMt > 0) {
    consumption.push({
      fuelType: mainFuelType,
      amountMt: bunkerResult.seaFuelMt,
    });
  }

  if (bunkerResult.ecaFuelMt > 0) {
    // Use provided ECA fuel, or default based on main fuel
    const effectiveEcaFuel = ecaFuelType ?? 
      ((mainFuelType === "LNG" || mainFuelType === "LSMGO") ? mainFuelType : "LSMGO");
    consumption.push({
      fuelType: effectiveEcaFuel,
      amountMt: bunkerResult.ecaFuelMt,
    });
  }

  return calculateCO2Emissions(consumption, customCarbonFactors);
}
