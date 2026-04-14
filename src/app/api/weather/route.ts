/**
 * Weather API Route — Open-Meteo Marine Weather Proxy
 *
 * GET /api/weather?lat=54.32,48.80&lon=10.13,2.35&forecast_days=7
 *
 * Fetches marine weather data from Open-Meteo for given coordinates.
 * Supports multiple waypoints (comma-separated lat/lon).
 */

import { NextRequest, NextResponse } from "next/server";
import type {
  MarineWeatherResponse,
  WaypointWeather,
  RouteWeatherSummary,
  WeatherAdvisory,
} from "@/types/weather";
import { classifySeaState } from "@/types/weather";

const OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

/** Hourly variables to request */
const HOURLY_VARS = [
  "wave_height",
  "wave_direction",
  "wave_period",
  "wind_wave_height",
  "wind_wave_direction",
  "wind_wave_period",
  "swell_wave_height",
  "swell_wave_direction",
  "swell_wave_period",
  "ocean_current_velocity",
  "ocean_current_direction",
  "sea_surface_temperature",
].join(",");

/** Daily variables to request */
const DAILY_VARS = [
  "wave_height_max",
  "wave_direction_dominant",
  "wave_period_max",
  "wind_wave_height_max",
  "swell_wave_height_max",
  "sea_surface_temperature_max",
].join(",");

/**
 * Get the value at the current/nearest hour from hourly arrays.
 * Uses the first entry as a quick approximation when no exact match.
 */
function getCurrentValue(arr: number[] | undefined, fallback = 0): number {
  if (!arr || arr.length === 0) return fallback;
  // The first entries correspond to the nearest forecast hours
  return arr[0] ?? fallback;
}

/**
 * Process raw Open-Meteo response into our internal WaypointWeather structure.
 */
function processResponse(raw: MarineWeatherResponse): WaypointWeather {
  const h = raw.hourly;
  const d = raw.daily;

  const currentWaveHeight = getCurrentValue(h?.wave_height);
  const currentSwellHeight = getCurrentValue(h?.swell_wave_height);

  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    current: {
      waveHeight: currentWaveHeight,
      waveDirection: getCurrentValue(h?.wave_direction),
      wavePeriod: getCurrentValue(h?.wave_period),
      windWaveHeight: getCurrentValue(h?.wind_wave_height),
      swellWaveHeight: currentSwellHeight,
      swellWaveDirection: getCurrentValue(h?.swell_wave_direction),
      swellWavePeriod: getCurrentValue(h?.swell_wave_period),
      oceanCurrentVelocity: getCurrentValue(h?.ocean_current_velocity),
      oceanCurrentDirection: getCurrentValue(h?.ocean_current_direction),
      seaSurfaceTemperature: getCurrentValue(h?.sea_surface_temperature),
      severity: classifySeaState(currentWaveHeight),
    },
    hourly: {
      time: h?.time || [],
      waveHeight: h?.wave_height || [],
      waveDirection: h?.wave_direction || [],
      wavePeriod: h?.wave_period || [],
      swellWaveHeight: h?.swell_wave_height || [],
      seaSurfaceTemperature: h?.sea_surface_temperature || [],
    },
    daily: d
      ? {
          time: d.time || [],
          waveHeightMax: d.wave_height_max || [],
          swellWaveHeightMax: d.swell_wave_height_max || [],
          seaSurfaceTemperatureMax: d.sea_surface_temperature_max || [],
        }
      : undefined,
  };
}

/**
 * Generate weather advisories based on conditions along the route.
 */
function generateAdvisories(waypoints: WaypointWeather[]): WeatherAdvisory[] {
  const advisories: WeatherAdvisory[] = [];

  waypoints.forEach((wp, index) => {
    const { waveHeight, swellWaveHeight, oceanCurrentVelocity } = wp.current;

    if (waveHeight >= 4.0) {
      advisories.push({
        severity: "severe",
        message: `⛔ Severe seas (${waveHeight.toFixed(1)}m waves) at waypoint ${index + 1} — consider route deviation or delay`,
        legIndex: index,
        location: { lat: wp.latitude, lon: wp.longitude },
      });
    } else if (waveHeight >= 2.5) {
      advisories.push({
        severity: "rough",
        message: `⚠️ Rough seas (${waveHeight.toFixed(1)}m waves) at waypoint ${index + 1} — reduced speed advised`,
        legIndex: index,
        location: { lat: wp.latitude, lon: wp.longitude },
      });
    }

    if (swellWaveHeight >= 3.0) {
      advisories.push({
        severity: "rough",
        message: `🌊 Heavy swell (${swellWaveHeight.toFixed(1)}m) at waypoint ${index + 1} — beam seas caution`,
        legIndex: index,
        location: { lat: wp.latitude, lon: wp.longitude },
      });
    }

    if (oceanCurrentVelocity >= 1.5) {
      advisories.push({
        severity: "moderate",
        message: `🔄 Strong current (${oceanCurrentVelocity.toFixed(1)} m/s) at waypoint ${index + 1} — may affect ETA`,
        legIndex: index,
        location: { lat: wp.latitude, lon: wp.longitude },
      });
    }
  });

  return advisories;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const forecastDays = searchParams.get("forecast_days") || "7";

    if (!latParam || !lonParam) {
      return NextResponse.json(
        { success: false, error: "lat and lon parameters are required" },
        { status: 400 }
      );
    }

    // Build Open-Meteo request URL
    const url = new URL(OPEN_METEO_MARINE_URL);
    url.searchParams.set("latitude", latParam);
    url.searchParams.set("longitude", lonParam);
    url.searchParams.set("hourly", HOURLY_VARS);
    url.searchParams.set("daily", DAILY_VARS);
    url.searchParams.set("timezone", "UTC");

    if (startDate && endDate) {
      url.searchParams.set("start_date", startDate);
      url.searchParams.set("end_date", endDate);
    } else {
      url.searchParams.set("forecast_days", forecastDays);
    }

    console.log(`[Weather API] Fetching: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "SolidVision/1.0 (maritime-platform)",
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Weather API] Open-Meteo error:", errorText);
      return NextResponse.json(
        { success: false, error: `Open-Meteo API error: ${response.status}` },
        { status: 502 }
      );
    }

    const rawData = await response.json();

    // Handle single location vs multiple locations
    // Open-Meteo returns an array for multiple coordinates, single object for one
    const isMultipleLocations = Array.isArray(rawData);
    const rawArray: MarineWeatherResponse[] = isMultipleLocations
      ? rawData
      : [rawData];

    // Process each location
    const waypoints: WaypointWeather[] = rawArray.map(processResponse);

    // Calculate route summary
    const allWaveHeights = waypoints.map((w) => w.current.waveHeight);
    const allSwellHeights = waypoints.map((w) => w.current.swellWaveHeight);
    const allSeaTemps = waypoints.map((w) => w.current.seaSurfaceTemperature);

    const maxWaveHeight = Math.max(...allWaveHeights);
    const maxSwellHeight = Math.max(...allSwellHeights);
    const maxWaveWp = waypoints[allWaveHeights.indexOf(maxWaveHeight)];

    const avgWaveHeight =
      allWaveHeights.reduce((a, b) => a + b, 0) / allWaveHeights.length;
    const avgSwellHeight =
      allSwellHeights.reduce((a, b) => a + b, 0) / allSwellHeights.length;
    const avgSeaTemp =
      allSeaTemps.reduce((a, b) => a + b, 0) / allSeaTemps.length;

    const advisories = generateAdvisories(waypoints);

    const summary: RouteWeatherSummary = {
      waypoints,
      worstConditions: {
        maxWaveHeight,
        maxSwellHeight,
        severity: classifySeaState(maxWaveHeight),
        location: {
          lat: maxWaveWp?.latitude ?? 0,
          lon: maxWaveWp?.longitude ?? 0,
        },
      },
      averageConditions: {
        avgWaveHeight: Math.round(avgWaveHeight * 10) / 10,
        avgSwellHeight: Math.round(avgSwellHeight * 10) / 10,
        avgSeaTemp: Math.round(avgSeaTemp * 10) / 10,
        overallSeverity: classifySeaState(avgWaveHeight),
      },
      advisories,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("[Weather API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch weather data" },
      { status: 500 }
    );
  }
}
