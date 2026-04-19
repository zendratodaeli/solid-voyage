"use client";

import { useState, useCallback } from "react";
import { fetchForecastSeries, type ForecastTimeseries } from "@/lib/weather-routing-client";

interface UseForecastSeriesReturn {
  fetchForecast: (lat: number, lon: number) => Promise<ForecastTimeseries | null>;
  isLoading: boolean;
  data: ForecastTimeseries | null;
  error: string | null;
  clearForecast: () => void;
}

export function useForecastSeries(): UseForecastSeriesReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ForecastTimeseries | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchForecast = useCallback(
    async (lat: number, lon: number): Promise<ForecastTimeseries | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchForecastSeries(lat, lon);
        
        if (!result) {
          setError("Failed to fetch forecast from engine");
          setData(null);
          return null;
        }

        if (!result.success) {
          setError("Forecast data unavailable or engine not ready");
          setData(null);
          return null;
        }

        setData(result);
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error fetching forecast";
        setError(errorMessage);
        setData(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearForecast = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { fetchForecast, isLoading, data, error, clearForecast };
}
