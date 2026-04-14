"use client";

/**
 * MaritimeMap — Reusable Leaflet map component for all maritime pages.
 *
 * Provides:
 * - CartoDB Voyager base tiles (English labels globally)
 * - OpenSeaMap seamark overlay
 * - ECA / HRA zone polygon overlays with toggle
 * - Configurable zone legend
 * - Map click and map-ready callbacks
 * - Children slot for page-specific markers, polylines, etc.
 */

import { ReactNode, useEffect, useState, lazy, Suspense } from "react";
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  Polygon,
  Tooltip,
} from "react-leaflet";
import type L from "leaflet";
import { Toggle } from "@/components/ui/toggle";
import { Layers, Globe, Anchor } from "lucide-react";
import { LegendItem } from "@/components/map/LegendItem";

// Zone data
import ecaZonesData from "@/data/eca-zones.json";
import hraZonesData from "@/data/hra-zones.json";
import { ZONE_COLORS, ZONE_LABELS } from "@/lib/route-zone-classifier";

// Lazy-load WorldPortLayer (heavy — 3,700 markers)
const WorldPortLayer = lazy(() => import("@/components/map/WorldPortLayer"));

// ── Leaflet CSS loader ──
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

// ── Marine Regions WMS Configuration ──
const MARINE_REGIONS_WMS = "https://geo.vliz.be/geoserver/MarineRegions/wms";

const MARINE_REGIONS_LAYERS = {
  eez: {
    layer: "eez",
    label: "EEZ (200nm)",
    color: "#facc15", // yellow-400 — distinct from all other colors
  },
  territorial: {
    layer: "eez_12nm",
    label: "Territorial Sea (12nm)",
    color: "#a3e635", // lime-400 — green, very distinct
  },
  iho: {
    layer: "iho",
    label: "IHO Sea Areas",
    color: "#c084fc", // purple-400 — distinct violet
  },
} as const;

/**
 * Build inline SLD XML for custom WMS layer styling.
 * GeoServer accepts SLD_BODY to override default polygon styles.
 */
function buildSLD(
  layerName: string,
  color: string,
  fillOpacity: number,
  strokeWidth: number
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<StyledLayerDescriptor version="1.0.0"',
    '  xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd"',
    '  xmlns="http://www.opengis.net/sld"',
    '  xmlns:ogc="http://www.opengis.net/ogc"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <NamedLayer>',
    `    <Name>${layerName}</Name>`,
    '    <UserStyle><FeatureTypeStyle><Rule>',
    '      <PolygonSymbolizer>',
    `        <Fill>`,
    `          <CssParameter name="fill">${color}</CssParameter>`,
    `          <CssParameter name="fill-opacity">${fillOpacity}</CssParameter>`,
    `        </Fill>`,
    `        <Stroke>`,
    `          <CssParameter name="stroke">${color}</CssParameter>`,
    `          <CssParameter name="stroke-width">${strokeWidth}</CssParameter>`,
    `          <CssParameter name="stroke-opacity">0.8</CssParameter>`,
    `        </Stroke>`,
    '      </PolygonSymbolizer>',
    '    </Rule></FeatureTypeStyle></UserStyle>',
    '  </NamedLayer>',
    '</StyledLayerDescriptor>',
  ].join('');
}

// ── Default legend items (no wrapper — MaritimeMap provides the container) ──
function DefaultLegendItems() {
  return (
    <>
      <LegendItem color={ZONE_COLORS.open_sea} label={ZONE_LABELS.open_sea} definitionKey="open_sea" />
      <LegendItem color={ZONE_COLORS.eca} label={ZONE_LABELS.eca} definitionKey="eca" />
      <LegendItem dotClassName="bg-amber-500" label="High Risk Area" definitionKey="hra" />
    </>
  );
}

// ── Marine Regions legend items ──
function MarineRegionsLegendItems() {
  return (
    <>
      <div className="border-t border-border/50 my-1" />
      {Object.values(MARINE_REGIONS_LAYERS).map((lr) => (
        <LegendItem
          key={lr.layer}
          color={lr.color}
          label={lr.label}
          definitionKey={lr.layer}
        />
      ))}
    </>
  );
}

// ── World Ports legend items ──
function PortsLegendItems() {
  return (
    <>
      <div className="border-t border-border/50 my-1" />
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#2dd4bf" }} />
        <span>Large Port</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#5eead4" }} />
        <span>Medium Port</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#99f6e4" }} />
        <span>Small Port</span>
      </div>
      <div className="text-[9px] text-muted-foreground mt-0.5">NGA World Port Index</div>
    </>
  );
}

// ── Props ──
export interface MaritimeMapProps {
  /** Map center — [lat, lng] */
  center?: [number, number];
  /** Initial zoom level */
  zoom?: number;
  /** Leaflet bounds to fit the map to */
  bounds?: [[number, number], [number, number]];
  /** Whether to show ECA/HRA zone overlays (default: true) */
  showZones?: boolean;
  /** Whether to show the zone toggle button (default: true) */
  showZoneToggle?: boolean;
  /** Custom legend node. Pass `null` to hide, omit for default. */
  legend?: ReactNode | null;
  /** Called when the map is clicked */
  onMapClick?: (lat: number, lon: number) => void;
  /** Called when the map is right-clicked (context menu) */
  onMapRightClick?: (lat: number, lon: number, containerPoint: { x: number; y: number }) => void;
  /** Called when the Leaflet map instance is ready */
  onMapReady?: (map: L.Map) => void;
  /** Additional CSS class for the wrapper */
  className?: string;
  /** Map container inline style overrides */
  style?: React.CSSProperties;
  /** Whether to hide the default attribution control (default: false) */
  hideAttribution?: boolean;
  /** Enable worldCopyJump (default: false) */
  worldCopyJump?: boolean;
  /** Show Marine Regions (EEZ/Territorial/IHO) layers initially (default: false) */
  showMarineRegionsInitial?: boolean;
  /** Show World Port Index markers initially (default: false) */
  showPortsInitial?: boolean;
  /** Children rendered inside the MapContainer (markers, polylines, etc.) */
  children?: ReactNode;
}

export default function MaritimeMap({
  center = [25, 0],
  zoom = 3,
  bounds,
  showZones: showZonesInitial = true,
  showZoneToggle = true,
  legend,
  onMapClick,
  onMapRightClick,
  onMapReady,
  className = "",
  style,
  hideAttribution = false,
  worldCopyJump = false,
  showMarineRegionsInitial = false,
  showPortsInitial = false,
  children,
}: MaritimeMapProps) {
  const [showZones, setShowZones] = useState(showZonesInitial);
  const [showMarineRegions, setShowMarineRegions] = useState(showMarineRegionsInitial);
  const [showPorts, setShowPorts] = useState(showPortsInitial);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <LeafletCSS />
      <MapContainer
        center={center}
        zoom={zoom}
        {...(bounds ? { bounds } : {})}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
        className="w-full h-full rounded-lg"
        style={style}
        attributionControl={!hideAttribution}
        worldCopyJump={worldCopyJump}
        ref={(mapInstance) => {
          if (mapInstance && onMapReady) {
            onMapReady(mapInstance as unknown as L.Map);
          }
          if (mapInstance && onMapClick) {
            const map = mapInstance as unknown as L.Map;
            // Avoid duplicate listeners by using a flag
            if (!(map as unknown as Record<string, boolean>).__maritimeMapClickBound) {
              map.on("click", (e: L.LeafletMouseEvent) => {
                onMapClick(e.latlng.lat, e.latlng.lng);
              });
              (map as unknown as Record<string, boolean>).__maritimeMapClickBound = true;
            }
          }
          if (mapInstance && onMapRightClick) {
            const map = mapInstance as unknown as L.Map;
            if (!(map as unknown as Record<string, boolean>).__maritimeMapRightClickBound) {
              map.on("contextmenu", (e: L.LeafletMouseEvent) => {
                e.originalEvent.preventDefault();
                onMapRightClick(e.latlng.lat, e.latlng.lng, e.containerPoint);
              });
              (map as unknown as Record<string, boolean>).__maritimeMapRightClickBound = true;
            }
          }
        }}
      >
        {/* CartoDB Voyager base layer — English labels globally */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          crossOrigin="anonymous"
        />
        {/* OpenSeaMap seamark overlay — nautical symbols */}
        <TileLayer
          attribution='&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>'
          url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
          opacity={1}
          crossOrigin="anonymous"
        />

        {/* Marine Regions WMS layers — authoritative maritime boundaries (VLIZ) */}
        {showMarineRegions && (
          <>
            <WMSTileLayer
              url={MARINE_REGIONS_WMS}
              params={{
                layers: MARINE_REGIONS_LAYERS.eez.layer,
                format: "image/png",
                transparent: true,
                styles: "",
                SLD_BODY: buildSLD("eez", MARINE_REGIONS_LAYERS.eez.color, 0.12, 1.5),
              } as any}
              opacity={0.8}
              attribution='&copy; <a href="https://www.marineregions.org">Marine Regions</a> · VLIZ'
            />
            <WMSTileLayer
              url={MARINE_REGIONS_WMS}
              params={{
                layers: MARINE_REGIONS_LAYERS.territorial.layer,
                format: "image/png",
                transparent: true,
                styles: "",
                SLD_BODY: buildSLD("eez_12nm", MARINE_REGIONS_LAYERS.territorial.color, 0.15, 1.5),
              } as any}
              opacity={0.8}
            />
            <WMSTileLayer
              url={MARINE_REGIONS_WMS}
              params={{
                layers: MARINE_REGIONS_LAYERS.iho.layer,
                format: "image/png",
                transparent: true,
                styles: "",
                SLD_BODY: buildSLD("iho", MARINE_REGIONS_LAYERS.iho.color, 0.08, 1),
              } as any}
              opacity={0.7}
            />
          </>
        )}

        {/* ECA Zones (Red) */}
        {showZones &&
          ecaZonesData.features.map((zone) => (
            <Polygon
              key={zone.properties.id}
              positions={zone.geometry.coordinates[0].map(
                (coord) => [coord[1], coord[0]] as [number, number]
              )}
              pathOptions={{
                color: "#ef4444",
                fillColor: "#ef4444",
                fillOpacity: 0.15,
                weight: 1,
              }}
            >
              <Tooltip>{zone.properties.name}</Tooltip>
            </Polygon>
          ))}

        {/* HRA Zones (Amber) */}
        {showZones &&
          hraZonesData.features.map((zone) => (
            <Polygon
              key={zone.properties.id}
              positions={zone.geometry.coordinates[0].map(
                (coord) => [coord[1], coord[0]] as [number, number]
              )}
              pathOptions={{
                color: "#f59e0b",
                fillColor: "#f59e0b",
                fillOpacity: 0.15,
                weight: 1,
                dashArray: "5, 5",
              }}
            >
              <Tooltip>{zone.properties.name}</Tooltip>
            </Polygon>
          ))}

        {/* World Port Index markers */}
        {showPorts && (
          <Suspense fallback={null}>
            <WorldPortLayer />
          </Suspense>
        )}

        {/* Page-specific content */}
        {children}
      </MapContainer>

      {/* Zone Toggle — top-right */}
      {showZoneToggle && (
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
          <Toggle
            pressed={showZones}
            onPressedChange={setShowZones}
            className="bg-background/90 backdrop-blur shadow-md"
            aria-label="Toggle emission zones"
          >
            <Layers className="h-4 w-4 mr-2" />
            {showZones ? "Hide Zones" : "Show Zones"}
          </Toggle>
          <Toggle
            pressed={showMarineRegions}
            onPressedChange={setShowMarineRegions}
            className="bg-background/90 backdrop-blur shadow-md"
            aria-label="Toggle Marine Regions boundaries"
          >
            <Globe className="h-4 w-4 mr-2" />
            {showMarineRegions ? "Hide Boundaries" : "Marine Regions"}
          </Toggle>
          <Toggle
            pressed={showPorts}
            onPressedChange={setShowPorts}
            className="bg-background/90 backdrop-blur shadow-md"
            aria-label="Toggle World Ports"
          >
            <Anchor className="h-4 w-4 mr-2" />
            {showPorts ? "Hide Ports" : "World Ports"}
          </Toggle>
        </div>
      )}

      {/* Legend — MaritimeMap owns the container and always appends Marine Regions items */}
      {legend !== null && (
        <div className="absolute bottom-8 right-16 z-[1000] bg-background/90 backdrop-blur p-2 rounded-lg shadow-md text-xs space-y-1">
          {legend === undefined ? <DefaultLegendItems /> : legend}
          {showMarineRegions && <MarineRegionsLegendItems />}
          {showPorts && <PortsLegendItems />}
        </div>
      )}
    </div>
  );
}
