/**
 * Weather Risk Calculator
 * 
 * Converts RouteWeatherSummary from Open-Meteo Marine API
 * into a dynamic weatherRiskMultiplier for the voyage optimizer.
 * 
 * Replaces the static 1.0 multiplier with real forecast-based adjustments.
 */

import type { RouteWeatherSummary, WeatherSeverity } from "@/types/weather";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface WeatherRiskAssessment {
  /** Dynamic multiplier for sea days (1.0 = no penalty, 1.30 = +30% days) */
  weatherMultiplier: number;
  /** Additional fuel consumption penalty as a fraction (0.0 = 0%, 0.15 = 15%) */
  fuelPenaltyPercent: number;
  /** Overall severity for display */
  overallSeverity: WeatherSeverity;
  /** Max wave height encountered in the forecast */
  maxWaveHeightM: number;
  /** Average wave height along route */
  avgWaveHeightM: number;
  /** Human-readable advisory text */
  advisory: string;
  /** Detailed per-segment breakdown */
  segments: WeatherSegment[];
}

export interface WeatherSegment {
  lat: number;
  lon: number;
  severity: WeatherSeverity;
  waveHeightM: number;
  /** Sea day multiplier for this segment */
  localMultiplier: number;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS — Maritime Weather Impact Tables
// ═══════════════════════════════════════════════════════════════════

/**
 * Sea day multipliers by wave height (well-established maritime ops values)
 * 
 * Beaufort Scale correspondence:
 * - < 1.0m   → BF 3-4 (Calm/Slight)     → No speed loss
 * - 1.0-2.5m → BF 4-5 (Moderate/Rough)   → 3-5% speed loss
 * - 2.5-4.0m → BF 6-7 (Very Rough/High)  → 10-15% speed loss
 * - > 4.0m   → BF 7-9 (High/Very High)   → 20-30% speed loss
 */
const WAVE_HEIGHT_TO_MULTIPLIER: Array<{ maxWave: number; multiplier: number; fuelPenalty: number }> = [
  { maxWave: 0.5,  multiplier: 1.00, fuelPenalty: 0.00 },  // Calm
  { maxWave: 1.0,  multiplier: 1.02, fuelPenalty: 0.02 },  // Slight
  { maxWave: 1.5,  multiplier: 1.05, fuelPenalty: 0.04 },  // Moderate
  { maxWave: 2.0,  multiplier: 1.08, fuelPenalty: 0.06 },  // Moderate-Rough
  { maxWave: 2.5,  multiplier: 1.10, fuelPenalty: 0.08 },  // Rough
  { maxWave: 3.0,  multiplier: 1.13, fuelPenalty: 0.10 },  // Rough
  { maxWave: 3.5,  multiplier: 1.17, fuelPenalty: 0.13 },  // Very Rough
  { maxWave: 4.0,  multiplier: 1.20, fuelPenalty: 0.15 },  // Very Rough
  { maxWave: 5.0,  multiplier: 1.25, fuelPenalty: 0.20 },  // High Seas
  { maxWave: 999,  multiplier: 1.35, fuelPenalty: 0.25 },  // Extreme
];

/** Advisory text by severity */
const SEVERITY_ADVISORY: Record<WeatherSeverity, string> = {
  calm:     "Favorable conditions — no weather penalties",
  moderate: "Moderate seas — minor speed/fuel impact expected",
  rough:    "Rough seas — significant speed reduction likely, consider alternative routing",
  severe:   "Severe conditions — hazardous weather, major delays expected",
};

// ═══════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate dynamic weather risk from actual forecast data.
 * 
 * Uses the RouteWeatherSummary (already fetched by useWeather hook)
 * to compute a realistic weatherRiskMultiplier instead of static 1.0.
 */
export function calculateWeatherRisk(
  weather: RouteWeatherSummary | null | undefined,
): WeatherRiskAssessment {
  // No weather data → return no-penalty baseline
  if (!weather || !weather.waypoints || weather.waypoints.length === 0) {
    return {
      weatherMultiplier: 1.0,
      fuelPenaltyPercent: 0,
      overallSeverity: "calm",
      maxWaveHeightM: 0,
      avgWaveHeightM: 0,
      advisory: "No weather data available — using baseline estimates",
      segments: [],
    };
  }

  // Build per-segment breakdown
  const segments: WeatherSegment[] = weather.waypoints.map(wp => {
    const waveHeight = wp.current.waveHeight;
    const lookup = getMultiplierForWaveHeight(waveHeight);
    return {
      lat: wp.latitude,
      lon: wp.longitude,
      severity: wp.current.severity,
      waveHeightM: waveHeight,
      localMultiplier: lookup.multiplier,
    };
  });

  // Route-average multiplier (weighted by segment count — assumes roughly equal spacing)
  const avgMultiplier = segments.length > 0
    ? segments.reduce((sum, s) => sum + s.localMultiplier, 0) / segments.length
    : 1.0;

  // Worst-case multiplier (peak conditions set a floor on realistic delay)
  const worstMultiplier = getMultiplierForWaveHeight(weather.worstConditions.maxWaveHeight);

  // Blend: 70% route average + 30% worst case (conservative maritime practice)
  const blendedMultiplier = Math.round(
    (avgMultiplier * 0.7 + worstMultiplier.multiplier * 0.3) * 1000
  ) / 1000;

  // Fuel penalty: same blending approach
  const avgFuelPenalty = segments.length > 0
    ? segments.reduce((sum, s) => sum + getMultiplierForWaveHeight(s.waveHeightM).fuelPenalty, 0) / segments.length
    : 0;
  const blendedFuelPenalty = Math.round(
    (avgFuelPenalty * 0.7 + worstMultiplier.fuelPenalty * 0.3) * 1000
  ) / 1000;

  return {
    weatherMultiplier: Math.min(blendedMultiplier, 1.5), // Cap at 1.5 (validator max)
    fuelPenaltyPercent: blendedFuelPenalty,
    overallSeverity: weather.averageConditions.overallSeverity,
    maxWaveHeightM: weather.worstConditions.maxWaveHeight,
    avgWaveHeightM: weather.averageConditions.avgWaveHeight,
    advisory: SEVERITY_ADVISORY[weather.averageConditions.overallSeverity],
    segments,
  };
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function getMultiplierForWaveHeight(waveHeightM: number): { multiplier: number; fuelPenalty: number } {
  for (const entry of WAVE_HEIGHT_TO_MULTIPLIER) {
    if (waveHeightM <= entry.maxWave) {
      return { multiplier: entry.multiplier, fuelPenalty: entry.fuelPenalty };
    }
  }
  // Fallback extreme
  return { multiplier: 1.35, fuelPenalty: 0.25 };
}
