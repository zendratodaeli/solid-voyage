"use client";

/**
 * useWeather Hook
 *
 * Manages marine weather state for the route planner.
 * Primary source: NOAA engine via /api/weather-routing/route-forecast
 * Fallback: Open-Meteo via /api/weather (when NOAA engine is offline)
 *
 * The setWeatherData setter lets callers inject pre-computed NOAA
 * summaries directly without triggering an Open-Meteo fetch.
 */

import { useState, useCallback } from "react";
import type { RouteWeatherSummary } from "@/types/weather";

interface UseWeatherReturn {
  fetchWeather: (
    coordinates: Array<{ lat: number; lon: number }>,
    options?: { startDate?: string; endDate?: string; forecastDays?: number }
  ) => Promise<RouteWeatherSummary | null>;
  setWeatherData: (data: RouteWeatherSummary | null) => void;
  isLoading: boolean;
  data: RouteWeatherSummary | null;
  error: string | null;
  clearWeather: () => void;
}

export function useWeather(): UseWeatherReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<RouteWeatherSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Inject a pre-computed weather summary (e.g. from NOAA engine) */
  const setWeatherData = useCallback((summary: RouteWeatherSummary | null) => {
    setData(summary);
    setError(null);
  }, []);

  /** Fallback fetch from Open-Meteo — only called when NOAA engine is offline */
  const fetchWeather = useCallback(
    async (
      coordinates: Array<{ lat: number; lon: number }>,
      options?: { startDate?: string; endDate?: string; forecastDays?: number }
    ): Promise<RouteWeatherSummary | null> => {
      if (coordinates.length === 0) {
        setError("No coordinates provided");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const lats = coordinates.map((c) => c.lat.toFixed(4)).join(",");
        const lons = coordinates.map((c) => c.lon.toFixed(4)).join(",");

        const params = new URLSearchParams();
        params.set("lat", lats);
        params.set("lon", lons);

        if (options?.startDate && options?.endDate) {
          params.set("start_date", options.startDate);
          params.set("end_date", options.endDate);
        } else if (options?.forecastDays) {
          params.set("forecast_days", String(options.forecastDays));
        }

        const response = await fetch(`/api/weather?${params.toString()}`);

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          setError("Weather service temporarily unavailable. Please try again.");
          setData(null);
          return null;
        }

        if (!response.ok) {
          setError(`Weather API error (${response.status})`);
          setData(null);
          return null;
        }
        const result = await response.json();

        if (!result.success) {
          setError(result.error || "Failed to fetch weather data");
          setData(null);
          return null;
        }

        setData(result.data);
        return result.data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error fetching weather";
        setError(errorMessage);
        setData(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearWeather = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return {
    fetchWeather,
    setWeatherData,
    isLoading,
    data,
    error,
    clearWeather,
  };
}
