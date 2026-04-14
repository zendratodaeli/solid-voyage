/**
 * Freight Recommendation Engine
 * 
 * This module generates intelligent freight rate recommendations
 * based on voyage economics, market data, and risk assessment.
 */

import { 
  VoyageCalculationResult, 
  VesselProfile, 
  VoyageInputs, 
  calculateVoyage 
} from "./voyage";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RecommendationAction = 
  | "STRONG_ACCEPT" 
  | "ACCEPT" 
  | "NEGOTIATE" 
  | "REJECT" 
  | "STRONG_REJECT";

export interface MarketData {
  minFreight: number;  // Market range low
  maxFreight: number;  // Market range high
  avgFreight: number;  // Market average
}

export interface RiskAssessment {
  overallRisk: RiskLevel;
  bunkerVolatilityRisk: RiskLevel;
  weatherRisk: RiskLevel;
  marketAlignmentRisk: RiskLevel;
  riskFactors: string[];
}

export interface FreightRecommendation {
  // Freight levels (USD/MT)
  breakEvenFreight: number;
  targetFreight: number;
  minMarketFreight: number;
  maxMarketFreight: number;
  recommendedFreight: number;
  
  // Margins
  targetMarginPercent: number;
  targetMarginUsd: number;
  
  // At offered freight (if provided)
  offeredFreight: number | null;
  marginAtOffer: number | null;
  pnlAtOffer: number | null;
  
  // Risk
  risk: RiskAssessment;
  
  // Decision
  confidenceScore: number;
  recommendation: RecommendationAction;
  explanation: string;
  assumptions: Record<string, string | number>;
}

export interface RecommendationConfig {
  targetMarginPercent: number;      // Default target margin (e.g., 15%)
  bunkerPriceHistoricalAvg: number; // For volatility calculation
  currentMonth: number;             // 1-12 for seasonal assessment
}

// ═══════════════════════════════════════════════════════════════════
// RISK ASSESSMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate bunker volatility risk based on current vs historical prices
 */
export function calculateBunkerRisk(
  currentPrice: number,
  historicalAvg: number
): RiskLevel {
  const variance = Math.abs(currentPrice - historicalAvg) / historicalAvg;
  
  if (variance < 0.10) return "LOW";    // Within 10%
  if (variance < 0.20) return "MEDIUM"; // 10-20%
  return "HIGH";                         // Over 20%
}

/**
 * Calculate weather risk based on weather multiplier
 */
export function calculateWeatherRisk(weatherMultiplier: number): RiskLevel {
  if (weatherMultiplier <= 1.05) return "LOW";     // Up to 5% buffer
  if (weatherMultiplier <= 1.15) return "MEDIUM";  // 5-15% buffer
  return "HIGH";                                    // Over 15% buffer
}

/**
 * Calculate market alignment risk
 */
export function calculateMarketAlignmentRisk(
  recommendedFreight: number,
  marketData: MarketData
): RiskLevel {
  // Within market range
  if (recommendedFreight >= marketData.minFreight && 
      recommendedFreight <= marketData.maxFreight) {
    return "LOW";
  }
  
  // Calculate deviation
  const deviation = recommendedFreight < marketData.minFreight
    ? (marketData.minFreight - recommendedFreight) / marketData.minFreight
    : (recommendedFreight - marketData.maxFreight) / marketData.maxFreight;
  
  if (deviation < 0.10) return "MEDIUM"; // Within 10% of range
  return "HIGH";                          // More than 10% outside range
}

/**
 * Calculate overall risk from component risks
 */
export function calculateOverallRisk(
  bunkerRisk: RiskLevel,
  weatherRisk: RiskLevel,
  marketRisk: RiskLevel
): RiskLevel {
  const riskScores: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  const weights = { bunker: 0.4, weather: 0.3, market: 0.3 };
  
  const weighted =
    riskScores[bunkerRisk] * weights.bunker +
    riskScores[weatherRisk] * weights.weather +
    riskScores[marketRisk] * weights.market;
  
  if (weighted < 1.5) return "LOW";
  if (weighted < 2.5) return "MEDIUM";
  return "HIGH";
}

/**
 * Generate risk factors description
 */
function generateRiskFactors(
  bunkerRisk: RiskLevel,
  weatherRisk: RiskLevel,
  marketRisk: RiskLevel,
  bunkerPrice: number,
  historicalAvg: number,
  weatherMultiplier: number
): string[] {
  const factors: string[] = [];
  
  if (bunkerRisk === "HIGH") {
    const variance = ((bunkerPrice - historicalAvg) / historicalAvg * 100).toFixed(1);
    factors.push(`Bunker price is ${variance}% ${bunkerPrice > historicalAvg ? 'above' : 'below'} historical average`);
  } else if (bunkerRisk === "MEDIUM") {
    factors.push("Moderate bunker price volatility");
  }
  
  if (weatherRisk === "HIGH") {
    factors.push(`Significant weather risk (${((weatherMultiplier - 1) * 100).toFixed(0)}% buffer applied)`);
  } else if (weatherRisk === "MEDIUM") {
    factors.push("Moderate seasonal weather conditions");
  }
  
  if (marketRisk === "HIGH") {
    factors.push("Recommended freight significantly outside market range");
  } else if (marketRisk === "MEDIUM") {
    factors.push("Recommended freight near market range boundary");
  }
  
  if (factors.length === 0) {
    factors.push("All risk indicators within normal ranges");
  }
  
  return factors;
}

// ═══════════════════════════════════════════════════════════════════
// RECOMMENDATION LOGIC
// ═══════════════════════════════════════════════════════════════════

/**
 * Determine recommendation action based on offered freight
 */
export function determineRecommendation(
  offeredFreight: number | null,
  breakEvenFreight: number,
  targetFreight: number,
  recommendedFreight: number,
  overallRisk: RiskLevel
): RecommendationAction {
  if (offeredFreight === null) {
    return "NEGOTIATE"; // No offer yet
  }
  
  // Below break-even = Always reject
  if (offeredFreight < breakEvenFreight) {
    return offeredFreight < breakEvenFreight * 0.95
      ? "STRONG_REJECT"
      : "REJECT";
  }
  
  // At or above recommended = Accept
  if (offeredFreight >= recommendedFreight) {
    return overallRisk === "LOW" ? "STRONG_ACCEPT" : "ACCEPT";
  }
  
  // Between break-even and target = Negotiate
  if (offeredFreight < targetFreight) {
    return "NEGOTIATE";
  }
  
  // Between target and recommended
  if (overallRisk === "HIGH") {
    return "NEGOTIATE"; // High risk = more cautious
  }
  
  return "ACCEPT";
}

/**
 * Calculate confidence score based on data quality and risk
 */
export function calculateConfidenceScore(
  hasMarketData: boolean,
  overallRisk: RiskLevel,
  totalVoyageDays: number
): number {
  let score = 100;
  
  // Data quality
  if (!hasMarketData) score -= 20;
  
  // Risk deductions
  if (overallRisk === "MEDIUM") score -= 10;
  if (overallRisk === "HIGH") score -= 25;
  
  // Long voyage uncertainty
  if (totalVoyageDays > 30) score -= 5;
  if (totalVoyageDays > 45) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate human-readable explanation
 */
function generateExplanation(
  recommendation: RecommendationAction,
  breakEvenFreight: number,
  targetFreight: number,
  recommendedFreight: number,
  offeredFreight: number | null,
  pnlAtOffer: number | null,
  risk: RiskAssessment
): string {
  const formatUsd = (val: number) => `USD ${val.toFixed(2)}/MT`;
  const formatMoney = (val: number) => `USD ${val.toLocaleString()}`;
  
  let explanation = "";
  
  if (offeredFreight !== null && pnlAtOffer !== null) {
    explanation += `At ${formatUsd(offeredFreight)}, estimated ${pnlAtOffer >= 0 ? 'profit' : 'loss'} is ${formatMoney(Math.abs(pnlAtOffer))}. `;
  }
  
  explanation += `Break-even is ${formatUsd(breakEvenFreight)}. `;
  
  if (recommendation === "STRONG_ACCEPT" || recommendation === "ACCEPT") {
    explanation += `The offered freight provides adequate margin above target rate of ${formatUsd(targetFreight)}. `;
  } else if (recommendation === "NEGOTIATE") {
    explanation += `We recommend negotiating towards ${formatUsd(recommendedFreight)} to achieve target margins. `;
  } else if (recommendation === "REJECT" || recommendation === "STRONG_REJECT") {
    explanation += `The offered freight is below break-even and would result in a loss. `;
  }
  
  // Risk context
  if (risk.overallRisk === "HIGH") {
    explanation += "Overall risk is HIGH - exercise caution. ";
  } else if (risk.overallRisk === "MEDIUM") {
    explanation += `Risk level is MEDIUM due to ${risk.riskFactors[0]?.toLowerCase() || 'market conditions'}. `;
  }
  
  return explanation.trim();
}

// ═══════════════════════════════════════════════════════════════════
// MAIN RECOMMENDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate complete freight recommendation
 */
export function generateFreightRecommendation(
  vessel: VesselProfile,
  inputs: VoyageInputs,
  marketData: MarketData | null,
  config: RecommendationConfig
): FreightRecommendation {
  // Calculate voyage economics
  const calculation = calculateVoyage(vessel, inputs);
  const breakEvenFreight = calculation.profitability.breakEvenFreight;
  
  // Calculate target freight (break-even + target margin)
  const targetMarginPercent = config.targetMarginPercent;
  const targetFreight = breakEvenFreight * (1 + targetMarginPercent / 100);
  const targetMarginUsd = targetFreight - breakEvenFreight;
  
  // Use market data or estimate
  const market: MarketData = marketData ?? {
    minFreight: breakEvenFreight * 0.95,
    maxFreight: targetFreight * 1.15,
    avgFreight: (breakEvenFreight + targetFreight) / 2,
  };
  
  // Calculate market-aligned freight (weighted average)
  const marketAlignedFreight = 
    breakEvenFreight * 0.3 +
    targetFreight * 0.3 +
    market.avgFreight * 0.4;
  
  // Calculate risk adjustment
  const bunkerRisk = calculateBunkerRisk(
    inputs.bunkerPriceUsd,
    config.bunkerPriceHistoricalAvg
  );
  const weatherRisk = calculateWeatherRisk(inputs.weatherRiskMultiplier);
  
  // Preliminary recommended freight (before market alignment risk)
  let recommendedFreight = Math.max(breakEvenFreight, marketAlignedFreight);
  
  // Add risk adjustment based on overall risk profile
  const riskAdjustmentPercent = 
    (bunkerRisk === "HIGH" ? 0.02 : bunkerRisk === "MEDIUM" ? 0.01 : 0) +
    (weatherRisk === "HIGH" ? 0.02 : weatherRisk === "MEDIUM" ? 0.01 : 0);
  
  recommendedFreight = recommendedFreight * (1 + riskAdjustmentPercent);
  
  // Calculate market alignment risk with final recommended freight
  const marketAlignmentRisk = calculateMarketAlignmentRisk(recommendedFreight, market);
  
  // Calculate overall risk
  const overallRisk = calculateOverallRisk(bunkerRisk, weatherRisk, marketAlignmentRisk);
  
  // Generate risk factors
  const riskFactors = generateRiskFactors(
    bunkerRisk,
    weatherRisk,
    marketAlignmentRisk,
    inputs.bunkerPriceUsd,
    config.bunkerPriceHistoricalAvg,
    inputs.weatherRiskMultiplier
  );
  
  const risk: RiskAssessment = {
    overallRisk,
    bunkerVolatilityRisk: bunkerRisk,
    weatherRisk,
    marketAlignmentRisk,
    riskFactors,
  };
  
  // Calculate at offered freight
  const offeredFreight = inputs.freightRateUsd ?? null;
  const marginAtOffer = offeredFreight !== null 
    ? offeredFreight - breakEvenFreight 
    : null;
  const pnlAtOffer = calculation.profitability.voyagePnl;
  
  // Determine recommendation
  const recommendationAction = determineRecommendation(
    offeredFreight,
    breakEvenFreight,
    targetFreight,
    recommendedFreight,
    overallRisk
  );
  
  // Calculate confidence
  const confidenceScore = calculateConfidenceScore(
    marketData !== null,
    overallRisk,
    calculation.duration.totalVoyageDays
  );
  
  // Generate explanation
  const explanation = generateExplanation(
    recommendationAction,
    breakEvenFreight,
    targetFreight,
    recommendedFreight,
    offeredFreight,
    pnlAtOffer,
    risk
  );
  
  // Assumptions used
  const assumptions: Record<string, string | number> = {
    bunkerPrice: `${inputs.bunkerPriceUsd} USD/MT`,
    bunkerFuelType: "VLSFO",
    weatherMultiplier: inputs.weatherRiskMultiplier,
    voyageDays: calculation.duration.totalVoyageDays,
    cargoQuantity: `${inputs.cargoQuantityMt} MT`,
    targetMargin: `${targetMarginPercent}%`,
    brokerage: `${inputs.brokeragePercent}%`,
    commission: `${inputs.commissionPercent}%`,
  };
  
  return {
    breakEvenFreight: round(breakEvenFreight, 2),
    targetFreight: round(targetFreight, 2),
    minMarketFreight: round(market.minFreight, 2),
    maxMarketFreight: round(market.maxFreight, 2),
    recommendedFreight: round(recommendedFreight, 2),
    targetMarginPercent,
    targetMarginUsd: round(targetMarginUsd, 2),
    offeredFreight,
    marginAtOffer: marginAtOffer !== null ? round(marginAtOffer, 2) : null,
    pnlAtOffer,
    risk,
    confidenceScore,
    recommendation: recommendationAction,
    explanation,
    assumptions,
  };
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Get recommendation action display properties
 */
export function getRecommendationDisplay(action: RecommendationAction): {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
} {
  switch (action) {
    case "STRONG_ACCEPT":
      return {
        label: "Strong Accept",
        color: "text-green-700",
        bgColor: "bg-green-100",
        icon: "✓✓",
      };
    case "ACCEPT":
      return {
        label: "Accept",
        color: "text-green-600",
        bgColor: "bg-green-50",
        icon: "✓",
      };
    case "NEGOTIATE":
      return {
        label: "Negotiate",
        color: "text-yellow-700",
        bgColor: "bg-yellow-100",
        icon: "↔",
      };
    case "REJECT":
      return {
        label: "Reject",
        color: "text-red-600",
        bgColor: "bg-red-50",
        icon: "✗",
      };
    case "STRONG_REJECT":
      return {
        label: "Strong Reject",
        color: "text-red-700",
        bgColor: "bg-red-100",
        icon: "✗✗",
      };
  }
}

/**
 * Get risk level display properties
 */
export function getRiskDisplay(risk: RiskLevel): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (risk) {
    case "LOW":
      return {
        label: "Low",
        color: "text-green-700",
        bgColor: "bg-green-100",
      };
    case "MEDIUM":
      return {
        label: "Medium",
        color: "text-yellow-700",
        bgColor: "bg-yellow-100",
      };
    case "HIGH":
      return {
        label: "High",
        color: "text-red-700",
        bgColor: "bg-red-100",
      };
  }
}
