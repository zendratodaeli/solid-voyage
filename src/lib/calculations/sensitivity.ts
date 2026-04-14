/**
 * Sensitivity Analysis Engine
 * 
 * This module provides sensitivity analysis for voyage profitability,
 * allowing users to understand how changes in key variables affect outcomes.
 */

import { VesselProfile, VoyageInputs, calculateVoyage } from "./voyage";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface SensitivityPoint {
  value: number;
  pnl: number;
  tce: number;
  breakEven: number;
}

export interface SensitivityResult {
  variable: string;
  unit: string;
  baseValue: number;
  points: SensitivityPoint[];
  impactPerUnit: number;
  description: string;
}

export interface ScenarioComparison {
  name: string;
  description?: string;
  inputs: Partial<VoyageInputs>;
  result: {
    totalVoyageDays: number;
    totalBunkerMt: number;
    totalBunkerCost: number;
    totalVoyageCost: number;
    tce: number;
    breakEvenFreight: number;
    voyagePnl: number | null;
  };
  difference: {
    voyageDays: number;
    bunkerCost: number;
    totalCost: number;
    tce: number;
    pnl: number | null;
  };
}

// ═══════════════════════════════════════════════════════════════════
// BUNKER PRICE SENSITIVITY
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate sensitivity to bunker price changes
 * For multi-fuel voyages, scales all fuel prices proportionally
 */
export function bunkerPriceSensitivity(
  vessel: VesselProfile,
  baseInputs: VoyageInputs,
  priceRange: { min: number; max: number; step: number }
): SensitivityResult {
  const points: SensitivityPoint[] = [];
  const baseResult = calculateVoyage(vessel, baseInputs);
  
  // Get the base fuel price for scaling
  const baseBunkerPrice = baseInputs.bunkerPriceUsd;
  
  for (let price = priceRange.min; price <= priceRange.max; price += priceRange.step) {
    // Calculate the scaling factor from the base price
    const scaleFactor = price / baseBunkerPrice;
    
    // Create modified inputs with scaled bunker price
    const modifiedInputs: VoyageInputs = { 
      ...baseInputs, 
      bunkerPriceUsd: price 
    };
    
    // If multi-fuel mode is active, scale ALL fuel prices proportionally
    if (baseInputs.fuelPrices && Object.keys(baseInputs.fuelPrices).length > 0) {
      const scaledFuelPrices: Record<string, number> = {};
      for (const [fuelType, basePrice] of Object.entries(baseInputs.fuelPrices)) {
        scaledFuelPrices[fuelType] = basePrice * scaleFactor;
      }
      modifiedInputs.fuelPrices = scaledFuelPrices;
    }
    
    const result = calculateVoyage(vessel, modifiedInputs);
    
    points.push({
      value: price,
      pnl: result.profitability.voyagePnl ?? 0,
      tce: result.profitability.tce,
      breakEven: result.profitability.breakEvenFreight,
    });
  }
  
  // Calculate impact per $10/MT change
  const totalBunker = baseResult.bunker.totalBunkerMt;
  const impactPerUnit = totalBunker * 10; // P&L change per $10/MT
  
  return {
    variable: "Bunker Price",
    unit: "USD/MT",
    baseValue: baseInputs.bunkerPriceUsd,
    points,
    impactPerUnit,
    description: `Each $10/MT change in bunker price affects P&L by ~USD ${impactPerUnit.toLocaleString()}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FREIGHT RATE SENSITIVITY
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate sensitivity to freight rate changes
 */
export function freightRateSensitivity(
  vessel: VesselProfile,
  baseInputs: VoyageInputs,
  freightRange: { min: number; max: number; step: number }
): SensitivityResult {
  const points: SensitivityPoint[] = [];
  
  // Calculate commission factor for impact calculation
  const commissionFactor = 1 - (baseInputs.commissionPercent / 100) - (baseInputs.brokeragePercent / 100);
  
  for (let freight = freightRange.min; freight <= freightRange.max; freight += freightRange.step) {
    const modifiedInputs = { ...baseInputs, freightRateUsd: freight };
    const result = calculateVoyage(vessel, modifiedInputs);
    
    points.push({
      value: freight,
      pnl: result.profitability.voyagePnl ?? 0,
      tce: result.profitability.tce,
      breakEven: result.profitability.breakEvenFreight,
    });
  }
  
  // Calculate impact per $1/MT change
  const impactPerUnit = baseInputs.cargoQuantityMt * 1 * commissionFactor;
  
  return {
    variable: "Freight Rate",
    unit: "USD/MT",
    baseValue: baseInputs.freightRateUsd ?? 0,
    points,
    impactPerUnit,
    description: `Each $1/MT change in freight affects net revenue by ~USD ${impactPerUnit.toLocaleString()}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SPEED SENSITIVITY
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate sensitivity to laden speed changes
 */
export function speedSensitivity(
  vessel: VesselProfile,
  baseInputs: VoyageInputs,
  speedRange: { min: number; max: number; step: number }
): SensitivityResult {
  const points: SensitivityPoint[] = [];
  const baseResult = calculateVoyage(vessel, baseInputs);
  
  for (let speed = speedRange.min; speed <= speedRange.max; speed += speedRange.step) {
    const modifiedVessel = { ...vessel, ladenSpeed: speed };
    const result = calculateVoyage(modifiedVessel, baseInputs);
    
    points.push({
      value: speed,
      pnl: result.profitability.voyagePnl ?? 0,
      tce: result.profitability.tce,
      breakEven: result.profitability.breakEvenFreight,
    });
  }
  
  // Estimate impact per knot (simplified)
  const baseSeaDays = baseResult.duration.ladenSeaDays;
  const baseDailyConsumption = vessel.ladenConsumption;
  const dailyCost = baseDailyConsumption * baseInputs.bunkerPriceUsd + vessel.dailyOpex;
  
  // Approximate days saved per knot increase
  const daysSavedPerKnot = baseInputs.ladenDistanceNm / (vessel.ladenSpeed * 24) -
    baseInputs.ladenDistanceNm / ((vessel.ladenSpeed + 1) * 24);
  const impactPerUnit = daysSavedPerKnot * dailyCost;
  
  return {
    variable: "Laden Speed",
    unit: "knots",
    baseValue: vessel.ladenSpeed,
    points,
    impactPerUnit,
    description: `Each 1 knot speed change affects voyage by ~${Math.abs(daysSavedPerKnot).toFixed(1)} days`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// TIME SENSITIVITY (PORT/WAITING DAYS)
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate sensitivity to port/waiting time changes
 */
export function timeSensitivity(
  vessel: VesselProfile,
  baseInputs: VoyageInputs,
  additionalDaysRange: { min: number; max: number; step: number }
): SensitivityResult {
  const points: SensitivityPoint[] = [];
  
  for (let days = additionalDaysRange.min; days <= additionalDaysRange.max; days += additionalDaysRange.step) {
    const modifiedInputs = { 
      ...baseInputs, 
      waitingDays: baseInputs.waitingDays + days 
    };
    const result = calculateVoyage(vessel, modifiedInputs);
    
    points.push({
      value: baseInputs.waitingDays + days,
      pnl: result.profitability.voyagePnl ?? 0,
      tce: result.profitability.tce,
      breakEven: result.profitability.breakEvenFreight,
    });
  }
  
  // Calculate impact per day
  const dailyPortCost = vessel.portConsumption * baseInputs.bunkerPriceUsd + vessel.dailyOpex;
  
  return {
    variable: "Waiting Days",
    unit: "days",
    baseValue: baseInputs.waitingDays,
    points,
    impactPerUnit: dailyPortCost,
    description: `Each additional waiting day costs ~USD ${dailyPortCost.toLocaleString()}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SCENARIO COMPARISON
// ═══════════════════════════════════════════════════════════════════

/**
 * Compare multiple scenario variations
 */
export function compareScenarios(
  vessel: VesselProfile,
  baseInputs: VoyageInputs,
  scenarios: Array<{
    name: string;
    description?: string;
    overrides: Partial<VoyageInputs>;
  }>
): ScenarioComparison[] {
  const baseResult = calculateVoyage(vessel, baseInputs);
  const baseSummary = baseResult.summary;
  
  return scenarios.map((scenario) => {
    // Merge base inputs with overrides
    const scenarioInputs = { ...baseInputs, ...scenario.overrides };
    const result = calculateVoyage(vessel, scenarioInputs);
    const summary = result.summary;
    
    return {
      name: scenario.name,
      description: scenario.description,
      inputs: scenario.overrides,
      result: summary,
      difference: {
        voyageDays: summary.totalVoyageDays - baseSummary.totalVoyageDays,
        bunkerCost: summary.totalBunkerCost - baseSummary.totalBunkerCost,
        totalCost: summary.totalVoyageCost - baseSummary.totalVoyageCost,
        tce: summary.tce - baseSummary.tce,
        pnl: summary.voyagePnl !== null && baseSummary.voyagePnl !== null
          ? summary.voyagePnl - baseSummary.voyagePnl
          : null,
      },
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
// COMPREHENSIVE SENSITIVITY ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/**
 * Run complete sensitivity analysis on all key variables
 */
export function runCompleteSensitivity(
  vessel: VesselProfile,
  baseInputs: VoyageInputs
): {
  bunkerPrice: SensitivityResult;
  freightRate: SensitivityResult;
  speed: SensitivityResult;
  time: SensitivityResult;
} {
  // Bunker price: ±20% in $25 steps
  const bunkerBase = baseInputs.bunkerPriceUsd;
  const bunkerPrice = bunkerPriceSensitivity(vessel, baseInputs, {
    min: Math.max(300, bunkerBase * 0.8),
    max: bunkerBase * 1.2,
    step: 25,
  });
  
  // Freight rate: from break-even to break-even + 50%
  const baseCalc = calculateVoyage(vessel, baseInputs);
  const breakEven = baseCalc.profitability.breakEvenFreight;
  const freightRate = freightRateSensitivity(vessel, baseInputs, {
    min: breakEven * 0.9,
    max: breakEven * 1.5,
    step: 1,
  });
  
  // Speed: ±3 knots in 0.5 knot steps
  const speed = speedSensitivity(vessel, baseInputs, {
    min: Math.max(8, vessel.ladenSpeed - 3),
    max: vessel.ladenSpeed + 3,
    step: 0.5,
  });
  
  // Time: 0 to +10 additional waiting days
  const time = timeSensitivity(vessel, baseInputs, {
    min: 0,
    max: 10,
    step: 1,
  });
  
  return {
    bunkerPrice,
    freightRate,
    speed,
    time,
  };
}

/**
 * Generate best/base/worst case scenarios
 */
export function generateCaseScenarios(
  vessel: VesselProfile,
  baseInputs: VoyageInputs
): ScenarioComparison[] {
  return compareScenarios(vessel, baseInputs, [
    {
      name: "Base Case",
      description: "Current assumptions",
      overrides: {},
    },
    {
      name: "Best Case",
      description: "Favorable conditions: lower bunker, no delays",
      overrides: {
        bunkerPriceUsd: baseInputs.bunkerPriceUsd * 0.9,
        waitingDays: 0,
        weatherRiskMultiplier: 1.0,
      },
    },
    {
      name: "Worst Case",
      description: "Adverse conditions: higher bunker, delays, weather",
      overrides: {
        bunkerPriceUsd: baseInputs.bunkerPriceUsd * 1.15,
        waitingDays: baseInputs.waitingDays + 3,
        weatherRiskMultiplier: Math.min(1.2, baseInputs.weatherRiskMultiplier * 1.1),
      },
    },
  ]);
}
