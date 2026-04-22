"use client";

/**
 * MapWeatherHover — Shows live weather info when hovering/tapping
 * anywhere on the ocean map.
 *
 * - Listens to Leaflet mousemove events
 * - Debounces by 600ms to avoid excessive API calls
 * - Fetches from Open-Meteo Marine API for the hovered coordinate
 * - Caches results by 0.5° lat/lon grid (~30 NM cells)
 * - Shows a floating tooltip at cursor position
 * - Mobile: fetches weather on long-press (contextmenu fallback)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";

interface WeatherHoverData {
  lat: number;
  lon: number;
  waveHeight: number;
  swellHeight: number;
  seaTemp: number;
  severity: "calm" | "moderate" | "rough" | "severe";
}

/** Round to nearest 0.5° for cache key */
function gridKey(lat: number, lon: number): string {
  return `${(Math.round(lat * 2) / 2).toFixed(1)},${(Math.round(lon * 2) / 2).toFixed(1)}`;
}

function classifySeverity(waveHeight: number): "calm" | "moderate" | "rough" | "severe" {
  if (waveHeight >= 4.0) return "severe";
  if (waveHeight >= 2.5) return "rough";
  if (waveHeight >= 1.0) return "moderate";
  return "calm";
}

/**
 * Simple land detection — checks if a coordinate is likely on land
 * by querying the engine's wave_height. If wave_height is exactly 0
 * or the engine returns no data, it's likely land. We also check
 * sea_surface_temp: if it's 0°C at low latitudes, it's land fill data.
 */
function isLikelyLand(waveHeight: number, seaTemp: number, lat: number): boolean {
  // If wave height is exactly 0 and sea temp is 0, it's land fill
  if (waveHeight === 0 && seaTemp === 0) return true;
  // If at lower latitudes and sea temp is unrealistically 0°C, it's land
  if (Math.abs(lat) < 60 && seaTemp <= 0 && waveHeight < 0.1) return true;
  return false;
}

const SEVERITY_COLORS: Record<string, string> = {
  calm: "#22c55e",
  moderate: "#f59e0b",
  rough: "#f97316",
  severe: "#ef4444",
};

export default function MapWeatherHover() {
  const map = useMap();
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    data: WeatherHoverData;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cache = useRef<Map<string, WeatherHoverData>>(new Map());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchKey = useRef<string>("");

  const fetchWeather = useCallback(async (lat: number, lon: number, containerX: number, containerY: number) => {
    const key = gridKey(lat, lon);

    // Skip if same grid cell
    if (key === lastFetchKey.current && tooltip) return;
    lastFetchKey.current = key;

    // Check cache first
    const cached = cache.current.get(key);
    if (cached) {
      setTooltip({ x: containerX, y: containerY, data: cached });
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const roundedLat = Math.round(lat * 2) / 2;
      const roundedLon = Math.round(lon * 2) / 2;
      // Use NOAA engine /conditions endpoint
      const url = `/api/weather-routing/conditions?lat=${roundedLat}&lon=${roundedLon}`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const data = json.data; // proxy wraps in { success, data: {...} }

      if (!data) throw new Error("No data from engine");

      const waveHeight = data.wave_height_m ?? 0;
      const swellHeight = 0; // /conditions doesn't separate swell — use wave_height_m
      const seaTemp = data.sea_surface_temp_c ?? 0;

      // Skip land areas — engine interpolates from nearest ocean grid cell
      // which gives misleading wave data on inland locations
      if (isLikelyLand(waveHeight, seaTemp, roundedLat) || data.navigability === 0) {
        setTooltip(null);
        return;
      }

      const result: WeatherHoverData = {
        lat: roundedLat,
        lon: roundedLon,
        waveHeight,
        swellHeight,
        seaTemp,
        severity: classifySeverity(waveHeight),
      };

      // Cache it
      cache.current.set(key, result);

      // Only update if still the latest request
      if (!controller.signal.aborted) {
        setTooltip({ x: containerX, y: containerY, data: result });
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        // Silent fail — land areas or API errors just hide tooltip
        setTooltip(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [tooltip]);

  // Listen to mouse events on the map
  useMapEvents({
    mousemove: (e) => {
      // Clear previous debounce
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      // Update tooltip position immediately if we have cached data
      const key = gridKey(e.latlng.lat, e.latlng.lng);
      const cached = cache.current.get(key);
      if (cached) {
        setTooltip({ x: e.containerPoint.x, y: e.containerPoint.y, data: cached });
        lastFetchKey.current = key;
        return;
      }

      // Debounce the API fetch
      debounceTimer.current = setTimeout(() => {
        fetchWeather(e.latlng.lat, e.latlng.lng, e.containerPoint.x, e.containerPoint.y);
      }, 600);
    },
    mouseout: () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setTooltip(null);
      lastFetchKey.current = "";
    },
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  if (!tooltip && !isLoading) return null;

  const { data } = tooltip || {};

  return (
    <div
      style={{
        position: "absolute",
        left: (tooltip?.x ?? 0) + 16,
        top: (tooltip?.y ?? 0) - 40,
        zIndex: 1500,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(15, 23, 42, 0.92)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          borderRadius: 8,
          padding: "8px 12px",
          minWidth: 140,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {isLoading && !data ? (
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Loading weather...</div>
        ) : data ? (
          <>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: SEVERITY_COLORS[data.severity],
              letterSpacing: "0.02em",
            }}>
              {data.waveHeight.toFixed(1)}m waves — {data.severity.charAt(0).toUpperCase() + data.severity.slice(1)}
            </div>
            {data.swellHeight > 0 && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                Swell: {data.swellHeight.toFixed(1)}m
              </div>
            )}
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>
              SST: {data.seaTemp.toFixed(1)}°C
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
