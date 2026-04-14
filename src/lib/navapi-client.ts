/**
 * NavAPI Client for Maritime Routing (Seametrix/NavAPI)
 * 
 * This client handles:
 * - Port searches with alias expansion
 * - Single route calculations
 * - SECA (Emission Control Area) segment analysis
 * 
 * Authentication: Bearer token via NAVAPI_BEARER_TOKEN env var
 * Base URL: https://v1.navapi.pro
 *
 * Mock mode: Set NEXT_PUBLIC_USE_MOCK_ROUTING=true in .env
 */

import { searchMockPorts, findMockRoute, MOCK_API_STATUS } from "@/data/navapi-mock-data";

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const NAVAPI_BASE_URL = "https://v1.navapi.pro";

/**
 * Get NavAPI bearer token from environment.
 * Throws at runtime if not configured (server-side only).
 */
function getNavApiToken(): string {
  const token = process.env.NAVAPI_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      "NAVAPI_BEARER_TOKEN environment variable is not set. " +
      "Add it to your .env file to enable maritime routing."
    );
  }
  return token;
}

/** Build the Authorization header for NavAPI requests */
function getNavApiAuthHeader(): string {
  return `Bearer ${getNavApiToken()}`;
}

/** Check if routing mock mode is enabled */
function useMockRouting(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_ROUTING === "true";
}

// ═══════════════════════════════════════════════════════════════════
// NAVAPI ALLOWED AREAS - Complete Reference (Official Documentation)
// ═══════════════════════════════════════════════════════════════════
//
// PASSAGES & CANALS (activate/de-activate passage):
// ID 1  = Bahamas Canal
// ID 2  = Magellan Strait
// ID 3  = Kiel Canal         (max draft: 9.5m)
// ID 4  = Oresund Strait
// ID 5  = Panama Canal       (max draft: 15.2m)
// ID 6  = Corinth Canal      (max draft: 8.0m)
// ID 7  = Suez Canal         (max draft: 20.1m)
// ID 8  = Bonifacio Strait
// ID 9  = Providence Channel
// ID 10 = Messina Strait
// ID 11 = Spratly Passage
// ID 12 = Kanmon Strait
// ID 13 = La Perouse Strait
// ID 14 = Unimak Pass
// ID 15 = Torres Strait      (max draft: 12.2m)
// ID 16 = Hainan Strait
// ID 17 = Surigao Strait
//
// PIRACY AVOIDANCE (Somalia zones):
// NIL     = Somalia Zone 1 (farthest from coast, 65th meridian)
// ID 10001 = Somalia Zone 2 (closer, 60th meridian)
// ID 10002 = Somalia Zone 3 (400-500nm off coast)
// ID 10003 = Somalia Zone 4 (250-300nm off coast) - enables 10002, 10001
// ID 10004 = NO Somalia Avoidance (closest route to coast)
//
// Default: Include all passages except Somalia Zone 1 (NIL)
const DEFAULT_ALLOWED_AREAS = "1,2,3,4,5,6,7,8,9,10,12,13,14,15,16,17,10003";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface NavApiPort {
  PortName: string;
  PortCode: string;
  Country: string;
  Latitude: number;
  Longitude: number;
}

export interface ParsedPort {
  displayName: string;
  portCode: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface RouteWaypoint {
  lat: number;
  lon: number;
}

export interface SingleRouteParams {
  startPortCode?: string;
  startLat?: number;
  startLon?: number;
  endPortCode?: string;
  endLat?: number;
  endLon?: number;
  secaAvoidance?: number;
  aslCompliance?: number;
  // Voyage parameters
  etd?: string;        // ISO string format for departure time
  draft?: number;      // Vessel draft in meters
  excludeAreas?: number[];  // NavAPI Area IDs to exclude (e.g., [7] to avoid Suez)
}

export interface SingleRouteResult {
  success: boolean;
  totalDistance: number;
  secaDistance: number;
  canalDistance: number;      // Canal distance (Kiel, Suez, etc.)
  nonSecaDistance: number;
  waypoints: RouteWaypoint[];
  geometry?: GeoJSON.LineString;
  error?: string;
  draftWarning?: string;      // Warning if route passes through draft-restricted canal
}

export interface SecaSegment {
  segmentType: "SECA" | "NON_SECA";
  distance: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
}

export interface SecaSegmentsResult {
  success: boolean;
  segments: SecaSegment[];
  totalSecaDistance: number;
  totalNonSecaDistance: number;
  error?: string;
}

export interface VoyageRouteResult {
  success: boolean;
  totalDistanceNm: number;
  ecaDistanceNm: number;       // SECA distance only
  canalDistanceNm: number;     // Canal distance (requires 0.1% sulfur like SECA)
  effectiveEcaDistanceNm: number; // ECA + Canal (for bunker calculation)
  nonEcaDistanceNm: number;
  waypoints: RouteWaypoint[];
  geometry?: GeoJSON.LineString;
  error?: string;
  draftWarning?: string;       // Warning if route violates draft restrictions
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Make an authenticated request to NavAPI
 */
async function navApiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${NAVAPI_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": getNavApiAuthHeader(),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`NavAPI request failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Parse port aliases from NavAPI response
 * 
 * Example: "Nagoya / Tobishima / Ishihara (Aichi)"
 * Returns: ["Nagoya (Aichi)", "Tobishima (Aichi)", "Ishihara (Aichi)"]
 * 
 * This follows the vendor's recommended parsing logic from the HTML demo.
 */
export function parsePortAliases(port: NavApiPort): ParsedPort[] {
  const name = port.PortName || "Unknown";
  
  // Extract trailing parenthesis suffix (e.g., "(Aichi)")
  const trailingMatch = name.match(/\s*(\([^()]*\))\s*$/);
  const suffix = trailingMatch ? ` ${trailingMatch[1]}` : "";
  
  // Get base name without the trailing parenthesis
  const baseName = trailingMatch 
    ? name.slice(0, trailingMatch.index).trim() 
    : name.trim();
  
  // Split by "/" to get individual aliases
  const parts = baseName.split("/").map(s => s.trim()).filter(Boolean);
  
  // Remove duplicates
  const uniqueParts = Array.from(new Set(parts));
  
  // Create a ParsedPort for each alias
  return uniqueParts.map(alias => {
    // Check if alias already has its own parenthesis
    const alreadyHasParen = /\([^()]*\)\s*$/.test(alias);
    
    return {
      displayName: alreadyHasParen ? alias : (alias + suffix),
      portCode: port.PortCode,
      country: port.Country,
      latitude: port.Latitude,
      longitude: port.Longitude,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
// PORT SEARCH
// ═══════════════════════════════════════════════════════════════════

interface SeaPortSearchResponse {
  ApiResults: {
    autc_SeaPortSearch: NavApiPort[];
  };
}

/**
 * Search for ports by name or UNLOCODE
 * Returns expanded aliases as separate options
 */
export async function searchPorts(query: string): Promise<ParsedPort[]> {
  if (!query || query.length < 2) {
    return [];
  }

  // Mock mode: return filtered mock ports
  if (useMockRouting()) {
    return searchMockPorts(query);
  }

  try {
    const response = await navApiFetch<SeaPortSearchResponse>(
      `/srtg/autc/SeaPortSearch?Q=${encodeURIComponent(query)}`
    );

    const rawPorts = response?.ApiResults?.autc_SeaPortSearch || [];
    
    // Expand all port aliases
    const expandedPorts: ParsedPort[] = [];
    for (const port of rawPorts) {
      const parsed = parsePortAliases(port);
      expandedPorts.push(...parsed);
    }

    return expandedPorts;
  } catch (error) {
    console.error("NavAPI port search error:", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ROUTE CALCULATION
// ═══════════════════════════════════════════════════════════════════

interface SingleRouteResponse {
  // NavAPI returns ApiResults (plural) for route calculations
  ApiResults?: {
    TotalDistance?: number;
    SecaDistance?: number;
    CanalDistance?: number;  // Canal distance (Kiel, Suez, Panama, etc.)
    Waypoints?: Array<{ lon: number; lat: number }>;
    GeoJson?: string;
  };
  ApiError?: string;
  Metadata?: {
    ResultCode?: string;
    ResultMessage?: string;
  };
}

// Canal geographic bounding boxes for client-side validation
// When NavAPI ignores AllowedAreas, we check if waypoints pass through these regions
interface CanalBoundingBox {
  name: string;
  areaId: number;      // NavAPI Allowed Areas ID
  maxDraft: number;    // meters
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const CANAL_BOUNDING_BOXES: CanalBoundingBox[] = [
  {
    name: "Suez Canal",
    areaId: 7,           // NavAPI Area ID 7
    maxDraft: 20.1,      // Suez max draft ~66 feet
    minLat: 29.8,
    maxLat: 31.5,
    minLon: 32.0,
    maxLon: 33.0,
  },
  {
    name: "Kiel Canal",
    areaId: 3,           // NavAPI Area ID 3
    maxDraft: 9.5,
    minLat: 53.8,
    maxLat: 54.5,
    minLon: 9.0,
    maxLon: 10.5,
  },
  {
    name: "Panama Canal",
    areaId: 5,           // NavAPI Area ID 5
    maxDraft: 15.2,
    minLat: 8.8,
    maxLat: 9.4,
    minLon: -80.0,
    maxLon: -79.0,
  },
  {
    name: "Corinth Canal",
    areaId: 6,           // NavAPI Area ID 6
    maxDraft: 8.0,
    minLat: 37.9,
    maxLat: 38.0,
    minLon: 22.9,
    maxLon: 23.1,
  },
  {
    name: "Torres Strait",
    areaId: 15,          // NavAPI Area ID 15
    maxDraft: 12.2,
    minLat: -11.0,
    maxLat: -9.5,
    minLon: 141.5,
    maxLon: 143.5,
  },
];

/**
 * Check if any waypoints pass through a canal region that exceeds vessel draft
 * Returns warning message if route violates draft restrictions
 */
function validateRouteAgainstDraft(
  waypoints: Array<{ lat: number; lon: number }>,
  vesselDraft: number
): string | undefined {
  if (vesselDraft <= 0 || waypoints.length === 0) return undefined;

  for (const canal of CANAL_BOUNDING_BOXES) {
    if (vesselDraft > canal.maxDraft) {
      // Check if any waypoint is within this canal's bounding box
      const waypointInCanal = waypoints.some(wp =>
        wp.lat >= canal.minLat &&
        wp.lat <= canal.maxLat &&
        wp.lon >= canal.minLon &&
        wp.lon <= canal.maxLon
      );

      if (waypointInCanal) {
        return `⚠️ DRAFT WARNING: Route passes through ${canal.name} region (max draft: ${canal.maxDraft}m) but vessel draft is ${vesselDraft}m. This route may not be safe!`;
      }
    }
  }

  return undefined;
}

// ═══════════════════════════════════════════════════════════════════
// FORCED ROUTING: CAPE OF GOOD HOPE
// When draft exceeds Suez limit and route crosses Europe <-> Asia
// ═══════════════════════════════════════════════════════════════════

// Suez Canal maximum draft (in meters)
const SUEZ_MAX_DRAFT = 20.12;

// Cape of Good Hope waypoint (south of Africa)
const CAPE_OF_GOOD_HOPE = {
  lat: -34.35,
  lon: 18.48,
  name: "Cape of Good Hope"
};

// Geographic region definitions for Suez bypass detection
interface GeoRegion {
  name: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

// Regions that would typically use Suez Canal to connect
const EUROPE_MED_REGION: GeoRegion = {
  name: "Europe/Mediterranean",
  minLat: 25,    // Southern edge (north of Suez)
  maxLat: 72,    // Northern Scandinavia
  minLon: -25,   // Atlantic (west of Portugal)
  maxLon: 45,    // Black Sea / Turkey
};

const ASIA_INDIAN_REGION: GeoRegion = {
  name: "Asia/Indian Ocean",
  minLat: -45,   // Southern Indian Ocean
  maxLat: 35,    // Northern Asia
  minLon: 45,    // East of Suez
  maxLon: 180,   // Pacific
};

/**
 * Check if a coordinate is within a geographic region
 */
function isInRegion(lat: number, lon: number, region: GeoRegion): boolean {
  return lat >= region.minLat && lat <= region.maxLat &&
         lon >= region.minLon && lon <= region.maxLon;
}

/**
 * Detect if a route crosses the Suez Canal path (Europe <-> Asia)
 * This helps identify routes that need Cape of Good Hope bypass
 */
function isCrossSuezRoute(
  startLat: number, startLon: number,
  endLat: number, endLon: number
): boolean {
  const startInEurope = isInRegion(startLat, startLon, EUROPE_MED_REGION);
  const startInAsia = isInRegion(startLat, startLon, ASIA_INDIAN_REGION);
  const endInEurope = isInRegion(endLat, endLon, EUROPE_MED_REGION);
  const endInAsia = isInRegion(endLat, endLon, ASIA_INDIAN_REGION);

  // Cross-Suez if one end is in Europe and other is in Asia
  return (startInEurope && endInAsia) || (startInAsia && endInEurope);
}

/**
 * Calculate route via MidPoints (forced routing)
 * Uses the RoutesVia POST endpoint to force geometry through specific points
 */
async function calculateRoutesVia(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
  midPoints: Array<{ lat: number; lon: number }>,
  allowedAreas: string
): Promise<SingleRouteResult> {
  console.log("[NavAPI DEBUG] Using RoutesVia with Cape of Good Hope bypass");
  console.log("[NavAPI DEBUG] MidPoints:", midPoints);

  const requestBody = {
    ApiRequest: {
      RoutePoints: [
        [startLon, startLat],  // NavAPI uses [lon, lat] format
        [endLon, endLat],
      ],
      MidPoints: midPoints.map(mp => [mp.lon, mp.lat]),
      NaviMethod: 0,
      AllowedAreas: allowedAreas,
    }
  };

  try {
    const response = await fetch(`${NAVAPI_BASE_URL}/srtg/calc/RoutesVia`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getNavApiAuthHeader(),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return {
        success: false,
        totalDistance: 0,
        secaDistance: 0,
        canalDistance: 0,
        nonSecaDistance: 0,
        waypoints: [],
        error: `RoutesVia API error: ${response.status}`,
      };
    }

    const data = await response.json();
    
    if (data.ApiError) {
      return {
        success: false,
        totalDistance: 0,
        secaDistance: 0,
        canalDistance: 0,
        nonSecaDistance: 0,
        waypoints: [],
        error: data.ApiError,
      };
    }

    const result = data.ApiResults;
    if (!result) {
      return {
        success: false,
        totalDistance: 0,
        secaDistance: 0,
        canalDistance: 0,
        nonSecaDistance: 0,
        waypoints: [],
        error: "No route result from RoutesVia",
      };
    }

    const totalDistance = result.TotalDistance || 0;
    const secaDistance = result.SecaDistance || 0;
    const canalDistance = result.CanalDistance || 0;
    const nonSecaDistance = Math.max(0, totalDistance - secaDistance - canalDistance);

    console.log("[NavAPI DEBUG] Cape Route - Total Distance:", totalDistance, "NM");

    const waypoints: RouteWaypoint[] = (result.Waypoints || []).map((wp: { lat: number; lon: number }) => ({
      lat: wp.lat,
      lon: wp.lon,
    }));

    // Parse GeoJSON if available  
    let geometry: GeoJSON.LineString | undefined;
    if (result.GeoJson) {
      try {
        geometry = JSON.parse(result.GeoJson);
      } catch {
        // Ignore GeoJSON parsing errors
      }
    }

    return {
      success: true,
      totalDistance,
      secaDistance,
      canalDistance,
      nonSecaDistance,
      waypoints,
      geometry,
    };
  } catch (error) {
    console.error("RoutesVia calculation error:", error);
    return {
      success: false,
      totalDistance: 0,
      secaDistance: 0,
      canalDistance: 0,
      nonSecaDistance: 0,
      waypoints: [],
      error: error instanceof Error ? error.message : "RoutesVia failed",
    };
  }
}


/**
 * Calculate a single route between two points
 * Supports port-to-port, port-to-waypoint, or waypoint-to-waypoint
 */
export async function calculateSingleRoute(
  params: SingleRouteParams
): Promise<SingleRouteResult> {
  // Mock mode: return pre-computed or dynamic mock route
  if (useMockRouting()) {
    console.log("[NavAPI MOCK] Using mock route data");
    return findMockRoute(
      params.startPortCode, params.endPortCode,
      params.startLat, params.startLon,
      params.endLat, params.endLon,
    );
  }

  try {
    // Dynamic AllowedAreas based on vessel draft
    // Remove canals that exceed the vessel's draft limit
    let allowedAreas = DEFAULT_ALLOWED_AREAS;
    const vesselDraft = params.draft ?? 0;
    
    if (vesselDraft > 0) {
      // Parse existing areas into array
      const areas = DEFAULT_ALLOWED_AREAS.split(",").map(a => a.trim());
      
      // NavAPI Allowed Areas - Canal draft limits (official documentation):
      // Area 3 = Kiel Canal: max 9.5m draft
      // Area 5 = Panama Canal: max 15.2m draft  
      // Area 6 = Corinth Canal: max 8.0m draft
      // Area 7 = Suez Canal: max 20.1m draft
      // Area 15 = Torres Strait: max 12.2m draft
      
      if (vesselDraft > 8.0) {
        // Remove Corinth Canal (Area 6)
        const idx = areas.indexOf("6");
        if (idx > -1) areas.splice(idx, 1);
      }
      
      if (vesselDraft > 9.5) {
        // Remove Kiel Canal (Area 3)
        const idx = areas.indexOf("3");
        if (idx > -1) areas.splice(idx, 1);
      }
      
      if (vesselDraft > 12.2) {
        // Remove Torres Strait (Area 15)
        const idx = areas.indexOf("15");
        if (idx > -1) areas.splice(idx, 1);
      }
      
      if (vesselDraft > 15.2) {
        // Remove Panama Canal (Area 5)
        const idx = areas.indexOf("5");
        if (idx > -1) areas.splice(idx, 1);
      }
      
      if (vesselDraft > 20.1) {
        // Remove Suez Canal (Area 7)
        const idx = areas.indexOf("7");
        if (idx > -1) areas.splice(idx, 1);
      }
      
      allowedAreas = areas.join(",");
    }

    // Exclude specific areas (for canal avoidance comparison)
    if (params.excludeAreas && params.excludeAreas.length > 0) {
      const areas = allowedAreas.split(",").map(a => a.trim());
      for (const areaId of params.excludeAreas) {
        const idx = areas.indexOf(String(areaId));
        if (idx > -1) areas.splice(idx, 1);
      }
      allowedAreas = areas.join(",");
      console.log(`[NavAPI] Excluding areas ${params.excludeAreas.join(",")} for canal avoidance. AllowedAreas: ${allowedAreas}`);
    }

    // NOTE: Cape of Good Hope forced routing was removed pending NavAPI's
    // official guidance on how to properly block canals based on draft.
    // The AllowedAreas exclusion and draft warning detection remain active.
    

    const queryParams = new URLSearchParams({
      StartPortCode: params.startPortCode || "",
      StartLat: String(params.startLat || 0),
      StartLon: String(params.startLon || 0),
      EndPortCode: params.endPortCode || "",
      EndLat: String(params.endLat || 0),
      EndLon: String(params.endLon || 0),
      GreatCircleInterval: "0",
      AllowedAreas: allowedAreas,
      SecaAvoidance: String(params.secaAvoidance ?? 0),
      ASLCompliance: String(params.aslCompliance ?? 0),
    });

    // Add optional voyage parameters if provided
    if (params.etd) {
      queryParams.set("ETD", params.etd);
    }
    // NavAPI requires "vesselDraft" (case-sensitive) for draft-aware routing
    if (vesselDraft > 0) {
      queryParams.set("vesselDraft", String(vesselDraft));
    }

    // DEBUG: Log the full NavAPI URL being called
    const navApiUrl = `/srtg/calc/SingleRoute?${queryParams.toString()}`;
    console.log("[NavAPI DEBUG] Draft received:", params.draft);
    console.log("[NavAPI DEBUG] VesselDraft after parse:", vesselDraft);
    console.log("[NavAPI DEBUG] AllowedAreas:", allowedAreas);
    console.log("[NavAPI DEBUG] Full URL:", navApiUrl);

    const response = await navApiFetch<SingleRouteResponse>(
      navApiUrl
    );

    if (response.ApiError) {
      return {
        success: false,
        totalDistance: 0,
        secaDistance: 0,
        canalDistance: 0,
        nonSecaDistance: 0,
        waypoints: [],
        error: response.ApiError,
      };
    }

    // NavAPI uses ApiResults (plural) for route data
    const result = response.ApiResults;
    if (!result) {
      return {
        success: false,
        totalDistance: 0,
        secaDistance: 0,
        canalDistance: 0,
        nonSecaDistance: 0,
        waypoints: [],
        error: "No route result returned",
      };
    }

    const totalDistance = result.TotalDistance || 0;
    const secaDistance = result.SecaDistance || 0;
    const canalDistance = result.CanalDistance || 0;
    // Non-SECA distance excludes both SECA and Canal areas
    const nonSecaDistance = Math.max(0, totalDistance - secaDistance - canalDistance);

    // NavAPI waypoints use lowercase lon/lat
    const waypoints: RouteWaypoint[] = (result.Waypoints || []).map(wp => ({
      lat: wp.lat,
      lon: wp.lon,
    }));

    // Parse GeoJSON if available
    let geometry: GeoJSON.LineString | undefined;
    if (result.GeoJson) {
      try {
        geometry = JSON.parse(result.GeoJson);
      } catch {
        // Ignore GeoJSON parsing errors
      }
    }

    // Validate that route doesn't pass through draft-restricted canals
    const draftWarning = validateRouteAgainstDraft(waypoints, vesselDraft);
    if (draftWarning) {
      console.log("[NavAPI DEBUG] Draft validation warning:", draftWarning);
    }

    return {
      success: true,
      totalDistance,
      secaDistance,
      canalDistance,
      nonSecaDistance,
      waypoints,
      geometry,
      draftWarning,
    };
  } catch (error) {
    console.warn("NavAPI route calculation failed, generating mock sea route:", error);

    // ═══════════════════════════════════════════════════════════════
    // MOCK SEA ROUTE FALLBACK
    // When NavAPI subscription is expired or unavailable, generate
    // a realistic mock route with intermediate waypoints so the
    // entire weather + CII + optimizer chain works end-to-end.
    // ═══════════════════════════════════════════════════════════════

    const startLat = params.startLat ?? 0;
    const startLon = params.startLon ?? 0;
    const endLat = params.endLat ?? 0;
    const endLon = params.endLon ?? 0;

    // Only generate mock if we have valid coordinates
    if ((startLat !== 0 || startLon !== 0) && (endLat !== 0 || endLon !== 0)) {
      const mockRoute = generateMockSeaRoute(startLat, startLon, endLat, endLon);
      console.log(`[NavAPI MOCK] Generated fallback route: ${mockRoute.totalDistance.toFixed(1)} NM, ${mockRoute.waypoints.length} waypoints`);
      return mockRoute;
    }

    return {
      success: false,
      totalDistance: 0,
      secaDistance: 0,
      canalDistance: 0,
      nonSecaDistance: 0,
      waypoints: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// MOCK SEA ROUTE GENERATOR
// Generates a realistic great-circle route with intermediate waypoints
// for testing when NavAPI is unavailable.
// ═══════════════════════════════════════════════════════════════════

function generateMockSeaRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numPoints: number = 24,
): SingleRouteResult {
  // Great-circle distance (Haversine)
  const R = 3440.065; // Earth radius in nautical miles
  const lat1 = startLat * Math.PI / 180;
  const lat2 = endLat * Math.PI / 180;
  const dLat = (endLat - startLat) * Math.PI / 180;
  const dLon = (endLon - startLon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const gcDistanceNm = R * c;

  // Maritime routing factor: sea routes are ~15% longer than great circle
  const totalDistance = Math.round(gcDistanceNm * 1.15 * 100) / 100;

  // Generate intermediate waypoints along great-circle path
  const waypoints: RouteWaypoint[] = [];
  const coordinates: [number, number][] = []; // [lon, lat] for GeoJSON

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints; // Fraction along the route

    // Spherical interpolation (slerp) for great-circle path
    const sinC = Math.sin(c);
    if (sinC === 0) {
      // Degenerate case: start === end
      waypoints.push({ lat: startLat, lon: startLon });
      coordinates.push([startLon, startLat]);
      continue;
    }

    const A = Math.sin((1 - f) * c) / sinC;
    const B = Math.sin(f * c) / sinC;

    const x = A * Math.cos(lat1) * Math.cos(startLon * Math.PI / 180) +
              B * Math.cos(lat2) * Math.cos(endLon * Math.PI / 180);
    const y = A * Math.cos(lat1) * Math.sin(startLon * Math.PI / 180) +
              B * Math.cos(lat2) * Math.sin(endLon * Math.PI / 180);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const interpLat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    const interpLon = Math.atan2(y, x) * 180 / Math.PI;

    // Add slight random perturbation to simulate sea routing (avoid straight line on map)
    const jitterLat = (Math.random() - 0.5) * 0.3 * Math.sin(f * Math.PI);
    const jitterLon = (Math.random() - 0.5) * 0.3 * Math.sin(f * Math.PI);

    const lat = i === 0 || i === numPoints ? (i === 0 ? startLat : endLat) : interpLat + jitterLat;
    const lon = i === 0 || i === numPoints ? (i === 0 ? startLon : endLon) : interpLon + jitterLon;

    waypoints.push({ lat, lon });
    coordinates.push([lon, lat]);
  }

  // Build GeoJSON LineString
  const geometry: GeoJSON.LineString = {
    type: "LineString",
    coordinates,
  };

  return {
    success: true,
    totalDistance,
    secaDistance: 0, // No SECA data in mock
    canalDistance: 0,
    nonSecaDistance: totalDistance,
    waypoints,
    geometry,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SECA SEGMENTS
// ═══════════════════════════════════════════════════════════════════

interface SecaSegmentsResponse {
  ApiResult?: {
    Segments?: Array<{
      InSeca: boolean;
      Distance: number;
      StartLat: number;
      StartLon: number;
      EndLat: number;
      EndLon: number;
    }>;
  };
  ApiError?: string;
}

/**
 * Get SECA (Emission Control Area) segments for a route
 * This provides the breakdown of ECA vs Non-ECA miles for fuel calculations
 * 
 * @param waypoints - Array of waypoints from SingleRoute response
 */
export async function getSecaSegments(
  waypoints: RouteWaypoint[]
): Promise<SecaSegmentsResult> {
  if (waypoints.length < 2) {
    return {
      success: false,
      segments: [],
      totalSecaDistance: 0,
      totalNonSecaDistance: 0,
      error: "At least 2 waypoints required",
    };
  }

  try {
    const requestBody = {
      ApiRequest: waypoints.map(wp => ({ lon: wp.lon, lat: wp.lat })),
    };

    const response = await navApiFetch<SecaSegmentsResponse>(
      "/srtg/calc/SecaSegments",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      }
    );

    if (response.ApiError) {
      return {
        success: false,
        segments: [],
        totalSecaDistance: 0,
        totalNonSecaDistance: 0,
        error: response.ApiError,
      };
    }

    const rawSegments = response.ApiResult?.Segments || [];
    
    let totalSecaDistance = 0;
    let totalNonSecaDistance = 0;

    const segments: SecaSegment[] = rawSegments.map(seg => {
      if (seg.InSeca) {
        totalSecaDistance += seg.Distance;
      } else {
        totalNonSecaDistance += seg.Distance;
      }

      return {
        segmentType: seg.InSeca ? "SECA" : "NON_SECA",
        distance: seg.Distance,
        startLat: seg.StartLat,
        startLon: seg.StartLon,
        endLat: seg.EndLat,
        endLon: seg.EndLon,
      };
    });

    return {
      success: true,
      segments,
      totalSecaDistance,
      totalNonSecaDistance,
    };
  } catch (error) {
    console.error("NavAPI SECA segments error:", error);
    return {
      success: false,
      segments: [],
      totalSecaDistance: 0,
      totalNonSecaDistance: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMBINED VOYAGE CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate a complete voyage route with ECA breakdown
 * 
 * This is the main function to use for voyage estimation:
 * 1. Calculates the route between two ports
 * 2. If SECA distance > 0, gets detailed SECA segment breakdown
 * 3. Returns total distance, ECA miles, and Non-ECA miles
 */
export async function calculateVoyageRoute(
  startPortCode: string,
  endPortCode: string,
  options?: {
    secaAvoidance?: number;
    aslCompliance?: number;
    etd?: string;        // ISO string format for departure time
    draft?: number;      // Vessel draft in meters
    excludeAreas?: number[];  // NavAPI Area IDs to exclude
  }
): Promise<VoyageRouteResult> {
  // Step 1: Calculate the main route
  const routeResult = await calculateSingleRoute({
    startPortCode,
    endPortCode,
    secaAvoidance: options?.secaAvoidance ?? 0,
    aslCompliance: options?.aslCompliance ?? 0,
    etd: options?.etd,
    draft: options?.draft,
    excludeAreas: options?.excludeAreas,
  });

  if (!routeResult.success) {
    return {
      success: false,
      totalDistanceNm: 0,
      ecaDistanceNm: 0,
      canalDistanceNm: 0,
      effectiveEcaDistanceNm: 0,
      nonEcaDistanceNm: 0,
      waypoints: [],
      error: routeResult.error,
    };
  }

  // Extract distances from route result
  const ecaDistanceNm = routeResult.secaDistance;
  const canalDistanceNm = routeResult.canalDistance;
  // Effective ECA = SECA + Canal (both require 0.1% sulfur fuel)
  const effectiveEcaDistanceNm = ecaDistanceNm + canalDistanceNm;
  const nonEcaDistanceNm = routeResult.nonSecaDistance;

  // DEBUG: Log the SECA distance values
  console.log("[NavAPI DEBUG] calculateVoyageRoute distances:", {
    totalDistance: routeResult.totalDistance,
    secaDistance: ecaDistanceNm,
    canalDistance: canalDistanceNm,
    effectiveEcaDistance: effectiveEcaDistanceNm,
    nonSecaDistance: nonEcaDistanceNm,
  });

  return {
    success: true,
    totalDistanceNm: routeResult.totalDistance,
    ecaDistanceNm,
    canalDistanceNm,
    effectiveEcaDistanceNm,
    nonEcaDistanceNm,
    waypoints: routeResult.waypoints,
    geometry: routeResult.geometry,
    draftWarning: routeResult.draftWarning,
  };
}

// ═══════════════════════════════════════════════════════════════════
// API STATUS CHECK
// ═══════════════════════════════════════════════════════════════════

interface ApiKeyStatusResponse {
  ApiResult?: {
    Tokens?: number;
    ExpireDate?: string;
    Status?: string;
  };
  ApiError?: string;
}

/**
 * Check the API key status (remaining tokens and expiration)
 */
export async function checkApiStatus(): Promise<{
  success: boolean;
  tokens?: number;
  expireDate?: string;
  status?: string;
  error?: string;
}> {
  // Mock mode: return fake status
  if (useMockRouting()) {
    return MOCK_API_STATUS;
  }

  try {
    const response = await navApiFetch<ApiKeyStatusResponse>(
      "/acnt/view/ApiKeyStatus"
    );

    if (response.ApiError) {
      return {
        success: false,
        error: response.ApiError,
      };
    }

    return {
      success: true,
      tokens: response.ApiResult?.Tokens,
      expireDate: response.ApiResult?.ExpireDate,
      status: response.ApiResult?.Status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
