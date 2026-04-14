"use client";

/**
 * useNavApiRoute Hook
 * 
 * React hook for calculating maritime routes using NavAPI
 * Returns route distance, ECA miles breakdown, and geometry for mapping
 */

import { useState, useCallback } from "react";
import type { NavApiPort } from "@/components/route-planner/NavApiPortSearch";

interface RouteResult {
  success: boolean;
  totalDistanceNm: number;
  ecaDistanceNm: number;
  nonEcaDistanceNm: number;
  waypoints: Array<{ lat: number; lon: number }>;
  geometry?: GeoJSON.LineString;
  error?: string;
}

interface UseNavApiRouteReturn {
  calculateRoute: (
    startPort: NavApiPort,
    endPort: NavApiPort,
    options?: { secaAvoidance?: number }
  ) => Promise<RouteResult>;
  isCalculating: boolean;
  result: RouteResult | null;
  error: string | null;
  clearResult: () => void;
}

export function useNavApiRoute(): UseNavApiRouteReturn {
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculateRoute = useCallback(
    async (
      startPort: NavApiPort,
      endPort: NavApiPort,
      options?: { secaAvoidance?: number }
    ): Promise<RouteResult> => {
      setIsCalculating(true);
      setError(null);

      try {
        const response = await fetch("/api/navapi/route", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startPortCode: startPort.portCode,
            endPortCode: endPort.portCode,
            options,
          }),
        });

        const data = await response.json();

        if (!data.success) {
          const errorResult: RouteResult = {
            success: false,
            totalDistanceNm: 0,
            ecaDistanceNm: 0,
            nonEcaDistanceNm: 0,
            waypoints: [],
            error: data.error || "Route calculation failed",
          };
          setResult(errorResult);
          setError(data.error || "Route calculation failed");
          return errorResult;
        }

        const routeResult: RouteResult = {
          success: true,
          totalDistanceNm: data.totalDistanceNm,
          ecaDistanceNm: data.ecaDistanceNm,
          nonEcaDistanceNm: data.nonEcaDistanceNm,
          waypoints: data.waypoints,
          geometry: data.geometry,
        };

        setResult(routeResult);
        return routeResult;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const errorResult: RouteResult = {
          success: false,
          totalDistanceNm: 0,
          ecaDistanceNm: 0,
          nonEcaDistanceNm: 0,
          waypoints: [],
          error: errorMessage,
        };
        setResult(errorResult);
        setError(errorMessage);
        return errorResult;
      } finally {
        setIsCalculating(false);
      }
    },
    []
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    calculateRoute,
    isCalculating,
    result,
    error,
    clearResult,
  };
}

export type { RouteResult };
