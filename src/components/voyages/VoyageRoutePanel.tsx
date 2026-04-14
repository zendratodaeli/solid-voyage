"use client";

/**
 * VoyageRoutePanel — Inline Route Intelligence for VoyageForm
 *
 * Converts the voyage's port list (Open/Load/Discharge) into NavAPI waypoints,
 * calculates per-leg distances, and returns results to hydrate the parent form.
 *
 * Features:
 * - NavApiPortSearch autocomplete for each port
 * - Smart coordinate paste (decimal, DMS, Google Maps URL)
 * - Per-leg speed, fuel consumption, draft inputs
 * - Canal/passage waypoint insertion
 * - Inline result strip after calculation
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Route,
  Loader2,
  ChevronDown,
  ChevronUp,
  Navigation,
  MapPin,
  Gauge,
  Fuel,
  Anchor,
  ArrowRight,
  AlertTriangle,
  Ship,
  Zap,
  Compass,
  CalendarClock,
  Weight,
  Scale,
  Layers,
  CloudSun,
  ShieldAlert,
  DollarSign,
} from "lucide-react";
import { computeRouteIntelligence, type RouteIntelligenceResult } from "@/lib/calculations/route-intelligence";
import { fetchWeatherRoute, weatherWaypointsToCoordinates, type WeatherRouteResponse } from "@/lib/weather-routing-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NavApiPortSearch, type NavApiPort } from "@/components/route-planner/NavApiPortSearch";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ComplianceInsights } from "@/components/route-planner/ComplianceInsights";
import { WeatherForecastCard } from "@/components/weather/WeatherForecastCard";
import { useWeather } from "@/hooks/useWeather";
import {
  calculateValidatedZoneDistances,
  isMediterraneanSecaEffective,
} from "@/lib/route-zone-classifier";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export interface RouteWaypoint {
  id: string;
  role: "open" | "load" | "discharge";
  portIndex: number; // index within its role array
  portName: string;  // display text from parent form
  // NavAPI port (if selected via autocomplete)
  port: NavApiPort | null;
  // Manual coordinates (if typed/pasted)
  manualLat?: number;
  manualLng?: number;
  // Per-leg config (for outgoing leg FROM this waypoint)
  condition: "ballast" | "laden";
  speed: string;          // knots
  consumption: string;    // MT/day
  draft: string;          // meters
  // Is this the terminal waypoint? (no outgoing leg)
  isTerminal: boolean;
}

export interface RouteCalculationResult {
  legDistances: number[];
  totalDistanceNm: number;
  totalEcaDistanceNm: number;
  totalHraDistanceNm: number;
  estimatedDays: number;
  // Per-leg breakdown
  legs: Array<{
    from: string;
    to: string;
    distanceNm: number;
    ecaDistanceNm: number;
    condition: "ballast" | "laden";
    speedKnots: number;
    sailingHours: number;
  }>;
  // Country codes for EU ETS
  originCountryCode?: string;
  destinationCountryCode?: string;
  // Detected canals
  detectedCanals: string[];
  // Raw route data (stored in voyageLegs.routeIntelligence)
  routeData: unknown;
  calculatedAt: string;
  // Weather-optimized route (optional — from Python engine)
  weatherRoute?: WeatherRouteResponse | null;
  weatherRouteCoordinates?: [number, number][];
}

interface VoyageRoutePanelProps {
  openPort: string;
  loadPorts: string[];
  dischargePorts: string[];
  // Vessel data for default speed/consumption
  selectedVesselId: string;
  vessels: Array<{
    id: string;
    name: string;
    dwt: number;
    vesselType: string;
    ballastFuelType?: string;
    ladenFuelType?: string;
  }>;
  // Speed overrides from parent form
  ballastSpeed?: string;
  ladenSpeed?: string;
  // ETD & DWT from parent form (moved from internal state)
  etd?: string;
  dwt?: string;
  // Callback when route is calculated
  onRouteCalculated: (result: RouteCalculationResult) => void;
  // Callback when route is cleared
  onRouteClear: () => void;
  // Callback to update port names from port search
  onPortNameUpdate: (role: "open" | "load" | "discharge", index: number, name: string) => void;
  // Callback to update country codes
  onCountryCodeUpdate: (role: "load" | "discharge", index: number, code: string) => void;
  // Initial route data (for edit mode)
  initialRouteData?: RouteCalculationResult | null;
  // Signal from parent to force recalculation (e.g., after AI parse)
  triggerRecalculate?: number;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════

function generateId() {
  return `rwp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Parse smart coordinate input: "53.511, 9.968", Google Maps URL, DMS */
export function parseSmartCoordinates(value: string): { lat: number; lng: number } | null {
  // Decimal pair: "53.511, 9.968" or "53.511 9.968"
  const decimalMatch = value.match(/^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/);
  if (decimalMatch) {
    const lat = parseFloat(decimalMatch[1]);
    const lng = parseFloat(decimalMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // Google Maps URL: /@53.511,9.968
  const googleMatch = value.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)/);
  if (googleMatch) {
    return { lat: parseFloat(googleMatch[1]), lng: parseFloat(googleMatch[2]) };
  }

  // DMS: 53°30'41.4"N 9°58'5.1"E
  const dmsMatch = value.match(
    /(\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]?\s*([NS])\s*[\s,]\s*(\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]?\s*([EW])/i
  );
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
    let lng = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[4].toUpperCase() === "S") lat = -lat;
    if (dmsMatch[8].toUpperCase() === "W") lng = -lng;
    return { lat, lng };
  }

  return null;
}

/** Extract country code from NavApiPort locode (first 2 chars) */
function extractCountryCode(port: NavApiPort | null): string {
  if (!port?.portCode || port.portCode.length < 2) return "";
  return port.portCode.substring(0, 2).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════════

export function VoyageRoutePanel({
  openPort,
  loadPorts,
  dischargePorts,
  selectedVesselId,
  vessels,
  ballastSpeed: parentBallastSpeed,
  ladenSpeed: parentLadenSpeed,
  etd: parentEtd,
  dwt: parentDwt,
  onRouteCalculated,
  onRouteClear,
  onPortNameUpdate,
  onCountryCodeUpdate,
  initialRouteData,
  triggerRecalculate = 0,
  className,
}: VoyageRoutePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<RouteCalculationResult | null>(initialRouteData || null);

  // Detail panel toggle (summary, compliance, legs, weather) — opens as Dialog
  type DetailPanel = "summary" | "compliance" | "legs" | "weather" | "intelligence";
  const [activePanel, setActivePanel] = useState<DetailPanel | null>(null);

  // Route Intelligence — canal tolls, war risk, cargo risk, port congestion
  const [routeIntel, setRouteIntel] = useState<RouteIntelligenceResult | null>(null);
  const [isIntelLoading, setIsIntelLoading] = useState(false);

  // Weather-optimized route from Python engine (optional, non-blocking)
  const [weatherRoute, setWeatherRoute] = useState<WeatherRouteResponse | null>(null);
  const [isWeatherRouteLoading, setIsWeatherRouteLoading] = useState(false);

  // Weather data — live from Open-Meteo API
  const { fetchWeather, isLoading: isWeatherLoading, data: weatherData, error: weatherError, clearWeather } = useWeather();
  // Stored waypoint coordinates for weather fetch
  const [waypointCoords, setWaypointCoords] = useState<Array<{ lat: number; lon: number }>>([]);

  // Per-port state: NavApiPort selections + coordinates
  const [openPortData, setOpenPortData] = useState<NavApiPort | null>(null);
  const [loadPortData, setLoadPortData] = useState<(NavApiPort | null)[]>(loadPorts.map(() => null));
  const [dischargePortData, setDischargePortData] = useState<(NavApiPort | null)[]>(dischargePorts.map(() => null));

  // Per-port coordinates (for manual entry)
  const [openCoords, setOpenCoords] = useState("");
  const [loadCoords, setLoadCoords] = useState<string[]>(loadPorts.map(() => ""));
  const [dischargeCoords, setDischargeCoords] = useState<string[]>(dischargePorts.map(() => ""));

  // Per-leg config
  const [legSpeeds, setLegSpeeds] = useState<string[]>([]);
  const [legConsumptions, setLegConsumptions] = useState<string[]>([]);
  const [legDrafts, setLegDrafts] = useState<string[]>([]);
  const [legConditions, setLegConditions] = useState<("ballast" | "laden")[]>([]);

  // ETD and DWT — read from parent props (no longer internal state)
  const etd = parentEtd || "";
  const dwt = parentDwt || "";

  // Selected vessel reference
  const selectedVessel = useMemo(
    () => vessels.find((v) => v.id === selectedVesselId) || null,
    [vessels, selectedVesselId]
  );


  // Sync port data arrays when port counts change
  useEffect(() => {
    setLoadPortData((prev) => {
      if (prev.length === loadPorts.length) return prev;
      return loadPorts.map((_, i) => prev[i] || null);
    });
    setLoadCoords((prev) => {
      if (prev.length === loadPorts.length) return prev;
      return loadPorts.map((_, i) => prev[i] || "");
    });
  }, [loadPorts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDischargePortData((prev) => {
      if (prev.length === dischargePorts.length) return prev;
      return dischargePorts.map((_, i) => prev[i] || null);
    });
    setDischargeCoords((prev) => {
      if (prev.length === dischargePorts.length) return prev;
      return dischargePorts.map((_, i) => prev[i] || "");
    });
  }, [dischargePorts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-sync open port from parent form ─────────────────────────
  // The parent form's openPort may contain AIS coordinates or a port name.
  // Sync into openCoords or openPortData so the starting waypoint is valid.
  const prevOpenPort = useRef("");
  useEffect(() => {
    if (!openPort || openPort === prevOpenPort.current) return;
    prevOpenPort.current = openPort;

    // Check if it looks like coordinates
    const parsed = parseSmartCoordinates(openPort);
    if (parsed) {
      setOpenCoords(openPort);
      setOpenPortData(null);
    } else if (openPort.trim().length >= 2 && !openPortData) {
      // It's a port name — auto-resolve
      (async () => {
        try {
          const res = await fetch(`/api/navapi/ports?q=${encodeURIComponent(openPort.trim())}`);
          const data = await res.json();
          if (data.ports?.length) {
            setOpenPortData(data.ports[0] as NavApiPort);
          }
        } catch {
          // Silently fail
        }
      })();
    }
  }, [openPort]); // eslint-disable-line react-hooks/exhaustive-deps

  // Speed defaults from parent form overrides
  const defaultBallastSpeed = parentBallastSpeed || "14";
  const defaultLadenSpeed = parentLadenSpeed || "12";

  // Build the full waypoint chain: Open → Load1 → Load2... → Discharge1 → Discharge2...
  const waypoints = useMemo((): RouteWaypoint[] => {
    const wps: RouteWaypoint[] = [];

    // Open / Start position — try openCoords first, then fallback to openPort prop
    const openParsed = (openCoords ? parseSmartCoordinates(openCoords) : null)
                    || parseSmartCoordinates(openPort);
    wps.push({
      id: "wp-open",
      role: "open",
      portIndex: 0,
      portName: openPort || "Open Position",
      port: openPortData,
      manualLat: openParsed?.lat,
      manualLng: openParsed?.lng,
      condition: "ballast",
      speed: legSpeeds[0] || defaultBallastSpeed,
      consumption: legConsumptions[0] || "25",
      draft: legDrafts[0] || "",
      isTerminal: false,
    });

    // Load ports
    loadPorts.forEach((name, i) => {
      const parsed = loadCoords[i] ? parseSmartCoordinates(loadCoords[i]) : null;
      const legIdx = i + 1; // offset for leg configs
      wps.push({
        id: `wp-load-${i}`,
        role: "load",
        portIndex: i,
        portName: name || `Load Port ${i + 1}`,
        port: loadPortData[i] || null,
        manualLat: parsed?.lat,
        manualLng: parsed?.lng,
        condition: "laden",
        speed: legSpeeds[legIdx] || defaultLadenSpeed,
        consumption: legConsumptions[legIdx] || "25",
        draft: legDrafts[legIdx] || "",
        isTerminal: false,
      });
    });

    // Discharge ports
    dischargePorts.forEach((name, i) => {
      const parsed = dischargeCoords[i] ? parseSmartCoordinates(dischargeCoords[i]) : null;
      const isLast = i === dischargePorts.length - 1;
      const legIdx = 1 + loadPorts.length + i;
      wps.push({
        id: `wp-discharge-${i}`,
        role: "discharge",
        portIndex: i,
        portName: name || `Discharge Port ${i + 1}`,
        port: dischargePortData[i] || null,
        manualLat: parsed?.lat,
        manualLng: parsed?.lng,
        condition: "laden",
        speed: legSpeeds[legIdx] || defaultLadenSpeed,
        consumption: legConsumptions[legIdx] || "25",
        draft: legDrafts[legIdx] || "",
        isTerminal: isLast,
      });
    });

    return wps;
  }, [
    openPort, openPortData, openCoords,
    loadPorts, loadPortData, loadCoords,
    dischargePorts, dischargePortData, dischargeCoords,
    legSpeeds, legConsumptions, legDrafts,
    defaultBallastSpeed, defaultLadenSpeed,
  ]);

  // Init leg config arrays when waypoint count changes
  // Use parent speed overrides as defaults if provided
  const totalLegs = waypoints.length - 1;
  useEffect(() => {
    setLegSpeeds((prev) => {
      if (prev.length === totalLegs) return prev;
      return Array.from({ length: totalLegs }, (_, i) => {
        if (prev[i]) return prev[i];
        return i === 0 ? defaultBallastSpeed : defaultLadenSpeed;
      });
    });
    setLegConsumptions((prev) => {
      if (prev.length === totalLegs) return prev;
      return Array.from({ length: totalLegs }, (_, i) => prev[i] || "25");
    });
    setLegDrafts((prev) => {
      if (prev.length === totalLegs) return prev;
      return Array.from({ length: totalLegs }, (_, i) => prev[i] || "");
    });
    setLegConditions((prev) => {
      if (prev.length === totalLegs) return prev;
      return Array.from({ length: totalLegs }, (_, i) => {
        if (prev[i]) return prev[i];
        return i === 0 ? "ballast" : "laden";
      });
    });
  }, [totalLegs, defaultBallastSpeed, defaultLadenSpeed]);

  // Re-apply vessel profile speeds when vessel changes (speeds change)
  // This updates ALL legs to match the new vessel's ballast/laden profile
  const prevBallastRef = useRef(defaultBallastSpeed);
  const prevLadenRef = useRef(defaultLadenSpeed);
  useEffect(() => {
    if (prevBallastRef.current === defaultBallastSpeed && prevLadenRef.current === defaultLadenSpeed) return;
    prevBallastRef.current = defaultBallastSpeed;
    prevLadenRef.current = defaultLadenSpeed;
    setLegSpeeds((prev) =>
      prev.map((_, i) => {
        const cond = legConditions[i] || (i === 0 ? "ballast" : "laden");
        return cond === "ballast" ? defaultBallastSpeed : defaultLadenSpeed;
      })
    );
  }, [defaultBallastSpeed, defaultLadenSpeed, legConditions]);

  // ── Auto-Resolve Port Names → NavApiPort Objects ─────────────────
  // When the parent form has port names filled but Route Intelligence
  // hasn't resolved them yet, auto-lookup via NavAPI so we can calculate.
  const autoResolveRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const resolvePort = async (
      name: string,
      role: "load" | "discharge",
      index: number
    ) => {
      const key = `${role}-${index}-${name}`;
      if (autoResolveRef.current[key]) return; // Already resolving/resolved
      autoResolveRef.current[key] = true;

      try {
        const res = await fetch(`/api/navapi/ports?q=${encodeURIComponent(name.trim())}`);
        const data = await res.json();
        if (!data.ports?.length) return;

        // Find the best match — prefer ports whose name contains the search term
        const searchLower = name.trim().toLowerCase();
        const bestPort = (data.ports as NavApiPort[]).find(
          (p) => p.displayName?.toLowerCase().includes(searchLower)
        ) || data.ports[0] as NavApiPort;

        if (role === "load") {
          setLoadPortData((prev) => {
            if (prev[index]) return prev; // Don't override user selection
            const u = [...prev];
            u[index] = bestPort;
            return u;
          });
        } else {
          setDischargePortData((prev) => {
            if (prev[index]) return prev;
            const u = [...prev];
            u[index] = bestPort;
            return u;
          });
        }
      } catch {
        // Silently fail — user can still manually resolve
      }
    };

    // Resolve load ports that have names but no port data
    loadPorts.forEach((name, i) => {
      if (name.trim().length >= 2 && !loadPortData[i]) {
        resolvePort(name, "load", i);
      }
    });

    // Resolve discharge ports
    dischargePorts.forEach((name, i) => {
      if (name.trim().length >= 2 && !dischargePortData[i]) {
        resolvePort(name, "discharge", i);
      }
    });
  }, [loadPorts, dischargePorts, loadPortData, dischargePortData]);

  // ── Auto-Calculate when all ports are resolved ───────────────────
  // Once Route Intelligence has resolved port objects for all required
  // waypoints, auto-trigger route calculation (no manual click needed).
  const hasAutoCalculated = useRef(false);

  // Count valid waypoints for the calculate button
  const validWaypointCount = waypoints.filter(
    (w) => w.port || (w.manualLat !== undefined && w.manualLng !== undefined)
  ).length;
  const canCalculate = validWaypointCount >= 2;

  // ── Port Selection Handlers ──────────────────────────────────────

  const handlePortSelect = useCallback(
    (role: "open" | "load" | "discharge", index: number, port: NavApiPort) => {
      if (role === "open") {
        setOpenPortData(port);
        onPortNameUpdate("open", 0, port.displayName);
      } else if (role === "load") {
        setLoadPortData((prev) => {
          const u = [...prev];
          u[index] = port;
          return u;
        });
        onPortNameUpdate("load", index, port.displayName);
        const cc = extractCountryCode(port);
        if (cc) onCountryCodeUpdate("load", index, cc);
      } else {
        setDischargePortData((prev) => {
          const u = [...prev];
          u[index] = port;
          return u;
        });
        onPortNameUpdate("discharge", index, port.displayName);
        const cc = extractCountryCode(port);
        if (cc) onCountryCodeUpdate("discharge", index, cc);
      }
    },
    [onPortNameUpdate, onCountryCodeUpdate]
  );

  const handlePortClear = useCallback(
    (role: "open" | "load" | "discharge", index: number) => {
      if (role === "open") setOpenPortData(null);
      else if (role === "load") {
        setLoadPortData((prev) => {
          const u = [...prev];
          u[index] = null;
          return u;
        });
      } else {
        setDischargePortData((prev) => {
          const u = [...prev];
          u[index] = null;
          return u;
        });
      }
    },
    []
  );

  // ── Smart Coordinate Paste Handler ───────────────────────────────

  const handleCoordsChange = useCallback(
    (role: "open" | "load" | "discharge", index: number, value: string) => {
      if (role === "open") {
        setOpenCoords(value);
      } else if (role === "load") {
        setLoadCoords((prev) => {
          const u = [...prev];
          u[index] = value;
          return u;
        });
      } else {
        setDischargeCoords((prev) => {
          const u = [...prev];
          u[index] = value;
          return u;
        });
      }
    },
    []
  );

  // ── Route Calculation ────────────────────────────────────────────

  const handleCalculate = useCallback(async () => {
    if (!canCalculate) {
      toast.error("Please select at least 2 ports to calculate a route");
      return;
    }

    setIsCalculating(true);

    try {
      const legs: RouteCalculationResult["legs"] = [];
      let totalDistanceNm = 0;
      let totalEcaDistanceNm = 0;
      let totalHraDistanceNm = 0;
      const detectedCanals: string[] = [];
      const rawLegsData: unknown[] = [];

      // Calculate each leg sequentially
      for (let i = 0; i < waypoints.length - 1; i++) {
        const fromWp = waypoints[i];
        const toWp = waypoints[i + 1];

        // Resolve from coordinates
        let fromPortCode = fromWp.port?.portCode || "";
        let fromLat = fromWp.manualLat;
        let fromLon = fromWp.manualLng;
        if (fromWp.port) {
          fromLat = fromWp.port.latitude;
          fromLon = fromWp.port.longitude;
        }
        // Defense-in-depth: try parsing portName as coordinates
        if (!fromPortCode && (fromLat === undefined || fromLon === undefined)) {
          const fallback = parseSmartCoordinates(fromWp.portName);
          if (fallback) {
            fromLat = fallback.lat;
            fromLon = fallback.lng;
          }
        }

        // Resolve to coordinates
        let toPortCode = toWp.port?.portCode || "";
        let toLat = toWp.manualLat;
        let toLon = toWp.manualLng;
        if (toWp.port) {
          toLat = toWp.port.latitude;
          toLon = toWp.port.longitude;
        }
        // Defense-in-depth: try parsing portName as coordinates
        if (!toPortCode && (toLat === undefined || toLon === undefined)) {
          const fallback = parseSmartCoordinates(toWp.portName);
          if (fallback) {
            toLat = fallback.lat;
            toLon = fallback.lng;
          }
        }

        // Skip if either endpoint is still missing
        if (!fromPortCode && (fromLat === undefined || fromLon === undefined)) continue;
        if (!toPortCode && (toLat === undefined || toLon === undefined)) continue;

        const legDraft = legDrafts[i] ? parseFloat(legDrafts[i]) : undefined;
        const legSpeed = parseFloat(legSpeeds[i]) || 12;

        // Call NavAPI
        const body: Record<string, unknown> = {};
        if (fromPortCode) body.startPortCode = fromPortCode;
        else {
          body.startLat = fromLat;
          body.startLon = fromLon;
        }
        if (toPortCode) body.endPortCode = toPortCode;
        else {
          body.endLat = toLat;
          body.endLon = toLon;
        }
        if (legDraft) body.draft = legDraft;

        const response = await fetch("/api/navapi/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await response.json();

        if (data.error === "limit_reached") {
          toast.error(data.message || "Daily route calculation limit reached");
          throw new Error("limit_reached");
        }

        if (!data.success && !data.totalDistanceNm) {
          toast.warning(`Leg ${i + 1}: Route calculation failed — ${data.error || "Unknown error"}`);
          continue;
        }

        const legDistanceNm = data.totalDistanceNm || 0;

        // SECA distance — defense in depth (same as NavApiMultiRoutePlanner)
        let ecaDistanceNm = data.ecaDistanceNm || 0;
        const coordinates: [number, number][] =
          (data.geometry?.coordinates as [number, number][]) ||
          (data.waypoints || []).map(
            (wp: { lat: number; lon: number }) => [wp.lon, wp.lat] as [number, number]
          );

        if (coordinates.length > 0) {
          const localValidation = calculateValidatedZoneDistances(coordinates);
          ecaDistanceNm = Math.max(ecaDistanceNm, localValidation.secaDistanceNm || 0);
        }

        const sailingHours = legDistanceNm / legSpeed;

        totalDistanceNm += legDistanceNm;
        totalEcaDistanceNm += ecaDistanceNm;

        legs.push({
          from: fromWp.portName || fromWp.port?.displayName || `${fromLat}, ${fromLon}`,
          to: toWp.portName || toWp.port?.displayName || `${toLat}, ${toLon}`,
          distanceNm: legDistanceNm,
          ecaDistanceNm,
          condition: legConditions[i] || (i === 0 ? "ballast" : "laden"),
          speedKnots: legSpeed,
          sailingHours,
        });

        rawLegsData.push(data);
      }

      if (legs.length === 0) {
        toast.error("No valid legs could be calculated");
        setIsCalculating(false);
        return;
      }

      // Country codes from first load port and last discharge port
      const firstLoadPort = loadPortData.find((p) => p);
      const lastDischargePort = [...dischargePortData].reverse().find((p) => p);

      const estimatedDays = legs.reduce((sum, l) => sum + l.sailingHours / 24, 0);

      const calcResult: RouteCalculationResult = {
        legDistances: legs.map((l) => Math.round(l.distanceNm)),
        totalDistanceNm: Math.round(totalDistanceNm),
        totalEcaDistanceNm: Math.round(totalEcaDistanceNm),
        totalHraDistanceNm: Math.round(totalHraDistanceNm),
        estimatedDays: Math.round(estimatedDays * 10) / 10,
        legs,
        originCountryCode: extractCountryCode(firstLoadPort || null),
        destinationCountryCode: extractCountryCode(lastDischargePort || null),
        detectedCanals,
        routeData: rawLegsData,
        calculatedAt: new Date().toISOString(),
      };

      setResult(calcResult);
      onRouteCalculated(calcResult);

      // Extract waypoint coordinates for weather fetch
      const coords: Array<{ lat: number; lon: number }> = [];
      for (const wp of waypoints) {
        const lat = wp.port?.latitude ?? wp.manualLat;
        const lng = wp.port?.longitude ?? wp.manualLng;
        if (lat !== undefined && lng !== undefined) {
          coords.push({ lat, lon: lng });
        } else {
          const parsed = parseSmartCoordinates(wp.portName);
          if (parsed) coords.push({ lat: parsed.lat, lon: parsed.lng });
        }
      }
      setWaypointCoords(coords);
      clearWeather(); // Clear old weather when route changes

      toast.success(
        `Route calculated: ${Math.round(totalDistanceNm).toLocaleString()} NM across ${legs.length} leg${legs.length > 1 ? "s" : ""}`
      );

      // ── Fetch Weather-Optimized Route (non-blocking) ──────────
      // Fire-and-forget: if the Python engine is running, get a weather route
      // to compare against the NavAPI geometric route. If it's offline, skip silently.
      if (coords.length >= 2) {
        setIsWeatherRouteLoading(true);
        setWeatherRoute(null);
        const startCoord = coords[0];
        const endCoord = coords[coords.length - 1];
        const avgSpeed = legs.reduce((s, l) => s + l.speedKnots, 0) / legs.length || 12.5;
        fetchWeatherRoute({
          start_lat: startCoord.lat,
          start_lon: startCoord.lon,
          end_lat: endCoord.lat,
          end_lon: endCoord.lon,
          vessel_speed_knots: avgSpeed,
          daily_consumption_mt: parseFloat(legConsumptions[0]) || 28,
        }).then((wr) => {
          setWeatherRoute(wr);
          if (wr) {
            // Update the result with weather route data for parent component
            const wrCoords = weatherWaypointsToCoordinates(wr.waypoints);
            setResult(prev => prev ? { ...prev, weatherRoute: wr, weatherRouteCoordinates: wrCoords } : prev);
          }
        }).finally(() => setIsWeatherRouteLoading(false));
      }

      // Fetch Route Intelligence (canal tolls, war risk, cargo risk, port congestion)
      setIsIntelLoading(true);
      try {
        const portNames = waypoints
          .filter(w => w.port || w.portName)
          .map(w => ({ name: w.port?.displayName || w.portName, locode: w.port?.portCode }));

        const intel = await computeRouteIntelligence({
          detectedCanals: calcResult.detectedCanals,
          hraZones: [], // Will be populated when HRA detection is wired
          hraDistanceNm: totalHraDistanceNm,
          vessel: {
            vesselType: selectedVessel?.vesselType,
            netTonnage: undefined, // From vessel profile when available
            grossTonnage: undefined,
            dwt: dwt ? Number(dwt) : selectedVessel?.dwt,
            dailyOpex: undefined,
          },
          ports: portNames,
          laden: legConditions.some(c => c === "laden"),
          voyageDays: calcResult.estimatedDays,
        });
        setRouteIntel(intel);
      } catch (intelErr) {
        console.warn("Route Intelligence fetch failed:", intelErr);
      } finally {
        setIsIntelLoading(false);
      }
    } catch (err) {
      if ((err as Error).message !== "limit_reached") {
        console.error("Route calculation error:", err);
        toast.error("Route calculation failed");
      }
    } finally {
      setIsCalculating(false);
    }
  }, [
    canCalculate, waypoints, legDrafts, legSpeeds, legConditions,
    loadPortData, dischargePortData, onRouteCalculated,
  ]);

  // ── Clear Route ──────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setResult(null);
    onRouteClear();
    toast.info("Route cleared — distances reset to manual entry");
  }, [onRouteClear]);

  // ── Auto-Calculate when ports are resolved ──────────────────────
  // After auto-resolve fills in port data, trigger calculation automatically
  useEffect(() => {
    if (hasAutoCalculated.current) return;
    if (!canCalculate || isCalculating) return;

    // Open position must be valid (has port data or coordinates)
    const openValid = openPortData || parseSmartCoordinates(openCoords) || parseSmartCoordinates(openPort);

    // All required waypoints must have port data
    const allLoadResolved = loadPorts.every((name, i) =>
      !name.trim() || loadPortData[i]
    );
    const allDischargeResolved = dischargePorts.every((name, i) =>
      !name.trim() || dischargePortData[i]
    );
    const hasLoadPort = loadPorts.some((p) => p.trim());
    const hasDischargePort = dischargePorts.some((p) => p.trim());

    if (openValid && allLoadResolved && allDischargeResolved && hasLoadPort && hasDischargePort) {
      hasAutoCalculated.current = true;
      // Small delay to let React finish rendering
      setTimeout(() => {
        handleCalculate();
      }, 300);
    }
  }, [canCalculate, isCalculating, loadPorts, dischargePorts, loadPortData, dischargePortData, openPortData, openCoords, openPort, handleCalculate]);

  // Reset auto-calculate guard and clear stale result when ports change
  useEffect(() => {
    hasAutoCalculated.current = false;
    // Clear previous result since port data changed — distances are no longer valid
    setResult(null);
    onRouteClear();
  }, [
    openPort,
    loadPorts.map(p => p.trim()).join(","),
    dischargePorts.map(p => p.trim()).join(","),
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force recalculation when parent triggers (e.g., after AI parse fills ports)
  useEffect(() => {
    if (triggerRecalculate === 0) return; // Skip initial mount
    // Give port resolution a moment to complete, then force calculate
    const timer = setTimeout(() => {
      handleCalculate();
      setIsExpanded(true); // Auto-expand to show results
    }, 1500);
    return () => clearTimeout(timer);
  }, [triggerRecalculate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch live weather when Weather panel is opened
  useEffect(() => {
    if (activePanel !== "weather") return;
    if (weatherData || isWeatherLoading || waypointCoords.length === 0) return;
    fetchWeather(waypointCoords, { forecastDays: 7 });
  }, [activePanel, weatherData, isWeatherLoading, waypointCoords, fetchWeather]);

  // Derive selected vessel data for ComplianceInsights
  const complianceVessel = useMemo(() => {
    if (!selectedVessel) return null;
    return {
      id: selectedVessel.id,
      name: selectedVessel.name,
      dwt: selectedVessel.dwt,
      vesselType: selectedVessel.vesselType,
      ladenSpeed: parseFloat(parentLadenSpeed || "11.5") || 11.5,
      ballastSpeed: parseFloat(parentBallastSpeed || "13") || 13,
      ladenConsumption: 25,
      ballastConsumption: 25,
    };
  }, [selectedVessel, parentLadenSpeed, parentBallastSpeed]);

  // ═══════════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className={cn("rounded-xl border border-border/60 overflow-hidden", className)}>
      {/* ── Header (always visible) ── */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500/5 via-transparent to-blue-500/5 hover:from-violet-500/10 hover:to-blue-500/10 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
            <Compass className="h-4 w-4 text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Route Intelligence</p>
            <p className="text-xs text-muted-foreground">
              {result
                ? `${result.totalDistanceNm.toLocaleString()} NM • ${result.legs.length} leg${result.legs.length > 1 ? "s" : ""} • ~${result.estimatedDays} sea days`
                : "Auto-calculate distances via NavAPI sea routing"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Detail panel icons — visible when route is calculated */}
          {result && (
            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              {[
                { type: "summary" as const, icon: Navigation, label: "Summary", color: "text-blue-400", activeColor: "bg-blue-500/15 border-blue-500/30", hoverBg: "hover:bg-blue-500/10" },
                { type: "compliance" as const, icon: Scale, label: "Compliance", color: "text-emerald-400", activeColor: "bg-emerald-500/15 border-emerald-500/30", hoverBg: "hover:bg-emerald-500/10" },
                { type: "legs" as const, icon: Layers, label: "Legs", color: "text-purple-400", activeColor: "bg-purple-500/15 border-purple-500/30", hoverBg: "hover:bg-purple-500/10" },
                { type: "weather" as const, icon: CloudSun, label: "Weather", color: "text-amber-400", activeColor: "bg-amber-500/15 border-amber-500/30", hoverBg: "hover:bg-amber-500/10" },
                { type: "intelligence" as const, icon: ShieldAlert, label: "Intelligence", color: "text-rose-400", activeColor: "bg-rose-500/15 border-rose-500/30", hoverBg: "hover:bg-rose-500/10" },
              ].map((btn) => {
                const isActive = activePanel === btn.type;
                const Icon = btn.icon;
                const alertCount = btn.type === "compliance"
                  ? (result.totalEcaDistanceNm > 0 ? 1 : 0) + (result.totalHraDistanceNm > 0 ? 1 : 0)
                  : 0;
                return (
                  <button
                    key={btn.type}
                    type="button"
                    onClick={() => {
                      setActivePanel(isActive ? null : btn.type);
                      if (!isExpanded) setIsExpanded(true);
                    }}
                    className={cn(
                      "relative w-7 h-7 rounded-md flex items-center justify-center border transition-all duration-200",
                      isActive
                        ? `${btn.activeColor} ${btn.color}`
                        : `border-transparent ${btn.color}/50 ${btn.hoverBg}`
                    )}
                    title={btn.label}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {alertCount > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-amber-500 text-[7px] font-bold text-white cursor-help hover:bg-amber-400 transition-colors ring-2 ring-background"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePanel("compliance");
                              if (!isExpanded) setIsExpanded(true);
                            }}
                          >
                            {alertCount}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          sideOffset={8}
                          className="max-w-[220px] bg-zinc-900 border border-border/60 text-foreground p-0 rounded-lg shadow-xl"
                        >
                          <div className="px-3 py-2 space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Compliance Alerts</p>
                            <div className="space-y-1">
                              {result!.totalEcaDistanceNm > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                                  <span className="text-[11px] text-zinc-300">SECA/ECA Zone — {Math.round(result!.totalEcaDistanceNm).toLocaleString()} NM</span>
                                </div>
                              )}
                              {result!.totalHraDistanceNm > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                  <span className="text-[11px] text-zinc-300">High Risk Area — {Math.round(result!.totalHraDistanceNm).toLocaleString()} NM</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-500 pt-0.5">Click for full compliance details →</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {result && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              Calculated
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* ── Expanded Panel ── */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/40">
          {/* Info hint */}
          <div className="flex items-start gap-2 pt-3 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 mt-0.5 text-violet-400 shrink-0" />
            <span>
              Search for ports below to auto-resolve coordinates, or paste lat/lng directly.
              Click <strong>Calculate Route</strong> to get accurate sea distances via NavAPI.
            </span>
          </div>

          {/* ── Waypoint Cards ── */}
          <div className="space-y-3">
            {waypoints.map((wp, idx) => {
              const isFirst = idx === 0;
              const roleLabel =
                wp.role === "open"
                  ? "Starting Point"
                  : wp.role === "load"
                    ? `Loading Port ${wp.portIndex + 1}`
                    : `Discharge Port ${wp.portIndex + 1}`;

              const roleBadgeColor =
                wp.role === "open"
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                  : wp.role === "load"
                    ? "bg-blue-500/15 text-blue-400 border-blue-500/20"
                    : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";

              const stepColor =
                wp.role === "open"
                  ? "bg-amber-500 text-white"
                  : wp.role === "load"
                    ? "bg-blue-500 text-white"
                    : "bg-emerald-500 text-white";

              // Coords display
              const coordsValue =
                wp.role === "open"
                  ? openCoords
                  : wp.role === "load"
                    ? loadCoords[wp.portIndex] || ""
                    : dischargeCoords[wp.portIndex] || "";

              // Port data for this waypoint
              const portData =
                wp.role === "open"
                  ? openPortData
                  : wp.role === "load"
                    ? loadPortData[wp.portIndex]
                    : dischargePortData[wp.portIndex];

              return (
                <div
                  key={wp.id}
                  className="rounded-lg border border-border/50 bg-card/50 overflow-hidden"
                >
                  {/* Waypoint header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                    <span
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                        stepColor
                      )}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                        roleBadgeColor
                      )}
                    >
                      {roleLabel}
                    </span>
                    {wp.port ? (
                      <span className="text-xs text-muted-foreground ml-auto">
                        [{wp.port.portCode}]
                      </span>
                    ) : wp.portName && wp.portName !== `Load Port ${wp.portIndex + 1}` && wp.portName !== `Discharge Port ${wp.portIndex + 1}` && wp.portName !== "Open Position" ? (
                      <span className="text-xs text-violet-400/60 ml-auto truncate max-w-[140px]">
                        {wp.portName}
                      </span>
                    ) : null}
                  </div>

                  <div className="p-3 space-y-2.5">
                    {/* Synced Port Name from VoyageForm — compact resolved state */}
                    {wp.portName && wp.portName !== `Load Port ${wp.portIndex + 1}` && wp.portName !== `Discharge Port ${wp.portIndex + 1}` && wp.portName !== "Open Position" && !portData && (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-violet-500/8 border border-violet-500/15">
                        <MapPin className="h-3 w-3 text-violet-400 shrink-0" />
                        <span className="text-xs font-medium text-foreground">{wp.portName}</span>
                        <span className="text-[9px] text-violet-400/70 uppercase tracking-wider ml-auto">from form</span>
                      </div>
                    )}

                    {/* Port Search + Lat/Lng — ONLY show when port name is NOT filled from form */}
                    {(portData || !(wp.portName && wp.portName !== `Load Port ${wp.portIndex + 1}` && wp.portName !== `Discharge Port ${wp.portIndex + 1}` && wp.portName !== "Open Position")) && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Anchor className="h-3 w-3" />
                            {portData ? "Port" : "Search Port for Coordinates"}
                          </Label>
                          <NavApiPortSearch
                            value={portData}
                            onSelect={(port) =>
                              handlePortSelect(wp.role, wp.portIndex, port)
                            }
                            onClear={() => handlePortClear(wp.role, wp.portIndex)}
                            placeholder={`Search ${roleLabel.toLowerCase()}...`}
                          />
                        </div>

                        {/* Coordinates (smart paste) — alternative to port search */}
                        {!portData && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              Lat/Lng
                              <span className="text-[10px] opacity-60">(or paste coordinates directly)</span>
                            </Label>
                            <Input
                              placeholder="e.g., 53.511500, 9.968089"
                              value={coordsValue}
                              onChange={(e) =>
                                handleCoordsChange(wp.role, wp.portIndex, e.target.value)
                              }
                              className="text-xs h-8"
                            />
                          </div>
                        )}
                      </>
                    )}

                    {/* Per-leg config (not for terminal waypoint) */}
                    {!wp.isTerminal && (
                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/30">
                        {/* Condition toggle */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            Condition
                          </Label>
                          <div className="flex rounded-md overflow-hidden border border-border/60 h-7">
                            <button
                              type="button"
                              onClick={() => {
                                setLegConditions((prev) => {
                                  const u = [...prev];
                                  u[idx] = "ballast";
                                  return u;
                                });
                                // Auto-update speed to vessel's ballast speed
                                setLegSpeeds((prev) => {
                                  const u = [...prev];
                                  u[idx] = defaultBallastSpeed;
                                  return u;
                                });
                              }}
                              className={cn(
                                "flex-1 text-[10px] font-medium transition-colors",
                                (legConditions[idx] || (idx === 0 ? "ballast" : "laden")) === "ballast"
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "text-muted-foreground hover:bg-muted/50"
                              )}
                            >
                              Ballast
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setLegConditions((prev) => {
                                  const u = [...prev];
                                  u[idx] = "laden";
                                  return u;
                                });
                                // Auto-update speed to vessel's laden speed
                                setLegSpeeds((prev) => {
                                  const u = [...prev];
                                  u[idx] = defaultLadenSpeed;
                                  return u;
                                });
                              }}
                              className={cn(
                                "flex-1 text-[10px] font-medium transition-colors",
                                (legConditions[idx] || (idx === 0 ? "ballast" : "laden")) === "laden"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "text-muted-foreground hover:bg-muted/50"
                              )}
                            >
                              Laden
                            </button>
                          </div>
                        </div>

                        {/* Speed */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Gauge className="h-2.5 w-2.5" /> Speed (kn)
                          </Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={legSpeeds[idx] || ""}
                            onChange={(e) => {
                              const u = [...legSpeeds];
                              u[idx] = e.target.value;
                              setLegSpeeds(u);
                            }}
                            className="text-xs h-7"
                            placeholder="12"
                          />
                        </div>

                        {/* Consumption */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Fuel className="h-2.5 w-2.5" /> MT/day
                          </Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={legConsumptions[idx] || ""}
                            onChange={(e) => {
                              const u = [...legConsumptions];
                              u[idx] = e.target.value;
                              setLegConsumptions(u);
                            }}
                            className="text-xs h-7"
                            placeholder="25"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── ETD & DWT Summary (read from parent form) ── */}
          {(etd || dwt) && (
            <div className="flex items-center gap-3 pt-2 border-t border-border/30 text-xs text-muted-foreground">
              {etd && (
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3 w-3 text-violet-400" />
                  ETD: {new Date(etd).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {dwt && (
                <span className="flex items-center gap-1">
                  <Weight className="h-3 w-3 text-cyan-400" />
                  DWT: {Number(dwt).toLocaleString()} MT
                </span>
              )}
            </div>
          )}

          {/* ── Calculate Button ── */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              onClick={handleCalculate}
              disabled={!canCalculate || isCalculating}
              className="flex-1 gap-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white"
            >
              {isCalculating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Route className="h-4 w-4" />
              )}
              {isCalculating
                ? "Calculating..."
                : result
                  ? "Recalculate Route"
                  : `Calculate Route (${validWaypointCount} ports)`}
            </Button>
            {result && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-xs text-muted-foreground hover:text-red-400"
              >
                Clear
              </Button>
            )}
          </div>

          {/* ── Result: KPI Strip + Detail Panels ── */}
          {result && (() => {
            const ecaPercent = result.totalDistanceNm > 0
              ? Math.round((result.totalEcaDistanceNm / result.totalDistanceNm) * 100)
              : 0;
            const openSeaNm = result.totalDistanceNm - result.totalEcaDistanceNm - result.totalHraDistanceNm;
            const alertCount = (result.totalEcaDistanceNm > 0 ? 1 : 0) + (result.totalHraDistanceNm > 0 ? 1 : 0);

            return (
              <div className="space-y-3 pt-2">
                {/* ── KPI Boxes ── */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="text-sm font-bold text-blue-400 tabular-nums">
                      {result.totalDistanceNm.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase">NM</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-sm font-bold text-emerald-400 tabular-nums">
                      {result.estimatedDays}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase">Days</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="text-sm font-bold text-purple-400 tabular-nums">
                      {result.legs.length}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase">Legs</div>
                  </div>
                </div>

                {/* ── Route Composition Bar ── */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Navigation className="h-2.5 w-2.5" />
                      Route Composition
                    </span>
                    {alertCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-400 font-medium">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {alertCount} alert{alertCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-blue-500/20 flex">
                    {result.totalEcaDistanceNm > 0 && (
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{ width: `${ecaPercent}%` }}
                        title={`ECA: ${result.totalEcaDistanceNm.toLocaleString()} NM (${ecaPercent}%)`}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      Open Sea {openSeaNm.toLocaleString()} NM
                    </span>
                    {result.totalEcaDistanceNm > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        ECA {result.totalEcaDistanceNm.toLocaleString()} NM
                      </span>
                    )}
                    {result.totalHraDistanceNm > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                        HRA {result.totalHraDistanceNm.toLocaleString()} NM
                      </span>
                    )}
                  </div>
                </div>


                {/* ── Summary Dialog ── */}
                <Dialog open={activePanel === "summary"} onOpenChange={(open) => setActivePanel(open ? "summary" : null)}>
                  <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-blue-400">
                        <Navigation className="h-5 w-5" />
                        Voyage Summary
                      </DialogTitle>
                      <DialogDescription>Route distance and duration breakdown</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <div className="text-2xl font-bold text-blue-400">{result.totalDistanceNm.toLocaleString()} NM</div>
                          <div className="text-xs text-muted-foreground">Total Distance</div>
                        </div>
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                          <div className="text-2xl font-bold text-red-400">{result.totalEcaDistanceNm.toLocaleString()} NM</div>
                          <div className="text-xs text-muted-foreground">ECA Distance</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Est. Duration</span>
                          <span className="font-semibold">{result.estimatedDays} days</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Total Legs</span>
                          <span className="font-semibold">{result.legs.length}</span>
                        </div>
                        {result.detectedCanals.length > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Canals</span>
                            <span className="font-semibold text-amber-400">{result.detectedCanals.join(", ")}</span>
                          </div>
                        )}
                        {dwt && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">DWT</span>
                            <span className="font-semibold">{Number(dwt).toLocaleString()} MT</span>
                          </div>
                        )}
                        {result.originCountryCode && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Origin Country</span>
                            <span className="font-semibold">{result.originCountryCode}</span>
                          </div>
                        )}
                        {result.destinationCountryCode && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Destination Country</span>
                            <span className="font-semibold">{result.destinationCountryCode}</span>
                          </div>
                        )}
                      </div>
                      {/* Leg overview table */}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Leg</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Distance</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Speed</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Hours</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.legs.map((leg, i) => (
                              <tr key={i} className="border-t border-border/50">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn(
                                      "text-[9px] font-bold uppercase px-1 py-0.5 rounded",
                                      leg.condition === "ballast" ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"
                                    )}>{leg.condition === "ballast" ? "B" : "L"}</span>
                                    <span className="truncate max-w-[150px]">{leg.from} → {leg.to}</span>
                                  </div>
                                </td>
                                <td className="text-right px-3 py-2 font-mono">{Math.round(leg.distanceNm).toLocaleString()} NM</td>
                                <td className="text-right px-3 py-2">{leg.speedKnots} kn</td>
                                <td className="text-right px-3 py-2">{Math.round(leg.sailingHours)}h</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Weather Route Comparison */}
                      {(weatherRoute || isWeatherRouteLoading) && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center">
                              <Route className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                            <span className="text-sm font-semibold text-emerald-400">Weather-Optimized Route</span>
                            {isWeatherRouteLoading && <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />}
                          </div>
                          {weatherRoute && (
                            <>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="text-center">
                                  <div className="text-lg font-bold text-emerald-400">{weatherRoute.total_distance_nm.toLocaleString()} NM</div>
                                  <div className="text-[10px] text-muted-foreground">Distance</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-lg font-bold text-emerald-400">{weatherRoute.estimated_days} days</div>
                                  <div className="text-[10px] text-muted-foreground">Est. Duration</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-lg font-bold text-emerald-400">{weatherRoute.estimated_fuel_mt.toLocaleString()} MT</div>
                                  <div className="text-[10px] text-muted-foreground">Est. Fuel</div>
                                </div>
                              </div>
                              {/* Savings comparison */}
                              {result.totalDistanceNm > 0 && (() => {
                                const distDiff = weatherRoute.total_distance_nm - result.totalDistanceNm;
                                const distPct = ((distDiff / result.totalDistanceNm) * 100).toFixed(1);
                                const daysDiff = weatherRoute.estimated_days - result.estimatedDays;
                                return (
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
                                    <span>
                                      {distDiff > 0 ? '🟢' : '🔵'} {Math.abs(distDiff).toLocaleString()} NM {distDiff > 0 ? 'longer' : 'shorter'} ({distPct}%)
                                    </span>
                                    <span>•</span>
                                    <span>{Math.abs(daysDiff).toFixed(1)} days {daysDiff > 0 ? 'longer' : 'faster'}</span>
                                  </div>
                                );
                              })()}
                              <div className="text-[9px] text-muted-foreground/60 leading-tight">
                                {weatherRoute.disclaimer}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                {/* ── Compliance Dialog — uses real ComplianceInsights from Route Planner ── */}
                <Dialog open={activePanel === "compliance"} onOpenChange={(open) => setActivePanel(open ? "compliance" : null)}>
                  <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-emerald-400">
                        <Scale className="h-5 w-5" />
                        Compliance Insights
                      </DialogTitle>
                      <DialogDescription>Fuel strategy, ECA/SECA zones, EU ETS, and financial estimates</DialogDescription>
                    </DialogHeader>
                    <ComplianceInsights
                      totalDistanceNm={result.totalDistanceNm}
                      ecaDistanceNm={result.totalEcaDistanceNm}
                      hraDistanceNm={result.totalHraDistanceNm}
                      ecaZones={result.totalEcaDistanceNm > 0 ? ["SECA"] : []}
                      hraZones={result.totalHraDistanceNm > 0 ? ["HRA"] : []}
                      originCountryCode={result.originCountryCode}
                      destinationCountryCode={result.destinationCountryCode}
                      speedKnots={parseFloat(waypoints[0]?.speed || "13") || 13}
                      selectedVessel={complianceVessel}
                      manualDWT={dwt ? Number(dwt) : 0}
                      voyageMode={waypoints[0]?.condition || "laden"}
                    />
                  </DialogContent>
                </Dialog>

                {/* ── Legs Dialog ── */}
                <Dialog open={activePanel === "legs"} onOpenChange={(open) => setActivePanel(open ? "legs" : null)}>
                  <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-purple-400">
                        <Layers className="h-5 w-5" />
                        Leg Breakdown
                      </DialogTitle>
                      <DialogDescription>Per-leg route details with ECA zone distribution</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                      {result.legs.map((leg, i) => {
                        const legEcaPercent = leg.distanceNm > 0
                          ? Math.round((leg.ecaDistanceNm / leg.distanceNm) * 100)
                          : 0;
                        return (
                          <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={cn(
                                  "shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                                  leg.condition === "ballast" ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"
                                )}>{leg.condition}</span>
                                <span className="text-sm text-muted-foreground truncate">{leg.from} → {leg.to}</span>
                              </div>
                              <span className="text-sm font-bold tabular-nums shrink-0 ml-2">{Math.round(leg.distanceNm).toLocaleString()} NM</span>
                            </div>
                            {/* ECA bar */}
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full overflow-hidden bg-blue-500/20 flex">
                                {leg.ecaDistanceNm > 0 && (
                                  <div className="h-full bg-red-500" style={{ width: `${legEcaPercent}%` }} />
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {leg.ecaDistanceNm > 0 ? `${legEcaPercent}% ECA` : "Open Sea"}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                              <span>⚓ {leg.speedKnots} kn</span>
                              <span>⏱ {Math.round(leg.sailingHours)} hrs</span>
                              <span>📏 {(leg.distanceNm - leg.ecaDistanceNm).toLocaleString()} NM Open</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </DialogContent>
                </Dialog>

                {/* ── Weather Dialog — live data from Open-Meteo API ── */}
                <Dialog open={activePanel === "weather"} onOpenChange={(open) => setActivePanel(open ? "weather" : null)}>
                  <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-amber-400">
                        <CloudSun className="h-5 w-5" />
                        Weather Forecast
                      </DialogTitle>
                      <DialogDescription>Route weather conditions and sea state</DialogDescription>
                    </DialogHeader>
                    <WeatherForecastCard
                      weather={weatherData}
                      isLoading={isWeatherLoading}
                      error={weatherError}
                      onRefresh={() => {
                        clearWeather();
                        if (waypointCoords.length > 0) {
                          fetchWeather(waypointCoords, { forecastDays: 7 });
                        }
                      }}
                    />
                  </DialogContent>
                </Dialog>

                {/* ── Intelligence Dialog — Route Intelligence from MaritimeIntelligence ── */}
                <Dialog open={activePanel === "intelligence"} onOpenChange={(open) => setActivePanel(open ? "intelligence" : null)}>
                  <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-rose-400">
                        <ShieldAlert className="h-5 w-5" />
                        Route Intelligence
                      </DialogTitle>
                      <DialogDescription>Canal tolls, war risk premium, cargo risk, and port congestion analysis</DialogDescription>
                    </DialogHeader>

                    {isIntelLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Fetching intelligence data...</span>
                      </div>
                    ) : !routeIntel ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Intelligence data not available</p>
                        <p className="text-xs mt-1">Maritime Intelligence may not be configured yet</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Total Additional Costs banner */}
                        <div className="p-3 rounded-lg bg-gradient-to-r from-rose-500/10 to-amber-500/10 border border-rose-500/20">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Additional Voyage Costs</span>
                            <span className="text-xl font-bold text-rose-400">
                              ${routeIntel.totalAdditionalCostsUsd.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            Canal tolls + War risk + Port congestion delay costs
                          </div>
                        </div>

                        {/* Canal Tolls */}
                        {routeIntel.canalTolls.estimates.length > 0 && (
                          <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <Ship className="h-4 w-4 text-blue-400" />
                              <span>Canal Transit Fees</span>
                              <span className="ml-auto font-bold text-blue-400">
                                ${routeIntel.canalTolls.totalUsd.toLocaleString()}
                              </span>
                            </div>
                            {routeIntel.canalTolls.estimates.map((est, i) => (
                              <div key={i} className="pl-6 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground capitalize">{est.canal} Canal</span>{" — "}
                                ${est.estimatedCostUsd.toLocaleString()}
                                <span className="ml-1 opacity-60">({est.basis})</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* War Risk */}
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                            <span>War Risk Assessment</span>
                            {routeIntel.warRisk.premiumUsd > 0 && (
                              <span className="ml-auto font-bold text-amber-400">
                                ${routeIntel.warRisk.premiumUsd.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="pl-6 text-xs text-muted-foreground space-y-1">
                            <div>
                              Hull Value: <span className="text-foreground font-medium">${(routeIntel.hullValue.valueUsd / 1e6).toFixed(1)}M</span>
                              <span className="ml-1 opacity-60">({routeIntel.hullValue.basis})</span>
                            </div>
                            {routeIntel.warRisk.zones.length > 0 ? (
                              routeIntel.warRisk.zones.map((zone, i) => (
                                <div key={i} className="p-2 rounded bg-amber-500/5 border border-amber-500/10">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-foreground">{zone.name}</span>
                                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                      zone.riskLevel === "CRITICAL" ? "bg-red-500/20 text-red-400" :
                                      zone.riskLevel === "HIGH" ? "bg-amber-500/20 text-amber-400" :
                                      zone.riskLevel === "MODERATE" ? "bg-yellow-500/20 text-yellow-400" :
                                      "bg-green-500/20 text-green-400"
                                    }`}>{zone.riskLevel}</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 mt-1 text-[10px]">
                                    <span>Score: {zone.riskScore}/10</span>
                                    <span>Incidents: {zone.incidents12m}</span>
                                    <span>Guards: {zone.armedGuards}</span>
                                  </div>
                                  <div className="mt-1">
                                    Premium: ${zone.premiumUsd.toLocaleString()} ({zone.warRiskRatePercent}% hull)
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-green-400">✓ No High Risk Areas detected on this route</div>
                            )}
                          </div>
                        </div>

                        {/* Port Congestion */}
                        {routeIntel.portCongestion && (
                          <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <Anchor className="h-4 w-4 text-cyan-400" />
                              <span>Port Congestion</span>
                              <span className="ml-auto font-bold text-cyan-400">
                                {routeIntel.portCongestion.totalWaitDays}d wait
                              </span>
                            </div>
                            <div className="pl-6 space-y-1">
                              {routeIntel.portCongestion.ports.map((port, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    {port.portName}
                                    {!port.matched && <span className="ml-1 opacity-50">(est.)</span>}
                                  </span>
                                  <span className={`font-medium ${
                                    port.level === "HIGH" ? "text-red-400" :
                                    port.level === "MODERATE" ? "text-amber-400" :
                                    "text-green-400"
                                  }`}>
                                    {port.avgWaitDays}d — {port.level}
                                  </span>
                                </div>
                              ))}
                              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                                Est. delay cost: ${routeIntel.portCongestion.estimatedCostUsd.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Cargo Value */}
                        {routeIntel.cargoValue && (
                          <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <DollarSign className="h-4 w-4 text-emerald-400" />
                              <span>Cargo Value at Risk</span>
                            </div>
                            <div className="pl-6 text-xs text-muted-foreground space-y-1">
                              <div>
                                Cargo Value: <span className="text-foreground font-medium">${routeIntel.cargoValue.totalValueUsd.toLocaleString()}</span>
                                <span className="ml-1 opacity-60">({routeIntel.cargoValue.quantityMt.toLocaleString()} MT × ${routeIntel.cargoValue.pricePerMt}/MT)</span>
                              </div>
                              {routeIntel.cargoRisk && (
                                <>
                                  <div>
                                    Value at Risk: <span className="font-medium text-amber-400">${routeIntel.cargoRisk.riskExposureUsd.toLocaleString()}</span>
                                    <span className="ml-1 opacity-60">({routeIntel.cargoRisk.riskPercent}%)</span>
                                  </div>
                                  {routeIntel.cargoRisk.factors.map((f, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                      <span>{f.name}</span>
                                      <span className={`font-medium ${
                                        f.severity === "high" ? "text-red-400" :
                                        f.severity === "moderate" ? "text-amber-400" :
                                        "text-muted-foreground"
                                      }`}>${f.exposureUsd.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Data freshness footer */}
                        <div className="text-[10px] text-muted-foreground text-right">
                          Data as of {new Date(routeIntel.dataAsOf).toLocaleDateString()} • Updated by {routeIntel.updatedBy || "system"}
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
