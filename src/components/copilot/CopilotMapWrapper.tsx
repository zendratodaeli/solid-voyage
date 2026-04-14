"use client";

/**
 * CopilotMapWrapper — Lightweight Leaflet map for chat bubbles.
 *
 * Simplified version of MaritimeMap optimized for inline rendering
 * within the copilot chat stream. Supports:
 * - Dark CartoDB tiles + OpenSeaMap overlay
 * - Vessel markers with rotation
 * - Route polylines
 * - Auto-fit bounds
 * - Compact mode for sidebar panel
 */

import { useEffect, useRef, type ReactNode } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";

// ═══════════════════════════════════════════════════════════════════
// LEAFLET CSS LOADER
// ═══════════════════════════════════════════════════════════════════

function LeafletCSS() {
  useEffect(() => {
    if (document.querySelector('link[href*="leaflet@1.9.4"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);
  }, []);
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// ROTATED MARKER SCRIPT LOADER
// ═══════════════════════════════════════════════════════════════════

function RotatedMarkerScript() {
  useEffect(() => {
    if (document.querySelector('script[src*="leaflet-rotatedMarker"]')) return;
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet-rotatedmarker@0.2.0/leaflet.rotatedMarker.js";
    document.head.appendChild(script);
  }, []);
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// VESSEL SHIP ICON
// ═══════════════════════════════════════════════════════════════════

export function createShipIcon(color = "#3b82f6"): L.DivIcon {
  return L.divIcon({
    className: "copilot-ship-marker",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    html: `<div style="
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
    ">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L6 18H18L12 2Z" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="12" cy="14" r="2" fill="white"/>
      </svg>
    </div>`,
  });
}

export function createPortIcon(): L.DivIcon {
  return L.divIcon({
    className: "copilot-port-marker",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
    html: `<div style="
      width: 20px; height: 20px; border-radius: 50%;
      background: #f59e0b; border: 2px solid white;
      box-shadow: 0 0 6px rgba(0,0,0,0.3);
    "></div>`,
  });
}

// ═══════════════════════════════════════════════════════════════════
// AUTO-FIT BOUNDS HELPER
// ═══════════════════════════════════════════════════════════════════

function FitBounds({ bounds, padding = 40 }: { bounds: L.LatLngBoundsExpression; padding?: number }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [padding, padding], maxZoom: 12 });
    }
  }, [map, bounds, padding]);
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// VESSEL MARKER WITH ROTATION
// ═══════════════════════════════════════════════════════════════════

export interface VesselMarkerData {
  lat: number;
  lon: number;
  heading?: number | null;
  name: string;
  speed?: number | null;
  destination?: string | null;
  color?: string;
}

function VesselMarkers({ vessels }: { vessels: VesselMarkerData[] }) {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    // Clean up old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    vessels.forEach((v) => {
      if (v.lat == null || v.lon == null) return;
      const icon = createShipIcon(v.color || "#3b82f6");
      const marker = L.marker([v.lat, v.lon], {
        icon,
        rotationAngle: v.heading ?? 0,
        rotationOrigin: "center center",
      } as any);

      const popupHtml = `
        <div style="font-family: system-ui; font-size: 12px; min-width: 140px;">
          <div style="font-weight: 700; margin-bottom: 4px;">${v.name}</div>
          ${v.speed != null ? `<div>Speed: ${v.speed} kn</div>` : ""}
          ${v.destination ? `<div>→ ${v.destination}</div>` : ""}
        </div>
      `;
      marker.bindPopup(popupHtml, {
        className: "copilot-map-popup",
        closeButton: false,
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [map, vessels]);

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export interface CopilotMapProps {
  /** Map center */
  center?: [number, number];
  /** Zoom level */
  zoom?: number;
  /** Bounds to fit */
  bounds?: [[number, number], [number, number]];
  /** Height in pixels */
  height?: number;
  /** Vessel markers */
  vessels?: VesselMarkerData[];
  /** Route polyline coordinates [[lat,lon], ...] */
  routeCoords?: [number, number][];
  /** Route segments with zone type for coloring */
  routeSegments?: Array<{
    coords: [number, number][];
    type: "open_sea" | "seca" | "canal" | "hra";
  }>;
  /** Children (additional markers, etc.) */
  children?: ReactNode;
}

export default function CopilotMapWrapper({
  center,
  zoom = 4,
  bounds,
  height = 280,
  vessels = [],
  routeCoords,
  routeSegments,
  children,
}: CopilotMapProps) {
  // Auto-calculate bounds from vessels if not provided
  const autoBounds = (() => {
    if (bounds) return bounds;
    const points: [number, number][] = [];
    vessels.forEach((v) => {
      if (v.lat != null && v.lon != null) points.push([v.lat, v.lon]);
    });
    if (routeCoords) points.push(...routeCoords);
    if (routeSegments) routeSegments.forEach((s) => points.push(...s.coords));
    if (points.length === 0) return undefined;
    if (points.length === 1) {
      return [
        [points[0][0] - 2, points[0][1] - 3],
        [points[0][0] + 2, points[0][1] + 3],
      ] as [[number, number], [number, number]];
    }
    const lats = points.map((p) => p[0]);
    const lons = points.map((p) => p[1]);
    return [
      [Math.min(...lats) - 1, Math.min(...lons) - 1],
      [Math.max(...lats) + 1, Math.max(...lons) + 1],
    ] as [[number, number], [number, number]];
  })();

  const SEGMENT_COLORS: Record<string, string> = {
    open_sea: "#3b82f6",
    seca: "#f59e0b",
    canal: "#a855f7",
    hra: "#ef4444",
  };

  return (
    <div className="rounded-xl overflow-hidden border border-border/30" style={{ height }}>
      <LeafletCSS />
      <RotatedMarkerScript />
      <MapContainer
        center={center || [25, 0]}
        zoom={zoom}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
        className="w-full h-full"
        style={{ height: "100%", background: "#1a1a2e" }}
        attributionControl={false}
        zoomControl={true}
      >
        {/* CartoDB Dark tiles */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {/* OpenSeaMap overlay */}
        <TileLayer
          url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
          opacity={0.7}
        />

        {/* Auto-fit bounds */}
        {autoBounds && <FitBounds bounds={autoBounds} />}

        {/* Vessel markers */}
        {vessels.length > 0 && <VesselMarkers vessels={vessels} />}

        {/* Simple route polyline */}
        {routeCoords && routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.8 }}
          />
        )}

        {/* Segmented route polylines */}
        {routeSegments?.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg.coords}
            pathOptions={{
              color: SEGMENT_COLORS[seg.type] || "#3b82f6",
              weight: 3,
              opacity: 0.9,
              dashArray: seg.type === "seca" ? "8, 4" : undefined,
            }}
          />
        ))}

        {/* Custom children */}
        {children}
      </MapContainer>
    </div>
  );
}
