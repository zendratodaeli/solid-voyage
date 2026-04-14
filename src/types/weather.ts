/**
 * Weather Types for Open-Meteo Marine Weather API Integration
 * 
 * Types for fetching and displaying marine weather data along voyage routes
 * and on the dedicated weather page.
 */

// ═══════════════════════════════════════════════════════════════════
// OPEN-METEO MARINE API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════

/** Raw response from Open-Meteo Marine Weather API */
export interface MarineWeatherResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  hourly?: {
    time: string[];
    wave_height?: number[];
    wave_direction?: number[];
    wave_period?: number[];
    wind_wave_height?: number[];
    wind_wave_direction?: number[];
    wind_wave_period?: number[];
    swell_wave_height?: number[];
    swell_wave_direction?: number[];
    swell_wave_period?: number[];
    ocean_current_velocity?: number[];
    ocean_current_direction?: number[];
    sea_surface_temperature?: number[];
  };
  hourly_units?: Record<string, string>;
  daily?: {
    time: string[];
    wave_height_max?: number[];
    wave_direction_dominant?: number[];
    wave_period_max?: number[];
    wind_wave_height_max?: number[];
    swell_wave_height_max?: number[];
    sea_surface_temperature_max?: number[];
  };
  daily_units?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════
// PROCESSED / INTERNAL WEATHER TYPES
// ═══════════════════════════════════════════════════════════════════

/** Weather severity classification */
export type WeatherSeverity = "calm" | "moderate" | "rough" | "severe";

/** Beaufort scale approximation from wave height */
export function classifySeaState(waveHeightM: number): WeatherSeverity {
  if (waveHeightM < 1.0) return "calm";
  if (waveHeightM < 2.5) return "moderate";
  if (waveHeightM < 4.0) return "rough";
  return "severe";
}

/** Severity color mapping */
export const SEVERITY_CONFIG: Record<WeatherSeverity, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  markerColor: string;
  description: string;
}> = {
  calm: {
    label: "Calm",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    markerColor: "#22c55e",
    description: "Seas < 1.0m — Favorable conditions",
  },
  moderate: {
    label: "Moderate",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    markerColor: "#f59e0b",
    description: "Seas 1.0–2.5m — Normal operations",
  },
  rough: {
    label: "Rough",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    markerColor: "#f97316",
    description: "Seas 2.5–4.0m — Reduced speed advised",
  },
  severe: {
    label: "Severe",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    markerColor: "#ef4444",
    description: "Seas > 4.0m — Hazardous conditions",
  },
};

/** Processed weather data for a single waypoint/location */
export interface WaypointWeather {
  latitude: number;
  longitude: number;
  /** Current / nearest hour data */
  current: {
    waveHeight: number;       // meters
    waveDirection: number;    // degrees
    wavePeriod: number;       // seconds
    windWaveHeight: number;   // meters
    swellWaveHeight: number;  // meters
    swellWaveDirection: number; // degrees
    swellWavePeriod: number;  // seconds
    oceanCurrentVelocity: number; // m/s
    oceanCurrentDirection: number; // degrees
    seaSurfaceTemperature: number; // °C
    severity: WeatherSeverity;
  };
  /** Hourly forecast arrays */
  hourly: {
    time: string[];
    waveHeight: number[];
    waveDirection: number[];
    wavePeriod: number[];
    swellWaveHeight: number[];
    seaSurfaceTemperature: number[];
  };
  /** Daily summary */
  daily?: {
    time: string[];
    waveHeightMax: number[];
    swellWaveHeightMax: number[];
    seaSurfaceTemperatureMax: number[];
  };
}

/** Aggregated weather along an entire route */
export interface RouteWeatherSummary {
  /** Weather at sampled waypoints along the route */
  waypoints: WaypointWeather[];
  /** Worst conditions along the route */
  worstConditions: {
    maxWaveHeight: number;
    maxSwellHeight: number;
    severity: WeatherSeverity;
    location: { lat: number; lon: number };
  };
  /** Average conditions */
  averageConditions: {
    avgWaveHeight: number;
    avgSwellHeight: number;
    avgSeaTemp: number;
    overallSeverity: WeatherSeverity;
  };
  /** Weather advisories generated from the data */
  advisories: WeatherAdvisory[];
  /** Timestamp of the fetch */
  fetchedAt: string;
}

/** Weather advisory message */
export interface WeatherAdvisory {
  severity: WeatherSeverity;
  message: string;
  /** Which leg or segment this advisory applies to */
  legIndex?: number;
  /** Location of concern */
  location?: { lat: number; lon: number };
}

// ═══════════════════════════════════════════════════════════════════
// API REQUEST TYPES
// ═══════════════════════════════════════════════════════════════════

/** Parameters for the /api/weather endpoint */
export interface WeatherApiParams {
  /** Comma-separated latitudes */
  lat: string;
  /** Comma-separated longitudes */
  lon: string;
  /** Start date (YYYY-MM-DD) — optional, defaults to today */
  start_date?: string;
  /** End date (YYYY-MM-DD) — optional, defaults to 7 days out */
  end_date?: string;
  /** Number of forecast days (1-16), alternative to start/end dates */
  forecast_days?: string;
}

/** Direction labels from degrees */
export function degreesToCompass(deg: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                       "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}
