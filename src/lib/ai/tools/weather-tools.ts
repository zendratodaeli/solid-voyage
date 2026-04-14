/**
 * Weather Tools for AI Copilot
 *
 * Provides weather data for maritime locations using the Open-Meteo API
 * (free, no API key required). Compatible with AI SDK v6.
 */

import { tool } from "ai";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════

const weatherLocationSchema = z.object({
  latitude: z.number().describe("Latitude of the location"),
  longitude: z.number().describe("Longitude of the location"),
  locationName: z.string().optional().describe("Human-readable name of the location (e.g. 'Rotterdam Port', 'Suez Canal')"),
});

const weatherByPortSchema = z.object({
  portName: z.string().describe("Name of the port or maritime location (e.g. 'Rotterdam', 'Singapore', 'Houston')"),
});

// ═══════════════════════════════════════════════════════════════════
// PORT COORDINATES LOOKUP — DB-backed with static fallback
// ═══════════════════════════════════════════════════════════════════

// Static fallback for key waterways (not in port DB)
const WATERWAY_COORDS: Record<string, { lat: number; lon: number }> = {
  "SUEZ CANAL": { lat: 30.4586, lon: 32.3498 },
  "PANAMA CANAL": { lat: 9.0800, lon: -79.6800 },
  "STRAIT OF GIBRALTAR": { lat: 35.9610, lon: -5.5120 },
  "STRAIT OF MALACCA": { lat: 2.5000, lon: 101.5000 },
  "STRAIT OF HORMUZ": { lat: 26.5667, lon: 56.2500 },
  "CAPE OF GOOD HOPE": { lat: -34.3568, lon: 18.4740 },
  "BOSPHORUS": { lat: 41.1191, lon: 29.0764 },
  "DOVER STRAIT": { lat: 51.0500, lon: 1.5000 },
};

/** Cached port lookup map — loaded once from DB, then reused */
let portCoordsCache: Record<string, { lat: number; lon: number }> | null = null;
let portCoordsLoading: Promise<void> | null = null;

async function ensurePortCoords(): Promise<Record<string, { lat: number; lon: number }>> {
  if (portCoordsCache) return portCoordsCache;

  // Prevent concurrent fetches
  if (!portCoordsLoading) {
    portCoordsLoading = (async () => {
      try {
        // Use internal import for server-side Prisma access
        const { prisma } = await import("@/lib/prisma");
        const ports = await prisma.port.findMany({
          where: { isActive: true },
          select: { name: true, alternateName: true, latitude: true, longitude: true },
        });

        const map: Record<string, { lat: number; lon: number }> = {};
        for (const p of ports) {
          map[p.name.toUpperCase()] = { lat: p.latitude, lon: p.longitude };
          // Also index alternate names
          if (p.alternateName) {
            for (const alt of p.alternateName.split(";")) {
              const trimmed = alt.trim().toUpperCase();
              if (trimmed) map[trimmed] = { lat: p.latitude, lon: p.longitude };
            }
          }
        }

        // Merge waterways
        Object.assign(map, WATERWAY_COORDS);
        portCoordsCache = map;
        console.log(`[weather-tools] Loaded ${ports.length} ports from DB for weather lookups`);
      } catch (err) {
        console.warn("[weather-tools] DB port fetch failed, using waterways only:", err);
        portCoordsCache = { ...WATERWAY_COORDS };
      }
    })();
  }

  await portCoordsLoading;
  return portCoordsCache!;
}

async function findPortCoords(portName: string): Promise<{ lat: number; lon: number } | null> {
  const coords = await ensurePortCoords();
  const upper = portName.toUpperCase().trim();
  // Direct match
  if (coords[upper]) return coords[upper];
  // Partial match (check both directions)
  const key = Object.keys(coords).find((k) => k.includes(upper) || upper.includes(k));
  return key ? coords[key] : null;
}

// ═══════════════════════════════════════════════════════════════════
// OPEN-METEO API HELPERS
// ═══════════════════════════════════════════════════════════════════

interface WeatherData {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  waveHeight: number;
  weatherCode: number;
  humidity: number;
  visibility: number;
  pressure: number;
}

interface ForecastDay {
  date: string;
  tempMax: number;
  tempMin: number;
  windSpeedMax: number;
  windGustsMax: number;
  waveHeightMax: number;
  weatherCode: number;
  precipitationSum: number;
}

function describeWeatherCode(code: number): string {
  const codes: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
  };
  return codes[code] || `Weather code ${code}`;
}

function beaufortScale(windKmh: number): { force: number; description: string } {
  if (windKmh < 1) return { force: 0, description: "Calm" };
  if (windKmh < 6) return { force: 1, description: "Light air" };
  if (windKmh < 12) return { force: 2, description: "Light breeze" };
  if (windKmh < 20) return { force: 3, description: "Gentle breeze" };
  if (windKmh < 29) return { force: 4, description: "Moderate breeze" };
  if (windKmh < 39) return { force: 5, description: "Fresh breeze" };
  if (windKmh < 50) return { force: 6, description: "Strong breeze" };
  if (windKmh < 62) return { force: 7, description: "Near gale" };
  if (windKmh < 75) return { force: 8, description: "Gale" };
  if (windKmh < 89) return { force: 9, description: "Strong gale" };
  if (windKmh < 103) return { force: 10, description: "Storm" };
  if (windKmh < 118) return { force: 11, description: "Violent storm" };
  return { force: 12, description: "Hurricane force" };
}

async function fetchMarineWeather(lat: number, lon: number): Promise<{
  current: WeatherData;
  forecast: ForecastDay[];
  seaCondition: string;
  beaufort: { force: number; description: string };
}> {
  // Fetch current weather + marine data from Open-Meteo (free, no API key)
  const currentUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure&daily=temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum&forecast_days=5&timezone=UTC`;
  
  // Marine forecast (wave data)
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height&daily=wave_height_max&forecast_days=5&timezone=UTC`;

  const [weatherRes, marineRes] = await Promise.allSettled([
    fetch(currentUrl).then((r) => r.json()),
    fetch(marineUrl).then((r) => r.json()),
  ]);

  const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
  const marine = marineRes.status === "fulfilled" ? marineRes.value : null;

  const windSpeed = weather?.current?.wind_speed_10m ?? 0;
  const waveHeight = marine?.current?.wave_height ?? 0;
  const bf = beaufortScale(windSpeed);

  // Sea state assessment
  let seaCondition = "Calm";
  if (waveHeight > 6) seaCondition = "Very rough — DANGEROUS for navigation";
  else if (waveHeight > 4) seaCondition = "Rough — exercise caution";
  else if (waveHeight > 2.5) seaCondition = "Moderate — some swell expected";
  else if (waveHeight > 1) seaCondition = "Slight — normal conditions";

  const current: WeatherData = {
    temperature: weather?.current?.temperature_2m ?? 0,
    windSpeed,
    windDirection: weather?.current?.wind_direction_10m ?? 0,
    windGusts: weather?.current?.wind_gusts_10m ?? 0,
    waveHeight,
    weatherCode: weather?.current?.weather_code ?? 0,
    humidity: weather?.current?.relative_humidity_2m ?? 0,
    visibility: 10, // Open-Meteo doesn't provide visibility in free tier
    pressure: weather?.current?.surface_pressure ?? 1013,
  };

  const forecast: ForecastDay[] = (weather?.daily?.time || []).map((date: string, i: number) => ({
    date,
    tempMax: weather.daily.temperature_2m_max?.[i] ?? 0,
    tempMin: weather.daily.temperature_2m_min?.[i] ?? 0,
    windSpeedMax: weather.daily.wind_speed_10m_max?.[i] ?? 0,
    windGustsMax: weather.daily.wind_gusts_10m_max?.[i] ?? 0,
    waveHeightMax: marine?.daily?.wave_height_max?.[i] ?? 0,
    weatherCode: weather.daily.weather_code?.[i] ?? 0,
    precipitationSum: weather.daily.precipitation_sum?.[i] ?? 0,
  }));

  return { current, forecast, seaCondition, beaufort: bf };
}

// ═══════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════

export const weatherTools = {
  getWeatherAtLocation: tool({
    description:
      "Get current weather and 5-day marine forecast for a specific latitude/longitude. " +
      "Includes wind speed, wave height, sea state, Beaufort scale, and maritime safety assessment. " +
      "Use this for precise locations or vessel positions.",
    inputSchema: weatherLocationSchema,
    execute: async (input: z.infer<typeof weatherLocationSchema>) => {
      try {
        const data = await fetchMarineWeather(input.latitude, input.longitude);
        return {
          location: input.locationName || `${input.latitude.toFixed(2)}°N, ${input.longitude.toFixed(2)}°E`,
          coordinates: { latitude: input.latitude, longitude: input.longitude },
          current: {
            condition: describeWeatherCode(data.current.weatherCode),
            temperature: `${data.current.temperature}°C`,
            temperatureC: data.current.temperature,
            windSpeed: `${data.current.windSpeed} km/h (${(data.current.windSpeed * 0.54).toFixed(1)} knots)`,
            windSpeedKmh: data.current.windSpeed,
            windDirection: `${data.current.windDirection}°`,
            windDirectionDeg: data.current.windDirection,
            windGusts: `${data.current.windGusts} km/h`,
            beaufortForce: data.beaufort.force,
            beaufortDescription: data.beaufort.description,
            waveHeight: `${data.current.waveHeight} m`,
            waveHeightM: data.current.waveHeight,
            seaCondition: data.seaCondition,
            humidity: data.current.humidity,
            visibility: 10,
            pressure: data.current.pressure,
          },
          forecast: data.forecast.map((d) => ({
            date: d.date,
            condition: describeWeatherCode(d.weatherCode),
            tempRange: `${d.tempMin}°C — ${d.tempMax}°C`,
            tempMin: d.tempMin,
            tempMax: d.tempMax,
            maxWindSpeed: `${d.windSpeedMax} km/h (${(d.windSpeedMax * 0.54).toFixed(1)} kn)`,
            maxWindGusts: `${d.windGustsMax} km/h`,
            windSpeedMaxKmh: d.windSpeedMax,
            beaufortMax: beaufortScale(d.windSpeedMax),
            maxWaveHeight: `${d.waveHeightMax} m`,
            waveHeightMaxM: d.waveHeightMax,
            precipitation: `${d.precipitationSum} mm`,
            precipitationMm: d.precipitationSum,
          })),
          safetyAssessment: data.beaufort.force >= 8
            ? "⚠️ GALE WARNING — Consider delaying departure or altering course"
            : data.beaufort.force >= 6
              ? "⚠️ Strong winds expected — monitor conditions closely"
              : data.current.waveHeight > 3
                ? "⚠️ Significant wave height — secure cargo and reduce speed"
                : "✅ Conditions within safe operating limits",
        };
      } catch (error) {
        return {
          error: `Failed to fetch weather data: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  }),

  getWeatherAtPort: tool({
    description:
      "Get current weather and 5-day marine forecast for a named port or maritime location. " +
      "Supports 3,000+ ports worldwide from the NGA World Port Index database, plus key waterways " +
      "(Suez Canal, Panama Canal, Straits of Malacca/Hormuz/Gibraltar). " +
      "Use this when the user asks 'what's the weather in Rotterdam?' or " +
      "'check weather conditions at Singapore'.",
    inputSchema: weatherByPortSchema,
    execute: async (input: z.infer<typeof weatherByPortSchema>) => {
      const coords = await findPortCoords(input.portName);
      if (!coords) {
        const allPorts = await ensurePortCoords();
        return {
          error: `Port "${input.portName}" not found in database (${Object.keys(allPorts).length} ports available). Try using getWeatherAtLocation with exact coordinates, or try a different port name.`,
          availablePorts: Object.keys(allPorts).slice(0, 30),
        };
      }

      try {
        const data = await fetchMarineWeather(coords.lat, coords.lon);
        return {
          port: input.portName,
          coordinates: { latitude: coords.lat, longitude: coords.lon },
          current: {
            condition: describeWeatherCode(data.current.weatherCode),
            temperature: `${data.current.temperature}°C`,
            temperatureC: data.current.temperature,
            windSpeed: `${data.current.windSpeed} km/h (${(data.current.windSpeed * 0.54).toFixed(1)} knots)`,
            windSpeedKmh: data.current.windSpeed,
            windDirection: `${data.current.windDirection}°`,
            windDirectionDeg: data.current.windDirection,
            windGusts: `${data.current.windGusts} km/h`,
            beaufortForce: data.beaufort.force,
            beaufortDescription: data.beaufort.description,
            waveHeight: `${data.current.waveHeight} m`,
            waveHeightM: data.current.waveHeight,
            seaCondition: data.seaCondition,
            humidity: data.current.humidity,
            visibility: 10,
            pressure: data.current.pressure,
          },
          forecast: data.forecast.map((d) => ({
            date: d.date,
            condition: describeWeatherCode(d.weatherCode),
            tempRange: `${d.tempMin}°C — ${d.tempMax}°C`,
            tempMin: d.tempMin,
            tempMax: d.tempMax,
            maxWindSpeed: `${d.windSpeedMax} km/h (${(d.windSpeedMax * 0.54).toFixed(1)} kn)`,
            windSpeedMaxKmh: d.windSpeedMax,
            maxWaveHeight: `${d.waveHeightMax} m`,
            waveHeightMaxM: d.waveHeightMax,
            precipitation: `${d.precipitationSum} mm`,
            precipitationMm: d.precipitationSum,
          })),
          safetyAssessment: data.beaufort.force >= 8
            ? "⚠️ GALE WARNING — Consider delaying departure or altering course"
            : data.beaufort.force >= 6
              ? "⚠️ Strong winds expected — monitor conditions closely"
              : data.current.waveHeight > 3
                ? "⚠️ Significant wave height — secure cargo and reduce speed"
                : "✅ Conditions within safe operating limits",
        };
      } catch (error) {
        return {
          error: `Failed to fetch weather for ${input.portName}: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  }),
};
