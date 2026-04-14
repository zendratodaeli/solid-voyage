"use client";

/**
 * Route Zone Classification Utility
 * 
 * Classifies waypoints into ECA zones, Canal passages, and Open Sea
 * for proper route visualization with different colors.
 * 
 * Includes Mediterranean Sea ECA (Med SOx ECA) per IMO MEPC.361(79)
 * Effective Date: May 1, 2025
 */

import ecaZonesData from "@/data/eca-zones.json";
import hraZonesData from "@/data/hra-zones.json";

// Mediterranean SECA effective date per IMO Resolution MEPC.361(79)
const MED_SECA_EFFECTIVE_DATE = new Date("2025-05-01T00:00:00Z");

/**
 * Check if Mediterranean SECA is in effect based on current date
 * Regulation: IMO Resolution MEPC.361(79)
 * Effective Date: May 1, 2025
 */
export function isMediterraneanSecaEffective(checkDate?: Date): boolean {
  const dateToCheck = checkDate || new Date();
  return dateToCheck >= MED_SECA_EFFECTIVE_DATE;
}

// Zone type for each waypoint
export type ZoneType = "open_sea" | "eca" | "canal";

// Canal bounding boxes with NavAPI Area IDs
interface CanalBounds {
  name: string;
  areaId: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const CANAL_BOUNDS: CanalBounds[] = [
  {
    name: "Suez Canal",
    areaId: 7,
    minLat: 29.8,
    maxLat: 31.5,
    minLon: 32.0,
    maxLon: 33.0,
  },
  {
    name: "Kiel Canal",
    areaId: 3,
    minLat: 53.8,
    maxLat: 54.5,
    minLon: 9.0,
    maxLon: 10.5,
  },
  {
    name: "Panama Canal",
    areaId: 5,
    minLat: 8.8,
    maxLat: 9.4,
    minLon: -80.0,
    maxLon: -79.0,
  },
  {
    name: "Corinth Canal",
    areaId: 6,
    minLat: 37.9,
    maxLat: 38.0,
    minLon: 22.9,
    maxLon: 23.1,
  },
  {
    name: "Torres Strait",
    areaId: 15,
    minLat: -11.0,
    maxLat: -9.5,
    minLon: 141.5,
    maxLon: 143.5,
  },
];

// ═══════════════════════════════════════════════════════════════════
// DETECTED CANAL TYPE & FUNCTION
// ═══════════════════════════════════════════════════════════════════

export interface DetectedCanal {
  name: string;
  areaId: number;
  entryPoint: { lat: number; lon: number };
  exitPoint: { lat: number; lon: number };
  routeIndex: number; // First index in route where canal was detected
}

/**
 * Detect canals in a route by checking waypoints against bounding boxes.
 * Returns unique canal passages with entry/exit points.
 */
export function detectCanalsInRoute(
  coordinates: [number, number][] // [lon, lat] format
): DetectedCanal[] {
  if (coordinates.length < 2) return [];

  const detectedCanals: DetectedCanal[] = [];
  const seenCanals = new Set<string>();

  for (let i = 0; i < coordinates.length; i++) {
    const [lon, lat] = coordinates[i];
    
    for (const canal of CANAL_BOUNDS) {
      // Check if point is inside canal bounding box
      if (lat >= canal.minLat && lat <= canal.maxLat &&
          lon >= canal.minLon && lon <= canal.maxLon) {
        
        // Only add each canal once
        if (!seenCanals.has(canal.name)) {
          seenCanals.add(canal.name);
          
          // Find entry point (current) and exit point (last point in canal)
          let exitIndex = i;
          for (let j = i + 1; j < coordinates.length; j++) {
            const [eLon, eLat] = coordinates[j];
            if (eLat >= canal.minLat && eLat <= canal.maxLat &&
                eLon >= canal.minLon && eLon <= canal.maxLon) {
              exitIndex = j;
            } else {
              break; // Exited the canal
            }
          }
          
          const [entryLon, entryLat] = coordinates[i];
          const [exitLon, exitLat] = coordinates[exitIndex];
          
          detectedCanals.push({
            name: canal.name,
            areaId: canal.areaId,
            entryPoint: { lat: entryLat, lon: entryLon },
            exitPoint: { lat: exitLat, lon: exitLon },
            routeIndex: i,
          });
        }
      }
    }
  }

  // Sort by route index (order they appear in route)
  return detectedCanals.sort((a, b) => a.routeIndex - b.routeIndex);
}

/**
 * Ray casting algorithm for point-in-polygon
 * Checks if a point (lat, lon) is inside a polygon
 */
function pointInPolygon(lat: number, lon: number, polygon: number[][]): boolean {
  let inside = false;
  const n = polygon.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0]; // lon
    const yi = polygon[i][1]; // lat
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Check if a waypoint is in a canal passage
 */
function isInCanal(lat: number, lon: number): string | null {
  for (const canal of CANAL_BOUNDS) {
    if (lat >= canal.minLat && lat <= canal.maxLat &&
        lon >= canal.minLon && lon <= canal.maxLon) {
      return canal.name;
    }
  }
  return null;
}

/**
 * Check if a waypoint is in an ECA zone
 */
function isInECA(lat: number, lon: number): string | null {
  for (const feature of ecaZonesData.features) {
    const polygon = feature.geometry.coordinates[0];
    if (pointInPolygon(lat, lon, polygon)) {
      return feature.properties.name;
    }
  }
  return null;
}

/**
 * Classify a single waypoint's zone
 */
export function classifyWaypoint(lat: number, lon: number): { type: ZoneType; name?: string } {
  // Check canal first (higher priority)
  const canalName = isInCanal(lat, lon);
  if (canalName) {
    return { type: "canal", name: canalName };
  }
  
  // Check ECA zones
  const ecaName = isInECA(lat, lon);
  if (ecaName) {
    return { type: "eca", name: ecaName };
  }
  
  // Default to open sea
  return { type: "open_sea" };
}

/**
 * Segment the route coordinates into colored segments
 * Returns segments grouped by zone type for rendering
 */
export interface RouteSegment {
  type: ZoneType;
  name?: string;
  coordinates: [number, number][]; // [lon, lat] format for consistency
}

export function segmentRouteByZone(
  coordinates: [number, number][] // [lon, lat] format
): RouteSegment[] {
  if (coordinates.length < 2) return [];
  
  const segments: RouteSegment[] = [];
  let currentSegment: RouteSegment | null = null;
  
  for (let i = 0; i < coordinates.length; i++) {
    const [lon, lat] = coordinates[i];
    const classification = classifyWaypoint(lat, lon);
    
    if (!currentSegment || currentSegment.type !== classification.type) {
      // Start new segment (include previous point for continuity)
      if (currentSegment && currentSegment.coordinates.length > 0) {
        segments.push(currentSegment);
      }
      
      currentSegment = {
        type: classification.type,
        name: classification.name,
        coordinates: i > 0 ? [coordinates[i - 1], coordinates[i]] : [coordinates[i]],
      };
    } else {
      // Continue current segment
      currentSegment.coordinates.push(coordinates[i]);
    }
  }
  
  // Push final segment
  if (currentSegment && currentSegment.coordinates.length > 0) {
    segments.push(currentSegment);
  }
  
  return segments;
}

// Zone colors for rendering
export const ZONE_COLORS = {
  open_sea: "#3b82f6",  // Blue
  eca: "#ef4444",        // Red
  canal: "#8b5cf6",      // Purple
};

// Zone labels for legend
export const ZONE_LABELS = {
  open_sea: "Open Sea",
  eca: "ECA Zone",
  canal: "Canal/Passage",
};

// ═══════════════════════════════════════════════════════════════════
// VALIDATED ZONE DISTANCE CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Haversine distance calculation in nautical miles
 */
function haversineDistanceNm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate segment distance in nautical miles
 */
function calculateSegmentDistanceNm(coordinates: [number, number][]): number {
  let distance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    distance += haversineDistanceNm(lat1, lon1, lat2, lon2);
  }
  return distance;
}

/**
 * Result of validated zone distance calculation
 */
export interface ValidatedZoneDistances {
  totalDistanceNm: number;
  secaDistanceNm: number;           // Actual SECA zone distance (validated)
  canalDistanceNm: number;          // Canal/passage distance
  openSeaDistanceNm: number;        // Open sea distance
  effectiveEcaDistanceNm: number;   // SECA + Canal (for bunker calculations)
  secaZones: string[];              // Names of SECA zones crossed
  canals: string[];                 // Names of canals crossed
}

/**
 * Calculate validated zone distances by classifying each waypoint
 * against our local eca-zones.json data.
 * 
 * This overrides the NavAPI's incorrect SecaDistance values by
 * calculating actual distances using point-in-polygon checks
 * against known SECA zone boundaries.
 * 
 * @param coordinates Route waypoints in [lon, lat] format
 * @returns Validated distances for each zone type
 */
export function calculateValidatedZoneDistances(
  coordinates: [number, number][]
): ValidatedZoneDistances {
  if (coordinates.length < 2) {
    return {
      totalDistanceNm: 0,
      secaDistanceNm: 0,
      canalDistanceNm: 0,
      openSeaDistanceNm: 0,
      effectiveEcaDistanceNm: 0,
      secaZones: [],
      canals: [],
    };
  }

  // Segment the route by zone type
  const segments = segmentRouteByZone(coordinates);
  
  // Calculate distance for each zone type
  let totalDistanceNm = 0;
  let secaDistanceNm = 0;
  let canalDistanceNm = 0;
  let openSeaDistanceNm = 0;
  const secaZones = new Set<string>();
  const canals = new Set<string>();

  for (const segment of segments) {
    const segmentDistance = calculateSegmentDistanceNm(segment.coordinates);
    totalDistanceNm += segmentDistance;

    switch (segment.type) {
      case "eca":
        secaDistanceNm += segmentDistance;
        if (segment.name) secaZones.add(segment.name);
        break;
      case "canal":
        canalDistanceNm += segmentDistance;
        if (segment.name) canals.add(segment.name);
        break;
      case "open_sea":
      default:
        openSeaDistanceNm += segmentDistance;
        break;
    }
  }

  return {
    totalDistanceNm,
    secaDistanceNm,
    canalDistanceNm,
    openSeaDistanceNm,
    effectiveEcaDistanceNm: secaDistanceNm + canalDistanceNm,
    secaZones: Array.from(secaZones),
    canals: Array.from(canals),
  };
}

// ═══════════════════════════════════════════════════════════════════
// HRA (HIGH RISK AREA) DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a waypoint is inside an HRA zone (piracy / war risk)
 */
function isInHRA(lat: number, lon: number): string | null {
  for (const feature of hraZonesData.features) {
    const polygon = feature.geometry.coordinates[0];
    if (pointInPolygon(lat, lon, polygon)) {
      return feature.properties.name;
    }
  }
  return null;
}

export interface DetectedHRA {
  name: string;
  id: string;
  type: string;
  warning: string;
}

export interface HRADistanceResult {
  /** Total NM through all HRA zones */
  hraDistanceNm: number;
  /** Names of HRA zones crossed */
  hraZones: string[];
  /** Detailed zone info */
  detectedHRAs: DetectedHRA[];
}

/**
 * Calculate HRA (High Risk Area) distances by checking each route
 * waypoint against our hra-zones.json polygon data.
 *
 * Uses the same haversine + point-in-polygon approach as SECA detection.
 *
 * @param coordinates Route waypoints in [lon, lat] format
 * @returns HRA zone distances and crossed zone names
 */
export function calculateHRADistances(
  coordinates: [number, number][]
): HRADistanceResult {
  if (coordinates.length < 2) {
    return { hraDistanceNm: 0, hraZones: [], detectedHRAs: [] };
  }

  let hraDistanceNm = 0;
  const hraZoneNames = new Set<string>();
  const detectedHRAs: DetectedHRA[] = [];
  const seenIds = new Set<string>();

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];

    // Check midpoint of segment for zone membership
    const midLat = (lat1 + lat2) / 2;
    const midLon = (lon1 + lon2) / 2;
    const hraName = isInHRA(midLat, midLon);

    if (hraName) {
      const segmentDist = haversineDistanceNm(lat1, lon1, lat2, lon2);
      hraDistanceNm += segmentDist;
      hraZoneNames.add(hraName);

      // Find the feature for detailed info
      const feature = hraZonesData.features.find(f => f.properties.name === hraName);
      if (feature && !seenIds.has(feature.properties.id)) {
        seenIds.add(feature.properties.id);
        detectedHRAs.push({
          name: feature.properties.name,
          id: feature.properties.id,
          type: feature.properties.type,
          warning: feature.properties.warning,
        });
      }
    }
  }

  return {
    hraDistanceNm,
    hraZones: Array.from(hraZoneNames),
    detectedHRAs,
  };
}
