/**
 * CII (Carbon Intensity Indicator) Calculator
 * 
 * Implements IMO DCS regulation for annual vessel CII tracking.
 * Calculates attained CII (AER method) and assigns A–E ratings
 * based on IMO reference lines and reduction factors.
 * 
 * Reference: MEPC.352(78), MEPC.353(78), MEPC.354(78), MEPC.355(78)
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type CiiRating = "A" | "B" | "C" | "D" | "E";

export interface CiiResult {
  /** Attained CII in gCO₂/(dwt·nm) */
  attainedCII: number;
  /** Required CII for this year in gCO₂/(dwt·nm) */
  requiredCII: number;
  /** Letter rating A–E */
  rating: CiiRating;
  /** Ratio: attained / required (< 1.0 = good, > 1.0 = bad) */
  ratio: number;
  /** Human-readable label */
  label: string;
  /** Warning level for optimizer */
  isWarning: boolean; // D or E
}

export interface CiiVoyageImpact {
  /** CII from this single voyage */
  voyageCII: number;
  /** Predicted annual CII if all voyages were like this one */
  predictedAnnualCII: number;
  /** Rating based on predicted annual CII */
  predictedRating: CiiRating;
  /** Whether this config would push vessel toward D/E */
  isWarning: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// IMO CII REFERENCE LINE PARAMETERS
// 
// Required CII = a × DWT^(-c) × (1 - Z%)
// where Z is the reduction factor for the year
// ═══════════════════════════════════════════════════════════════════

/** IMO reference line parameters by ship type (MEPC.353(78)) */
const CII_REFERENCE: Record<string, { a: number; c: number }> = {
  "Bulk Carrier":      { a: 4745,   c: 0.622 },
  "Tanker":            { a: 5247,   c: 0.610 },
  "Container Ship":    { a: 1984,   c: 0.489 },
  "General Cargo":     { a: 588,    c: 0.3885 },
  "Gas Carrier":       { a: 14405,  c: 0.7246 },
  "LNG Carrier":       { a: 9827,   c: 0.7000 },
  "Ro-Ro Cargo":       { a: 10952,  c: 0.6558 },
  "Cruise Ship":       { a: 930,    c: 0.383 },
  "Refrigerated Cargo": { a: 4600,  c: 0.557 },
  // Default fallback
  "default":           { a: 4745,   c: 0.622 },
};

/** Annual reduction factor Z (%) — IMO MEPC.338(76) */
const CII_REDUCTION_FACTORS: Record<number, number> = {
  2023: 5.0,
  2024: 7.0,
  2025: 9.0,
  2026: 11.0,
  2027: 11.0, // Placeholder — IMO to update
  2028: 11.0,
  2029: 11.0,
  2030: 11.0,
};

/** Rating boundaries (d-vectors) as ratio of attained/required CII (MEPC.354(78)) */
const CII_RATING_BOUNDARIES: Record<string, { d1: number; d2: number; d3: number; d4: number }> = {
  "Bulk Carrier":      { d1: 0.86, d2: 0.94, d3: 1.06, d4: 1.18 },
  "Tanker":            { d1: 0.82, d2: 0.93, d3: 1.08, d4: 1.28 },
  "Container Ship":    { d1: 0.83, d2: 0.94, d3: 1.07, d4: 1.19 },
  "General Cargo":     { d1: 0.83, d2: 0.94, d3: 1.06, d4: 1.19 },
  "Gas Carrier":       { d1: 0.81, d2: 0.91, d3: 1.12, d4: 1.44 },
  "LNG Carrier":       { d1: 0.89, d2: 0.98, d3: 1.06, d4: 1.13 },
  "Ro-Ro Cargo":       { d1: 0.86, d2: 0.94, d3: 1.06, d4: 1.16 },
  "Cruise Ship":       { d1: 0.87, d2: 0.95, d3: 1.06, d4: 1.16 },
  "Refrigerated Cargo": { d1: 0.78, d2: 0.91, d3: 1.07, d4: 1.20 },
  "default":           { d1: 0.86, d2: 0.94, d3: 1.06, d4: 1.18 },
};

/** Rating labels and descriptions */
const RATING_CONFIG: Record<CiiRating, { label: string; color: string; bgColor: string }> = {
  A: { label: "Superior",  color: "text-emerald-400", bgColor: "bg-emerald-500/15" },
  B: { label: "Good",      color: "text-blue-400",    bgColor: "bg-blue-500/15" },
  C: { label: "Moderate",  color: "text-amber-400",   bgColor: "bg-amber-500/15" },
  D: { label: "Inferior",  color: "text-orange-400",  bgColor: "bg-orange-500/15" },
  E: { label: "Poor",      color: "text-red-400",     bgColor: "bg-red-500/15" },
};

// ═══════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate CII rating for a vessel based on annual data.
 * 
 * @param co2Mt - Total annual CO₂ emissions in metric tonnes
 * @param dwt - Vessel deadweight tonnage
 * @param distanceNm - Total annual distance sailed (nautical miles)
 * @param vesselType - Ship type for reference line lookup
 * @param year - Year for reduction factor (defaults to current year)
 */
export function calculateCII(
  co2Mt: number,
  dwt: number,
  distanceNm: number,
  vesselType: string = "Bulk Carrier",
  year: number = new Date().getFullYear(),
): CiiResult {
  if (!co2Mt || !dwt || !distanceNm) {
    return {
      attainedCII: 0,
      requiredCII: 0,
      rating: "C",
      ratio: 1.0,
      label: "Insufficient data",
      isWarning: false,
    };
  }

  // Attained CII (AER method): gCO₂ / (DWT × NM)
  const attainedCII = (co2Mt * 1_000_000) / (dwt * distanceNm);

  // Required CII = reference × (1 - Z%)
  const ref = CII_REFERENCE[vesselType] || CII_REFERENCE["default"];
  const reduction = CII_REDUCTION_FACTORS[year] ?? CII_REDUCTION_FACTORS[2026] ?? 11.0;
  const referenceCII = ref.a * Math.pow(dwt, -ref.c);
  const requiredCII = referenceCII * (1 - reduction / 100);

  // Rating
  const ratio = attainedCII / requiredCII;
  const rating = getRating(ratio, vesselType);

  return {
    attainedCII: Math.round(attainedCII * 1000) / 1000,
    requiredCII: Math.round(requiredCII * 1000) / 1000,
    rating,
    ratio: Math.round(ratio * 1000) / 1000,
    label: `${rating} — ${RATING_CONFIG[rating].label}`,
    isWarning: rating === "D" || rating === "E",
  };
}

/**
 * Calculate CII impact of a single voyage on the vessel's annual rating.
 * 
 * @param voyageCO2Mt - CO₂ from this voyage in MT
 * @param dwt - Vessel DWT
 * @param voyageDistanceNm - Distance of this voyage (NM)
 * @param vesselType - Ship type
 * @param year - Year
 */
export function calculateVoyageCiiImpact(
  voyageCO2Mt: number,
  dwt: number,
  voyageDistanceNm: number,
  vesselType: string = "Bulk Carrier",
  year: number = new Date().getFullYear(),
): CiiVoyageImpact {
  // Single-voyage CII
  const voyageCII = dwt > 0 && voyageDistanceNm > 0
    ? (voyageCO2Mt * 1_000_000) / (dwt * voyageDistanceNm)
    : 0;

  // Estimate annual CII by extrapolating this voyage's efficiency
  // This gives a "what if all voyages were like this" prediction
  const annualResult = calculateCII(voyageCO2Mt, dwt, voyageDistanceNm, vesselType, year);

  return {
    voyageCII: Math.round(voyageCII * 1000) / 1000,
    predictedAnnualCII: annualResult.attainedCII,
    predictedRating: annualResult.rating,
    isWarning: annualResult.isWarning,
  };
}

/**
 * Quick CII estimate from speed and consumption (without full voyage calc)
 * Used by the optimizer to estimate CII per config in the results table.
 */
export function estimateCiiFromConfig(
  speedKnots: number,
  dailyConsumptionMt: number,
  dwt: number,
  vesselType: string = "Bulk Carrier",
  carbonFactor: number = 3.114, // VLSFO default
): CiiResult {
  if (speedKnots <= 0 || dailyConsumptionMt <= 0 || dwt <= 0) {
    return calculateCII(0, 0, 0, vesselType);
  }

  // In one day: vessel travels speed × 24 NM, burns dailyConsumption MT
  // CO₂ = consumption × carbonFactor
  const dailyCO2Mt = dailyConsumptionMt * carbonFactor;
  const dailyDistanceNm = speedKnots * 24;

  // CII = gCO₂ / (DWT × NM) = (dailyCO2 × 1e6) / (DWT × dailyDistance)
  // This is equivalent to calculating annual CII since daily ratios = annual ratios
  return calculateCII(dailyCO2Mt, dwt, dailyDistanceNm, vesselType);
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS — for UI components
// ═══════════════════════════════════════════════════════════════════

export { RATING_CONFIG, CII_REFERENCE, CII_REDUCTION_FACTORS };

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function getRating(ratio: number, vesselType: string): CiiRating {
  const bounds = CII_RATING_BOUNDARIES[vesselType] || CII_RATING_BOUNDARIES["default"];
  if (ratio <= bounds.d1) return "A";
  if (ratio <= bounds.d2) return "B";
  if (ratio <= bounds.d3) return "C";
  if (ratio <= bounds.d4) return "D";
  return "E";
}
