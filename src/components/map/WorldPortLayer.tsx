"use client";

/**
 * WorldPortLayer — Renders NGA World Port Index ports as interactive
 * CircleMarkers inside a Leaflet MapContainer.
 *
 * Performance design:
 * - Fetches the slimmed WPI dataset once on mount (~300 KB, 3 700 ports).
 * - Only renders markers when zoom ≥ 4.
 * - Viewport-culled: only ports within current map bounds are rendered.
 * - Uses CircleMarker (SVG) instead of Marker (DOM) for speed.
 * - Permanent name labels appear at zoom ≥ 7.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { CircleMarker, Tooltip, Popup, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBounds } from "leaflet";

/** Matches the slim shape from /api/wpi */
interface WpiPort {
  n: number;   // portNumber
  p: string;   // portName (resolved via cross-reference)
  c: string;   // countryName
  y: number;   // lat
  x: number;   // lng
  s: string;   // harborSize V|S|M|L
  u: string | null; // UN/LOCODE
  w: string | null; // water body
  r: string | null; // region
  a: string | null; // alternate names
}

// ── Visual config by harbor size ──
const SIZE_CONFIG: Record<string, { radius: number; color: string; label: string }> = {
  L: { radius: 7, color: "#2dd4bf", label: "Large" },      // teal-400
  M: { radius: 6, color: "#5eead4", label: "Medium" },      // teal-300
  S: { radius: 5, color: "#99f6e4", label: "Small" },       // teal-200
  V: { radius: 4, color: "#99f6e4", label: "Very Small" }, // teal-200
};

const MIN_ZOOM = 4;
const LABEL_ZOOM = 7;

/** Viewport padding in degrees — load a bit beyond visible area */
const PAD = 2;

export default function WorldPortLayer() {
  const map = useMap();
  const [ports, setPorts] = useState<WpiPort[]>([]);
  const [zoom, setZoom] = useState(map.getZoom());
  const [bounds, setBounds] = useState<LatLngBounds>(map.getBounds());

  // Fetch WPI data once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/wpi");
        const data = await res.json();
        if (!cancelled && data.ports) {
          setPorts(data.ports);
        }
      } catch (err) {
        console.error("[WorldPortLayer] Failed to load WPI data:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Track zoom & bounds changes
  const updateView = useCallback(() => {
    setZoom(map.getZoom());
    setBounds(map.getBounds());
  }, [map]);

  useMapEvents({
    zoomend: updateView,
    moveend: updateView,
  });

  // Viewport-culled ports — only those within padded bounds
  const visiblePorts = useMemo(() => {
    if (zoom < MIN_ZOOM || ports.length === 0) return [];

    const south = bounds.getSouth() - PAD;
    const north = bounds.getNorth() + PAD;
    const west = bounds.getWest() - PAD;
    const east = bounds.getEast() + PAD;

    // At low zooms, further filter to only L and M ports
    const sizeFilter = zoom < 6 ? (p: WpiPort) => p.s === "L" || p.s === "M" : () => true;

    return ports.filter(
      (p) =>
        p.y >= south &&
        p.y <= north &&
        p.x >= west &&
        p.x <= east &&
        sizeFilter(p)
    );
  }, [zoom, bounds, ports]);

  // Don't render anything below min zoom
  if (zoom < MIN_ZOOM) return null;

  const showLabels = zoom >= LABEL_ZOOM;

  return (
    <>
      {visiblePorts.map((port) => {
        const cfg = SIZE_CONFIG[port.s] || SIZE_CONFIG.V;
        return (
          <CircleMarker
            key={port.n}
            center={[port.y, port.x]}
            radius={cfg.radius}
            pathOptions={{
              color: cfg.color,
              fillColor: cfg.color,
              fillOpacity: 0.85,
              weight: 1,
              opacity: 0.9,
            }}
          >
            {/* Permanent label at high zoom, hover tooltip otherwise */}
            <Tooltip
              permanent={showLabels}
              direction="right"
              offset={[6, 0]}
              className="port-label-tooltip"
            >
              {port.p}
            </Tooltip>

            {/* Click popup with details */}
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  {port.p}
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
                  {port.c}
                </div>
                {port.u && (
                  <div style={{ fontSize: 11, color: "#888" }}>
                    UN/LOCODE: {port.u}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#888" }}>
                  Harbor: {cfg.label}
                </div>
                {port.r && (
                  <div style={{ fontSize: 11, color: "#888" }}>
                    Region: {port.r}
                  </div>
                )}
                {port.a && (
                  <div style={{ fontSize: 10, color: "#999", marginTop: 3, fontStyle: "italic" }}>
                    Also known as: {port.a}
                  </div>
                )}
                {port.w && (
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>
                    {port.w}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>
                  {port.y.toFixed(4)}°, {port.x.toFixed(4)}°
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
