/**
 * Route Deviation Engine
 *
 * Analyzes weather conditions along a route and generates deviation
 * waypoints to avoid dangerous weather clusters. This is the core engine
 * that powers weather-avoidance routing.
 *
 * Algorithm:
 * 1. Scan weather waypoints for "rough" or "severe" clusters
 * 2. Group adjacent dangerous waypoints into hazard zones
 * 3. Calculate lateral offset to route around each hazard
 * 4. Return deviation waypoints for NavAPI re-routing
 *
 * Deviation magnitude (Captain's standard):
 *   - Rough seas (2.5–4.0m): 3° lateral shift (~180 NM)
 *   - Severe seas (>4.0m):   5° lateral shift (~300 NM)
 */

import type { RouteWeatherSummary, WaypointWeather, WeatherSeverity } from "@/types/weather";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface DeviationResult {
  /** Whether a deviation route is recommended */
  hasDeviation: boolean;
  /** Human-readable reason for the deviation */
  reason: string;
  /** The highest severity found in the danger zone */
  maxSeverity: WeatherSeverity;
  /** Maximum wave height in the danger zone (meters) */
  maxWaveHeight: number;
  /** Intermediate waypoints for NavAPI calls (includes pre-deviation, deviation, and post-deviation points) */
  deviationWaypoints: Array<{ lat: number; lon: number }>;
  /** The detected hazard clusters */
  hazardClusters: HazardCluster[];
}

export interface HazardCluster {
  /** Center of the hazard zone */
  center: { lat: number; lon: number };
  /** Waypoints included in this cluster */
  waypoints: Array<{ lat: number; lon: number; waveHeight: number; severity: WeatherSeverity }>;
  /** Maximum wave height in this cluster */
  maxWaveHeight: number;
  /** Highest severity in this cluster */
  maxSeverity: WeatherSeverity;
  /** Start index in the original waypoints array */
  startIndex: number;
  /** End index in the original waypoints array */
  endIndex: number;
}

export interface SafePortResult {
  /** Analysis per waypoint */
  waypoints: Array<{
    lat: number;
    lon: number;
    nearestPort: { name: string; locode: string; distanceNm: number };
    isRemote: boolean;
  }>;
  /** The most remote point on the route */
  mostRemotePoint: {
    lat: number;
    lon: number;
    nearestPort: string;
    distanceNm: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** Minimum wave height (meters) to consider a waypoint "dangerous" */
const ROUGH_THRESHOLD = 2.5;

/** Minimum consecutive dangerous waypoints to form a cluster */
const MIN_CLUSTER_SIZE = 2;

/** Deviation magnitude in degrees latitude */
const DEVIATION_ROUGH = 3.0;  // ~180 NM for rough seas (2.5-4.0m)
const DEVIATION_SEVERE = 5.0; // ~300 NM for severe seas (>4.0m)

/** 1 degree of latitude ≈ 60 NM */
const DEG_TO_NM = 60;

// ═══════════════════════════════════════════════════════════════════
// CORE ENGINE
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyze weather along a route and generate deviation waypoints.
 *
 * @param weatherData   Live weather data from Open-Meteo marine API
 * @param routeGeometry Full route coordinates from NavAPI [lon, lat][]
 * @returns             Deviation result with intermediate waypoints
 */
export function analyzeWeatherDeviation(
  weatherData: RouteWeatherSummary,
  routeGeometry?: [number, number][],
): DeviationResult {
  const noDeviation: DeviationResult = {
    hasDeviation: false,
    reason: "No significant weather hazards detected along the route",
    maxSeverity: "calm",
    maxWaveHeight: 0,
    deviationWaypoints: [],
    hazardClusters: [],
  };

  if (!weatherData.waypoints || weatherData.waypoints.length < 3) {
    return noDeviation;
  }

  // Step 1: Identify dangerous waypoints
  const dangerousIndices: number[] = [];
  for (let i = 0; i < weatherData.waypoints.length; i++) {
    const wp = weatherData.waypoints[i];
    if (wp.current.waveHeight >= ROUGH_THRESHOLD || wp.current.severity === "rough" || wp.current.severity === "severe") {
      dangerousIndices.push(i);
    }
  }

  if (dangerousIndices.length < MIN_CLUSTER_SIZE) {
    return noDeviation;
  }

  // Step 2: Group consecutive dangerous waypoints into clusters
  const clusters = groupIntoClusters(dangerousIndices, weatherData.waypoints);

  if (clusters.length === 0) {
    return noDeviation;
  }

  // Step 3: Generate deviation waypoints for each cluster
  const allDeviationWaypoints: Array<{ lat: number; lon: number }> = [];
  let globalMaxWaveHeight = 0;
  let globalMaxSeverity: WeatherSeverity = "calm";

  for (const cluster of clusters) {
    if (cluster.maxWaveHeight > globalMaxWaveHeight) {
      globalMaxWaveHeight = cluster.maxWaveHeight;
    }
    if (severityRank(cluster.maxSeverity) > severityRank(globalMaxSeverity)) {
      globalMaxSeverity = cluster.maxSeverity;
    }

    const deviationDeg = cluster.maxSeverity === "severe" ? DEVIATION_SEVERE : DEVIATION_ROUGH;
    const deviationPoints = generateDeviationWaypoints(
      cluster,
      weatherData.waypoints,
      deviationDeg,
    );
    allDeviationWaypoints.push(...deviationPoints);
  }

  // Build reason string
  const clusterDescs = clusters.map(c => {
    const loc = `${c.center.lat.toFixed(1)}°${c.center.lat >= 0 ? "N" : "S"}, ${Math.abs(c.center.lon).toFixed(1)}°${c.center.lon >= 0 ? "E" : "W"}`;
    return `${c.maxSeverity} seas (${c.maxWaveHeight.toFixed(1)}m waves) near ${loc}`;
  });

  return {
    hasDeviation: allDeviationWaypoints.length > 0,
    reason: `Weather avoidance: ${clusterDescs.join("; ")}`,
    maxSeverity: globalMaxSeverity,
    maxWaveHeight: globalMaxWaveHeight,
    deviationWaypoints: allDeviationWaypoints,
    hazardClusters: clusters,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CLUSTERING
// ═══════════════════════════════════════════════════════════════════

/**
 * Group consecutive dangerous waypoint indices into clusters.
 * A cluster is formed when 2+ consecutive waypoints are dangerous.
 * Allow a gap of 1 waypoint between dangerous ones (weather systems are continuous).
 */
function groupIntoClusters(
  dangerousIndices: number[],
  waypoints: WaypointWeather[],
): HazardCluster[] {
  const clusters: HazardCluster[] = [];
  let currentCluster: number[] = [dangerousIndices[0]];

  for (let i = 1; i < dangerousIndices.length; i++) {
    const gap = dangerousIndices[i] - dangerousIndices[i - 1];
    if (gap <= 2) {
      // Allow gap of 1 (weather systems span across waypoints)
      currentCluster.push(dangerousIndices[i]);
    } else {
      // Finalize current cluster if big enough
      if (currentCluster.length >= MIN_CLUSTER_SIZE) {
        clusters.push(buildCluster(currentCluster, waypoints));
      }
      currentCluster = [dangerousIndices[i]];
    }
  }
  // Don't forget the last cluster
  if (currentCluster.length >= MIN_CLUSTER_SIZE) {
    clusters.push(buildCluster(currentCluster, waypoints));
  }

  return clusters;
}

function buildCluster(indices: number[], waypoints: WaypointWeather[]): HazardCluster {
  const clusterWaypoints = indices.map(i => ({
    lat: waypoints[i].latitude,
    lon: waypoints[i].longitude,
    waveHeight: waypoints[i].current.waveHeight,
    severity: waypoints[i].current.severity,
  }));

  const avgLat = clusterWaypoints.reduce((s, w) => s + w.lat, 0) / clusterWaypoints.length;
  const avgLon = clusterWaypoints.reduce((s, w) => s + w.lon, 0) / clusterWaypoints.length;
  const maxWaveHeight = Math.max(...clusterWaypoints.map(w => w.waveHeight));
  const maxSeverity = clusterWaypoints.reduce<WeatherSeverity>((best, w) =>
    severityRank(w.severity) > severityRank(best) ? w.severity : best,
    "calm",
  );

  return {
    center: { lat: avgLat, lon: avgLon },
    waypoints: clusterWaypoints,
    maxWaveHeight,
    maxSeverity,
    startIndex: indices[0],
    endIndex: indices[indices.length - 1],
  };
}

// ═══════════════════════════════════════════════════════════════════
// DEVIATION WAYPOINT GENERATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate intermediate waypoints that route around a hazard cluster.
 *
 * Strategy:
 * 1. Take the waypoint BEFORE the cluster as "entry point"
 * 2. Take the waypoint AFTER the cluster as "exit point"
 * 3. Calculate the bearing of the route through the cluster
 * 4. Shift perpendicular to the route — prefer shifting away from the equator
 *    (in Northern Hemisphere shift south, in Southern shift north) to stay
 *    in more navigable waters. But also consider: shift towards calmer seas.
 * 5. Generate 2-3 intermediate deviation waypoints
 */
function generateDeviationWaypoints(
  cluster: HazardCluster,
  allWaypoints: WaypointWeather[],
  deviationDeg: number,
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];

  // Get entry and exit points (waypoints just before/after the cluster)
  const entryIdx = Math.max(0, cluster.startIndex - 1);
  const exitIdx = Math.min(allWaypoints.length - 1, cluster.endIndex + 1);

  const entry = allWaypoints[entryIdx];
  const exit = allWaypoints[exitIdx];

  // Determine deviation direction
  // For routes in Northern Hemisphere: try shifting south (towards equator gives calmer seas)
  // For routes in Southern Hemisphere: try shifting north
  // This is a heuristic — real weather routing would check conditions on both sides
  const avgLat = cluster.center.lat;
  const latShift = avgLat >= 0 ? -deviationDeg : deviationDeg; // Towards equator

  // Calculate the route bearing through the cluster
  const bearing = calculateBearing(entry.latitude, entry.longitude, exit.latitude, exit.longitude);

  // Perpendicular shift — if route goes roughly east-west, shift north/south
  // If route goes roughly north-south, shift east/west
  const isEastWest = Math.abs(Math.cos(bearing * Math.PI / 180)) > 0.5;

  if (isEastWest) {
    // Route goes roughly E-W → shift latitude
    // Pre-deviation waypoint: halfway between entry and cluster start, shifted
    const preLat = (entry.latitude + cluster.center.lat) / 2 + latShift * 0.5;
    const preLon = (entry.longitude + cluster.center.lon) / 2;
    points.push({ lat: preLat, lon: preLon });

    // Mid-deviation waypoint: at cluster center, maximum shift
    points.push({
      lat: cluster.center.lat + latShift,
      lon: cluster.center.lon,
    });

    // Post-deviation waypoint: halfway between cluster end and exit, shifting back
    const postLat = (cluster.center.lat + exit.latitude) / 2 + latShift * 0.5;
    const postLon = (cluster.center.lon + exit.longitude) / 2;
    points.push({ lat: postLat, lon: postLon });
  } else {
    // Route goes roughly N-S → shift longitude
    const lonShift = cluster.center.lon >= 0 ? -deviationDeg : deviationDeg;

    const preLon = (entry.longitude + cluster.center.lon) / 2 + lonShift * 0.5;
    const preLat = (entry.latitude + cluster.center.lat) / 2;
    points.push({ lat: preLat, lon: preLon });

    points.push({
      lat: cluster.center.lat,
      lon: cluster.center.lon + lonShift,
    });

    const postLon = (cluster.center.lon + exit.longitude) / 2 + lonShift * 0.5;
    const postLat = (cluster.center.lat + exit.latitude) / 2;
    points.push({ lat: postLat, lon: postLon });
  }

  // Clamp coordinates to valid ranges
  return points.map(p => ({
    lat: Math.max(-85, Math.min(85, p.lat)),
    lon: ((p.lon + 540) % 360) - 180, // Normalize to [-180, 180]
  }));
}

// ═══════════════════════════════════════════════════════════════════
// NEAREST SAFE PORT ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/** Threshold in NM beyond which a waypoint is considered "remote" */
const REMOTE_THRESHOLD_NM = 500;

/**
 * Calculate the nearest major port to each waypoint along the route.
 *
 * @param routeWaypoints  Sampled points along the route
 * @param ports           Available port database
 * @returns               Per-waypoint nearest port analysis
 */
export function analyzeNearestSafePorts(
  routeWaypoints: Array<{ lat: number; lon: number }>,
  ports: Array<{ name: string; locode: string; lat: number; lon: number }>,
): SafePortResult {
  if (ports.length === 0 || routeWaypoints.length === 0) {
    return {
      waypoints: [],
      mostRemotePoint: { lat: 0, lon: 0, nearestPort: "Unknown", distanceNm: 0 },
    };
  }

  let mostRemoteDist = 0;
  let mostRemoteWp = routeWaypoints[0];
  let mostRemotePortName = "";

  const analyzed = routeWaypoints.map(wp => {
    let nearestDist = Infinity;
    let nearestPort = { name: "Unknown", locode: "", distanceNm: 0 };

    for (const port of ports) {
      const dist = haversineNm(wp.lat, wp.lon, port.lat, port.lon);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestPort = { name: port.name, locode: port.locode, distanceNm: Math.round(dist) };
      }
    }

    if (nearestDist > mostRemoteDist) {
      mostRemoteDist = nearestDist;
      mostRemoteWp = wp;
      mostRemotePortName = nearestPort.name;
    }

    return {
      lat: wp.lat,
      lon: wp.lon,
      nearestPort,
      isRemote: nearestDist > REMOTE_THRESHOLD_NM,
    };
  });

  return {
    waypoints: analyzed,
    mostRemotePoint: {
      lat: mostRemoteWp.lat,
      lon: mostRemoteWp.lon,
      nearestPort: mostRemotePortName,
      distanceNm: Math.round(mostRemoteDist),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// BUNKERING RANGE CHECK
// ═══════════════════════════════════════════════════════════════════

export interface BunkeringAlert {
  isLongVoyage: boolean;
  voyageDays: number;
  message: string;
}

/**
 * Simple heuristic: flag voyages exceeding 20 days as requiring
 * bunkering verification. A proper implementation would use actual
 * fuel tank capacity data.
 */
export function checkBunkeringRange(
  voyageDays: number,
  dailyConsumptionMt?: number,
): BunkeringAlert {
  const LONG_VOYAGE_THRESHOLD = 20; // days

  if (voyageDays > LONG_VOYAGE_THRESHOLD) {
    const fuelEstimate = dailyConsumptionMt
      ? `Estimated fuel requirement: ${Math.round(voyageDays * dailyConsumptionMt)} MT`
      : "Verify fuel capacity against voyage duration";

    return {
      isLongVoyage: true,
      voyageDays,
      message: `Extended passage (${voyageDays.toFixed(1)} days). ${fuelEstimate}. Verify bunkering adequacy before departure.`,
    };
  }

  return {
    isLongVoyage: false,
    voyageDays,
    message: "",
  };
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

function severityRank(s: WeatherSeverity): number {
  switch (s) {
    case "calm": return 0;
    case "moderate": return 1;
    case "rough": return 2;
    case "severe": return 3;
  }
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180)
    - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/** Haversine distance in nautical miles */
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in NM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
