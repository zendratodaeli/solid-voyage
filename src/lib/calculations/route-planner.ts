/**
 * Route Planner Calculation Engine
 * 
 * Handles multi-leg voyage calculations, ECA detection, and HRA warnings.
 * Uses searoute-js for realistic maritime routing through sea lanes.
 */

import * as turf from "@turf/turf";
import searoute from "searoute-js";
import ecaZonesData from "@/data/eca-zones.json";
import hraZonesData from "@/data/hra-zones.json";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface PortPoint {
  id: string;
  name: string;
  locode?: string;
  latitude: number;
  longitude: number;
  passagePolyline?: [number, number][] | null; // Pre-traced canal path [lat, lng][]
  passageDistanceNm?: number; // Accurate canal distance
}

export interface LegResult {
  from: PortPoint;
  to: PortPoint;
  distanceNm: number;
  ecaDistanceNm: number;
  hraDistanceNm: number;
  isFullECA: boolean;
  ecaZones: string[];
  hraZones: string[];
  geometry: {
    coordinates: [number, number][];
    ecaSegments: [number, number][][];
    hraSegments: [number, number][][];
  };
}

export interface RouteResult {
  totalDistanceNm: number;
  totalECADistanceNm: number;
  totalHRADistanceNm: number;
  estimatedDays: number | null;
  legs: LegResult[];
  hraWarnings: string[];
  allECAZones: string[];
  allHRAZones: string[];
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const EARTH_RADIUS_NM = 3440.065; // Earth radius in nautical miles
const KM_TO_NM = 0.539957; // Conversion factor

// ═══════════════════════════════════════════════════════════════════
// DISTANCE CALCULATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate great-circle distance between two points using Haversine formula
 * Returns distance in nautical miles
 */
export function calculateGreatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_NM * c;
}

/**
 * Generate maritime route using searoute-js library
 * Returns coordinates in [lng, lat] GeoJSON format
 * Uses Dijkstra's algorithm on a maritime network graph to avoid land
 */
export function generateRoutePoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): [number, number][] {
  try {
    // searoute-js expects GeoJSON Point Features
    const origin = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Point" as const,
        coordinates: [lon1, lat1] as [number, number]
      }
    };
    
    const destination = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Point" as const,
        coordinates: [lon2, lat2] as [number, number]
      }
    };
    
    // Call searoute with GeoJSON Point features
    const route = searoute(origin, destination);
    
    // Return the coordinates from the LineString geometry
    if (route && route.geometry && route.geometry.coordinates) {
      return route.geometry.coordinates as [number, number][];
    }
    
    // Fallback to direct line if searoute fails
    console.warn("Searoute returned no coordinates, using direct line");
    return [[lon1, lat1], [lon2, lat2]];
  } catch (error) {
    console.error("Searoute failed:", error);
    // Fallback to a simple direct line
    return [[lon1, lat1], [lon2, lat2]];
  }
}

/**
 * Calculate maritime distance using searoute-js
 * Returns distance in nautical miles
 */
export function calculateMaritimeDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  try {
    // searoute-js expects GeoJSON Point Features
    const origin = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Point" as const,
        coordinates: [lon1, lat1] as [number, number]
      }
    };
    
    const destination = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Point" as const,
        coordinates: [lon2, lat2] as [number, number]
      }
    };
    
    // Call searoute - returns distance in nautical miles by default
    const route = searoute(origin, destination);
    
    // The length property is in nautical miles by default
    if (route && route.properties && route.properties.length) {
      return route.properties.length;
    }
    
    // Fallback to great circle distance
    return calculateGreatCircleDistance(lat1, lon1, lat2, lon2);
  } catch (error) {
    console.warn("Searoute distance failed, using great circle:", error);
    return calculateGreatCircleDistance(lat1, lon1, lat2, lon2);
  }
}

// ═══════════════════════════════════════════════════════════════════
// ZONE DETECTION (Optimized - samples every Nth point only)
// ═══════════════════════════════════════════════════════════════════

// Pre-compute polygon bounds for fast rejection
function getBounds(coords: number[][]): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function pointInBounds(lng: number, lat: number, bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }): boolean {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

/**
 * Check if a point is within a specified distance of any ECA zone
 * Used to detect river/inland ports that should be considered within ECA
 */
function isPointNearECAZone(lng: number, lat: number, maxDistanceNm: number = 50): { isNear: boolean; zone: string | null } {
  const ecaFeatures = ecaZonesData.features;
  const point = turf.point([lng, lat]);
  
  for (const feature of ecaFeatures) {
    try {
      const ecaPolygon = turf.polygon(feature.geometry.coordinates);
      
      // First check if point is inside the polygon
      if (turf.booleanPointInPolygon(point, ecaPolygon)) {
        return { isNear: true, zone: feature.properties.name };
      }
      
      // Calculate distance to polygon edge (in kilometers, then convert to NM)
      const distanceKm = turf.pointToPolygonDistance(point, ecaPolygon, { units: "kilometers" });
      const distanceNm = distanceKm * KM_TO_NM;
      
      if (distanceNm <= maxDistanceNm) {
        return { isNear: true, zone: feature.properties.name };
      }
    } catch {
      continue;
    }
  }
  
  return { isNear: false, zone: null };
}

/**
 * Calculate how much of a route line passes through ECA zones
 * Uses fast sampling (every 5th point) with bounding box pre-filter
 */
export function calculateECAIntersection(
  routeCoords: [number, number][]
): { distanceNm: number; zones: string[]; segments: [number, number][][] } {
  const ecaFeatures = ecaZonesData.features;
  const intersectedZones: string[] = [];
  const ecaSegments: [number, number][][] = [];
  
  // Pre-compute bounds for all ECA zones
  const ecaBounds = ecaFeatures.map(f => ({
    feature: f,
    bounds: getBounds(f.geometry.coordinates[0])
  }));
  
  let ecaPointCount = 0;
  const SAMPLE_RATE = 5; // Check every 5th point
  
  // Sample points along the route
  for (let i = 0; i < routeCoords.length; i += SAMPLE_RATE) {
    const [lng, lat] = routeCoords[i];
    
    // Check if point is in any ECA zone (with bounding box pre-filter)
    for (const { feature, bounds } of ecaBounds) {
      // Fast bounding box rejection
      if (!pointInBounds(lng, lat, bounds)) continue;
      
      try {
        const ecaPolygon = turf.polygon(feature.geometry.coordinates);
        const point = turf.point([lng, lat]);
        if (turf.booleanPointInPolygon(point, ecaPolygon)) {
          ecaPointCount++;
          if (!intersectedZones.includes(feature.properties.name)) {
            intersectedZones.push(feature.properties.name);
          }
          break;
        }
      } catch {
        continue;
      }
    }
  }
  
  // Estimate distance based on proportion of sampled points in ECA
  const sampledPoints = Math.ceil(routeCoords.length / SAMPLE_RATE);
  const totalRouteLength = routeCoords.length > 1 
    ? turf.length(turf.lineString(routeCoords), { units: "kilometers" }) * KM_TO_NM
    : 0;
  
  const ecaRatio = sampledPoints > 0 ? ecaPointCount / sampledPoints : 0;
  const ecaDistance = totalRouteLength * ecaRatio;
  
  return {
    distanceNm: Math.round(ecaDistance * 10) / 10,
    zones: intersectedZones,
    segments: ecaSegments, // Simplified - not tracking individual segments
  };
}

/**
 * Calculate how much of a route line passes through HRA zones
 * Uses fast sampling (every 5th point) with bounding box pre-filter
 */
export function calculateHRAIntersection(
  routeCoords: [number, number][]
): { distanceNm: number; zones: string[]; warnings: string[]; segments: [number, number][][] } {
  const hraFeatures = hraZonesData.features;
  const intersectedZones: string[] = [];
  const warnings: string[] = [];
  const hraSegments: [number, number][][] = [];
  
  // Pre-compute bounds for all HRA zones
  const hraBounds = hraFeatures.map(f => ({
    feature: f,
    bounds: getBounds(f.geometry.coordinates[0])
  }));
  
  let hraPointCount = 0;
  const SAMPLE_RATE = 5; // Check every 5th point
  
  // Sample points along the route
  for (let i = 0; i < routeCoords.length; i += SAMPLE_RATE) {
    const [lng, lat] = routeCoords[i];
    
    // Check if point is in any HRA zone (with bounding box pre-filter)
    for (const { feature, bounds } of hraBounds) {
      // Fast bounding box rejection
      if (!pointInBounds(lng, lat, bounds)) continue;
      
      try {
        const hraPolygon = turf.polygon(feature.geometry.coordinates);
        const point = turf.point([lng, lat]);
        if (turf.booleanPointInPolygon(point, hraPolygon)) {
          hraPointCount++;
          if (!intersectedZones.includes(feature.properties.name)) {
            intersectedZones.push(feature.properties.name);
            warnings.push(feature.properties.warning);
          }
          break;
        }
      } catch {
        continue;
      }
    }
  }
  
  // Estimate distance based on proportion of sampled points in HRA
  const sampledPoints = Math.ceil(routeCoords.length / SAMPLE_RATE);
  const totalRouteLength = routeCoords.length > 1 
    ? turf.length(turf.lineString(routeCoords), { units: "kilometers" }) * KM_TO_NM
    : 0;
  
  const hraRatio = sampledPoints > 0 ? hraPointCount / sampledPoints : 0;
  const hraDistance = totalRouteLength * hraRatio;
  
  return {
    distanceNm: Math.round(hraDistance * 10) / 10,
    zones: intersectedZones,
    warnings,
    segments: hraSegments,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-LEG ROUTE CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate a single leg between two ports
 * Uses maritime routing through custom waypoints (Suez, Gibraltar, Malacca, etc.)
 * For legs WITHIN passages (both endpoints are PASSAGE), uses direct routing
 */
export function calculateLeg(from: PortPoint, to: PortPoint): LegResult {
  // Only use direct routing when BOTH endpoints are passage waypoints
  // This handles the canal transit itself (e.g., Brunsbüttel → Holtenau)
  // For entering/exiting the canal, we still use searoute maritime routing
  const isWithinPassage = from.locode === "PASSAGE" && to.locode === "PASSAGE";
  
  // Debug: Log passage info
  console.log(`[DEBUG] Leg: ${from.name} → ${to.name}, isWithinPassage: ${isWithinPassage}, hasPolyline: ${!!from.passagePolyline}, polylineLength: ${from.passagePolyline?.length || 0}`);
  
  let distanceNm: number;
  let routeCoords: [number, number][];
  
  if (isWithinPassage) {
    // Check if a pre-traced polyline is available (for accurate canal visualization)
    if (from.passagePolyline && from.passagePolyline.length >= 2) {
      // Use the pre-traced polyline for accurate canal rendering
      // Polyline is stored as [lat, lng][] but we need [lng, lat][] for GeoJSON
      routeCoords = from.passagePolyline.map(
        ([lat, lng]) => [lng, lat] as [number, number]
      );
      
      // Debug: Log the polyline being used
      console.log(`[DEBUG] Using polyline with ${routeCoords.length} points`);
      console.log(`[DEBUG] First 3 coords: ${JSON.stringify(routeCoords.slice(0, 3))}`);
      console.log(`[DEBUG] Last 3 coords: ${JSON.stringify(routeCoords.slice(-3))}`);
      // Use the accurate canal distance if available, otherwise calculate from polyline
      if (from.passageDistanceNm) {
        distanceNm = from.passageDistanceNm;
      } else {
        // Calculate distance along the polyline
        distanceNm = 0;
        for (let i = 0; i < from.passagePolyline.length - 1; i++) {
          const [lat1, lng1] = from.passagePolyline[i];
          const [lat2, lng2] = from.passagePolyline[i + 1];
          distanceNm += calculateGreatCircleDistance(lat1, lng1, lat2, lng2);
        }
      }
    } else {
      // Fallback: direct great-circle routing (may cross land for short canals)
      distanceNm = calculateGreatCircleDistance(
        from.latitude,
        from.longitude,
        to.latitude,
        to.longitude
      );
      
      // Direct line between the two points
      routeCoords = [
        [from.longitude, from.latitude],
        [to.longitude, to.latitude]
      ];
    }
  } else {
    // For regular port-to-port legs, use searoute maritime routing
    distanceNm = calculateMaritimeDistance(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude
    );
    
    routeCoords = generateRoutePoints(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude
    );
  }
  
  const ecaResult = calculateECAIntersection(routeCoords);
  const hraResult = calculateHRAIntersection(routeCoords);
  
  // Calculate the base ECA distance and zones
  let finalEcaDistanceNm = ecaResult.distanceNm;
  let finalEcaZones = [...ecaResult.zones];
  
  // RIVER/INLAND PORT FIX:
  // Check if this is a short leg (< 50 NM) and if both endpoints are near an ECA zone
  // This handles cases where river ports (Amsterdam, Hamburg, Rostock) are slightly
  // outside the ECA polygon boundary but should be considered 100% ECA
  const SHORT_LEG_THRESHOLD_NM = 100; // Consider legs up to 100 NM for this check
  const NEAR_ECA_THRESHOLD_NM = 50;   // Ports within 50 NM of ECA are considered "in ECA"
  
  if (distanceNm <= SHORT_LEG_THRESHOLD_NM || ecaResult.distanceNm > 0) {
    // Check if both endpoints are near an ECA zone
    const fromNearEca = isPointNearECAZone(from.longitude, from.latitude, NEAR_ECA_THRESHOLD_NM);
    const toNearEca = isPointNearECAZone(to.longitude, to.latitude, NEAR_ECA_THRESHOLD_NM);
    
    // If both endpoints are near ECA zones (or the same ECA zone), force 100% ECA
    if (fromNearEca.isNear && toNearEca.isNear) {
      finalEcaDistanceNm = distanceNm; // 100% ECA
      
      // Add the zone names if not already present
      if (fromNearEca.zone && !finalEcaZones.includes(fromNearEca.zone)) {
        finalEcaZones.push(fromNearEca.zone);
      }
      if (toNearEca.zone && !finalEcaZones.includes(toNearEca.zone)) {
        finalEcaZones.push(toNearEca.zone);
      }
    }
  }
  
  return {
    from,
    to,
    distanceNm: Math.round(distanceNm * 10) / 10,
    ecaDistanceNm: Math.round(finalEcaDistanceNm * 10) / 10,
    hraDistanceNm: hraResult.distanceNm,
    isFullECA: finalEcaDistanceNm >= distanceNm * 0.95,
    ecaZones: finalEcaZones,
    hraZones: hraResult.zones,
    geometry: {
      coordinates: routeCoords,
      ecaSegments: ecaResult.segments,
      hraSegments: hraResult.segments,
    },
  };
}

/**
 * Calculate complete multi-leg route through all waypoints
 */
export function calculateMultiLegRoute(
  ports: PortPoint[],
  avgSpeedKnots?: number
): RouteResult {
  if (ports.length < 2) {
    return {
      totalDistanceNm: 0,
      totalECADistanceNm: 0,
      totalHRADistanceNm: 0,
      estimatedDays: null,
      legs: [],
      hraWarnings: [],
      allECAZones: [],
      allHRAZones: [],
    };
  }
  
  const legs: LegResult[] = [];
  let totalDistance = 0;
  let totalECA = 0;
  let totalHRA = 0;
  const allHRAWarnings: string[] = [];
  const allECAZones = new Set<string>();
  const allHRAZones = new Set<string>();
  
  // Loop through port pairs
  for (let i = 0; i < ports.length - 1; i++) {
    const leg = calculateLeg(ports[i], ports[i + 1]);
    legs.push(leg);
    
    totalDistance += leg.distanceNm;
    totalECA += leg.ecaDistanceNm;
    totalHRA += leg.hraDistanceNm;
    
    // Collect unique zones
    leg.ecaZones.forEach((z) => allECAZones.add(z));
    leg.hraZones.forEach((z) => allHRAZones.add(z));
  }
  
  // Collect HRA warnings
  const hraSet = new Set<string>();
  legs.forEach((leg) => {
    if (leg.hraZones.length > 0) {
      // Get warning for each HRA zone
      leg.hraZones.forEach((zone) => {
        const feature = hraZonesData.features.find(
          (f) => f.properties.name === zone
        );
        if (feature && !hraSet.has(feature.properties.warning)) {
          hraSet.add(feature.properties.warning);
          allHRAWarnings.push(feature.properties.warning);
        }
      });
    }
  });
  
  // Calculate ETA if speed provided
  let estimatedDays: number | null = null;
  if (avgSpeedKnots && avgSpeedKnots > 0) {
    const hours = totalDistance / avgSpeedKnots;
    estimatedDays = Math.round((hours / 24) * 10) / 10;
  }
  
  return {
    totalDistanceNm: Math.round(totalDistance * 10) / 10,
    totalECADistanceNm: Math.round(totalECA * 10) / 10,
    totalHRADistanceNm: Math.round(totalHRA * 10) / 10,
    estimatedDays,
    legs,
    hraWarnings: allHRAWarnings,
    allECAZones: Array.from(allECAZones),
    allHRAZones: Array.from(allHRAZones),
  };
}

/**
 * Calculate ETA from distance and speed
 */
export function calculateETA(distanceNm: number, speedKnots: number): number {
  if (speedKnots <= 0) return 0;
  const hours = distanceNm / speedKnots;
  return Math.round((hours / 24) * 10) / 10;
}
