"use client";

/**
 * Route Weather Overlay Component
 *
 * Renders color-coded circle markers on the Leaflet map
 * at sampled points along a voyage route, showing weather severity.
 */

import dynamic from "next/dynamic";
import type { RouteWeatherSummary } from "@/types/weather";
import { SEVERITY_CONFIG, classifySeaState } from "@/types/weather";

// Dynamically import Leaflet components (no SSR)
const CircleMarker = dynamic(
  () => import("react-leaflet").then((mod) => mod.CircleMarker),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((mod) => mod.Tooltip),
  { ssr: false }
);

interface RouteWeatherOverlayProps {
  weather: RouteWeatherSummary;
}

export function RouteWeatherOverlay({ weather }: RouteWeatherOverlayProps) {
  if (!weather?.waypoints?.length) return null;

  return (
    <>
      {weather.waypoints.map((wp, index) => {
        const severity = classifySeaState(wp.current.waveHeight);
        const config = SEVERITY_CONFIG[severity];

        return (
          <CircleMarker
            key={`weather-${index}`}
            center={[wp.latitude, wp.longitude]}
            radius={7}
            pathOptions={{
              fillColor: config.markerColor,
              fillOpacity: 0.85,
              color: "#fff",
              weight: 2,
              opacity: 0.9,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <div className="text-xs space-y-0.5 min-w-[140px]">
                <div className="font-semibold" style={{ color: config.markerColor }}>
                  {config.label} — {wp.current.waveHeight.toFixed(1)}m waves
                </div>
                <div className="text-gray-600">
                  Swell: {wp.current.swellWaveHeight.toFixed(1)}m
                </div>
                <div className="text-gray-600">
                  Period: {wp.current.wavePeriod.toFixed(1)}s
                </div>
                <div className="text-gray-600">
                  Sea temp: {wp.current.seaSurfaceTemperature.toFixed(1)}°C
                </div>
                {wp.current.oceanCurrentVelocity > 0.1 && (
                  <div className="text-gray-600">
                    Current: {wp.current.oceanCurrentVelocity.toFixed(2)} m/s
                  </div>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
