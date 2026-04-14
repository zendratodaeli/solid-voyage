"use server";

/**
 * AIS Server Actions — NavAPI AISP Endpoints
 *
 * All NavAPI API calls are routed through these Server Actions.
 * The Bearer token is read from process.env.NAVAPI_BEARER_TOKEN
 * and is NEVER exposed to the client.
 *
 * Redis caching layer: All endpoints are cached via Upstash Redis
 * to minimize NavAPI token consumption and improve response times.
 */

import { prisma } from "@/lib/prisma";
import { cached, CACHE_TTL, hashKey } from "@/lib/redis";
import {
  MOCK_SHIP_SEARCH,
  MOCK_LAST_POSITION,
  MOCK_FLEET_POSITIONS,
  MOCK_HISTORICAL_TRACKS,
  MOCK_WITHIN_RANGE,
  MOCK_FIND_BY_DEST,
  findMockPosition,
} from "@/data/ais-mock-data";

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const NAVAPI_BASE = "https://v1.navapi.pro/aisp";

function useMockData(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_AIS === "true";
}

function getAuthHeader(): string {
  const token = process.env.NAVAPI_BEARER_TOKEN;
  if (!token) throw new Error("NAVAPI_BEARER_TOKEN is not configured");
  return `Bearer ${token}`;
}

// ═══════════════════════════════════════════════════════════════════
// TYPESCRIPT INTERFACES — API Response Types
// ═══════════════════════════════════════════════════════════════════

/** ShipSearch autocomplete result item */
export interface AisShipSearchResult {
  ShipName: string;
  ImoNumber: string;
  MmsiNumber: string;
  CallSign: string;
  ShipFlag: string;
}

/** Last Position / Fleet Position vessel data */
export interface AisVesselPosition {
  ShipName: string | null;
  ImoNumber: string | null;
  MmsiNumber: string | null;
  CallSign: string | null;
  ShipFlag: string | null;
  ShipType: number | string | null;
  NavigationStatus: number | string | null;
  Latitude: number | string | null;
  Longitude: number | string | null;
  SpeedOverGround: number | string | null;
  CourseOverGround: number | string | null;
  CourseTransmitted: number | string | null;
  TrueHeading: number | string | null;
  DestDeclared: string | null;
  EtaDeclared: string | null;
  OriginDeclared: string | null;
  DraughtDeclared: number | string | null;
  PositionLastUpdated: string | null;
  Length: number | string | null;
  Beam: number | string | null;
}

/** Historical track position point */
export interface AisTrackPoint {
  Latitude: number | string | null;
  Longitude: number | string | null;
  SpeedOverGround: number | string | null;
  CourseOverGround: number | string | null;
  CourseTransmitted: number | string | null;
  NavigationStatus: number | string | null;
  PositionLastUpdated: string | null;
}

/** Historical tracks response with vessel info + track array */
export interface AisHistoricalTracksResult {
  ShipName: string | null;
  ImoNumber: string | null;
  MmsiNumber: string | null;
  CallSign: string | null;
  ShipFlag: string | null;
  ShipType: number | string | null;
  EnquiredDataArray: AisTrackPoint[];
}

/** WithinRange response item */
export interface AisWithinRangeResult {
  ShipName: string | null;
  ImoNumber: string | null;
  MmsiNumber: string | null;
  CallSign: string | null;
  ShipFlag: string | null;
  ShipType: number | string | null;
  NavigationStatus: number | string | null;
  Latitude: number | string | null;
  Longitude: number | string | null;
  SpeedOverGround: number | string | null;
  CourseOverGround: number | string | null;
  CourseTransmitted: number | string | null;
  DestDeclared: string | null;
  EtaDeclared: string | null;
  PositionLastUpdated: string | null;
}

/** FindByDestination response item */
export interface AisFindByDestResult {
  ShipName: string | null;
  ImoNumber: string | null;
  MmsiNumber: string | null;
  CallSign: string | null;
  ShipFlag: string | null;
  ShipType: number | string | null;
  NavigationStatus: number | string | null;
  Latitude: number | string | null;
  Longitude: number | string | null;
  SpeedOverGround: number | string | null;
  CourseOverGround: number | string | null;
  CourseTransmitted: number | string | null;
  DestDeclared: string | null;
  EtaDeclared: string | null;
  OriginDeclared: string | null;
  DraughtDeclared: number | string | null;
  PositionLastUpdated: string | null;
}

/** Standard action result wrapper */
interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// 1. SHIP SEARCH (Autocomplete)
//    GET /aisp/autc/ShipSearch?Q={query}
// ═══════════════════════════════════════════════════════════════════

export async function searchShips(
  query: string
): Promise<ActionResult<AisShipSearchResult[]>> {
  try {
    if (!query || query.trim().length < 3) {
      return { success: true, data: [] };
    }

    // Mock mode — bypass cache
    if (useMockData()) {
      const q = query.trim().toUpperCase();
      const filtered = MOCK_SHIP_SEARCH.filter(
        (s) => s.ShipName.toUpperCase().includes(q) ||
               s.MmsiNumber.includes(q) ||
               s.ImoNumber.includes(q)
      );
      return { success: true, data: filtered };
    }

    const cleanQuery = query.trim().toUpperCase();
    const cacheKey = `ais:search:${hashKey(cleanQuery)}`;

    const results = await cached<AisShipSearchResult[]>(
      cacheKey,
      CACHE_TTL.AIS_SEARCH,
      async () => {
        const url = `${NAVAPI_BASE}/autc/ShipSearch?Q=${encodeURIComponent(cleanQuery)}`;
        const res = await fetch(url, {
          headers: { Authorization: getAuthHeader() },
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`ShipSearch failed: ${res.status}`);
        }

        const json = await res.json();
        if (json?.ApiResults?.err) {
          throw new Error(json.ApiResults.msg || "ShipSearch API error");
        }

        return json?.ApiResults?.autc_ShipSearch ?? [];
      }
    );

    return { success: true, data: results };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "ShipSearch failed",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. LAST POSITION (Single Vessel)
//    GET /aisp/svsl/LastPosition?Name=&Mmsi={mmsi}&Imo={imo}
// ═══════════════════════════════════════════════════════════════════

export async function getLastPosition(params: {
  mmsi?: string;
  imo?: string;
  name?: string;
}): Promise<ActionResult<AisVesselPosition[]>> {
  try {
    // Mock mode — return vessel-specific position
    if (useMockData()) {
      return { success: true, data: findMockPosition(params) };
    }

    const identifier = params.mmsi || params.imo || params.name || "unknown";
    const cacheKey = `ais:position:${hashKey(identifier)}`;

    const results = await cached<AisVesselPosition[]>(
      cacheKey,
      CACHE_TTL.AIS_POSITION,
      async () => {
        const qs = new URLSearchParams({
          Name: params.name ?? "",
          Mmsi: params.mmsi ?? "",
          Imo: params.imo ?? "",
        });

        const url = `${NAVAPI_BASE}/svsl/LastPosition?${qs.toString()}`;
        const res = await fetch(url, {
          headers: { Authorization: getAuthHeader() },
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`LastPosition failed: ${res.status}`);
        }

        const json = await res.json();
        if (json?.ApiResults?.err) {
          throw new Error(json.ApiResults.msg || "LastPosition API error");
        }

        return json?.ApiResults?.svsl_LastPosition ?? [];
      }
    );

    return { success: true, data: results };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "LastPosition failed",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. FLEET POSITIONS (Multiple Vessels — max 100 per call)
//    POST /aisp/mvsl/FleetPositions
//    Body: { MmsiNumbers: [...] } or { ImoNumbers: [...] }
//    Auto-batches in chunks of 100 and merges results.
// ═══════════════════════════════════════════════════════════════════

export async function getFleetPositions(params: {
  mmsiNumbers?: string[];
  imoNumbers?: string[];
}): Promise<ActionResult<AisVesselPosition[]>> {
  try {
    const mmsiList = params.mmsiNumbers?.filter(Boolean) ?? [];
    const imoList = params.imoNumbers?.filter(Boolean) ?? [];

    if (mmsiList.length === 0 && imoList.length === 0) {
      return { success: true, data: [] };
    }

    // Mock mode — bypass cache
    if (useMockData()) {
      return { success: true, data: MOCK_FLEET_POSITIONS };
    }

    // Cache key based on sorted identifiers for consistency
    const useMMSI = mmsiList.length > 0;
    const identifiers = useMMSI ? mmsiList : imoList;
    const sortedIds = [...identifiers].sort().join(",");
    const cacheKey = `ais:fleet:${hashKey(sortedIds)}`;

    const allResults = await cached<AisVesselPosition[]>(
      cacheKey,
      CACHE_TTL.AIS_FLEET,
      async () => {
        const BATCH_SIZE = 100;

        // Split into chunks of 100
        const chunks: string[][] = [];
        for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
          chunks.push(identifiers.slice(i, i + BATCH_SIZE));
        }

        // Fetch all chunks in parallel
        const chunkResults = await Promise.all(
          chunks.map(async (chunk) => {
            const body = useMMSI
              ? { MmsiNumbers: chunk }
              : { ImoNumbers: chunk };

            const res = await fetch(`${NAVAPI_BASE}/mvsl/FleetPositions`, {
              method: "POST",
              headers: {
                Authorization: getAuthHeader(),
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
              cache: "no-store",
            });

            if (!res.ok) {
              throw new Error(`FleetPositions batch failed: ${res.status}`);
            }

            const json = await res.json();
            return (json?.ApiResults?.mvsl_FleetPositions ?? []) as AisVesselPosition[];
          })
        );

        return chunkResults.flat();
      }
    );

    return { success: true, data: allResults };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "FleetPositions failed",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. HISTORICAL TRACKS (Single Vessel)
//    POST /aisp/svsl/HistoricalTracks
//    Body: { MmsiNumber, HistoryFrom, HistoryUntil }
// ═══════════════════════════════════════════════════════════════════

export async function getHistoricalTracks(params: {
  mmsiNumber?: string;
  imoNumber?: string;
  historyFrom: string; // ISO 8601 UTC e.g. "2025-01-01T00:00:00Z"
  historyUntil: string; // ISO 8601 UTC
}): Promise<ActionResult<AisHistoricalTracksResult[]>> {
  try {
    // Mock mode — bypass cache
    if (useMockData()) {
      return { success: true, data: MOCK_HISTORICAL_TRACKS };
    }

    const identifier = params.mmsiNumber || params.imoNumber;
    if (!identifier) return { success: false, error: "MMSI or IMO required" };

    const cacheKey = `ais:tracks:${hashKey(identifier, params.historyFrom, params.historyUntil)}`;

    const results = await cached<AisHistoricalTracksResult[]>(
      cacheKey,
      CACHE_TTL.AIS_TRACKS,
      async () => {
        const body: Record<string, string> = {
          HistoryFrom: params.historyFrom,
          HistoryUntil: params.historyUntil,
        };

        if (params.mmsiNumber) body.MmsiNumber = params.mmsiNumber;
        else if (params.imoNumber) body.ImoNumber = params.imoNumber;

        const res = await fetch(`${NAVAPI_BASE}/svsl/HistoricalTracks`, {
          method: "POST",
          headers: {
            Authorization: getAuthHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`HistoricalTracks failed: ${res.status}`);
        }

        const json = await res.json();
        if (json?.ApiResults?.err) {
          throw new Error(json.ApiResults.msg || "HistoricalTracks API error");
        }

        return json?.ApiResults?.svsl_HistoricalTracks ?? [];
      }
    );

    return { success: true, data: results };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "HistoricalTracks failed",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. WITHIN RANGE
//    GET /aisp/mvsl/WithinRange?Lat=&Lon=&Km=&ShipType=&NavStatus=
// ═══════════════════════════════════════════════════════════════════

export async function getWithinRange(params: {
  latitude: number;
  longitude: number;
  km: number;
  shipType?: number;
  navStatus?: number;
}): Promise<ActionResult<AisWithinRangeResult[]>> {
  try {
    // Mock mode — bypass cache
    if (useMockData()) {
      return { success: true, data: MOCK_WITHIN_RANGE };
    }

    // Round coordinates to 2 decimals for cache key stability
    const latRound = Math.round(params.latitude * 100) / 100;
    const lonRound = Math.round(params.longitude * 100) / 100;
    const cacheKey = `ais:range:${hashKey(String(latRound), String(lonRound), String(params.km), String(params.shipType ?? 0))}`;

    const results = await cached<AisWithinRangeResult[]>(
      cacheKey,
      CACHE_TTL.AIS_RANGE,
      async () => {
        const qs = new URLSearchParams({
          Lat: String(params.latitude),
          Lon: String(params.longitude),
          Km: String(params.km),
        });

        if (params.shipType !== undefined && params.shipType !== 0) {
          qs.set("ShipType", String(params.shipType));
        }
        if (params.navStatus !== undefined) {
          qs.set("NavStatus", String(params.navStatus));
        }

        const url = `${NAVAPI_BASE}/mvsl/WithinRange?${qs.toString()}`;
        const res = await fetch(url, {
          headers: { Authorization: getAuthHeader() },
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`WithinRange failed: ${res.status}`);
        }

        const json = await res.json();

        // Check for API-level errors (NavAPI returns HTTP 200 even on errors)
        const meta = json?.Metadata;
        if (meta?.ResultCode !== undefined && meta.ResultCode !== 1) {
          throw new Error(meta.ResultMessage || "Unknown API error");
        }
        if (json?.ApiResults?.err) {
          throw new Error(json.ApiResults.msg || "API error");
        }

        return json?.ApiResults?.mvsl_WithinRange ?? [];
      }
    );

    return { success: true, data: results };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "WithinRange failed",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. FIND BY DESTINATION
//    POST /aisp/mvsl/FindByDestination
//    Body: { DestDeclared, EtaFrom, EtaUntil, ShipType? }
// ═══════════════════════════════════════════════════════════════════

export async function findByDestination(params: {
  destDeclared: string[];  // Array of destinations (comma-separated parsed by caller)
  etaFrom: string;
  etaUntil: string;
  shipType?: number;
}): Promise<ActionResult<AisFindByDestResult[]>> {
  try {
    // Mock mode — bypass cache
    if (useMockData()) {
      return { success: true, data: MOCK_FIND_BY_DEST };
    }

    const destinations = params.destDeclared.map((d) => d.toUpperCase().trim()).filter(Boolean);
    const cacheKey = `ais:dest:${hashKey(destinations.join(","), params.etaFrom, params.etaUntil, String(params.shipType ?? 0))}`;

    const results = await cached<AisFindByDestResult[]>(
      cacheKey,
      CACHE_TTL.AIS_DESTINATION,
      async () => {
        const body: Record<string, unknown> = {
          DestDeclared: destinations,
          EtaFrom: params.etaFrom,
          EtaUntil: params.etaUntil,
        };

        if (params.shipType !== undefined && params.shipType !== 0) {
          body.ShipType = String(params.shipType);
        }

        const res = await fetch(`${NAVAPI_BASE}/mvsl/FindByDestination`, {
          method: "POST",
          headers: {
            Authorization: getAuthHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`FindByDestination failed: ${res.status}`);
        }

        const json = await res.json();
        if (json?.ApiResults?.err) {
          throw new Error(json.ApiResults.msg || "FindByDestination API error");
        }

        return json?.ApiResults?.mvsl_FindByDestination ?? [];
      }
    );

    return { success: true, data: results };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "FindByDestination failed",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. ORG FLEET POSITIONS (Prisma → FleetPositions)
//    Queries the user's org vessels from DB, extracts MMSIs,
//    and calls getFleetPositions automatically.
// ═══════════════════════════════════════════════════════════════════

export async function getOrgFleetPositions(
  orgId: string
): Promise<ActionResult<AisVesselPosition[]>> {
  try {
    if (!orgId) {
      return { success: false, error: "Organization ID required" };
    }

    // Query all vessels for this org that have an MMSI
    const vessels = await prisma.vessel.findMany({
      where: {
        orgId,
        mmsiNumber: { not: null },
      },
      select: {
        mmsiNumber: true,
      },
    });

    const mmsiNumbers = vessels
      .map((v) => v.mmsiNumber)
      .filter((m): m is string => m !== null && m.length > 0);

    if (mmsiNumbers.length === 0) {
      return { success: true, data: [] };
    }

    // Delegate to getFleetPositions with auto-batching
    return getFleetPositions({ mmsiNumbers });
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "OrgFleetPositions failed",
    };
  }
}
