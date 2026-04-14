/**
 * Smart Voyage Optimizer — Phase 1
 * 
 * Sweeps speed × eco mode combinations using the existing
 * calculateVoyage() engine and returns ranked results.
 * 
 * No external API or database dependency — pure calculation.
 */

import {
  calculateVoyage,
  type VesselProfile,
  type VoyageInputs,
  type VoyageCalculationResult,
} from "./voyage";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type OptimizeTarget = "maxTCE" | "minCost" | "minBunker" | "minDays";

export interface OptimizerConfig {
  /** Speed sweep range. Defaults: eco speed → design speed, step 0.5 */
  speedRange?: { min: number; max: number; step: number };
  /** Optimization target */
  optimizeFor: OptimizeTarget;
  /** Whether to include eco mode in the sweep */
  includeEco: boolean;
  /** Freight rate — required for TCE/P&L ranking */
  freightRateUsd?: number;
  /** Cargo quantity in MT */
  cargoQuantityMt: number;
}

export interface OptimizerResult {
  rank: number;
  /** Speed used for this combination (knots) */
  speed: number;
  /** Whether eco mode was used */
  mode: "normal" | "eco";
  /** Duration breakdown */
  seaDays: number;
  totalVoyageDays: number;
  /** Cost breakdown */
  bunkerMt: number;
  bunkerCost: number;
  totalVoyageCost: number;
  /** Profitability */
  tce: number;
  voyagePnl: number | null;
  breakEvenFreight: number;
  /** Savings vs current/baseline config (in total cost) */
  savingsVsBaseline: number;
  /** The full calculation result for drill-down */
  fullResult: VoyageCalculationResult;
}

export interface OptimizerOutput {
  results: OptimizerResult[];
  metadata: {
    totalCombinations: number;
    timeTakenMs: number;
    optimizeFor: OptimizeTarget;
    baselineTce: number;
    baselineCost: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// OPTIMIZER ENGINE
// ═══════════════════════════════════════════════════════════════════

/**
 * Main optimizer function.
 * 
 * Sweeps across speed × eco mode combinations,
 * runs calculateVoyage() for each, and returns ranked results.
 */
export function runOptimizer(
  vessel: VesselProfile,
  baseInputs: VoyageInputs,
  config: OptimizerConfig,
): OptimizerOutput {
  const startTime = performance.now();

  // Determine speed range
  const ecoSpeed = Math.min(
    vessel.ecoLadenSpeed || vessel.ladenSpeed,
    vessel.ecoBallastSpeed || vessel.ballastSpeed,
  );
  const designSpeed = Math.max(vessel.ladenSpeed, vessel.ballastSpeed);
  
  const speedRange = config.speedRange || {
    min: Math.max(ecoSpeed - 1, 6), // 1 knot below eco, minimum 6
    max: designSpeed + 1,            // 1 knot above design
    step: 0.5,
  };

  // Calculate baseline (current config) for comparison
  const baselineResult = calculateVoyage(vessel, {
    ...baseInputs,
    freightRateUsd: config.freightRateUsd,
    cargoQuantityMt: config.cargoQuantityMt,
  });
  const baselineCost = baselineResult.costs.totalVoyageCost;
  const baselineTce = baselineResult.profitability.tce;

  // Generate all combinations
  const allResults: OptimizerResult[] = [];
  const modes: Array<"normal" | "eco"> = config.includeEco && hasEcoProfile(vessel)
    ? ["normal", "eco"]
    : ["normal"];

  for (let speed = speedRange.min; speed <= speedRange.max; speed += speedRange.step) {
    // Round to avoid floating point issues
    const roundedSpeed = Math.round(speed * 10) / 10;
    
    for (const mode of modes) {
      // Build vessel profile with this speed/mode
      const modifiedVessel = buildVesselForSpeed(vessel, roundedSpeed, mode);
      
      // Build voyage inputs
      const modifiedInputs: VoyageInputs = {
        ...baseInputs,
        useEcoSpeed: mode === "eco",
        freightRateUsd: config.freightRateUsd,
        cargoQuantityMt: config.cargoQuantityMt,
      };

      try {
        const result = calculateVoyage(modifiedVessel, modifiedInputs);
        
        // Skip invalid results
        if (result.duration.totalVoyageDays <= 0) continue;
        
        allResults.push({
          rank: 0, // Will be set after sorting
          speed: roundedSpeed,
          mode,
          seaDays: result.duration.totalSeaDays,
          totalVoyageDays: result.duration.totalVoyageDays,
          bunkerMt: result.bunker.totalBunkerMt,
          bunkerCost: result.bunker.totalBunkerCost,
          totalVoyageCost: result.costs.totalVoyageCost,
          tce: result.profitability.tce,
          voyagePnl: result.profitability.voyagePnl,
          breakEvenFreight: result.profitability.breakEvenFreight,
          savingsVsBaseline: baselineCost - result.costs.totalVoyageCost,
          fullResult: result,
        });
      } catch {
        // Skip combinations that cause calculation errors
        continue;
      }
    }
  }

  // Sort by optimization target
  sortResults(allResults, config.optimizeFor);

  // Assign ranks (top 10)
  const topResults = allResults.slice(0, 10).map((r, i) => ({
    ...r,
    rank: i + 1,
  }));

  const timeTakenMs = Math.round(performance.now() - startTime);

  return {
    results: topResults,
    metadata: {
      totalCombinations: allResults.length,
      timeTakenMs,
      optimizeFor: config.optimizeFor,
      baselineTce,
      baselineCost,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Check if vessel has eco speed/consumption profiles */
function hasEcoProfile(vessel: VesselProfile): boolean {
  return !!(
    vessel.ecoLadenSpeed ||
    vessel.ecoBallastSpeed ||
    vessel.ecoLadenConsumption ||
    vessel.ecoBallastConsumption
  );
}

/**
 * Build a modified VesselProfile with the given speed applied.
 * 
 * In "normal" mode: override ladenSpeed and ballastSpeed.
 * In "eco" mode: override ecoLadenSpeed and ecoBallastSpeed.
 * 
 * Consumption is scaled proportionally using the cubic law:
 * consumption ∝ speed³ (approximately, for displacement hulls)
 */
function buildVesselForSpeed(
  vessel: VesselProfile,
  targetSpeed: number,
  mode: "normal" | "eco",
): VesselProfile {
  if (mode === "eco") {
    // Eco mode: use eco consumption profiles, override eco speeds
    const ecoLadenConsumption = scaleConsumption(
      vessel.ecoLadenConsumption || vessel.ladenConsumption,
      vessel.ecoLadenSpeed || vessel.ladenSpeed,
      targetSpeed,
    );
    const ecoBallastConsumption = scaleConsumption(
      vessel.ecoBallastConsumption || vessel.ballastConsumption,
      vessel.ecoBallastSpeed || vessel.ballastSpeed,
      targetSpeed,
    );
    
    return {
      ...vessel,
      ecoLadenSpeed: targetSpeed,
      ecoBallastSpeed: targetSpeed,
      ecoLadenConsumption: ecoLadenConsumption,
      ecoBallastConsumption: ecoBallastConsumption,
    };
  }

  // Normal mode: override design speeds
  const ladenConsumption = scaleConsumption(
    vessel.ladenConsumption,
    vessel.ladenSpeed,
    targetSpeed,
  );
  const ballastConsumption = scaleConsumption(
    vessel.ballastConsumption,
    vessel.ballastSpeed,
    targetSpeed,
  );

  return {
    ...vessel,
    ladenSpeed: targetSpeed,
    ballastSpeed: targetSpeed,
    ladenConsumption,
    ballastConsumption,
  };
}

/**
 * Scale fuel consumption using the admiralty coefficient (cubic law).
 * 
 * For displacement vessels, fuel consumption is roughly proportional
 * to speed cubed: consumption_new / consumption_ref = (speed_new / speed_ref)³
 * 
 * This is a well-known maritime engineering approximation.
 */
function scaleConsumption(
  refConsumption: number,
  refSpeed: number,
  newSpeed: number,
): number {
  if (refSpeed <= 0) return refConsumption;
  const ratio = newSpeed / refSpeed;
  return Math.round(refConsumption * Math.pow(ratio, 3) * 100) / 100;
}

/** Sort results by optimization target */
function sortResults(results: OptimizerResult[], target: OptimizeTarget): void {
  switch (target) {
    case "maxTCE":
      results.sort((a, b) => b.tce - a.tce);
      break;
    case "minCost":
      results.sort((a, b) => a.totalVoyageCost - b.totalVoyageCost);
      break;
    case "minBunker":
      results.sort((a, b) => a.bunkerCost - b.bunkerCost);
      break;
    case "minDays":
      results.sort((a, b) => a.totalVoyageDays - b.totalVoyageDays);
      break;
  }
}
