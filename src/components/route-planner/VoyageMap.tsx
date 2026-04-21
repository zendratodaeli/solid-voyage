"use client";

/**
 * Voyage Map Component
 * 
 * Displays voyage route with zone-colored segments,
 * port markers, and ECA/HRA zones on a MaritimeMap.
 */

import { useEffect, useState, useMemo } from "react";
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

/** A point in the vessel's tracking trail */
export interface TrailPoint {
  lat: number;
  lon: number;
  timestamp: string;
  /** Distance from planned route in nautical miles */
  deviationNm: number;
  /** Status derived from deviation */
  status: "on-route" | "minor-deviation" | "off-route";
}

/** Current vessel position for map display */
export interface VesselMapPosition {
  lat: number;
  lon: number;
  heading?: number;
  name?: string;
  speed?: number;
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
  /** Live vessel position (ship icon on map) */
  vesselPosition?: VesselMapPosition | null;
  /** Vessel tracking trail (color-coded polyline) */
  vesselTrail?: TrailPoint[];
  /** Whether live tracking is active (enables pulsing animation) */
  isLiveTracking?: boolean;
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

/** Trail segment colors based on deviation status */
const TRAIL_COLORS = {
  "on-route": "#22c55e",       // Green
  "minor-deviation": "#f59e0b", // Amber/Orange
  "off-route": "#ef4444",       // Red
} as const;

export function VoyageMap({ waypoints, result, className, weatherPoints, alternativeRoutes, onMapClick, onMapRightClick, clickModeLabel, vesselPosition, vesselTrail, isLiveTracking }: VoyageMapProps) {
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

  // Create vessel ship icon
  const createVesselIcon = (heading = 0) => {
    if (!L) return undefined;
    const pulseClass = isLiveTracking ? 'animation: pulse 2s infinite;' : '';
    const vesselHtml = `
      <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,0.15);${pulseClass}"></div>
        <div style="transform:rotate(${heading}deg);width:28px;height:28px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#3b82f6" stroke="white" stroke-width="1.5">
            <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
            <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/>
            <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>
            <path d="M12 2v3"/>
          </svg>
        </div>
      </div>
    `;
    return L.divIcon({
      html: vesselHtml,
      className: "vessel-marker",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  };

  // Build color-segmented trail from trail points
  const trailSegments = useMemo(() => {
    if (!vesselTrail || vesselTrail.length < 2) return [];
    const segments: Array<{ positions: [number, number][]; status: TrailPoint["status"]; color: string }> = [];
    let currentSegment: { positions: [number, number][]; status: TrailPoint["status"]; color: string } = {
      positions: [[vesselTrail[0].lat, vesselTrail[0].lon]],
      status: vesselTrail[0].status,
      color: TRAIL_COLORS[vesselTrail[0].status],
    };

    for (let i = 1; i < vesselTrail.length; i++) {
      const point = vesselTrail[i];
      if (point.status !== currentSegment.status) {
        // End current segment with this point (for continuity)
        currentSegment.positions.push([point.lat, point.lon]);
        segments.push(currentSegment);
        // Start new segment
        currentSegment = {
          positions: [[point.lat, point.lon]],
          status: point.status,
          color: TRAIL_COLORS[point.status],
        };
      } else {
        currentSegment.positions.push([point.lat, point.lon]);
      }
    }
    segments.push(currentSegment);
    return segments;
  }, [vesselTrail]);

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
      {(vesselPosition || (vesselTrail && vesselTrail.length > 0)) && (
        <>
          <div className="border-t border-border/30 my-1" />
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vessel Tracking</div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-[10px]">Vessel Position</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0 border-t-2" style={{ borderColor: TRAIL_COLORS["on-route"] }} />
            <span className="text-[10px]">On Route</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0 border-t-2" style={{ borderColor: TRAIL_COLORS["minor-deviation"] }} />
            <span className="text-[10px]">Minor Deviation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0 border-t-2" style={{ borderColor: TRAIL_COLORS["off-route"] }} />
            <span className="text-[10px]">Off Route</span>
          </div>
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

        {/* ═══ LIVE VESSEL TRACKING ═══ */}

        {/* Vessel Trail — Color-coded polyline segments */}
        {trailSegments.map((seg, i) => (
          <Polyline
            key={`trail-seg-${i}`}
            positions={seg.positions}
            pathOptions={{
              color: seg.color,
              weight: 4,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
            }}
          >
            <Tooltip sticky>
              <div style={{ fontSize: '12px', fontWeight: 500 }}>
                {seg.status === "on-route" ? "✅ On Route" : seg.status === "minor-deviation" ? "⚠️ Minor Deviation" : "🔴 Off Route"}
              </div>
            </Tooltip>
          </Polyline>
        ))}

        {/* Vessel Icon — ship marker at current position */}
        {vesselPosition && (
          <Marker
            position={[vesselPosition.lat, vesselPosition.lon]}
            icon={createVesselIcon(vesselPosition.heading)}
          >
            <Popup>
              <div style={{ minWidth: '160px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                  ⛴️ {vesselPosition.name || "Vessel"}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  {vesselPosition.lat.toFixed(4)}°N, {vesselPosition.lon.toFixed(4)}°E
                </div>
                {vesselPosition.speed !== undefined && (
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    Speed: {vesselPosition.speed.toFixed(1)} kn
                  </div>
                )}
                {isLiveTracking && (
                  <div style={{ fontSize: '10px', color: '#3b82f6', marginTop: '4px', fontWeight: 500 }}>
                    ● LIVE TRACKING
                  </div>
                )}
              </div>
            </Popup>
            <Tooltip direction="top" offset={[0, -20]} permanent={isLiveTracking}>
              <span style={{ fontSize: '11px', fontWeight: 500 }}>
                {vesselPosition.name || "Vessel"}
                {isLiveTracking && " 🔴"}
              </span>
            </Tooltip>
          </Marker>
        )}
      </MaritimeMap>
    </div>
  );
}
