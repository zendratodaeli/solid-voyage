"use client";

/**
 * Compliance Insights Component
 * 
 * Displays smart voyage insights including:
 * - Fuel Switch Warning (ECA)
 * - EU ETS Sustainability Badge
 * - HRA Security Alert
 * - Financial Estimate
 */

import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Leaf,
  Shield,
  DollarSign,
  Fuel,
  Info,
  ChevronDown,
  ChevronUp,
  Gauge,
  TrendingDown,
  Waves,
  TreePine,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  checkEUETS,
  calculateBunkerCost,
  calculateVoyageCO2,
  CARBON_FACTORS,
  type MainFuelType,
  type FuelPrices,
  type AllFuelType,
} from "@/lib/calculations/compliance-engine";

// SECA-compliant fuels in priority order (cleanest first)
// Includes common spelling variations
const SECA_COMPLIANT_FUELS = [
  ["HYDROGEN", "H2"],
  ["AMMONIA", "AMONIA", "NH3"],  // Handle both spellings
  ["METHANOL", "MEOH"],
  ["LNG"],
  ["LSMGO"],
  ["MGO"],
  ["ULSFO"],
];

// Heavy fuels that require scrubber for ECA compliance
const HEAVY_FUELS = ["HFO", "HSFO", "IFO380", "IFO180", "VLSFO"];

// Open Sea fuel priority: heaviest/cheapest first (for auto-selection)
const OPEN_SEA_FUEL_PRIORITY = [
  "HFO", "HSFO", "IFO380", "IFO180", "VLSFO",  // Heavy fuels (cheapest)
  "LSMGO", "MGO", "ULSFO",                        // Distillates
  "LNG", "METHANOL", "AMMONIA", "HYDROGEN",        // Alternative fuels
];

/**
 * Energy density factors relative to VLSFO (baseline = 1.0)
 * Lower energy density = more mass required for same power output
 * 
 * VLSFO: ~42 MJ/kg (baseline)
 * Ammonia: ~18.6 MJ/kg (~45% of VLSFO) → factor 2.1
 * Methanol: ~20 MJ/kg → factor 1.6
 * LNG: ~50 MJ/kg → factor 0.85 (more efficient)
 * Hydrogen: ~120 MJ/kg by mass but very low density → factor 3.0 (volume-limited)
 */
const FUEL_ENERGY_FACTORS: Record<string, number> = {
  VLSFO: 1.0,
  LSMGO: 1.0,
  MGO: 1.0,
  ULSFO: 1.0,
  IFO380: 1.0,
  IFO180: 1.0,
  HFO: 1.0,
  HSFO: 1.0,
  LNG: 0.85,
  METHANOL: 1.6,
  AMMONIA: 2.1,
  AMONIA: 2.1,  // Handle misspelling
  NH3: 2.1,
  HYDROGEN: 3.0,
  H2: 3.0,
};

/**
 * Check if a vessel fuel matches any of the target fuel variants
 */
function fuelMatches(vesselFuel: string, targetVariants: string[]): boolean {
  const normalized = vesselFuel.toUpperCase().trim();
  return targetVariants.some(variant => 
    normalized === variant || 
    normalized.startsWith(variant) || 
    variant.startsWith(normalized)
  );
}

/**
 * Auto-select the best SECA-compliant fuel from vessel's available fuels
 * @param vesselFuels - Array of fuel types the vessel can burn
 * @param hasScrubber - Whether vessel has EGCS (scrubber) fitted
 * @returns Selected fuel and reason for selection
 */
function getSecaFuel(
  vesselFuels: string[],
  hasScrubber: boolean
): { fuel: string; reason: string } {
  // Normalize fuel names to uppercase for comparison
  const normalizedFuels = vesselFuels.map((f) => f.toUpperCase().trim());

  // Check 1: Scrubber "Trump Card" - can use heavy fuel legally in ECA
  if (hasScrubber) {
    const heavyFuel = HEAVY_FUELS.find((hf) => normalizedFuels.includes(hf));
    if (heavyFuel) {
      return {
        fuel: heavyFuel,
        reason: "Scrubber fitted - heavy fuel permitted in ECA",
      };
    }
  }

  // Check 2: Find cleanest compliant fuel from vessel's inventory (priority order)
  for (const fuelVariants of SECA_COMPLIANT_FUELS) {
    // Check if any vessel fuel matches any variant of this priority fuel
    const matchedFuel = vesselFuels.find(vf => fuelMatches(vf, fuelVariants));
    if (matchedFuel) {
      return {
        fuel: matchedFuel.toUpperCase(),
        reason: "Selected from vessel inventory (cleanest available)",
      };
    }
  }

  // Check 3: Fallback to MGO (universal ECA standard)
  return {
    fuel: "MGO",
    reason: "Default ECA-compliant fuel",
  };
}

/**
 * Auto-select the best Open Sea fuel from vessel's available fuels
 * Prioritizes heaviest/cheapest fuel (HFO > VLSFO > distillates > alternatives)
 * @param vesselFuels - Array of fuel types the vessel can burn
 * @returns Selected fuel name (uppercase)
 */
function getOpenSeaFuel(vesselFuels: string[]): string {
  const normalizedFuels = vesselFuels.map(f => f.toUpperCase().trim());
  
  // Pick the heaviest/cheapest fuel the vessel has
  for (const priorityFuel of OPEN_SEA_FUEL_PRIORITY) {
    if (normalizedFuels.includes(priorityFuel)) {
      return priorityFuel;
    }
  }
  
  return normalizedFuels[0] || "VLSFO";
}

/**
 * Get fuel price from system pricing for any fuel type
 */
function getFuelPrice(fuel: string, pricing: {
  globalVLSFOAverage: number;
  globalLSMGOAverage: number;
  globalIFO380Average: number;
  globalIFO180Average: number;
  globalLNGAverage: number;
}): number {
  const priceMap: Record<string, number> = {
    VLSFO: pricing.globalVLSFOAverage,
    LSMGO: pricing.globalLSMGOAverage,
    MGO: pricing.globalLSMGOAverage,
    ULSFO: pricing.globalVLSFOAverage,
    IFO380: pricing.globalIFO380Average,
    IFO180: pricing.globalIFO180Average,
    LNG: pricing.globalLNGAverage,
    AMMONIA: 800,
    AMONIA: 800,
    NH3: 800,
    METHANOL: 450,
    HFO: pricing.globalIFO380Average,
    HSFO: pricing.globalIFO380Average,
    HYDROGEN: 3000,
    H2: 3000,
  };
  return priceMap[fuel.toUpperCase()] ?? pricing.globalVLSFOAverage;
}

// Vessel data from route planner
interface VesselData {
  id: string;
  name: string;
  dwt: number;
  vesselType: string;
  ladenSpeed: number;
  ballastSpeed: number;
  ladenConsumption: number;
  ballastConsumption: number;
  fuelConsumption?: Record<string, { laden: number; ballast: number }>;
  hasScrubber?: boolean;
  fuelTypes?: string[];
}

interface ComplianceInsightsProps {
  totalDistanceNm: number;
  ecaDistanceNm: number;
  hraDistanceNm: number;
  ecaZones: string[];
  hraZones: string[];
  originCountryCode?: string;
  destinationCountryCode?: string;
  speedKnots: number;
  selectedVessel?: VesselData | null;
  manualDWT?: number;
  voyageMode?: "laden" | "ballast";
  canalTransitCost?: number;  // Manual canal transit cost in USD
  legConsumptions?: Array<{
    condition: "laden" | "ballast";
    dailyConsumption: number;
    distanceNm: number;
    speedKnots: number;
  }>;
}

interface SystemPricing {
  globalLSMGOAverage: number;
  globalVLSFOAverage: number;
  globalIFO380Average: number;
  globalIFO180Average: number;
  globalLNGAverage: number;
  globalEUAPrice: number;
  // Carbon factors
  carbonFactorVLSFO?: number;
  carbonFactorLSMGO?: number;
  carbonFactorIFO380?: number;
  carbonFactorIFO180?: number;
  carbonFactorLNG?: number;
  carbonFactorMETHANOL?: number;
  carbonFactorAMMONIA?: number;
}

export function ComplianceInsights({
  totalDistanceNm,
  ecaDistanceNm,
  hraDistanceNm,
  ecaZones,
  hraZones,
  originCountryCode,
  destinationCountryCode,
  speedKnots,
  selectedVessel,
  manualDWT = 0,
  voyageMode = "laden",
  canalTransitCost = 0,
  legConsumptions = [],
}: ComplianceInsightsProps) {
  const [mainFuelType, setMainFuelType] = useState<string>("");  // Open Sea fuel
  const [secaFuelType, setSecaFuelType] = useState<string>(""); // SECA fuel
  const [pricing, setPricing] = useState<SystemPricing | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [sensitivityTab, setSensitivityTab] = useState<"total" | "seca" | "opensea">("total");
  
  // Get available fuels from vessel's fuelConsumption profile
  const availableFuels = useMemo(() => {
    if (selectedVessel?.fuelConsumption) {
      return Object.keys(selectedVessel.fuelConsumption);
    }
    // Fallback to default fuels if no vessel selected
    return ["VLSFO", "LSMGO", "IFO380", "IFO180", "LNG"];
  }, [selectedVessel?.fuelConsumption]);

  // Auto-select optimal Open Sea fuel when vessel changes
  useEffect(() => {
    if (availableFuels.length > 0) {
      const optimalFuel = getOpenSeaFuel(availableFuels);
      if (optimalFuel !== mainFuelType) {
        setMainFuelType(optimalFuel);
      }
    }
  }, [availableFuels]);

  // Auto-select optimal SECA fuel when vessel changes
  useEffect(() => {
    if (availableFuels.length > 0) {
      const vesselFuels = availableFuels;
      const secaResult = getSecaFuel(vesselFuels, selectedVessel?.hasScrubber ?? false);
      if (secaResult.fuel !== secaFuelType) {
        setSecaFuelType(secaResult.fuel);
      }
    }
  }, [availableFuels, selectedVessel?.hasScrubber]);

  // Use vessel's DWT if available, otherwise use manual input from parent
  const effectiveDWT = selectedVessel?.dwt ?? manualDWT;
  
  // Compute weighted average consumption from per-leg data
  // Total Fuel = Σ (Leg_Distance / Leg_Speed / 24 * Leg_Consumption)
  const effectiveConsumption = useMemo(() => {
    if (legConsumptions.length === 0) return 25;
    let totalFuelMt = 0;
    let totalSailingDays = 0;
    for (const leg of legConsumptions) {
      const sailingDays = leg.speedKnots > 0 ? leg.distanceNm / (leg.speedKnots * 24) : 0;
      totalFuelMt += sailingDays * leg.dailyConsumption;
      totalSailingDays += sailingDays;
    }
    // Weighted average consumption (MT/day)
    return totalSailingDays > 0 ? totalFuelMt / totalSailingDays : 25;
  }, [legConsumptions]);

  // Check if vessel has per-fuel consumption profiles
  const hasPerFuelProfile = !!selectedVessel?.fuelConsumption;

  /**
   * Calculates Attained CII (AER) in gCO2/dwt-nm
   * Formula: (CO2_MT * 1,000,000) / (DWT * Distance_NM)
   * NOTE: Pass the already-calculated CO₂ to avoid fuel-factor mismatch
   */
  const calculateCII = (co2MT: number, distanceNM: number, dwt: number) => {
    if (!dwt || !distanceNM || !co2MT) return 0;
    const co2Grams = co2MT * 1_000_000; // Convert MT to grams
    return co2Grams / (dwt * distanceNM);
  };

  // Fetch system pricing
  useEffect(() => {
    fetch("/api/market-data")
      .then((res) => res.json())
      .then(setPricing)
      .catch(console.error);
  }, []);

  // Calculate EU ETS status
  const euEts = originCountryCode && destinationCountryCode
    ? checkEUETS(originCountryCode, destinationCountryCode)
    : null;

  // Use user-selected SECA fuel (from the SECA dropdown)
  const effectiveSecaFuel = secaFuelType || "MGO";
  
  // Build a "result" object for the SECA fuel (used by price lookups and CO2 calcs)
  const secaFuelResult = useMemo(() => {
    const isCompliant = !HEAVY_FUELS.includes(effectiveSecaFuel.toUpperCase()) || (selectedVessel?.hasScrubber ?? false);
    return {
      fuel: effectiveSecaFuel,
      reason: isCompliant ? "User-selected SECA fuel" : "Non-compliant: requires scrubber",
    };
  }, [effectiveSecaFuel, selectedVessel?.hasScrubber]);

  // SECA fuel consumption from vessel profile (may differ from main fuel)
  const secaFuelConsumptionProfile = selectedVessel?.fuelConsumption?.[
    effectiveSecaFuel.toUpperCase()
  ] ?? selectedVessel?.fuelConsumption?.[
    effectiveSecaFuel
  ];
  const secaDailyConsumption = secaFuelConsumptionProfile
    ? (voyageMode === "laden" ? secaFuelConsumptionProfile.laden : secaFuelConsumptionProfile.ballast)
    : effectiveConsumption; // Fallback: same as main fuel

  // --- Validation Logic ---
  // Scenario A: High-sulphur fuel in SECA without scrubber
  const isSecaViolation = HEAVY_FUELS.includes(effectiveSecaFuel.toUpperCase()) && !(selectedVessel?.hasScrubber);
  // Scenario B: Premium fuel in Open Sea when cheaper option available
  const isOpenSeaCostAlert = useMemo(() => {
    if (!pricing) return { show: false, savings: 0, cheaperFuel: "" };
    const premiumFuels = ["LSMGO", "MGO", "ULSFO"];
    if (!premiumFuels.includes(mainFuelType.toUpperCase())) return { show: false, savings: 0, cheaperFuel: "" };
    // Check if vessel has a cheaper alternative
    const cheaperOption = availableFuels.find(f => 
      ["VLSFO", "IFO380", "IFO180", "HFO", "HSFO"].includes(f.toUpperCase())
    );
    if (!cheaperOption) return { show: false, savings: 0, cheaperFuel: "" };
    // Estimate savings
    const currentPrice = getFuelPrice(mainFuelType, pricing);
    const cheaperPrice = getFuelPrice(cheaperOption, pricing);
    const seaDays = speedKnots > 0 ? (totalDistanceNm - ecaDistanceNm) / (speedKnots * 24) : 0;
    const savings = Math.round((currentPrice - cheaperPrice) * effectiveConsumption * seaDays);
    return { show: savings > 0, savings, cheaperFuel: cheaperOption };
  }, [mainFuelType, pricing, availableFuels, speedKnots, totalDistanceNm, ecaDistanceNm, effectiveConsumption]);

  // Calculate fuel costs
  const seaDistanceNm = totalDistanceNm - ecaDistanceNm;
  const dailyConsumptionNum = effectiveConsumption; // Weighted avg from per-leg data
  
  // Fuel price lookup helper
  const getEcaFuelPrice = (): number | undefined => {
    if (!pricing) return undefined;
    return getFuelPrice(effectiveSecaFuel, pricing);
  };
  
  const bunkerCost = pricing
    ? calculateBunkerCost({
        seaDistanceNm,
        ecaDistanceNm,
        speedKnots,
        dailyConsumptionMt: dailyConsumptionNum,
        mainFuelType: mainFuelType as MainFuelType,
        prices: {
          vlsfo: pricing.globalVLSFOAverage,
          lsmgo: pricing.globalLSMGOAverage,
          ifo380: pricing.globalIFO380Average,
          ifo180: pricing.globalIFO180Average,
          lng: pricing.globalLNGAverage,
        },
        ecaFuelType: secaFuelResult.fuel.toUpperCase(),
        ecaFuelPrice: getEcaFuelPrice(),
        ecaDailyConsumptionMt: secaDailyConsumption,
      })
    : null;

  // Build custom carbon factors from database
  const customCarbonFactors = pricing ? {
    VLSFO: pricing.carbonFactorVLSFO,
    LSMGO: pricing.carbonFactorLSMGO,
    IFO380: pricing.carbonFactorIFO380,
    IFO180: pricing.carbonFactorIFO180,
    LNG: pricing.carbonFactorLNG,
    METHANOL: pricing.carbonFactorMETHANOL,
    AMMONIA: pricing.carbonFactorAMMONIA,
  } : undefined;

  // Calculate CO2 emissions with custom carbon factors from database
  // Pass SECA fuel to ensure correct carbon factor is used (e.g., AMMONIA = 0.05)
  const secaFuelForCO2 = secaFuelResult.fuel.toUpperCase() as AllFuelType;
  const co2Emissions = bunkerCost
    ? calculateVoyageCO2(bunkerCost, mainFuelType as MainFuelType, customCarbonFactors, secaFuelForCO2)
    : null;

  // Calculate carbon tax (EU ETS)
  const carbonPriceUSD = pricing?.globalEUAPrice ?? 75;
  const taxablePercentage = euEts?.percentage ?? 0;
  const carbonTaxCost = co2Emissions && taxablePercentage > 0
    ? co2Emissions.totalCO2Mt * (taxablePercentage / 100) * carbonPriceUSD
    : 0;

  // Total cost (fuel + carbon tax + canal transit)
  const totalCost = (bunkerCost?.total ?? 0) + carbonTaxCost + canalTransitCost;

  // Pre-computed formula values for ⓘ tooltips
  const formulaSeaDays = speedKnots > 0 ? seaDistanceNm / (speedKnots * 24) : 0;
  const formulaEcaDays = speedKnots > 0 ? ecaDistanceNm / (speedKnots * 24) : 0;
  const formulaEcaFuelPrice = getEcaFuelPrice() ?? 0;
  const formulaSeaFuelPrice = (() => {
    if (!pricing) return 0;
    const priceMap: Record<string, number> = {
      VLSFO: pricing.globalVLSFOAverage, LSMGO: pricing.globalLSMGOAverage,
      IFO380: pricing.globalIFO380Average, IFO180: pricing.globalIFO180Average,
      LNG: pricing.globalLNGAverage,
    };
    return priceMap[mainFuelType.toUpperCase()] ?? pricing.globalVLSFOAverage;
  })();
  // When vessel has per-fuel profiles, energy factors are already baked into consumption
  const formulaSecaEnergyFactor = hasPerFuelProfile ? 1.0 : (FUEL_ENERGY_FACTORS[secaFuelResult.fuel.toUpperCase()] ?? 1.0);
  const formulaOpenSeaEnergyFactor = hasPerFuelProfile ? 1.0 : (FUEL_ENERGY_FACTORS[mainFuelType.toUpperCase()] ?? 1.0);
  const formulaSecaCarbonFactor = CARBON_FACTORS[secaFuelResult.fuel.toUpperCase() as AllFuelType] ?? 3.114;
  const formulaOpenSeaCarbonFactor = CARBON_FACTORS[mainFuelType.toUpperCase() as AllFuelType] ?? 3.114;

  // Note: Each zone now selects fuel independently:
  // - Open Sea: getOpenSeaFuel() picks heaviest/cheapest
  // - SECA: getSecaFuel() picks cleanest compliant (or heavy if scrubber)

  // Determine if fuel switch is needed
  // - Not needed if already using ECA-compliant fuel (LNG, LSMGO, MGO)
  // - Not needed if vessel has scrubber (can continue using heavy fuel)
  const isMainFuelECACompliant = ["LNG", "LSMGO", "MGO", "ULSFO"].includes(mainFuelType.toUpperCase());
  const needsFuelSwitch = ecaDistanceNm > 0 && !isMainFuelECACompliant && !selectedVessel?.hasScrubber;

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Compliance Insights
          </CardTitle>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Fuel Strategy Configuration */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fuel Strategy
              {selectedVessel?.fuelConsumption && (
                <span className="ml-1 font-normal normal-case">(from vessel profile)</span>
              )}
            </Label>
            
            <div className={`grid gap-3 ${seaDistanceNm > 0 && ecaDistanceNm > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              {/* Global (Non-SECA) Strategy — hidden when route is 100% inside SECA */}
              {seaDistanceNm > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Waves className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-blue-400">Global</span>
                  <span className="text-[9px] text-muted-foreground">(Non-ECA waters)</span>
                </div>
                <Select
                  value={mainFuelType}
                  onValueChange={setMainFuelType}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select fuel" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFuels.map((fuel) => (
                      <SelectItem key={fuel} value={fuel}>
                        {fuel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Cost Alert: premium fuel in Non-SECA */}
                {isOpenSeaCostAlert.show && (
                  <div className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>
                      Using premium fuel. Switch to {isOpenSeaCostAlert.cheaperFuel} to save ~${isOpenSeaCostAlert.savings.toLocaleString()}
                    </span>
                  </div>
                )}
                {pricing && (
                  <div className="text-[10px] text-muted-foreground">
                    ${getFuelPrice(mainFuelType, pricing).toFixed(0)}/MT · {seaDistanceNm.toFixed(0)} NM
                  </div>
                )}
              </div>
              )}
              
              {/* ECA / SECA Strategy — hidden when route is 100% outside SECA */}
              {ecaDistanceNm > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <TreePine className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-xs font-medium text-green-400">ECA / SECA</span>
                  <span className="text-[9px] text-muted-foreground">(Emission Control Area)</span>
                </div>
                <Select
                  value={secaFuelType}
                  onValueChange={setSecaFuelType}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select fuel" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFuels.map((fuel) => (
                      <SelectItem key={fuel} value={fuel}>
                        {fuel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Regulatory Violation: high-sulphur in SECA */}
                {isSecaViolation && (
                  <div className="flex items-start gap-1.5 text-[10px] text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
                    <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>
                      ⛔ VIOLATION: Exceeds 0.1% sulphur limit in ECA. Risk of fines &amp; detention.
                    </span>
                  </div>
                )}
                {pricing && (
                  <div className="text-[10px] text-muted-foreground">
                    ${getFuelPrice(effectiveSecaFuel, pricing).toFixed(0)}/MT · {ecaDistanceNm.toFixed(0)} NM
                  </div>
                )}
              </div>
              )}
            </div>
            
            {/* Vessel DWT */}
            <div className="space-y-1">
              <Label className="text-xs">
                Vessel DWT {selectedVessel && <span className="text-muted-foreground">({selectedVessel.name})</span>}
              </Label>
              <div className="h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm font-medium">
                {effectiveDWT > 0 ? `${effectiveDWT.toLocaleString()} DWT` : "Not set"}
              </div>
            </div>
          </div>

          {/* Compliance Badges */}
          <div className="space-y-3">
            {/* 1. SECA Zone Summary (compact — details now in fuel strategy above) */}
            {ecaDistanceNm > 0 && (
              <div className={`flex items-start gap-3 p-3 rounded-lg ${
                isSecaViolation
                  ? "bg-red-500/10 border border-red-500/30"
                  : "bg-green-500/10 border border-green-500/30"
              }`}>
                <Fuel className={`h-5 w-5 shrink-0 mt-0.5 ${
                  isSecaViolation ? "text-red-500" : "text-green-500"
                }`} />
                <div className="flex-1">
                  <div className={`font-medium ${
                    isSecaViolation
                      ? "text-red-700 dark:text-red-400"
                      : "text-green-700 dark:text-green-400"
                  }`}>
                    ECA Zone ({ecaZones.join(", ") || "ECA"})
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    {seaDistanceNm > 0 && <span>Global: <span className="font-medium text-foreground">{mainFuelType}</span></span>}
                    <span>ECA: <span className="font-medium text-foreground">{effectiveSecaFuel}</span></span>
                    <span>📏 {ecaDistanceNm.toFixed(0)} NM in ECA</span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. EU ETS Sustainability Badge */}
            {euEts?.applicable && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <Leaf className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-green-700 dark:text-green-400">
                    Sustainability Impact
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Est. Emissions:{" "}
                    <span className="font-medium">
                      {co2Emissions?.totalCO2Mt.toFixed(1) ?? "—"} MT CO₂
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    🇪🇺 EU ETS Zone: Yes ({euEts.percentage}% Taxable)
                  </div>
                </div>
              </div>
            )}

            {/* 3. HRA Security Alert — Enriched with zone details */}
            {hraDistanceNm > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <Shield className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-red-700 dark:text-red-400">
                    ⚠️ Security Alert — High Risk Area
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Route transits {hraDistanceNm.toLocaleString(undefined, { maximumFractionDigits: 0 })} NM through HRA
                    ({Math.round((hraDistanceNm / totalDistanceNm) * 100)}% of voyage)
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {hraZones.map((zone) => (
                      <div key={zone} className="flex items-start gap-2 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1.5" />
                        <div>
                          <span className="font-medium text-foreground">{zone}</span>
                          <span className="text-muted-foreground ml-1">
                            {zone.toLowerCase().includes("aden") && "— Piracy risk, armed escort recommended"}
                            {zone.toLowerCase().includes("africa") && "— Piracy & armed robbery risk"}
                            {zone.toLowerCase().includes("malacca") && "— Piracy risk, exercise caution"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 font-medium">
                      War Risk Premium (AWRP) applies
                    </span>
                    {hraZones.some(z => z.toLowerCase().includes("aden")) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                        Armed Guard Recommended
                      </span>
                    )}
                    {hraZones.some(z => z.toLowerCase().includes("africa")) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                        Citadel Required
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 4. Financial Estimate (Always visible) */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <DollarSign className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-blue-700 dark:text-blue-400">
                    Financial Estimate
                  </span>
                  {bunkerCost && (
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-blue-400/60 hover:text-blue-400 transition-colors">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start" className="max-w-sm p-3">
                          <div className="space-y-2 text-xs">
                            <p className="font-semibold text-sm">📐 Cost Formula Breakdown</p>
                            
                            {/* Open Sea formula */}
                            <div className="space-y-0.5">
                              <p className="font-medium text-blue-400">Open Sea ({mainFuelType})</p>
                              <p className="text-muted-foreground">Days × Consumption × Price</p>
                              <p className="font-mono">
                                {formulaSeaDays.toFixed(1)}d × {dailyConsumptionNum} MT/d × ${formulaSeaFuelPrice.toLocaleString()}/MT
                              </p>
                              <p className="font-medium">= ${bunkerCost.seaCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                            </div>

                            {/* SECA formula */}
                            {ecaDistanceNm > 0 && (
                              <div className="space-y-0.5">
                                <p className="font-medium text-green-400">SECA Zone ({bunkerCost.ecaFuelLabel})</p>
                                <p className="text-muted-foreground">Days × Consumption × Price</p>
                                <p className="font-mono">
                                  {formulaEcaDays.toFixed(1)}d × {secaDailyConsumption} MT/d × ${formulaEcaFuelPrice.toLocaleString()}/MT
                                </p>
                                <p className="font-medium">= ${bunkerCost.ecaCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                              </div>
                            )}

                            {/* EU ETS formula */}
                            {carbonTaxCost > 0 && co2Emissions && (
                              <div className="space-y-0.5">
                                <p className="font-medium text-amber-400">🇪🇺 EU ETS Carbon Tax</p>
                                <p className="text-muted-foreground">CO₂ × Taxable% × Carbon Price</p>
                                <p className="font-mono">
                                  {co2Emissions.totalCO2Mt.toFixed(1)} MT × {taxablePercentage}% × ${carbonPriceUSD.toFixed(2)}/MT
                                </p>
                                <p className="font-medium text-amber-400">= +${carbonTaxCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                              </div>
                            )}

                            {/* Canal Transit Cost */}
                            {canalTransitCost > 0 && (
                              <div className="space-y-0.5">
                                <p className="font-medium text-purple-400">🚢 Canal Transit</p>
                                <p className="text-muted-foreground">Manual input</p>
                                <p className="font-medium text-purple-400">= +${canalTransitCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                              </div>
                            )}

                            <hr className="border-muted" />
                            <p className="font-semibold text-sm">
                              Total: ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                            <p className="text-muted-foreground text-[10px]">Based on current Global Avg Prices</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="text-xl font-bold">
                  {bunkerCost
                    ? `~$${totalCost.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}`
                    : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div>Fuel: ${bunkerCost?.total.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"}</div>
                  {carbonTaxCost > 0 && (
                    <div className="text-amber-600 dark:text-amber-400">
                      Carbon Tax: +${carbonTaxCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <span className="text-muted-foreground ml-1">(@ ${carbonPriceUSD.toFixed(2)}/MT)</span>
                    </div>
                  )}
                  {canalTransitCost > 0 && (
                    <div className="text-purple-600 dark:text-purple-400">
                      Canal Transit: +${canalTransitCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 5. Speed & CII Sensitivity Matrix - Tabbed Split View */}
            {bunkerCost && totalDistanceNm > 0 && (
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge className="h-5 w-5 text-purple-500" />
                  <span className="font-medium text-purple-700 dark:text-purple-400">
                    Speed & CII Sensitivity
                  </span>
                </div>
                
                {/* Tab Selector - only show tabs when SECA zone exists */}
                {ecaDistanceNm > 0 && (
                  <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-muted/50">
                    <button
                      type="button"
                      onClick={() => setSensitivityTab("total")}
                      className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        sensitivityTab === "total"
                          ? "bg-purple-600 text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      🌍 Total Voyage
                    </button>
                    <button
                      type="button"
                      onClick={() => setSensitivityTab("seca")}
                      className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        sensitivityTab === "seca"
                          ? "bg-green-600 text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      🌿 SECA ({ecaDistanceNm.toLocaleString(undefined, { maximumFractionDigits: 0 })} NM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSensitivityTab("opensea")}
                      className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        sensitivityTab === "opensea"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      🌊 Open Sea ({(totalDistanceNm - ecaDistanceNm).toLocaleString(undefined, { maximumFractionDigits: 0 })} NM)
                    </button>
                  </div>
                )}

                {/* Zone info badge */}
                {ecaDistanceNm > 0 && sensitivityTab !== "total" && (
                  <div className={`text-xs px-2 py-1 rounded mb-2 ${
                    sensitivityTab === "seca"
                      ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  }`}>
                    {sensitivityTab === "seca" 
                      ? `⚡ Fuel: ${secaFuelResult.fuel} • Energy Factor: ×${(FUEL_ENERGY_FACTORS[secaFuelResult.fuel.toUpperCase()] ?? 1.0).toFixed(1)} • CO₂ Factor: ${(CARBON_FACTORS[secaFuelResult.fuel.toUpperCase() as AllFuelType] ?? 3.114).toFixed(3)}`
                      : `⚡ Fuel: ${mainFuelType} • Energy Factor: ×${(FUEL_ENERGY_FACTORS[mainFuelType.toUpperCase()] ?? 1.0).toFixed(1)} • CO₂ Factor: ${(CARBON_FACTORS[mainFuelType.toUpperCase() as AllFuelType] ?? 3.114).toFixed(3)}`
                    }
                  </div>
                )}

                {/* Speed comparison table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-purple-500/20">
                        <th className="text-left py-1 pr-2">Speed</th>
                        <th className="text-right py-1 px-2">Days</th>
                        <th className="text-right py-1 px-2">
                          <span className="inline-flex items-center gap-1">
                            {sensitivityTab === "seca" ? `${secaFuelResult.fuel} (MT)` 
                              : sensitivityTab === "opensea" ? `${mainFuelType} (MT)`
                              : "Fuel (MT)"}
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground/50 hover:text-purple-400 transition-colors">
                                    <Info className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs p-2">
                                  <div className="text-xs space-y-1">
                                    <p className="font-semibold">⛽ Fuel Mass Formula</p>
                                    <p className="text-muted-foreground">{hasPerFuelProfile ? "Days × Daily Consumption" : "Days × Consumption × Energy Factor"}</p>
                                    {sensitivityTab === "seca" ? (
                                      hasPerFuelProfile ? (
                                        <p className="font-mono">Uses {secaDailyConsumption.toFixed(1)} MT/day ({secaFuelResult.fuel} Profile)</p>
                                      ) : (
                                        <p className="font-mono">Energy Factor: ×{formulaSecaEnergyFactor.toFixed(1)} ({secaFuelResult.fuel})</p>
                                      )
                                    ) : sensitivityTab === "opensea" ? (
                                      hasPerFuelProfile ? (
                                        <p className="font-mono">Uses {dailyConsumptionNum.toFixed(1)} MT/day ({mainFuelType} Profile)</p>
                                      ) : (
                                        <p className="font-mono">Energy Factor: ×{formulaOpenSeaEnergyFactor.toFixed(1)} ({mainFuelType})</p>
                                      )
                                    ) : (
                                      <>
                                        {hasPerFuelProfile ? (
                                          <>
                                            <p className="font-mono">SECA: {secaDailyConsumption.toFixed(1)} MT/day ({secaFuelResult.fuel} Profile)</p>
                                            <p className="font-mono">Open Sea: {dailyConsumptionNum.toFixed(1)} MT/day ({mainFuelType} Profile)</p>
                                          </>
                                        ) : (
                                          <>
                                            <p className="font-mono">SECA: ×{formulaSecaEnergyFactor.toFixed(1)} ({secaFuelResult.fuel})</p>
                                            <p className="font-mono">Open Sea: ×{formulaOpenSeaEnergyFactor.toFixed(1)} ({mainFuelType})</p>
                                          </>
                                        )}
                                      </>
                                    )}
                                    <p className="text-muted-foreground text-[10px]">{hasPerFuelProfile ? "Vessel profile data used instead of generic energy factors" : "Higher energy factor = more fuel mass needed"}</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </span>
                        </th>
                        <th className="text-right py-1 px-2">
                          <span className="inline-flex items-center gap-1">
                            CO₂ (MT)
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground/50 hover:text-purple-400 transition-colors">
                                    <Info className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs p-2">
                                  <div className="text-xs space-y-1">
                                    <p className="font-semibold">📐 CO₂ Emissions Formula</p>
                                    <p className="text-muted-foreground">Fuel (MT) × Carbon Factor</p>
                                    {sensitivityTab === "seca" ? (
                                      <p className="font-mono">{secaFuelResult.fuel}: CF = {formulaSecaCarbonFactor.toFixed(3)}</p>
                                    ) : sensitivityTab === "opensea" ? (
                                      <p className="font-mono">{mainFuelType}: CF = {formulaOpenSeaCarbonFactor.toFixed(3)}</p>
                                    ) : (
                                      <>
                                        <p className="font-mono">SECA ({secaFuelResult.fuel}): CF = {formulaSecaCarbonFactor.toFixed(3)}</p>
                                        <p className="font-mono">Open Sea ({mainFuelType}): CF = {formulaOpenSeaCarbonFactor.toFixed(3)}</p>
                                      </>
                                    )}
                                    <p className="text-muted-foreground text-[10px]">IMO MEPC.308 default values</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </span>
                        </th>
                        {sensitivityTab === "total" && (
                          <th className="text-right py-1 px-2">
                            <span className="inline-flex items-center gap-1">
                              CII Score
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="text-muted-foreground/50 hover:text-purple-400 transition-colors">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs p-2">
                                    <div className="text-xs space-y-1">
                                      <p className="font-semibold">📐 CII Rating Formula</p>
                                      <p className="text-muted-foreground">(Total CO₂ × 10⁶) ÷ (DWT × Distance)</p>
                                      <p className="font-mono">DWT: {(manualDWT || selectedVessel?.dwt || 0).toLocaleString()}</p>
                                      <p className="font-mono">Distance: {totalDistanceNm.toLocaleString(undefined, { maximumFractionDigits: 0 })} NM</p>
                                      <p className="text-muted-foreground text-[10px]">Lower CII = Better environmental rating</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </span>
                          </th>
                        )}
                        <th className="text-right py-1 pl-2">
                          <span className="inline-flex items-center gap-1">
                            Est. Cost
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground/50 hover:text-purple-400 transition-colors">
                                    <Info className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="end" className="max-w-xs p-2">
                                  <div className="text-xs space-y-1">
                                    <p className="font-semibold">📐 Cost Formula</p>
                                    <p className="text-muted-foreground">Fuel (MT) × Price ($/MT)</p>
                                    {sensitivityTab === "seca" ? (
                                      <p className="font-mono">{secaFuelResult.fuel}: ${formulaEcaFuelPrice.toLocaleString()}/MT</p>
                                    ) : sensitivityTab === "opensea" ? (
                                      <p className="font-mono">{mainFuelType}: ${formulaSeaFuelPrice.toLocaleString()}/MT</p>
                                    ) : (
                                      <>
                                        <p className="font-mono">SECA ({secaFuelResult.fuel}): ${formulaEcaFuelPrice.toLocaleString()}/MT</p>
                                        <p className="font-mono">Open Sea ({mainFuelType}): ${formulaSeaFuelPrice.toLocaleString()}/MT</p>
                                      </>
                                    )}
                                    <p className="text-muted-foreground text-[10px]">Current row shows ±diff vs current speed</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const dwt = effectiveDWT;
                        const consumption = effectiveConsumption;
                        const speeds = [
                          { name: "🌱 Eco", kts: Math.max(8, speedKnots - 2), label: "eco" },
                          { name: "📍 Current", kts: speedKnots, label: "current" },
                          { name: "⚡ Fast", kts: speedKnots + 2, label: "fast" },
                        ];
                        
                        // Get fuel prices from market data (same prices used by Financial Estimate)
                        // Previously these were hardcoded ($800 ammonia, VLSFO only)
                        
                        // Per-zone consumption from vessel profile
                        // When vessel has per-fuel profiles, use them directly (no energy factors)
                        const openSeaBaseConsumption = consumption; // Main fuel consumption
                        const secaBaseConsumption = secaDailyConsumption; // SECA fuel consumption from profile
                        const openSeaDistanceNm = totalDistanceNm - ecaDistanceNm;
                        
                        const secaFuel = secaFuelResult.fuel.toUpperCase();
                        const openSeaFuel = mainFuelType.toUpperCase();
                        
                        // Skip energy factors when vessel has specific per-fuel consumption
                        const secaEnergyFactor = hasPerFuelProfile ? 1.0 : (FUEL_ENERGY_FACTORS[secaFuel] ?? 1.0);
                        const openSeaEnergyFactor = hasPerFuelProfile ? 1.0 : (FUEL_ENERGY_FACTORS[openSeaFuel] ?? 1.0);
                        
                        const secaCarbonFactor = CARBON_FACTORS[secaFuel as AllFuelType] ?? 3.114;
                        const openSeaCarbonFactor = CARBON_FACTORS[openSeaFuel as AllFuelType] ?? 3.114;
                        
                        // Use actual market prices (synced with Financial Estimate card)
                        const secaFuelPrice = formulaEcaFuelPrice;
                        const openSeaFuelPrice = formulaSeaFuelPrice;
                        
                        // Base values at current speed
                        const baseSecaDays = ecaDistanceNm / (speedKnots * 24);
                        const baseOpenSeaDays = openSeaDistanceNm / (speedKnots * 24);
                        const baseSecaFuelMT = baseSecaDays * secaBaseConsumption * secaEnergyFactor;
                        const baseOpenSeaFuelMT = baseOpenSeaDays * openSeaBaseConsumption * openSeaEnergyFactor;
                        const baseTotalCO2 = (baseSecaFuelMT * secaCarbonFactor) + (baseOpenSeaFuelMT * openSeaCarbonFactor);
                        const baseCII = calculateCII(baseTotalCO2, totalDistanceNm, dwt);
                        const baseTotalCost = (baseSecaFuelMT * secaFuelPrice) + (baseOpenSeaFuelMT * openSeaFuelPrice);
                        
                        return speeds.map((speed) => {
                          const speedRatio = speed.kts / speedKnots;
                          const adjustedSecaConsumption = secaBaseConsumption * Math.pow(speedRatio, 3);
                          const adjustedOpenSeaConsumption = openSeaBaseConsumption * Math.pow(speedRatio, 3);
                          
                          // Calculate per-zone values
                          const secaDays = ecaDistanceNm / (speed.kts * 24);
                          const openSeaDays = openSeaDistanceNm / (speed.kts * 24);
                          const totalDays = totalDistanceNm / (speed.kts * 24);
                          
                          const secaFuelMT = secaDays * adjustedSecaConsumption * secaEnergyFactor;
                          const secaCO2MT = secaFuelMT * secaCarbonFactor;
                          const secaCostVal = secaFuelMT * secaFuelPrice;
                          
                          const openSeaFuelMT = openSeaDays * adjustedOpenSeaConsumption * openSeaEnergyFactor;
                          const openSeaCO2MT = openSeaFuelMT * openSeaCarbonFactor;
                          const openSeaCostVal = openSeaFuelMT * openSeaFuelPrice;
                          
                          const totalFuelMT = secaFuelMT + openSeaFuelMT;
                          const totalCO2MT = secaCO2MT + openSeaCO2MT;
                          const totalCostVal = secaCostVal + openSeaCostVal;
                          const cii = calculateCII(totalCO2MT, totalDistanceNm, dwt);
                          
                          // Select values based on active tab
                          let displayDays: number, displayFuel: number, displayCO2: number, displayCost: number;
                          
                          if (sensitivityTab === "seca") {
                            displayDays = secaDays;
                            displayFuel = secaFuelMT;
                            displayCO2 = secaCO2MT;
                            displayCost = secaCostVal;
                          } else if (sensitivityTab === "opensea") {
                            displayDays = openSeaDays;
                            displayFuel = openSeaFuelMT;
                            displayCO2 = openSeaCO2MT;
                            displayCost = openSeaCostVal;
                          } else {
                            displayDays = totalDays;
                            displayFuel = totalFuelMT;
                            displayCO2 = totalCO2MT;
                            displayCost = totalCostVal;
                          }
                          
                          const costDiff = displayCost - (
                            sensitivityTab === "seca" ? baseSecaFuelMT * secaFuelPrice
                            : sensitivityTab === "opensea" ? baseOpenSeaFuelMT * openSeaFuelPrice
                            : baseTotalCost
                          );
                          
                          const isBetter = cii < baseCII * 0.98;
                          const isWorse = cii > baseCII * 1.02;
                          
                          return (
                            <tr 
                              key={speed.label} 
                              className={`border-b border-purple-500/10 ${
                                speed.label === "current" ? "bg-purple-500/5 font-medium" : ""
                              }`}
                            >
                              <td className="py-1.5 pr-2">
                                {speed.name}
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({speed.kts} kts)
                                </span>
                              </td>
                              <td className="text-right py-1.5 px-2">
                                {displayDays.toFixed(1)}
                              </td>
                              <td className="text-right py-1.5 px-2">
                                {displayFuel.toFixed(0)}
                              </td>
                              <td className={`text-right py-1.5 px-2 ${
                                sensitivityTab === "seca" ? "text-green-500 font-medium" : ""
                              }`}>
                                {displayCO2.toFixed(0)}
                                {sensitivityTab === "seca" && displayCO2 < 50 && " 🌿"}
                              </td>
                              {sensitivityTab === "total" && (
                                <td className={`text-right py-1.5 px-2 font-mono ${
                                  isBetter 
                                    ? "text-green-500 font-bold" 
                                    : isWorse 
                                      ? "text-red-500 font-bold" 
                                      : ""
                                }`}>
                                  {cii.toFixed(2)}
                                  {isBetter && " ▼"}
                                  {isWorse && " ▲"}
                                </td>
                              )}
                              <td className={`text-right py-1.5 pl-2 font-medium ${
                                costDiff < -1 
                                  ? "text-green-500" 
                                  : costDiff > 1 
                                    ? "text-red-500" 
                                    : "text-muted-foreground"
                              }`}>
                                {speed.label === "current" 
                                  ? `$${displayCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` 
                                  : costDiff < 0 
                                    ? `-$${Math.abs(costDiff).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                    : `+$${costDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                }
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
                
                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  {sensitivityTab === "seca" 
                    ? `${secaFuelResult.fuel} requires ${(FUEL_ENERGY_FACTORS[secaFuelResult.fuel.toUpperCase()] ?? 1).toFixed(1)}× more fuel mass but produces near-zero CO₂.`
                    : sensitivityTab === "opensea"
                    ? `${mainFuelType} is the standard fuel with high energy density but higher emissions.`
                    : "Lower CII = Better Rating. Slowing down improves your environmental score."
                  }
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
