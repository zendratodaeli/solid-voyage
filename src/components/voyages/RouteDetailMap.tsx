"use client";

/**
 * RouteDetailMap — Lightweight route visualization for the Voyage Detail page.
 * 
 * Renders stored route geometry (from useVoyageAutoRoute) as colored polylines
 * on a MaritimeMap, with port markers extracted from the leg data.
 * 
 * Unlike VoyageMap (used in the Route Planner), this component works with the
 * simplified data stored in voyageLegs.routeIntelligence.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { segmentRouteByZone, ZONE_COLORS, ZONE_LABELS } from "@/lib/route-zone-classifier";
import { LegendItem } from "@/components/map/LegendItem";

const Polyline = dynamic(
  () => import("react-leaflet").then((mod) => mod.Polyline),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((mod) => mod.Tooltip),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false }
);

const MaritimeMap = dynamic(
  () => import("@/components/map/MaritimeMap"),
  { ssr: false }
);

interface RouteLeg {
  from: string;
  to: string;
  distanceNm: number;
  condition: "ballast" | "laden";
  ecaDistanceNm?: number;
  hraDistanceNm?: number;
  geometry: [number, number][];
}

interface RouteDetailMapProps {
  /** Per-leg coordinate arrays: [number, number][][] */
  routeGeometry: [number, number][][];
  /** Leg metadata for tooltips and markers */
  legs?: RouteLeg[];
  /** Route label to display */
  routeLabel?: string;
  /** Total distance */
  totalDistanceNm?: number;
  /** CSS class for the container */
  className?: string;
}

export function RouteDetailMap({
  routeGeometry,
  legs,
  routeLabel,
  totalDistanceNm,
  className = "h-[350px]",
}: RouteDetailMapProps) {
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    import("leaflet").then((leaflet) => {
      setL(leaflet.default);
      setMapReady(true);
    });
  }, []);

  // Compute center from all coordinates
  const allCoords = routeGeometry.flat();
  const center: [number, number] = allCoords.length > 0
    ? [
        allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length, // lat
        allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length, // lon
      ]
    : [30, 0];

  // Extract unique port locations for markers (first and last coord of each leg)
  const portMarkers: { name: string; lat: number; lon: number; type: "start" | "mid" | "end" }[] = [];
  if (legs && legs.length > 0) {
    legs.forEach((leg, i) => {
      const coords = routeGeometry[i];
      if (!coords || coords.length === 0) return;
      const startCoord = coords[0];
      const endCoord = coords[coords.length - 1];

      if (i === 0) {
        portMarkers.push({ name: leg.from, lat: startCoord[1], lon: startCoord[0], type: "start" });
      }
      portMarkers.push({
        name: leg.to,
        lat: endCoord[1],
        lon: endCoord[0],
        type: i === legs.length - 1 ? "end" : "mid",
      });
    });
  }

  const createIcon = (color: string, size: "sm" | "lg") => {
    if (!L) return undefined;
    const px = size === "lg" ? 20 : 14;
    return L.divIcon({
      html: `<div style="background:${color};width:${px}px;height:${px}px;border-radius:50%;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>`,
      className: "custom-marker",
      iconSize: [px, px],
      iconAnchor: [px / 2, px / 2],
    });
  };

  if (!mapReady) {
    return (
      <div className={`${className} bg-muted/20 rounded-lg flex items-center justify-center`}>
        <div className="text-muted-foreground text-sm">Loading map...</div>
      </div>
    );
  }

  const legend = (
    <>
      <LegendItem color={ZONE_COLORS.open_sea} label={ZONE_LABELS.open_sea} definitionKey="open_sea" />
      <LegendItem color={ZONE_COLORS.eca} label={ZONE_LABELS.eca} definitionKey="eca" />
      <LegendItem color={ZONE_COLORS.canal} label={ZONE_LABELS.canal} definitionKey="canal" />
      <LegendItem dotClassName="bg-amber-500" label="High Risk Area" definitionKey="hra" />
    </>
  );

  return (
    <div className={`relative rounded-lg overflow-hidden border border-border/50 ${className}`}>
      <MaritimeMap
        center={center}
        zoom={3}
        style={{ background: "#1a1a2e" }}
        legend={legend}
      >
        {/* Route polylines per leg — zone-colored */}
        {routeGeometry.map((legCoords, legIndex) => {
          if (legCoords.length < 2) return null;
          const leg = legs?.[legIndex];

          // Use zone classifier for proper ECA/canal coloring
          const zoneSegments = segmentRouteByZone(legCoords);

          return (
            <div key={`leg-${legIndex}`}>
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
                  {leg && (
                    <Tooltip sticky>
                      <div style={{ fontSize: "12px", fontWeight: 500 }}>
                        {leg.from} → {leg.to}
                      </div>
                      <div style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>
                        {Math.round(leg.distanceNm).toLocaleString()} NM
                        {segment.name ? ` · ${segment.name}` : ""}
                      </div>
                    </Tooltip>
                  )}
                </Polyline>
              ))}
            </div>
          );
        })}

        {/* Port markers */}
        {portMarkers.map((pm, i) => {
          const color = pm.type === "start" ? "#22c55e" : pm.type === "end" ? "#ef4444" : "#eab308";
          const size = pm.type === "start" || pm.type === "end" ? "lg" : "sm";

          return (
            <Marker
              key={`port-${i}`}
              position={[pm.lat, pm.lon]}
              icon={createIcon(color, size)}
            >
              <Popup>
                <div className="font-medium">{pm.name}</div>
              </Popup>
            </Marker>
          );
        })}
      </MaritimeMap>
    </div>
  );
}
