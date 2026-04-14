/**
 * Voyage Profitability Calculation Engine
 * 
 * This module contains all the deterministic calculation logic for
 * voyage economics, including duration, bunker consumption, costs,
 * and profitability metrics.
 * 
 * Supports all vessel types: bulk, tanker, container, LNG/LPG, MPP, Ro-Ro.
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface VesselProfile {
  ladenSpeed: number;           // knots
  ballastSpeed: number;         // knots
  ladenConsumption: number;     // MT/day
  ballastConsumption: number;   // MT/day
  portConsumption: number;      // MT/day
  dailyOpex: number;            // USD/day
  ecoLadenSpeed?: number;
  ecoBallastSpeed?: number;
  ecoLadenConsumption?: number;
  ecoBallastConsumption?: number;

  // ─── Vessel Dimensions & Capacity ───────────────────────────────
  dwt?: number;                   // Deadweight tonnage (MT)
  vesselConstant?: number;        // Stores/crew/provisions (MT) — deducted from DWT
  loa?: number;                   // Length Overall (meters) — for canal access
  beam?: number;                  // Beam (meters) — for canal access
  summerDraft?: number;           // Summer draft (meters) — for canal/port access
  grossTonnage?: number;          // GT — for port dues, canal tolls
  netTonnage?: number;            // NT — for Suez/Panama fee basis

  // ─── Bulk Carrier ──────────────────────────────────────────────
  grainCapacity?: number;         // cbm — grain capacity
  baleCapacity?: number;          // cbm — bale capacity

  // ─── Container Ship ────────────────────────────────────────────
  teuCapacity?: number;           // TEU capacity

  // ─── LNG/LPG Carrier ──────────────────────────────────────────
  cargoTankCapacityCbm?: number;  // Cargo tank capacity (cbm)
  boilOffRate?: number;           // Daily boil-off rate (e.g. 0.10 = 0.10%/day)
  heelQuantity?: number;          // LNG heel retained on ballast (cbm)
}

export interface VoyageInputs {
  // Distances
  ballastDistanceNm: number;
  ladenDistanceNm: number;
  
  // Port operations
  loadPortDays: number;
  dischargePortDays: number;
  waitingDays: number;
  idleDays: number;
  
  // Cargo
  cargoQuantityMt: number;
  
  // Speed mode
  useEcoSpeed: boolean;
  
  // Speed overrides (per-voyage adjustments)
  overrideLadenSpeed?: number;
  overrideBallastSpeed?: number;
  
  // Canal
  canalTolls: number;
  
  // Bunker (legacy single fuel support)
  bunkerPriceUsd: number;
  
  // Multi-fuel support
  fuelPrices?: Record<string, number>;  // { "VLSFO": 555, "LSMGO": 785 }
  ballastFuelType?: string;
  ladenFuelType?: string;
  portFuelType?: string;
  
  // Costs
  brokeragePercent: number;
  commissionPercent: number;
  additionalCosts: number;
  pdaCosts: number;       // Proforma Disbursement Account
  lubOilCosts: number;    // Lubricating Oil & Cylinder Lub Oil
  
  // Weather adjustment
  weatherRiskMultiplier: number;
  
  // Optional freight rate for P&L calculation
  freightRateUsd?: number;

  // ─── Extended Freight ──────────────────────────────────────────
  freightRateUnit?: string;   // PER_MT | PER_TEU | PER_CBM | LUMP_SUM | WORLDSCALE
  stowageFactor?: number;     // cbm/MT — for volume-limited detection

  // ─── LNG-specific ─────────────────────────────────────────────
  lngCargoValue?: number;     // USD per cbm of LNG — used for boil-off cost offset
}

export interface DurationBreakdown {
  ballastSeaDays: number;
  ladenSeaDays: number;
  totalSeaDays: number;
  totalPortDays: number;
  totalVoyageDays: number;
  weatherBufferDays: number;
}

export interface BunkerBreakdown {
  ballastBunkerMt: number;
  ladenBunkerMt: number;
  portBunkerMt: number;
  weatherBufferMt: number;
  totalBunkerMt: number;
  totalBunkerCost: number;
  // LNG boil-off as fuel
  boilOffAsFuelMt?: number;
  boilOffCostOffset?: number;
}

export interface CostBreakdown {
  bunkerCost: number;
  opexCost: number;
  canalCost: number;
  brokerageCost: number;
  commissionCost: number;
  additionalCost: number;
  pdaCost: number;        // Proforma Disbursement Account
  lubOilCost: number;     // Lubricating Oil & Cylinder Lub Oil
  totalVoyageCost: number;
  // Cost breakdown percentages
  bunkerPercent: number;
  opexPercent: number;
  canalPercent: number;
  brokeragePercent: number;
  commissionPercent: number;
  additionalPercent: number;
  pdaPercent: number;
  lubOilPercent: number;
}

export interface CargoIntakeAnalysis {
  dwtCapacity: number;            // Raw DWT
  actualCargoIntake: number;      // DWT minus constants & bunkers
  volumeCapacity?: number;        // Grain/bale capacity (cbm)
  cargoVolume?: number;           // Cargo volume at given stowage factor (cbm)
  isVolumeLimited: boolean;       // True if cargo fills volume before weight
  isWeightLimited: boolean;       // True if cargo fills weight before volume
  utilizationPercent: number;     // How much of available capacity is used
  warnings: string[];             // Capacity warnings
}

export interface ProfitabilityMetrics {
  grossRevenue: number | null;
  netRevenue: number | null;
  voyagePnl: number | null;
  tce: number;
  breakEvenFreight: number;
  marginAtOfferedFreight: number | null;
  marginPercent: number | null;
}

export interface VoyageCalculationResult {
  duration: DurationBreakdown;
  bunker: BunkerBreakdown;
  costs: CostBreakdown;
  profitability: ProfitabilityMetrics;
  cargoIntake?: CargoIntakeAnalysis;
  
  // Summary for quick display
  summary: {
    totalVoyageDays: number;
    totalBunkerMt: number;
    totalBunkerCost: number;
    totalVoyageCost: number;
    tce: number;
    breakEvenFreight: number;
    voyagePnl: number | null;
  };
}

// ═══════════════════════════════════════════════════════════════════
// CARGO INTAKE ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyze cargo intake considering DWT, vessel constant, bunker weight,
 * and volume constraints (grain/bale capacity vs stowage factor).
 */
export function analyzeCargoIntake(
  vessel: VesselProfile,
  inputs: VoyageInputs,
  totalBunkerMt: number
): CargoIntakeAnalysis {
  const warnings: string[] = [];
  const dwt = vessel.dwt ?? 0;
  const vesselConstant = vessel.vesselConstant ?? 0;
  
  // Actual cargo intake = DWT - vessel constant - bunkers onboard
  const actualCargoIntake = Math.max(0, dwt - vesselConstant - totalBunkerMt);
  
  // Check if requested cargo exceeds weight capacity
  const isWeightLimited = inputs.cargoQuantityMt > actualCargoIntake && dwt > 0;
  
  if (isWeightLimited) {
    warnings.push(
      `Cargo ${inputs.cargoQuantityMt.toLocaleString()} MT exceeds available intake of ${Math.round(actualCargoIntake).toLocaleString()} MT (DWT ${dwt.toLocaleString()} − constant ${vesselConstant} − bunkers ${Math.round(totalBunkerMt)})`
    );
  }
  
  // Volume analysis (if stowage factor and capacity are available)
  let volumeCapacity: number | undefined;
  let cargoVolume: number | undefined;
  let isVolumeLimited = false;
  
  if (inputs.stowageFactor && inputs.stowageFactor > 0) {
    cargoVolume = inputs.cargoQuantityMt * inputs.stowageFactor;
    
    // Use grain capacity for bulk, or bale for general cargo
    volumeCapacity = vessel.grainCapacity || vessel.baleCapacity;
    
    if (volumeCapacity && cargoVolume > volumeCapacity) {
      isVolumeLimited = true;
      const maxWeight = Math.floor(volumeCapacity / inputs.stowageFactor);
      warnings.push(
        `Volume-limited: ${Math.round(cargoVolume).toLocaleString()} cbm exceeds ${volumeCapacity.toLocaleString()} cbm capacity. Max cargo at SF ${inputs.stowageFactor}: ${maxWeight.toLocaleString()} MT`
      );
    }
  }
  
  // Calculate utilization
  const utilizationPercent = dwt > 0
    ? Math.min(100, (inputs.cargoQuantityMt / actualCargoIntake) * 100)
    : 0;
  
  return {
    dwtCapacity: dwt,
    actualCargoIntake: round(actualCargoIntake, 0),
    volumeCapacity,
    cargoVolume: cargoVolume ? round(cargoVolume, 0) : undefined,
    isVolumeLimited,
    isWeightLimited,
    utilizationPercent: round(utilizationPercent, 1),
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate voyage duration breakdown.
 * Supports per-voyage speed overrides.
 */
export function calculateDuration(
  vessel: VesselProfile,
  inputs: VoyageInputs
): DurationBreakdown {
  // Speed resolution priority: voyage override → eco speed → vessel profile
  let ballastSpeed: number;
  let ladenSpeed: number;

  if (inputs.overrideBallastSpeed) {
    ballastSpeed = inputs.overrideBallastSpeed;
  } else if (inputs.useEcoSpeed && vessel.ecoBallastSpeed) {
    ballastSpeed = vessel.ecoBallastSpeed;
  } else {
    ballastSpeed = vessel.ballastSpeed;
  }

  if (inputs.overrideLadenSpeed) {
    ladenSpeed = inputs.overrideLadenSpeed;
  } else if (inputs.useEcoSpeed && vessel.ecoLadenSpeed) {
    ladenSpeed = vessel.ecoLadenSpeed;
  } else {
    ladenSpeed = vessel.ladenSpeed;
  }
  
  // Sea days = Distance / (Speed × 24 hours)
  const ballastSeaDays = inputs.ballastDistanceNm / (ballastSpeed * 24);
  const ladenSeaDays = inputs.ladenDistanceNm / (ladenSpeed * 24);
  
  // Base sea days before weather adjustment
  const baseSeaDays = ballastSeaDays + ladenSeaDays;
  
  // Weather buffer (additional days due to weather risk)
  const weatherBufferDays = baseSeaDays * (inputs.weatherRiskMultiplier - 1);
  
  // Total sea days including weather buffer
  const totalSeaDays = baseSeaDays + weatherBufferDays;
  
  // Port days
  const totalPortDays = 
    inputs.loadPortDays + 
    inputs.dischargePortDays + 
    inputs.waitingDays + 
    inputs.idleDays;
  
  // Total voyage duration
  const totalVoyageDays = totalSeaDays + totalPortDays;
  
  return {
    ballastSeaDays: round(ballastSeaDays, 2),
    ladenSeaDays: round(ladenSeaDays, 2),
    totalSeaDays: round(totalSeaDays, 2),
    totalPortDays: round(totalPortDays, 2),
    totalVoyageDays: round(totalVoyageDays, 2),
    weatherBufferDays: round(weatherBufferDays, 2),
  };
}

/**
 * Calculate bunker consumption and cost.
 * Supports multi-fuel pricing and LNG boil-off-as-fuel dynamics.
 */
export function calculateBunker(
  vessel: VesselProfile,
  inputs: VoyageInputs,
  duration: DurationBreakdown
): BunkerBreakdown {
  // Select consumption based on ECO mode
  const ballastConsumption = inputs.useEcoSpeed && vessel.ecoBallastConsumption 
    ? vessel.ecoBallastConsumption 
    : vessel.ballastConsumption;
  const ladenConsumption = inputs.useEcoSpeed && vessel.ecoLadenConsumption 
    ? vessel.ecoLadenConsumption 
    : vessel.ladenConsumption;
  
  // Bunker consumption = Days × Daily Consumption
  const ballastBunkerMt = duration.ballastSeaDays * ballastConsumption;
  const ladenBunkerMt = duration.ladenSeaDays * ladenConsumption;
  const portBunkerMt = duration.totalPortDays * vessel.portConsumption;
  
  // Weather buffer bunker (proportional to extra days)
  const avgSeaConsumption = (ballastConsumption + ladenConsumption) / 2;
  const weatherBufferMt = duration.weatherBufferDays * avgSeaConsumption;
  
  // ─── LNG Boil-Off as Fuel ─────────────────────────────────────
  // For LNG carriers, cargo boil-off gas (BOG) is burned as fuel,
  // reducing the need for conventional bunkers.
  let boilOffAsFuelMt: number | undefined;
  let boilOffCostOffset: number | undefined;
  
  if (vessel.boilOffRate && vessel.cargoTankCapacityCbm && vessel.boilOffRate > 0) {
    // Boil-off during laden leg (cargo onboard)
    // BOR is % per day, cargoTankCapacity is in cbm
    // LNG density ≈ 0.45 MT/cbm
    const LNG_DENSITY = 0.45;
    const cargoCbm = vessel.cargoTankCapacityCbm;
    
    // Daily boil-off volume (cbm/day) = capacity × BOR%
    const dailyBoilOffCbm = cargoCbm * (vessel.boilOffRate / 100);
    const dailyBoilOffMt = dailyBoilOffCbm * LNG_DENSITY;
    
    // Boil-off only occurs during laden sea days (cargo onboard)
    boilOffAsFuelMt = round(dailyBoilOffMt * duration.ladenSeaDays, 2);
    
    // Value of boil-off as fuel offset (saves conventional fuel cost)
    // Use LNG fuel price if available, otherwise estimate
    const lngPrice = inputs.fuelPrices?.["LNG"] || inputs.bunkerPriceUsd * 0.8;
    boilOffCostOffset = round(boilOffAsFuelMt * lngPrice, 2);
  }
  
  // Total bunker (conventional fuel)
  const totalBunkerMt = ballastBunkerMt + ladenBunkerMt + portBunkerMt + weatherBufferMt;
  
  // Calculate cost using multi-fuel pricing if available
  let totalBunkerCost: number;
  
  if (inputs.fuelPrices && Object.keys(inputs.fuelPrices).length > 0) {
    // Multi-fuel mode: calculate cost per fuel type
    const ballastFuel = inputs.ballastFuelType || "VLSFO";
    const ladenFuel = inputs.ladenFuelType || "VLSFO";
    const portFuel = inputs.portFuelType || "LSMGO";
    
    // Get price for each fuel type, fallback to legacy bunkerPriceUsd
    const ballastPrice = inputs.fuelPrices[ballastFuel] || inputs.bunkerPriceUsd;
    const ladenPrice = inputs.fuelPrices[ladenFuel] || inputs.bunkerPriceUsd;
    const portPrice = inputs.fuelPrices[portFuel] || inputs.bunkerPriceUsd;
    
    // Weighted average for weather buffer (use sea fuel prices)
    const avgSeaPrice = (ballastPrice + ladenPrice) / 2;
    
    // Calculate per-segment costs
    const ballastCost = ballastBunkerMt * ballastPrice;
    const ladenCost = ladenBunkerMt * ladenPrice;
    const portCost = portBunkerMt * portPrice;
    const weatherCost = weatherBufferMt * avgSeaPrice;
    
    totalBunkerCost = ballastCost + ladenCost + portCost + weatherCost;
  } else {
    // Legacy single-fuel mode
    totalBunkerCost = totalBunkerMt * inputs.bunkerPriceUsd;
  }
  
  // Subtract boil-off fuel offset (LNG carriers save on conventional fuel)
  if (boilOffCostOffset) {
    totalBunkerCost = Math.max(0, totalBunkerCost - boilOffCostOffset);
  }
  
  return {
    ballastBunkerMt: round(ballastBunkerMt, 2),
    ladenBunkerMt: round(ladenBunkerMt, 2),
    portBunkerMt: round(portBunkerMt, 2),
    weatherBufferMt: round(weatherBufferMt, 2),
    totalBunkerMt: round(totalBunkerMt, 2),
    totalBunkerCost: round(totalBunkerCost, 2),
    boilOffAsFuelMt,
    boilOffCostOffset,
  };
}

/**
 * Calculate gross revenue based on freight rate unit.
 * Supports $/MT, $/TEU, $/CBM, Lump Sum, and Worldscale.
 */
export function calculateGrossRevenue(
  inputs: VoyageInputs,
  vessel: VesselProfile
): number {
  const freightRate = inputs.freightRateUsd;
  if (!freightRate) return 0;

  const unit = inputs.freightRateUnit || "PER_MT";

  switch (unit) {
    case "PER_MT":
      // Revenue = cargo MT × $/MT
      return inputs.cargoQuantityMt * freightRate;

    case "PER_TEU":
      // Revenue = TEU capacity × $/TEU (or use cargoQuantityMt as TEU count if teuCapacity not set)
      // In container shipping, cargoQuantityMt is overloaded to mean "TEU count" when unit is PER_TEU
      return inputs.cargoQuantityMt * freightRate;

    case "PER_CBM":
      // Revenue = cargo cbm × $/CBM
      // For LNG: cargoQuantityMt is overloaded to cbm when unit is PER_CBM
      if (inputs.stowageFactor) {
        return inputs.cargoQuantityMt * inputs.stowageFactor * freightRate;
      }
      return inputs.cargoQuantityMt * freightRate;

    case "LUMP_SUM":
      // Revenue = flat rate (freightRate is the total freight amount)
      return freightRate;

    case "WORLDSCALE":
      // Worldscale: Revenue = cargo MT × Worldscale flat rate × (WS points / 100)
      // freightRate here is the WS points (e.g., WS 55 = 55)
      // We use a simplified model — the flat rate is embedded in the offered rate
      // In practice, WS flat rate × WS points / 100 = $/MT effective rate
      // Users typically enter the effective $/MT already when using Worldscale
      return inputs.cargoQuantityMt * freightRate;

    default:
      return inputs.cargoQuantityMt * freightRate;
  }
}

/**
 * Calculate voyage costs
 */
export function calculateCosts(
  vessel: VesselProfile,
  inputs: VoyageInputs,
  duration: DurationBreakdown,
  bunker: BunkerBreakdown
): CostBreakdown {
  // OPEX cost
  const opexCost = duration.totalVoyageDays * vessel.dailyOpex;
  
  // Canal cost
  const canalCost = inputs.canalTolls;
  
  // Calculate gross revenue for commission calculation (using extended freight units)
  const grossRevenue = calculateGrossRevenue(inputs, vessel);
  
  // Brokerage and commission are based on gross revenue
  const brokerageCost = grossRevenue * (inputs.brokeragePercent / 100);
  const commissionCost = grossRevenue * (inputs.commissionPercent / 100);
  
  // Additional costs
  const additionalCost = inputs.additionalCosts;
  const pdaCost = inputs.pdaCosts;
  const lubOilCost = inputs.lubOilCosts;
  
  // Total voyage cost
  const totalVoyageCost = bunker.totalBunkerCost + opexCost + canalCost + additionalCost + pdaCost + lubOilCost + brokerageCost + commissionCost;
  
  return {
    bunkerCost: round(bunker.totalBunkerCost, 2),
    opexCost: round(opexCost, 2),
    canalCost: round(canalCost, 2),
    brokerageCost: round(brokerageCost, 2),
    commissionCost: round(commissionCost, 2),
    additionalCost: round(additionalCost, 2),
    pdaCost: round(pdaCost, 2),
    lubOilCost: round(lubOilCost, 2),
    totalVoyageCost: round(totalVoyageCost, 2),
    bunkerPercent: totalVoyageCost > 0 ? round((bunker.totalBunkerCost / totalVoyageCost) * 100, 1) : 0,
    opexPercent: totalVoyageCost > 0 ? round((opexCost / totalVoyageCost) * 100, 1) : 0,
    canalPercent: totalVoyageCost > 0 ? round((canalCost / totalVoyageCost) * 100, 1) : 0,
    brokeragePercent: totalVoyageCost > 0 ? round((brokerageCost / totalVoyageCost) * 100, 1) : 0,
    commissionPercent: totalVoyageCost > 0 ? round((commissionCost / totalVoyageCost) * 100, 1) : 0,
    additionalPercent: totalVoyageCost > 0 ? round((additionalCost / totalVoyageCost) * 100, 1) : 0,
    pdaPercent: totalVoyageCost > 0 ? round((pdaCost / totalVoyageCost) * 100, 1) : 0,
    lubOilPercent: totalVoyageCost > 0 ? round((lubOilCost / totalVoyageCost) * 100, 1) : 0,
  };
}

/**
 * Calculate profitability metrics including TCE and break-even freight.
 * Supports all freight rate units.
 */
export function calculateProfitability(
  vessel: VesselProfile,
  inputs: VoyageInputs,
  duration: DurationBreakdown,
  bunker: BunkerBreakdown,
  costs: CostBreakdown
): ProfitabilityMetrics {
  const { cargoQuantityMt, freightRateUsd } = inputs;
  
  // Break-even freight calculation depends on the unit
  // For all modes: break-even = Total Cost / denominator
  const unit = inputs.freightRateUnit || "PER_MT";
  let breakEvenDenominator: number;

  switch (unit) {
    case "PER_TEU":
      // TEU count is stored in cargoQuantityMt when using $/TEU
      breakEvenDenominator = cargoQuantityMt;
      break;
    case "PER_CBM":
      // CBM = MT × stowage factor
      breakEvenDenominator = inputs.stowageFactor 
        ? cargoQuantityMt * inputs.stowageFactor
        : cargoQuantityMt;
      break;
    case "LUMP_SUM":
      // For lump sum, break-even is just the total cost (denominator = 1)
      breakEvenDenominator = 1;
      break;
    case "WORLDSCALE":
    case "PER_MT":
    default:
      breakEvenDenominator = cargoQuantityMt;
      break;
  }

  const breakEvenFreight = breakEvenDenominator > 0 
    ? costs.totalVoyageCost / breakEvenDenominator 
    : 0;
  
  // Revenue calculation using the extended freight rate engine
  const grossRevenue = freightRateUsd ? calculateGrossRevenue(inputs, vessel) : null;
  
  let netRevenue: number | null = null;
  let voyagePnl: number | null = null;
  let marginAtOfferedFreight: number | null = null;
  let marginPercent: number | null = null;
  
  if (grossRevenue !== null && freightRateUsd) {
    // Net Revenue = Gross - Brokerage - Commission
    netRevenue = grossRevenue - costs.brokerageCost - costs.commissionCost;
    
    // Voyage P&L = Gross Revenue - Total Voyage Cost
    voyagePnl = grossRevenue - costs.totalVoyageCost;
    
    // Margin per unit
    marginAtOfferedFreight = freightRateUsd - breakEvenFreight;
    
    // Margin percentage
    marginPercent = breakEvenFreight > 0 ? (marginAtOfferedFreight / breakEvenFreight) * 100 : 0;
  }

  // Industry-Standard TCE = (Gross Revenue - Voyage Costs) / Total Voyage Days
  // Voyage Costs = Bunker + Canal + PDA + LubOil + Brokerage + Commission + Additional
  // OPEX is EXCLUDED to allow comparison with time charter market rates
  const voyageCostsForTce = bunker.totalBunkerCost + costs.canalCost + costs.pdaCost + 
    costs.lubOilCost + costs.brokerageCost + costs.commissionCost + costs.additionalCost;
  const tceNumerator = (grossRevenue ?? 0) - voyageCostsForTce;
  const tce = duration.totalVoyageDays > 0 ? tceNumerator / duration.totalVoyageDays : 0;
  
  return {
    grossRevenue: grossRevenue !== null ? round(grossRevenue, 2) : null,
    netRevenue: netRevenue !== null ? round(netRevenue, 2) : null,
    voyagePnl: voyagePnl !== null ? round(voyagePnl, 2) : null,
    tce: round(tce, 2),
    breakEvenFreight: round(breakEvenFreight, 2),
    marginAtOfferedFreight: marginAtOfferedFreight !== null ? round(marginAtOfferedFreight, 2) : null,
    marginPercent: marginPercent !== null ? round(marginPercent, 2) : null,
  };
}

/**
 * Main function to calculate complete voyage profitability.
 * Now includes cargo intake analysis and LNG boil-off dynamics.
 */
export function calculateVoyage(
  vessel: VesselProfile,
  inputs: VoyageInputs
): VoyageCalculationResult {
  // Step 1: Calculate duration (with speed overrides)
  const duration = calculateDuration(vessel, inputs);
  
  // Step 2: Calculate bunker consumption (with LNG boil-off)
  const bunker = calculateBunker(vessel, inputs, duration);
  
  // Step 3: Calculate costs (with extended freight units)
  const costs = calculateCosts(vessel, inputs, duration, bunker);
  
  // Step 4: Calculate profitability (with extended freight units)
  const profitability = calculateProfitability(vessel, inputs, duration, bunker, costs);
  
  // Step 5: Analyze cargo intake (vessel constant, volume constraints)
  let cargoIntake: CargoIntakeAnalysis | undefined;
  if (vessel.dwt && vessel.dwt > 0) {
    cargoIntake = analyzeCargoIntake(vessel, inputs, bunker.totalBunkerMt);
  }
  
  return {
    duration,
    bunker,
    costs,
    profitability,
    cargoIntake,
    summary: {
      totalVoyageDays: duration.totalVoyageDays,
      totalBunkerMt: bunker.totalBunkerMt,
      totalBunkerCost: bunker.totalBunkerCost,
      totalVoyageCost: costs.totalVoyageCost,
      tce: profitability.tce,
      breakEvenFreight: profitability.breakEvenFreight,
      voyagePnl: profitability.voyagePnl,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate P&L at different freight rates (for sensitivity slider)
 */
export function calculatePnlAtFreight(
  vessel: VesselProfile,
  inputs: VoyageInputs,
  freightRate: number
): { voyagePnl: number; tce: number; margin: number } {
  const modifiedInputs = { ...inputs, freightRateUsd: freightRate };
  const result = calculateVoyage(vessel, modifiedInputs);
  
  return {
    voyagePnl: result.profitability.voyagePnl ?? 0,
    tce: result.profitability.tce,
    margin: result.profitability.marginAtOfferedFreight ?? 0,
  };
}
