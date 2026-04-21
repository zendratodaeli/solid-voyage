"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  calculateValidatedZoneDistances,
  isMediterraneanSecaEffective,
} from "@/lib/route-zone-classifier";
import { calculateHRADistances } from "@/lib/route-zone-classifier";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface RouteAlternative {
  id: string;
  label: string; // e.g., "Via Suez Canal", "Cape of Good Hope", "Direct"
  rank: number;
  legs: RouteLeg[];
  totalDistanceNm: number;
  totalEcaDistanceNm: number;
  totalHraDistanceNm: number;
  ecaZones: string[];
  hraZones: string[];
  detectedCanals: string[];
  estimatedSeaDays: number;
  routeGeometry: [number, number][][]; // per-leg GeoJSON coordinates
  /** AI-generated one-liner for why it's ranked this way (filled post-calculation) */
  rankReason?: string;
}

export interface RouteLeg {
  legNumber: number;
  from: string;
  to: string;
  distanceNm: number;
  ecaDistanceNm: number;
  hraDistanceNm: number;
  condition: "ballast" | "laden";
  speedKnots: number;
  sailingHours: number;
  ecaZones: string[];
  hraZones: string[];
  geometry: [number, number][];
}

export interface AutoRouteResult {
  /** The best route (rank 1) */
  bestRoute: RouteAlternative;
  /** All alternatives including the best (sorted by rank) */
  alternatives: RouteAlternative[];
  /** Leg distances for the best route (for filling form fields) */
  legDistances: number[];
  /** Country codes extracted from ports */
  originCountryCode?: string;
  destinationCountryCode?: string;
  /** Timestamp of calculation */
  calculatedAt: string;
}

export type AutoRouteStatus = "idle" | "calculating" | "complete" | "error";

export interface AutoRouteState {
  status: AutoRouteStatus;
  result: AutoRouteResult | null;
  error: string | null;
  /** Which fields are still missing for auto-route to fire */
  missingFields: string[];
  /** Whether the engine has sufficient data to calculate */
  isReady: boolean;
}

interface AutoRouteInput {
  vesselId: string;
  vesselName: string;
  openPort: string;
  loadPorts: string[];
  dischargePorts: string[];
  ballastSpeed: number;
  ladenSpeed: number;
  ballastConsumption: number;
  ladenConsumption: number;
  draft: number;
  portLoadDays: string[];
  portDischargeDays: string[];
  portLoadWaiting: string[];
  portDischargeWaiting: string[];
  etd: string;
}

interface UseVoyageAutoRouteOptions {
  /** Called when leg distances are auto-filled */
  onDistancesCalculated?: (distances: string[]) => void;
  /** Called when country codes are extracted */
  onCountryCodesDetected?: (origin?: string, destination?: string) => void;
  /** Debounce delay in ms (default: 1500) */
  debounceMs?: number;
  /** Enable/disable auto-route (e.g., disabled in edit mode) */
  enabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════

export function useVoyageAutoRoute(
  input: AutoRouteInput,
  options: UseVoyageAutoRouteOptions = {}
) {
  const { onDistancesCalculated, onCountryCodesDetected, debounceMs = 1500, enabled = true } = options;

  const [state, setState] = useState<AutoRouteState>({
    status: "idle",
    result: null,
    error: null,
    missingFields: [],
    isReady: false,
  });

  // Refs for callbacks to avoid stale closures
  const onDistancesRef = useRef(onDistancesCalculated);
  const onCountryCodesRef = useRef(onCountryCodesDetected);
  useEffect(() => { onDistancesRef.current = onDistancesCalculated; }, [onDistancesCalculated]);
  useEffect(() => { onCountryCodesRef.current = onCountryCodesDetected; }, [onCountryCodesDetected]);

  // Abort controller for cancelling in-flight calculations
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track calculation version to discard stale results
  const calcVersionRef = useRef(0);

  // ── Check readiness ──────────────────────────────────────────
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!input.vesselId) missing.push("Vessel");
    if (!input.openPort) missing.push("Open Port / Start Position");
    const hasLoadPort = input.loadPorts.some(p => p.trim());
    if (!hasLoadPort) missing.push("Load Port");
    const hasDischargePort = input.dischargePorts.some(p => p.trim());
    if (!hasDischargePort) missing.push("Discharge Port");
    const hasLoadDays = input.portLoadDays.some(d => parseFloat(d) > 0);
    if (!hasLoadDays) missing.push("Load Port Days");
    const hasDischargeDays = input.portDischargeDays.some(d => parseFloat(d) > 0);
    if (!hasDischargeDays) missing.push("Discharge Port Days");
    return missing;
  }, [input.vesselId, input.openPort, input.loadPorts, input.dischargePorts, input.portLoadDays, input.portDischargeDays]);

  const isReady = missingFields.length === 0;

  // ── Build the trigger fingerprint ────────────────────────────
  // A serialized key of all trigger fields. When this changes, re-calculate.
  const triggerKey = useMemo(() => {
    if (!isReady) return null;
    return JSON.stringify({
      vesselId: input.vesselId,
      openPort: input.openPort,
      loadPorts: input.loadPorts.filter(p => p.trim()),
      dischargePorts: input.dischargePorts.filter(p => p.trim()),
      ballastSpeed: input.ballastSpeed,
      ladenSpeed: input.ladenSpeed,
      draft: input.draft,
      etd: input.etd,
    });
  }, [isReady, input.vesselId, input.openPort, input.loadPorts, input.dischargePorts, input.ballastSpeed, input.ladenSpeed, input.draft, input.etd]);

  // ── Core calculation logic ───────────────────────────────────
  const calculate = useCallback(async (signal: AbortSignal, version: number) => {
    setState(prev => ({ ...prev, status: "calculating", error: null, missingFields, isReady }));

    try {
      const filledLoadPorts = input.loadPorts.filter(p => p.trim());
      const filledDischargePorts = input.dischargePorts.filter(p => p.trim());

      // Build waypoint sequence: Open → Load1 → Load2... → Discharge1 → Discharge2...
      const waypoints: { name: string; type: "ballast" | "laden" }[] = [];
      waypoints.push({ name: input.openPort, type: "ballast" });
      filledLoadPorts.forEach(p => waypoints.push({ name: p, type: "laden" }));
      filledDischargePorts.forEach(p => waypoints.push({ name: p, type: "laden" }));

      // Calculate primary route (standard routing)
      const primaryLegs = await calculateRouteLegs(
        waypoints, input, signal
      );

      if (signal.aborted) return;

      // Check if we detected canals — if so, calculate an alternative without canals
      const detectedCanals = extractDetectedCanals(primaryLegs);
      const alternatives: RouteAlternative[] = [];

      // Build primary route alternative
      const primaryRoute = buildRouteAlternative(
        "primary",
        detectedCanals.length > 0
          ? `Via ${detectedCanals.join(" + ")}`
          : "Direct Route",
        1,
        primaryLegs,
        input
      );
      alternatives.push(primaryRoute);

      // If canals detected, calculate canal-avoidance alternative
      if (detectedCanals.length > 0 && !signal.aborted) {
        try {
          const altLegs = await calculateRouteLegs(
            waypoints, input, signal, { avoidCanals: true }
          );
          if (!signal.aborted && altLegs.length > 0) {
            const capeRoute = buildRouteAlternative(
              "avoid-canals",
              "Avoid Canal (Cape Route)",
              2,
              altLegs,
              input
            );

            // Rank: if canal route is actually longer, swap ranks
            if (capeRoute.totalDistanceNm < primaryRoute.totalDistanceNm) {
              capeRoute.rank = 1;
              primaryRoute.rank = 2;
              alternatives.unshift(alternatives.pop()!);
            }
            alternatives.push(capeRoute);
          }
        } catch {
          console.warn("[AutoRoute] Canal-avoidance alternative failed");
        }
      }

      if (signal.aborted) return;

      // Sort by rank
      alternatives.sort((a, b) => a.rank - b.rank);

      // Generate rank reasons
      alternatives.forEach((alt, i) => {
        if (i === 0) {
          alt.rankReason = "Best balance of distance, fuel cost, and compliance.";
        } else {
          const best = alternatives[0];
          const distDiff = alt.totalDistanceNm - best.totalDistanceNm;
          const daysDiff = alt.estimatedSeaDays - best.estimatedSeaDays;
          const parts: string[] = [];
          if (distDiff > 0) parts.push(`+${Math.round(distDiff).toLocaleString()} NM`);
          if (daysDiff > 0) parts.push(`+${daysDiff.toFixed(1)} sea days`);
          if (alt.totalEcaDistanceNm < best.totalEcaDistanceNm) {
            parts.push(`${Math.round(best.totalEcaDistanceNm - alt.totalEcaDistanceNm)} NM less ECA`);
          }
          if (alt.detectedCanals.length === 0 && best.detectedCanals.length > 0) {
            parts.push(`avoids ${best.detectedCanals.join("/")} tolls`);
          }
          alt.rankReason = parts.length > 0
            ? `Trade-off: ${parts.join(", ")}.`
            : "Alternative routing option.";
        }
      });

      // Verify this is still the latest calculation
      if (version !== calcVersionRef.current) return;

      const bestRoute = alternatives[0];
      const legDistances = bestRoute.legs.map(l => l.distanceNm);

      // Extract country codes from port codes if available
      const originCC = bestRoute.legs[0]?.from?.match(/\[([A-Z]{2})/)?.[1];
      const destCC = bestRoute.legs[bestRoute.legs.length - 1]?.to?.match(/\[([A-Z]{2})/)?.[1];

      const result: AutoRouteResult = {
        bestRoute,
        alternatives,
        legDistances,
        originCountryCode: originCC,
        destinationCountryCode: destCC,
        calculatedAt: new Date().toISOString(),
      };

      setState({
        status: "complete",
        result,
        error: null,
        missingFields: [],
        isReady: true,
      });

      // Fire callbacks
      onDistancesRef.current?.(legDistances.map(String));
      onCountryCodesRef.current?.(originCC, destCC);

    } catch (err) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : "Route calculation failed";
      console.error("[AutoRoute] Calculation error:", err);
      setState(prev => ({
        ...prev,
        status: "error",
        error: message,
      }));
    }
  }, [input, missingFields, isReady]);

  // ── Debounced trigger effect ─────────────────────────────────
  useEffect(() => {
    // Update missing fields immediately
    setState(prev => ({ ...prev, missingFields, isReady }));

    if (!enabled || !isReady || !triggerKey) return;

    // Cancel previous debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Cancel previous in-flight calculation
    if (abortRef.current) {
      abortRef.current.abort();
    }

    debounceTimerRef.current = setTimeout(() => {
      const abort = new AbortController();
      abortRef.current = abort;
      const version = ++calcVersionRef.current;

      calculate(abort.signal, version);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [triggerKey, enabled, debounceMs, calculate, missingFields, isReady]);

  // ── Manual recalculate ───────────────────────────────────────
  const recalculate = useCallback(() => {
    if (!isReady) return;
    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const version = ++calcVersionRef.current;
    calculate(abort.signal, version);
  }, [isReady, calculate]);

  // ── Cleanup on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return {
    ...state,
    recalculate,
  };
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Known canal NavAPI Area IDs for exclusion */
const CANAL_AREA_IDS: Record<string, number[]> = {
  "Suez Canal": [789],
  "Panama Canal": [790],
  "Kiel Canal": [1022],
};

interface CalcOptions {
  avoidCanals?: boolean;
}

/**
 * Calculate route legs using the NavAPI backend.
 * Reuses the exact same API as NavApiMultiRoutePlanner.
 */
async function calculateRouteLegs(
  waypoints: { name: string; type: "ballast" | "laden" }[],
  input: AutoRouteInput,
  signal: AbortSignal,
  opts: CalcOptions = {}
): Promise<RouteLeg[]> {
  const legs: RouteLeg[] = [];

  // First resolve all port names to NavAPI port codes
  const portCodes = await resolvePortCodes(
    waypoints.map(w => w.name),
    signal
  );

  for (let i = 0; i < waypoints.length - 1; i++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const fromWp = waypoints[i];
    const toWp = waypoints[i + 1];
    const condition = i === 0 ? "ballast" : "laden"; // First leg is ballast, rest laden
    const speed = condition === "ballast" ? input.ballastSpeed : input.ladenSpeed;
    const fromCode = portCodes[i];
    const toCode = portCodes[i + 1];
    const fromName = fromWp.name;
    const toName = toWp.name;

    // Build request based on whether we have port codes or coordinates
    const routeRequest: Record<string, unknown> = {};
    const fromCoords = parseCoordinates(fromName);
    const toCoords = parseCoordinates(toName);

    if (fromCode) {
      routeRequest.startPortCode = fromCode;
    } else if (fromCoords) {
      routeRequest.startLat = fromCoords.lat;
      routeRequest.startLon = fromCoords.lng;
    }

    if (toCode) {
      routeRequest.endPortCode = toCode;
    } else if (toCoords) {
      routeRequest.endLat = toCoords.lat;
      routeRequest.endLon = toCoords.lng;
    }

    // Add draft and ETD
    if (input.draft > 0) routeRequest.draft = input.draft;
    if (input.etd) routeRequest.etd = new Date(input.etd).toISOString();

    // Canal avoidance: exclude all known canal area IDs
    if (opts.avoidCanals) {
      const excludeAreas = Object.values(CANAL_AREA_IDS).flat();
      routeRequest.excludeAreas = excludeAreas;
    }

    const response = await fetch("/api/navapi/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(routeRequest),
      signal,
    });

    const data = await response.json();

    if (data.error === "limit_reached") {
      throw new Error("Daily route calculation limit reached. Upgrade for unlimited access.");
    }

    if (data.success) {
      const legDistanceNm = data.totalDistanceNm || 0;
      const coordinates: [number, number][] =
        (data.geometry?.coordinates as [number, number][]) ||
        (data.waypoints || []).map(
          (wp: { lat: number; lon: number }) => [wp.lon, wp.lat] as [number, number]
        );

      // Defense-in-Depth SECA calculation
      const navApiSecaNm = data.ecaDistanceNm || 0;
      const localValidation = calculateValidatedZoneDistances(coordinates);
      const localSecaNm = localValidation.secaDistanceNm || 0;
      const actualSecaNm = Math.max(navApiSecaNm, localSecaNm);

      let ecaZones: string[] = [];
      if (actualSecaNm > 0) {
        ecaZones = localSecaNm >= navApiSecaNm && localValidation.secaZones.length > 0
          ? localValidation.secaZones
          : ["SECA"];
      }

      // HRA detection
      const hraResult = calculateHRADistances(coordinates);

      const sailingHours = speed > 0 ? legDistanceNm / speed : 0;

      legs.push({
        legNumber: i + 1,
        from: fromName,
        to: toName,
        distanceNm: legDistanceNm,
        ecaDistanceNm: actualSecaNm,
        hraDistanceNm: hraResult.hraDistanceNm,
        condition,
        speedKnots: speed,
        sailingHours,
        ecaZones,
        hraZones: hraResult.hraZones,
        geometry: coordinates,
      });
    } else {
      // Fallback: great circle estimate
      const fCoords = fromCoords || { lat: 0, lng: 0 };
      const tCoords = toCoords || { lat: 0, lng: 0 };
      const estimatedNm = haversineNm(fCoords.lat, fCoords.lng, tCoords.lat, tCoords.lng);
      const sailingHours = speed > 0 ? estimatedNm / speed : 0;

      legs.push({
        legNumber: i + 1,
        from: fromName,
        to: toName,
        distanceNm: estimatedNm,
        ecaDistanceNm: 0,
        hraDistanceNm: 0,
        condition,
        speedKnots: speed,
        sailingHours,
        ecaZones: [],
        hraZones: [],
        geometry: [],
      });

      console.warn(`[AutoRoute] NavAPI failed for ${fromName} → ${toName}, using great-circle estimate`);
    }
  }

  return legs;
}

/**
 * Resolve port names to NavAPI port codes using the ports search API.
 * For coordinate strings, returns null (will use lat/lon directly).
 */
async function resolvePortCodes(
  names: string[],
  signal: AbortSignal
): Promise<(string | null)[]> {
  const codes: (string | null)[] = [];

  for (const name of names) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // If it's a coordinate string, skip resolution
    if (parseCoordinates(name)) {
      codes.push(null);
      continue;
    }

    try {
      const response = await fetch(
        `/api/navapi/ports?q=${encodeURIComponent(name.trim())}&limit=1`,
        { signal }
      );
      const data = await response.json();
      const port = data.ports?.[0];
      codes.push(port?.portCode || null);
    } catch {
      codes.push(null);
    }
  }

  return codes;
}

/**
 * Parse a coordinate string (e.g., "51.9054, 4.4631" or "51.9054°N 4.4631°E").
 * Returns null if the string is a port name (not coordinates).
 */
function parseCoordinates(value: string): { lat: number; lng: number } | null {
  if (!value) return null;
  // Match decimal coordinates: "51.9054, 4.4631" or "51.9054 4.4631"
  const match = value.match(/^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

/** Haversine distance in nautical miles */
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 3440.065;
}

/** Extract canal names from leg geometries using zone classifier */
function extractDetectedCanals(legs: RouteLeg[]): string[] {
  const canals = new Set<string>();
  for (const leg of legs) {
    if (leg.geometry.length >= 2) {
      const zoneData = calculateValidatedZoneDistances(leg.geometry);
      zoneData.canals.forEach(c => canals.add(c));
    }
  }
  return Array.from(canals);
}

/** Build a RouteAlternative from calculated legs */
function buildRouteAlternative(
  id: string,
  label: string,
  rank: number,
  legs: RouteLeg[],
  input: AutoRouteInput
): RouteAlternative {
  const totalDistanceNm = legs.reduce((s, l) => s + l.distanceNm, 0);
  const totalEcaDistanceNm = legs.reduce((s, l) => s + l.ecaDistanceNm, 0);
  const totalHraDistanceNm = legs.reduce((s, l) => s + l.hraDistanceNm, 0);
  const ecaZones = [...new Set(legs.flatMap(l => l.ecaZones))];
  const hraZones = [...new Set(legs.flatMap(l => l.hraZones))];
  const detectedCanals = extractDetectedCanals(legs);
  const totalSailingHours = legs.reduce((s, l) => s + l.sailingHours, 0);
  const estimatedSeaDays = totalSailingHours / 24;

  return {
    id,
    label,
    rank,
    legs,
    totalDistanceNm,
    totalEcaDistanceNm,
    totalHraDistanceNm,
    ecaZones,
    hraZones,
    detectedCanals,
    estimatedSeaDays,
    routeGeometry: legs.map(l => l.geometry),
  };
}
