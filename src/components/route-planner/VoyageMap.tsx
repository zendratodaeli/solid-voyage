"use client";

/**
 * Voyage Map Component
 * 
 * Displays voyage route with zone-colored segments,
 * port markers, and ECA/HRA zones on a MaritimeMap.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { segmentRouteByZone, ZONE_COLORS, ZONE_LABELS } from "@/lib/route-zone-classifier";
import { LegendItem } from "@/components/map/LegendItem";
import type { WeatherSeverity } from "@/types/weather";

// Dynamically import Leaflet components used as children (no SSR)
const Polyline = dynamic(
  () => import("react-leaflet").then((mod) => mod.Polyline),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((mod) => mod.Tooltip),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((mod) => mod.CircleMarker),
  { ssr: false }
);

// Dynamically import MaritimeMap (no SSR — Leaflet requires DOM)
const MaritimeMap = dynamic(
  () => import("@/components/map/MaritimeMap"),
  { ssr: false }
);

// Dynamically import MapWeatherHover (uses react-leaflet hooks — no SSR)
const MapWeatherHover = dynamic(
  () => import("@/components/route-planner/MapWeatherHover"),
  { ssr: false }
);

interface Port {
  id: string;
  name: string;
  locode?: string;
  latitude: number;
  longitude: number;
}

interface Waypoint {
  id: string;
  port: Port | null;
  order: number;
}

interface LegGeometry {
  coordinates: [number, number][];
  ecaSegments: [number, number][][];
  hraSegments: [number, number][][];
}

interface RouteResultData {
  summary?: {
    totalDistanceNm: number;
  };
  legs: Array<{
    geometry: LegGeometry;
    from: { name: string };
    to: { name: string };
    distanceNm?: number;
  }>;
}

interface VoyageMapProps {
  waypoints: Waypoint[];
  result: RouteResultData | null;
  className?: string;
  /** Weather overlay points along route (Phase 2) */
  weatherPoints?: Array<{
    lat: number;
    lon: number;
    severity: WeatherSeverity;
    waveHeightM: number;
    swellHeightM?: number;
  }>;
  /** Alternative routes for multi-route comparison overlay */
  alternativeRoutes?: AlternativeRouteOverlay[];
  /** Called when user clicks on the map (for click-to-fill) */
  onMapClick?: (lat: number, lon: number) => void;
  /** Called when user right-clicks on the map (context menu) */
  onMapRightClick?: (lat: number, lon: number, containerPoint: { x: number; y: number }) => void;
  /** Label shown on map when click-to-fill is active */
  clickModeLabel?: string | null;
}

/** Route variant for multi-route map overlay */
export interface AlternativeRouteOverlay {
  id: string;
  label: string;
  color: string;
  coordinates: [number, number][][]; // Array of leg coordinate arrays [lon,lat]
  distanceNm: number;
}

/** Weather severity colors for map markers */
const WEATHER_MARKER_COLORS: Record<WeatherSeverity, string> = {
  calm: "#22c55e",
  moderate: "#f59e0b",
  rough: "#f97316",
  severe: "#ef4444",
};

/** Multi-route comparison colors */
const ROUTE_VARIANT_COLORS: Record<string, string> = {
  "avoid-canal": "#f97316",    // Orange
  "seca-minimized": "#06b6d4", // Cyan
};

export function VoyageMap({ waypoints, result, className, weatherPoints, alternativeRoutes, onMapClick, onMapRightClick, clickModeLabel }: VoyageMapProps) {
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Load Leaflet on client
  useEffect(() => {
    import("leaflet").then((leaflet) => {
      setL(leaflet.default);
      setMapReady(true);
    });
  }, []);

  // Get ports with coordinates
  const portsWithCoords = waypoints
    .filter((w) => w.port !== null)
    .map((w) => w.port!);

  // Debug: Log leg geometry data
  if (result) {
    console.log("[MAP DEBUG] Received legs:", result.legs.length);
    result.legs.forEach((leg, i) => {
      console.log(`  Leg ${i + 1}: ${leg.from.name} → ${leg.to.name}, coords: ${leg.geometry.coordinates.length}`);
    });
  }

  // Calculate map center and bounds
  const getCenter = (): [number, number] => {
    if (portsWithCoords.length === 0) {
      return [30, 0]; // Default center
    }
    const avgLat =
      portsWithCoords.reduce((sum, p) => sum + p.latitude, 0) /
      portsWithCoords.length;
    const avgLng =
      portsWithCoords.reduce((sum, p) => sum + p.longitude, 0) /
      portsWithCoords.length;
    return [avgLat, avgLng];
  };

  // Create custom icons
  const createIcon = (color: string, isAnchor = false) => {
    if (!L) return undefined;
    
    const iconHtml = isAnchor
      ? `<div style="background:${color};width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" x2="12" y1="22" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>
         </div>`
      : `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>`;

    return L.divIcon({
      html: iconHtml,
      className: "custom-marker",
      iconSize: isAnchor ? [24, 24] : [16, 16],
      iconAnchor: isAnchor ? [12, 12] : [8, 8],
    });
  };

  if (!mapReady) {
    return (
      <div className={`${className} bg-muted flex items-center justify-center`}>
        <div className="text-muted-foreground">Loading map...</div>
      </div>
    );
  }

  // Custom legend items (MaritimeMap provides the positioned container)
  const voyageLegend = (
    <>
      <LegendItem color={ZONE_COLORS.open_sea} label={ZONE_LABELS.open_sea} definitionKey="open_sea" />
      <LegendItem color={ZONE_COLORS.eca} label={ZONE_LABELS.eca} definitionKey="eca" />
      <LegendItem color={ZONE_COLORS.canal} label={ZONE_LABELS.canal} definitionKey="canal" />
      <LegendItem dotClassName="bg-amber-500" label="High Risk Area" definitionKey="hra" />
      {weatherPoints && weatherPoints.length > 0 && (
        <>
          <div className="border-t border-border/30 my-1" />
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Weather</div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: WEATHER_MARKER_COLORS.calm }} />
            <span>Calm (&lt;1m)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: WEATHER_MARKER_COLORS.moderate }} />
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: WEATHER_MARKER_COLORS.rough }} />
            <span>Rough</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: WEATHER_MARKER_COLORS.severe }} />
            <span>Severe (&gt;4m)</span>
          </div>
        </>
      )}
      {alternativeRoutes && alternativeRoutes.length > 0 && (
        <>
          <div className="border-t border-border/30 my-1" />
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Route Variants</div>
          <LegendItem color="#3b82f6" label="Primary Route" />
          {alternativeRoutes.map((alt) => (
            <div key={alt.id} className="flex items-center gap-2">
              <div className="w-4 h-0 border-t-2 border-dashed" style={{ borderColor: alt.color }} />
              <span className="text-[10px]">{alt.label}</span>
            </div>
          ))}
        </>
      )}
    </>
  );

  return (
    <div className={`relative ${className}`}>
      {/* Click-to-Fill Mode Indicator */}
      {clickModeLabel && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] px-4 py-2 rounded-full bg-cyan-500/90 backdrop-blur-md text-white text-sm font-medium shadow-lg animate-pulse flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          Click map to set: {clickModeLabel}
        </div>
      )}
      <MaritimeMap
        center={getCenter()}
        zoom={3}
        style={{ background: "#1a1a2e" }}
        legend={voyageLegend}
        onMapClick={onMapClick}
        onMapRightClick={onMapRightClick}
      >
        {/* Live Weather Hover — shows wave/swell on mouse hover anywhere */}
        <MapWeatherHover />

        {/* Alternative Route Overlays (dashed lines behind primary) */}
        {alternativeRoutes?.map((alt) => (
          alt.coordinates.map((legCoords, legIdx) => {
            if (legCoords.length < 2) return null;
            return (
              <Polyline
                key={`alt-${alt.id}-leg-${legIdx}`}
                positions={legCoords.map(
                  (coord) => [coord[1], coord[0]] as [number, number]
                )}
                pathOptions={{
                  color: alt.color,
                  weight: 3,
                  opacity: 0.6,
                  dashArray: "8, 6",
                }}
              >
                <Tooltip sticky>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>
                    {alt.label}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                    {Math.round(alt.distanceNm).toLocaleString()} NM
                  </div>
                </Tooltip>
              </Polyline>
            );
          })
        ))}

        {/* Primary Route Lines — Zone Colored */}
        {result?.legs.map((leg, legIndex) => {
          // Classify route into zone segments for coloring
          const zoneSegments = segmentRouteByZone(leg.geometry.coordinates);
          const legDistanceNm = leg.distanceNm || 0;
          const totalDistanceNm = result.summary?.totalDistanceNm || legDistanceNm;
          
          return (
            <div key={`leg-${legIndex}-${leg.geometry.coordinates.length}`}>
              {/* Render each zone segment with its color */}
              {zoneSegments.map((segment, segIndex) => (
                <Polyline
                  key={`zone-${legIndex}-${segIndex}`}
                  positions={segment.coordinates.map(
                    (coord) => [coord[1], coord[0]] as [number, number]
                  )}
                  pathOptions={{
                    color: ZONE_COLORS[segment.type],
                    weight: segment.type === "open_sea" ? 3 : 4,
                    opacity: 0.9,
                  }}
                >
                  <Tooltip sticky>
                    <div style={{ fontSize: '12px', fontWeight: 500 }}>
                      {leg.from.name} → {leg.to.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                      {segment.name ? `${segment.name} · ` : ''}
                      {Math.round(totalDistanceNm).toLocaleString()} NM total
                    </div>
                  </Tooltip>
                </Polyline>
              ))}

              {/* HRA segments overlay (Orange) - always on top */}
              {leg.geometry.hraSegments.map((segment, segIndex) => (
                <Polyline
                  key={`hra-${legIndex}-${segIndex}`}
                  positions={segment.map(
                    (coord) => [coord[1], coord[0]] as [number, number]
                  )}
                  pathOptions={{
                    color: "#f59e0b",
                    weight: 5,
                    opacity: 0.9,
                    dashArray: "10, 5",
                  }}
                />
              ))}
            </div>
          );
        })}

        {/* Port Markers */}
        {portsWithCoords.map((port, index) => {
          const isFirst = index === 0;
          const isLast = index === portsWithCoords.length - 1;
          const color = isFirst
            ? "#22c55e"
            : isLast
            ? "#ef4444"
            : "#eab308";

          return (
            <Marker
              key={port.id}
              position={[port.latitude, port.longitude]}
              icon={createIcon(color, isFirst || isLast)}
            >
              <Popup>
                <div className="font-medium">{port.name}</div>
                {port.locode && (
                  <div className="text-xs text-gray-500">{port.locode}</div>
                )}
              </Popup>
            </Marker>
          );
        })}

        {/* Weather Overlay Markers (Phase 2) */}
        {weatherPoints?.map((wp, i) => (
          <CircleMarker
            key={`weather-${i}`}
            center={[wp.lat, wp.lon]}
            radius={7}
            pathOptions={{
              color: WEATHER_MARKER_COLORS[wp.severity],
              fillColor: WEATHER_MARKER_COLORS[wp.severity],
              fillOpacity: 0.7,
              weight: 2,
              opacity: 0.9,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.02em' }}>
                {wp.waveHeightM.toFixed(1)}m waves — {wp.severity.charAt(0).toUpperCase() + wp.severity.slice(1)}
              </div>
              {wp.swellHeightM !== undefined && wp.swellHeightM > 0 && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  Swell: {wp.swellHeightM.toFixed(1)}m
                </div>
              )}
            </Tooltip>
          </CircleMarker>
        ))}
      </MaritimeMap>
    </div>
  );
}
