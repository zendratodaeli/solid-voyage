"use client";

/**
 * NavAPI Multi-Leg Route Planner Component
 * 
 * Multi-waypoint route planner using NavAPI (Seametrix) for maritime routing.
 * Features:
 * - Multiple waypoints with add/remove
 * - Optional passage/canal waypoints
 * - Sequential leg calculation
 * - Uses existing VoyageMap and ResultsCard for display
 * - Freemium rate limiting (3/day free, unlimited paid)
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Navigation,
  Loader2,
  Ship,
  Plus,
  X,
  ChevronDown,
  Route,
  Clock,
  Anchor,
  Gauge,
  Fuel,
  FileDown,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
  BarChart3,
  CloudSun,
  ChevronLeft,
  ChevronRight,
  Scale,
  Layers,
  AlertTriangle,
  Zap,
  Crosshair,
  Satellite,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NavApiPortSearch, type NavApiPort } from "./NavApiPortSearch";
import { VoyageMap, type AlternativeRouteOverlay } from "./VoyageMap";
import { ResultsCard } from "./ResultsCard";
import { ResultsStrip } from "./ResultsStrip";
import { DrawerButtonBar, type DrawerType } from "./DrawerButtonBar";
import { PassageSearchInput } from "./PassageSearchInput";
import { RouteComparisonCard } from "./RouteComparisonCard";
import { VoyageOptimizerPanel } from "./VoyageOptimizerPanel";
import { cn } from "@/lib/utils";
import { UsageCounter } from "@/components/billing/UsageCounter";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { useWeather } from "@/hooks/useWeather";
import { WeatherForecastCard } from "@/components/weather/WeatherForecastCard";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ComplianceInsights } from "./ComplianceInsights";
import { 
  detectCanalsInRoute, 
  calculateValidatedZoneDistances,
  calculateHRADistances,
  isMediterraneanSecaEffective,
  type DetectedCanal 
} from "@/lib/route-zone-classifier";
import { getCountryCodeByName } from "@/data/countries";
import { majorPorts } from "@/data/ports";
import { getLastPosition, type AisVesselPosition } from "@/actions/ais-actions";
import { computeRouteIntelligence, type RouteIntelligenceResult } from "@/lib/calculations/route-intelligence";
import { analyzeWeatherDeviation, checkBunkeringRange, analyzeNearestSafePorts, type SafePortResult } from "@/lib/calculations/route-deviation-engine";
import { fetchWeatherRoute, weatherWaypointsToCoordinates, fetchRouteForecast, fetchMultiRouteForecast, type WeatherRouteResponse, type RouteForecastResponse, type MultiRouteComparisonResponse } from "@/lib/weather-routing-client";
import { AIRouteRecommendationPanel } from "./AIRouteRecommendation";
import type { AIRouteRecommendation } from "@/app/api/ai/route-analysis/route";
import LiveTrackingPanel from "./LiveTrackingPanel";

// Types
interface PortTimes {
  waitingHours: number;   // Waiting for berth
  loadingHours: number;   // Loading/Unloading/Berthing
  idleHours: number;      // Other downtime
}

interface LegConfig {
  condition: "laden" | "ballast";
  speed: number;            // Knots (auto-filled from vessel profile)
  dailyConsumption: number; // MT/day (auto-filled from vessel profile per condition)
  maxDraft: string;         // Meters (manual input)
}

interface Waypoint {
  id: string;
  type: "port" | "passage";
  port?: NavApiPort | null;
  passage?: StrategicPassage | null;
  order: number;
  portTimes?: PortTimes;
  useManualCoords?: boolean;
  manualLat?: number;
  manualLng?: number;
  manualName?: string;
  legConfig?: LegConfig;  // Settings for leg FROM this waypoint TO the next
}

interface StrategicPassage {
  id: string;
  name: string;
  displayName: string;
  type: string;
  region: string;
  entryLat: number;
  entryLng: number;
  entryName: string;
  exitLat: number;
  exitLng: number;
  exitName: string;
  maxDraft: number | null;
  restriction: string | null;
  hasToll: boolean;
  polyline?: [number, number][] | null;
  distanceNm?: number;
}

// User's vessel profile (from /api/vessels)
interface UserVessel {
  id: string;
  name: string;
  dwt: number;
  vesselType: string;
  loa?: number | null;
  beam?: number | null;
  ladenSpeed: number;
  ballastSpeed: number;
  ladenConsumption: number;
  ballastConsumption: number;
  fuelConsumption?: Record<string, { laden: number; ballast: number }>;
  hasScrubber?: boolean;
  fuelTypes?: string[];
}

// VoyageMap compatible types
interface VoyageMapWaypoint {
  id: string;
  port: {
    id: string;
    name: string;
    locode?: string;
    latitude: number;
    longitude: number;
  } | null;
  order: number;
}

interface LegGeometry {
  coordinates: [number, number][];
  ecaSegments: [number, number][][];
  hraSegments: [number, number][][];
}

interface RouteResultData {
  summary: {
    totalDistanceNm: number;
    totalECADistanceNm: number;
    totalHRADistanceNm: number;
    estimatedDays: number | null;
    openSeaDistanceNm: number;
  };
  legs: Array<{
    legNumber: number;
    from: { name: string; locode?: string; coordinates: [number, number] };
    to: { name: string; locode?: string; coordinates: [number, number] };
    distanceNm: number;
    ecaDistanceNm: number;
    hraDistanceNm: number;
    isFullECA: boolean;
    ecaZones: string[];
    hraZones: string[];
    geometry: LegGeometry;
    sailingHours?: number;
    eta?: string;
    etd?: string;
    portStayHours?: number;
    speedKnots?: number;    // Per-leg speed used for this segment
    condition?: "laden" | "ballast";  // Vessel condition for this leg
  }>;
  zones: {
    eca: string[];
    hra: string[];
  };
  warnings: string[];
}

interface RouteAlternative {
  id: string;              // "primary" | "avoid-canal" | "seca-minimized"
  label: string;           // "Via Suez Canal" | "Avoid Suez (Cape Route)" | "SECA Minimized"
  result: RouteResultData;
  canalName: string;
  totalDays: number;
  totalDistanceNm: number;
  intel?: RouteIntelligenceResult | null; // Maritime Intelligence enrichment
}

// Generate unique ID
function generateId(): string {
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Create initial waypoints (Starting Point + Origin + Destination)
// Every non-terminal waypoint gets legConfig for outgoing leg
function createInitialWaypoints(): Waypoint[] {
  return [
    { id: generateId(), type: "port", port: null, order: 0,
      legConfig: { condition: "ballast", speed: 14.0, dailyConsumption: 25, maxDraft: "" } },
    { id: "wp-2", type: "port" as const, port: null, order: 1,
      legConfig: { condition: "laden", speed: 12.5, dailyConsumption: 25, maxDraft: "" } },
    { id: generateId(), type: "port", port: null, order: 2 },
  ];
}

/**
 * Calculate ETAs for each leg based on:
 * - ETD at origin
 * - Per-leg speed (from leg.speedKnots)
 * - Port stay time at each intermediate port
 */
function calculateETAs(
  legs: RouteResultData["legs"],
  etdString: string,
  waypoints: Waypoint[]
): void {
  if (!etdString) return;
  
  let currentTime = new Date(etdString);
  
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const speed = leg.speedKnots || 12.5;
    if (speed <= 0) continue;
    
    const sailingHours = leg.distanceNm / speed;
    leg.sailingHours = sailingHours;
    
    currentTime = new Date(currentTime.getTime() + sailingHours * 60 * 60 * 1000);
    leg.eta = currentTime.toISOString();
    
    const destWaypoint = waypoints[i + 1];
    const portTimes = destWaypoint?.portTimes;
    const totalPortHours = 
      (portTimes?.waitingHours || 0) + 
      (portTimes?.loadingHours || 0) + 
      (portTimes?.idleHours || 0);
    leg.portStayHours = totalPortHours;
    
    if (i < legs.length - 1 && totalPortHours > 0) {
      currentTime = new Date(currentTime.getTime() + totalPortHours * 60 * 60 * 1000);
      leg.etd = currentTime.toISOString();
    }
  }
}

interface NavApiMultiRoutePlannerProps {
  className?: string;
}

export function NavApiMultiRoutePlanner({
  className,
}: NavApiMultiRoutePlannerProps) {
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgSlug = routeParams.orgSlug as string || "personal";
  const isCreateVoyageMode = searchParams.get("mode") === "create-voyage";
  const [waypoints, setWaypoints] = useState<Waypoint[]>(createInitialWaypoints());
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<RouteResultData | null>(null);
  const [passageDialogOpen, setPassageDialogOpen] = useState(false);
  const [insertAfterIndex, setInsertAfterIndex] = useState<number>(0);
  
  // Freemium billing state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const usageRefetchRef = useRef<(() => void) | null>(null);

  // PDF state
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  
  // Voyage parameters
  const [etd, setEtd] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16);
  });
  const [detectedCanals, setDetectedCanals] = useState<DetectedCanal[]>([]);
  
   // Route comparison state
  const [routeAlternatives, setRouteAlternatives] = useState<RouteAlternative[]>([]);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState<string>("primary");
  const [canalCost, setCanalCost] = useState<string>("");

  // Route Intelligence + AI Recommendation state
  const [aiRecommendation, setAiRecommendation] = useState<AIRouteRecommendation | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Nearest Safe Port Analysis state
  const [safePortAnalysis, setSafePortAnalysis] = useState<SafePortResult | null>(null);

  // Multi-route weather comparison state
  const [multiRouteComparison, setMultiRouteComparison] = useState<MultiRouteComparisonResponse | null>(null);
  const [isMultiRouteLoading, setIsMultiRouteLoading] = useState(false);

  // Panel state — cockpit layout
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(380);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [expandedWaypoints, setExpandedWaypoints] = useState<Set<string>>(new Set());
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const weatherSectionRef = useRef<HTMLDivElement>(null);

  // Panel resize drag handler
  const handlePanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPanel(true);
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(550, Math.max(300, startWidth + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDraggingPanel(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  // Drawer state for detail panels (Summary, Compliance, Legs, Weather, Optimizer)
  const [activeDrawer, setActiveDrawer] = useState<DrawerType | null>(null);
  const handleOpenDrawer = useCallback((drawer: DrawerType) => {
    setActiveDrawer(prev => prev === drawer ? null : drawer);
  }, []);
  const handleCloseDrawer = useCallback(() => {
    setActiveDrawer(null);
  }, []);

  // Compute alert count for Compliance badge
  const complianceAlertCount = useMemo(() => {
    if (!result) return 0;
    let alerts = 0;
    if (result.summary.totalECADistanceNm > 0) alerts++;
    if (result.summary.totalHRADistanceNm > 0) alerts++;
    alerts += result.warnings.filter(w => w.includes("⛔") || w.includes("VIOLATION")).length;
    return alerts;
  }, [result]);

  // Toggle expand/collapse for a waypoint's leg config
  const toggleWaypointExpanded = useCallback((id: string) => {
    setExpandedWaypoints(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Weather integration — NOAA primary, Open-Meteo fallback
  const { fetchWeather, setWeatherData, isLoading: isWeatherLoading, data: weatherData, error: weatherError, clearWeather } = useWeather();

  // ── Click-to-Fill State ──────────────────────────────────────────
  // Tracks which waypoint field is "armed" & waiting for a map click
  const [activeClickTarget, setActiveClickTarget] = useState<{
    waypointId: string;
    waypointIndex: number;
    label: string;
  } | null>(null);

  // ── Map Context Menu State ────────────────────────────────────────
  // Right-click on map shows "Add destination here" + nearest port options
  const [contextMenu, setContextMenu] = useState<{
    lat: number;
    lon: number;
    x: number;
    y: number;
    nearestPorts: Array<{ name: string; locode: string; distanceNm: number; lat: number; lon: number }>;
  } | null>(null);

  // ── Port Database Cache (from our DB — seeded from NGA WPI) ────
  const wpiPortsRef = useRef<Array<{ name: string; locode: string; lat: number; lon: number }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/ports?all=true");
        const data = await res.json();
        if (data.ports) {
          wpiPortsRef.current = data.ports.map((p: any) => ({
            name: p.name,
            locode: p.locode || "",
            lat: p.latitude,
            lon: p.longitude,
          }));
          console.log(`[PortDB] Loaded ${wpiPortsRef.current.length} ports for context menu`);
        }
      } catch (err) {
        console.warn("[PortDB] Failed to load from DB, falling back to static ports:", err);
        wpiPortsRef.current = majorPorts.map(p => ({
          name: p.name,
          locode: p.locode,
          lat: p.latitude,
          lon: p.longitude,
        }));
      }
    })();
  }, []);

  // ── AIS Auto-Fill State ──────────────────────────────────────────
  const [aisPosition, setAisPosition] = useState<{ lat: number; lng: number; name: string; updated: string } | null>(null);
  const aisAutoFillRef = useRef<string | null>(null); // Track which vessel was auto-filled

  // ── Live Vessel Tracking State ──────────────────────────────────
  const [vesselMapPosition, setVesselMapPosition] = useState<{ lat: number; lon: number; name: string; speed: number } | null>(null);
  const [vesselTrail, setVesselTrail] = useState<import("./LiveTrackingPanel").TrailPoint[]>([]);
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [nearbyMapVessels, setNearbyMapVessels] = useState<Array<{ lat: number; lon: number; name: string; speed: number; heading?: number }>>([]);

  // Weather-optimized route from Python engine (optional, non-blocking)
  const [weatherRouteOverlay, setWeatherRouteOverlay] = useState<{
    coordinates: [number, number][];
    distanceNm: number;
    estimatedDays: number;
    estimatedFuelMt: number;
  } | null>(null);

  // Route forecast delay (from NOAA engine)
  const [routeForecastDelay, setRouteForecastDelay] = useState<{
    delayHours: number;
    calmHours: number;
    weatherHours: number;
    vesselType: string;
    worstSegment: RouteForecastResponse["worst_segment"] | null;
  } | null>(null);

  // Convert weather data to map-compatible points for overlay
  const weatherMapPoints = useMemo(() => {
    if (!weatherData?.waypoints) return undefined;
    return weatherData.waypoints.map(wp => ({
      lat: wp.latitude,
      lon: wp.longitude,
      severity: wp.current.severity,
      waveHeightM: wp.current.waveHeight,
      swellHeightM: wp.current.swellWaveHeight,
    }));
  }, [weatherData]);

  const alternativeRouteOverlays: AlternativeRouteOverlay[] = useMemo(() => {
    const overlays: AlternativeRouteOverlay[] = [];

    // NavAPI route alternatives (avoid-canal, seca-minimized)
    if (routeAlternatives.length >= 2) {
      const VARIANT_COLORS: Record<string, string> = {
        "primary": "#3b82f6",
        "avoid-canal": "#f97316",
        "seca-minimized": "#06b6d4",
      };
      overlays.push(
        ...routeAlternatives
          .filter(alt => alt.id !== selectedAlternativeId)
          .map(alt => ({
            id: alt.id,
            label: alt.label,
            color: VARIANT_COLORS[alt.id] || "#8b5cf6",
            coordinates: alt.result.legs.map(leg => leg.geometry.coordinates),
            distanceNm: alt.totalDistanceNm,
          }))
      );
    }

    // Weather-optimized route from Python engine (green dashed line)
    if (weatherRouteOverlay) {
      overlays.push({
        id: "weather-optimized",
        label: `Weather Route (${weatherRouteOverlay.distanceNm.toLocaleString()} NM · ${weatherRouteOverlay.estimatedDays}d · ${weatherRouteOverlay.estimatedFuelMt} MT)`,
        color: "#22c55e", // Green
        coordinates: [weatherRouteOverlay.coordinates],
        distanceNm: weatherRouteOverlay.distanceNm,
      });
    }

    return overlays;
  }, [routeAlternatives, selectedAlternativeId, weatherRouteOverlay]);

  // When user selects a route alternative, swap the displayed result
  const handleSelectAlternative = useCallback((altId: string) => {
    setSelectedAlternativeId(altId);
    const selected = routeAlternatives.find(a => a.id === altId);
    if (selected) {
      setResult(selected.result);
    }
  }, [routeAlternatives]);
  
  // Compute effective speed (weighted average from leg configs) for ComplianceInsights
  const effectiveSpeed = useMemo(() => {
    const configs = waypoints.filter(w => w.legConfig).map(w => w.legConfig!);
    if (configs.length === 0) return 12.5;
    return configs.reduce((sum, c) => sum + c.speed, 0) / configs.length;
  }, [waypoints]);
  
  // Compute effective voyage mode (use cargo leg condition, default laden)
  const effectiveVoyageMode = useMemo((): "laden" | "ballast" => {
    // Use the last leg with a config (typically Origin→Dest = laden)
    const configs = waypoints.filter(w => w.legConfig).map(w => w.legConfig!);
    if (configs.length === 0) return "laden";
    return configs[configs.length - 1].condition;
  }, [waypoints]);
  
  // Compute per-leg consumption data for ComplianceInsights
  const legConsumptions = useMemo(() => {
    if (!result) return [];
    return result.legs.map((leg, i) => {
      const wpConfig = waypoints[i]?.legConfig;
      return {
        condition: wpConfig?.condition || "ballast" as const,
        dailyConsumption: wpConfig?.dailyConsumption || 25,
        distanceNm: leg.distanceNm,
        speedKnots: wpConfig?.speed || effectiveSpeed,
      };
    });
  }, [result, waypoints, effectiveSpeed]);
  
  // Compute max draft across all legs for passage skipping
  const maxDraftValue = useMemo(() => {
    return Math.max(
      ...waypoints
        .filter(w => w.legConfig?.maxDraft)
        .map(w => parseFloat(w.legConfig!.maxDraft.replace(',', '.')) || 0),
      0
    );
  }, [waypoints]);
  
  // User's vessels for CII calculation
  const [vessels, setVessels] = useState<UserVessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<string>("");
  const [manualDWT, setManualDWT] = useState<string>(""); // Manual DWT input when no vessel selected
  const [manualVesselName, setManualVesselName] = useState<string>(""); // Manual vessel name input
  const [vesselDropdownOpen, setVesselDropdownOpen] = useState(false); // Combobox dropdown state
  const selectedVessel = useMemo(
    () => selectedVesselId && selectedVesselId !== "__manual__" 
      ? vessels.find(v => v.id === selectedVesselId) || null 
      : null,
    [vessels, selectedVesselId]
  );
  // Effective DWT: from selected vessel or manual input
  const effectiveDWT = selectedVessel?.dwt ?? (parseFloat(manualDWT) || 0);

  // Computed distances for optimizer (ballast + laden from route result)
  const optimizerDistances = useMemo(() => {
    if (!result) return { ballast: 0, laden: 0 };
    let ballast = 0;
    let laden = 0;
    result.legs.forEach((leg, i) => {
      const condition = waypoints[i]?.legConfig?.condition || "laden";
      if (condition === "ballast") {
        ballast += leg.distanceNm;
      } else {
        laden += leg.distanceNm;
      }
    });
    return { ballast, laden };
  }, [result, waypoints]);

  // Build vessel profile for optimizer
  const optimizerVesselProfile = useMemo(() => {
    if (!selectedVessel) return null;
    return {
      ladenSpeed: selectedVessel.ladenSpeed,
      ballastSpeed: selectedVessel.ballastSpeed,
      ladenConsumption: selectedVessel.ladenConsumption,
      ballastConsumption: selectedVessel.ballastConsumption,
      portConsumption: 3, // Default port consumption
      dailyOpex: 8000,     // Default daily OPEX
    };
  }, [selectedVessel]);

  // Handle optimizer Apply Config (updates speed on route planner only)
  const handleApplyOptimizedConfig = useCallback((speed: number, mode: "normal" | "eco") => {
    setWaypoints(prev => prev.map(w => {
      if (!w.legConfig) return w;
      return {
        ...w,
        legConfig: {
          ...w.legConfig,
          speed,
        },
      };
    }));
  }, []);

  // Handle "Create Voyage with optimized config" from optimizer Apply/Use button
  const handleCreateVoyageWithConfig = useCallback((config: {
    speed: number;
    mode: "normal" | "eco";
    bunkerCost: number;
    tce: number;
    voyagePnl: number | null;
    seaDays: number;
    totalVoyageDays: number;
    ciiRating?: string;
  }) => {
    if (!result || !selectedVessel) return;

    // Build port names from waypoints (supports both port-search and lat/lng)
    const portNames = waypoints
      .filter(w => w.type === "port")
      .map(w => w.port?.displayName || w.manualName || "Unknown");
    
    const openPort = portNames[0] || "";
    const loadPorts = portNames.length > 2
      ? portNames.slice(1, -1)
      : [portNames[1] || ""].filter(Boolean);
    const dischargePorts = portNames.length > 2
      ? [portNames[portNames.length - 1]].filter(Boolean)
      : [];
    if (loadPorts.length === 0 && dischargePorts.length > 0) {
      loadPorts.push(dischargePorts[0]);
    }

    // Build leg distances
    const legData = result.legs.map((leg, i) => ({
      from: leg.from.name,
      to: leg.to.name,
      type: waypoints[i]?.legConfig?.condition || "laden",
      distanceNm: leg.distanceNm,
    }));

    // Extract country codes from port data for EU ETS auto-detection
    const portWps = waypoints.filter(w => w.type === "port" && w.port);
    const originCountry = portWps[0]?.port?.country;
    const destCountry = portWps[portWps.length - 1]?.port?.country;

    // Store in sessionStorage with optimized config
    const optimizerData = {
      vesselId: selectedVessel.id,
      openPort,
      loadPorts,
      dischargePorts,
      legDistances: legData,
      canalTolls: canalCost ? parseFloat(canalCost) || 0 : 0,
      optimizedConfig: config,
      originCountryCode: originCountry ? getCountryCodeByName(originCountry) : undefined,
      destinationCountryCode: destCountry ? getCountryCodeByName(destCountry) : undefined,
      timestamp: Date.now(),
    };
    sessionStorage.setItem("voyage-optimizer-data", JSON.stringify(optimizerData));

    toast.success(`Creating voyage with optimized speed: ${config.speed} kn (${config.mode} mode)`);

    // Navigate to voyage form
    router.push(`/${orgSlug}/voyages/new?from=optimizer`);
  }, [result, selectedVessel, waypoints, canalCost, orgSlug, router]);

  // Handle "Create Voyage" button (non-optimizer, basic route data)
  const handleCreateVoyage = useCallback(() => {
    if (!result || !selectedVessel) return;

    // Build port names from waypoints
    const portWaypoints = waypoints.filter(w => w.type === "port" && w.port);
    const openPort = portWaypoints[0]?.port?.displayName || "";
    const loadPorts = portWaypoints.slice(1, -1).map(w => w.port?.displayName || "").filter(Boolean);
    const dischargePorts = [portWaypoints[portWaypoints.length - 1]?.port?.displayName || ""].filter(Boolean);
    if (loadPorts.length === 0 && dischargePorts.length > 0) {
      // If only 2 ports: first is load, second is discharge
      loadPorts.push(dischargePorts[0]);
    }

    // Build leg distances
    const legData = result.legs.map((leg, i) => ({
      from: leg.from.name,
      to: leg.to.name,
      type: waypoints[i]?.legConfig?.condition || "laden",
      distanceNm: leg.distanceNm,
    }));

    // Extract country codes for EU ETS auto-detection
    const originCountry = portWaypoints[0]?.port?.country;
    const destCountry = portWaypoints[portWaypoints.length - 1]?.port?.country;

    // Store in sessionStorage
    const optimizerData = {
      vesselId: selectedVessel.id,
      openPort,
      loadPorts,
      dischargePorts,
      legDistances: legData,
      canalTolls: canalCost ? parseFloat(canalCost) || 0 : 0,
      originCountryCode: originCountry ? getCountryCodeByName(originCountry) : undefined,
      destinationCountryCode: destCountry ? getCountryCodeByName(destCountry) : undefined,
      timestamp: Date.now(),
    };
    sessionStorage.setItem("voyage-optimizer-data", JSON.stringify(optimizerData));

    // Navigate to voyage form
    router.push(`/${orgSlug}/voyages/new?from=optimizer`);
  }, [result, selectedVessel, waypoints, canalCost, orgSlug, router]);

  // Fetch user's vessels on mount
  useEffect(() => {
    fetch("/api/vessels")
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setVessels(data.data);
          // Don't auto-select - let user choose or use manual input
        }
      })
      .catch(console.error);
  }, []);

  // ── Copilot Deep-Link: Pre-fill ports from URL params ──
  // Supports: ?from=SGSIN&to=DEHAM or ?from=SGSIN&via=DEHAM&to=DERSK
  // Also supports coordinates: ?fromLat=1.26&fromLon=103.82&fromName=Singapore
  const deepLinkProcessed = useRef(false);
  useEffect(() => {
    if (deepLinkProcessed.current) return;
    
    const fromCode = searchParams.get("from");
    const toCode = searchParams.get("to");
    const viaCode = searchParams.get("via");
    const fromLat = searchParams.get("fromLat");
    const fromLon = searchParams.get("fromLon");
    const fromName = searchParams.get("fromName");
    const toLat = searchParams.get("toLat");
    const toLon = searchParams.get("toLon");
    const toName = searchParams.get("toName");

    // Nothing to pre-fill
    if (!fromCode && !toCode && !fromLat && !toLat) return;
    deepLinkProcessed.current = true;

    // Helper: fetch port by code from NavAPI search
    const fetchPort = async (code: string): Promise<NavApiPort | null> => {
      try {
        const res = await fetch(`/api/navapi/ports?q=${encodeURIComponent(code)}`);
        const data = await res.json();
        const ports: NavApiPort[] = data.ports || [];
        // Exact code match first, then first result
        return ports.find(p => p.portCode === code) || ports[0] || null;
      } catch {
        return null;
      }
    };

    (async () => {
      // Build new waypoints array
      const newWaypoints = createInitialWaypoints();

      // Origin: port code or coordinates
      if (fromCode) {
        const port = await fetchPort(fromCode);
        if (port) newWaypoints[0] = { ...newWaypoints[0], port };
      } else if (fromLat && fromLon) {
        newWaypoints[0] = {
          ...newWaypoints[0],
          useManualCoords: true,
          manualLat: parseFloat(fromLat),
          manualLng: parseFloat(fromLon),
          manualName: fromName || `${fromLat}, ${fromLon}`,
          port: null,
        };
      }

      // Via point (optional intermediate port)
      if (viaCode) {
        const viaPort = await fetchPort(viaCode);
        if (viaPort) {
          // Insert via waypoint between origin and destination
          newWaypoints.splice(1, 0, {
            id: generateId(),
            type: "port",
            port: viaPort,
            order: 1,
            legConfig: { condition: "laden", speed: 12.5, dailyConsumption: 25, maxDraft: "" },
          });
          // Re-order
          newWaypoints.forEach((w, i) => { w.order = i; });
        }
      }

      // Destination: port code or coordinates
      const destIdx = newWaypoints.length - 1;
      if (toCode) {
        const port = await fetchPort(toCode);
        if (port) newWaypoints[destIdx] = { ...newWaypoints[destIdx], port };
      } else if (toLat && toLon) {
        newWaypoints[destIdx] = {
          ...newWaypoints[destIdx],
          useManualCoords: true,
          manualLat: parseFloat(toLat),
          manualLng: parseFloat(toLon),
          manualName: toName || `${toLat}, ${toLon}`,
          port: null,
        };
      }

      setWaypoints(newWaypoints);
      toast.info("Ports pre-filled from AI Copilot", { duration: 3000 });
    })();
  }, [searchParams]);

  // ── Voyage Form Deep-Dive: Pre-fill from VoyageForm sessionStorage ──
  const voyageFormProcessed = useRef(false);
  useEffect(() => {
    if (voyageFormProcessed.current) return;
    const fromParam = searchParams.get("from");
    if (fromParam !== "voyage-form") return;

    try {
      const raw = sessionStorage.getItem("voyage-form-to-route-planner");
      if (!raw) return;
      voyageFormProcessed.current = true;

      const data = JSON.parse(raw);
      sessionStorage.removeItem("voyage-form-to-route-planner"); // Clean up

      // Auto-select vessel
      if (data.vesselId && vessels.length > 0) {
        const vessel = vessels.find((v: any) => v.id === data.vesselId);
        if (vessel) {
          setSelectedVesselId(vessel.id);
        }
      }

      // Build waypoints: Open → LoadPorts → DischargePorts
      const allPorts: string[] = [];
      if (data.openPort) allPorts.push(data.openPort);
      if (data.loadPorts) allPorts.push(...data.loadPorts);
      if (data.dischargePorts) allPorts.push(...data.dischargePorts);

      if (allPorts.length >= 2) {
        const newWaypoints = allPorts.map((portName: string, idx: number) => ({
          id: `vf-${idx}-${Date.now()}`,
          type: "port" as const,
          port: null,
          passage: null,
          manualName: portName,
          useManualCoords: false,
          legConfig: idx > 0 ? {
            condition: (idx === 1 ? "ballast" : "laden") as "ballast" | "laden",
            speed: idx === 1
              ? parseFloat(data.ballastSpeed) || 14
              : parseFloat(data.ladenSpeed) || 12,
            dailyConsumption: 25,
            maxDraft: data.draft?.toString() || "",
          } : undefined,
          portTimes: idx > 0 ? {
            waitingHours: 0,
            loadingHours: 0,
            idleHours: 0,
          } : undefined,
        }));

        // Apply port times from voyage form
        if (data.portTimes) {
          const loadIdx = data.openPort ? 1 : 0; // Offset if there's an open port
          data.portTimes.load?.forEach((pt: any, i: number) => {
            const wpIdx = loadIdx + i;
            if (newWaypoints[wpIdx]?.portTimes) {
              newWaypoints[wpIdx].portTimes!.waitingHours = (pt.waiting || 0) * 24;
              newWaypoints[wpIdx].portTimes!.loadingHours = (pt.berthing || 0) * 24;
            }
          });
          data.portTimes.discharge?.forEach((pt: any, i: number) => {
            const wpIdx = loadIdx + (data.loadPorts?.length || 0) + i;
            if (newWaypoints[wpIdx]?.portTimes) {
              newWaypoints[wpIdx].portTimes!.waitingHours = (pt.waiting || 0) * 24;
              newWaypoints[wpIdx].portTimes!.loadingHours = (pt.berthing || 0) * 24;
            }
          });
        }

        setWaypoints(newWaypoints as any);

        // Set ETD if provided
        if (data.etd) {
          setEtd(data.etd);
        }

        toast.info("Pre-filled from Voyage Form — review and calculate", { duration: 4000 });
      }
    } catch (e) {
      console.warn("[RoutePlanner] Failed to read voyage form data:", e);
    }
  }, [searchParams, vessels]);

  // Check if we can calculate (at least 2 valid waypoints)
  const validWaypoints = useMemo(
    () => waypoints.filter((w) => 
      w.port || w.passage || (w.manualLat !== undefined && w.manualLng !== undefined) || w.manualName
    ),
    [waypoints]
  );
  const canCalculate = validWaypoints.length >= 2;

  // Auto-fill leg speeds AND consumption when vessel is selected
  useEffect(() => {
    if (selectedVessel) {
      setWaypoints(prev => prev.map(w => {
        if (!w.legConfig) return w;
        const isLaden = w.legConfig.condition === "laden";
        // Get consumption from per-fuel profile or fallback to vessel defaults
        const vesselConsumption = isLaden
          ? selectedVessel.ladenConsumption
          : selectedVessel.ballastConsumption;
        return {
          ...w,
          legConfig: {
            ...w.legConfig,
            speed: isLaden ? selectedVessel.ladenSpeed : selectedVessel.ballastSpeed,
            dailyConsumption: vesselConsumption,
          },
        };
      }));
    }
  }, [selectedVessel]);

  // ── AIS Auto-Fill: Fetch vessel position when vessel is selected ──────
  // Uses the vessel's MMSI or IMO from their profile to get live AIS position
  useEffect(() => {
    if (!selectedVessel) {
      setAisPosition(null);
      aisAutoFillRef.current = null;
      return;
    }

    // Skip if we already auto-filled for this exact vessel
    if (aisAutoFillRef.current === selectedVessel.id) return;

    // Need MMSI or IMO — these come from the full vessel record
    (async () => {
      try {
        const vesselRes = await fetch(`/api/vessels/${selectedVessel.id}`);
        const vesselData = await vesselRes.json();
        if (!vesselData.success) return;

        const vessel = vesselData.data;
        const mmsi = vessel.mmsiNumber;
        const imo = vessel.imoNumber;

        if (!mmsi && !imo) {
          console.log("[AIS] Vessel has no MMSI/IMO — skipping AIS auto-fill");
          return;
        }

        const result = await getLastPosition({
          mmsi: mmsi || undefined,
          imo: imo || undefined,
        });

        if (!result.success || !result.data?.length) {
          console.log("[AIS] No position data returned");
          return;
        }

        const pos = result.data[0];
        const lat = typeof pos.Latitude === "string" ? parseFloat(pos.Latitude) : pos.Latitude;
        const lng = typeof pos.Longitude === "string" ? parseFloat(pos.Longitude) : pos.Longitude;

        if (lat === null || lng === null || lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
          console.log("[AIS] Invalid coordinates from AIS");
          return;
        }

        // Store AIS position for the badge display
        const updatedTime = pos.PositionLastUpdated || new Date().toISOString();
        setAisPosition({ lat, lng, name: "AIS", updated: updatedTime });

        // Auto-fill the Starting Point (first waypoint)
        // Overwrite if: empty OR was previously AIS-filled (so switching vessels works)
        setWaypoints(prev => {
          const first = prev[0];
          const isEmpty = first && !first.port && first.manualLat === undefined;
          const wasAisFilled = first && first.manualName === "__ais__";
          
          if (first && (isEmpty || wasAisFilled)) {
            aisAutoFillRef.current = selectedVessel.id;
            const updated = [...prev];
            updated[0] = {
              ...first,
              port: null,
              useManualCoords: true,
              manualLat: lat,
              manualLng: lng,
              manualName: "__ais__", // Internal marker — not shown in UI
            };
            return updated;
          }
          return prev;
        });

        toast.success(`📡 Starting point set from AIS: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`, {
          duration: 4000,
        });
      } catch (err) {
        console.warn("[AIS] Failed to fetch vessel position:", err);
      }
    })();
  }, [selectedVessel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Click-to-Fill: Ref-based handler to avoid stale closure ──────────
  // MaritimeMap binds the click handler ONCE in a ref callback, so we need
  // a stable function that always delegates to the latest state via refs.
  const activeClickTargetRef = useRef(activeClickTarget);
  const waypointsRef = useRef(waypoints);
  useEffect(() => { activeClickTargetRef.current = activeClickTarget; }, [activeClickTarget]);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    const currentTarget = activeClickTargetRef.current;
    const currentWaypoints = waypointsRef.current;

    // If a target is armed → fill that specific waypoint
    if (currentTarget) {
      const { waypointId, waypointIndex, label } = currentTarget;

      setWaypoints(prev => prev.map(w =>
        w.id === waypointId
          ? {
              ...w,
              port: null,
              useManualCoords: true,
              manualLat: lat,
              manualLng: lng,
              manualName: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
            }
          : w
      ));

      toast.success(`📍 ${label} set to ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`);

      // Smart advancement: find the next empty waypoint
      const nextEmpty = currentWaypoints.findIndex((w, i) =>
        i > waypointIndex && !w.port && !w.passage && w.manualLat === undefined
      );

      if (nextEmpty >= 0) {
        const nextWp = currentWaypoints[nextEmpty];
        setActiveClickTarget({
          waypointId: nextWp.id,
          waypointIndex: nextEmpty,
          label: getWaypointLabel(nextEmpty, currentWaypoints.length),
        });
      } else {
        setActiveClickTarget(null);
      }
      return;
    }

    // No target armed → auto-fill the FIRST empty waypoint
    const firstEmptyIndex = currentWaypoints.findIndex(w =>
      !w.port && !w.passage && w.manualLat === undefined
    );

    if (firstEmptyIndex >= 0) {
      const emptyWp = currentWaypoints[firstEmptyIndex];
      const label = getWaypointLabel(firstEmptyIndex, currentWaypoints.length);

      setWaypoints(prev => prev.map(w =>
        w.id === emptyWp.id
          ? {
              ...w,
              port: null,
              useManualCoords: true,
              manualLat: lat,
              manualLng: lng,
              manualName: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
            }
          : w
      ));

      toast.success(`📍 ${label} set to ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`);

      // Advance to next empty
      const nextEmpty = currentWaypoints.findIndex((w, i) =>
        i > firstEmptyIndex && !w.port && !w.passage && w.manualLat === undefined
      );
      if (nextEmpty >= 0) {
        const nextWp = currentWaypoints[nextEmpty];
        setActiveClickTarget({
          waypointId: nextWp.id,
          waypointIndex: nextEmpty,
          label: getWaypointLabel(nextEmpty, currentWaypoints.length),
        });
      }
    } else {
      toast.info("All waypoints already have locations set");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Stable — never recreated. Uses refs for latest state.

  // ── Map Right-Click Context Menu ─────────────────────────────────
  // Shows "Add destination here" + nearest 3 ports from NGA World Port Index (3,700+)
  const handleMapRightClick = useCallback((lat: number, lon: number, containerPoint: { x: number; y: number }) => {
    // Close context menu on any left-click
    setActiveClickTarget(null);

    // Use NGA WPI (3,700+ ports) if loaded, fallback to static majorPorts
    const portSource = wpiPortsRef.current.length > 0 ? wpiPortsRef.current : majorPorts.map(p => ({
      name: p.name, locode: p.locode, lat: p.latitude, lon: p.longitude,
    }));

    // Find nearest ports using haversine distance
    const R = 3440.065; // Earth radius in NM
    const portsWithDist = portSource.map(p => {
      const dLat = (p.lat - lat) * Math.PI / 180;
      const dLon = (p.lon - lon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      const distNm = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return { name: p.name, locode: p.locode, distanceNm: Math.round(distNm), lat: p.lat, lon: p.lon };
    })
    .filter(p => p.distanceNm < 100) // Only show ports within 100 NM
    .sort((a, b) => a.distanceNm - b.distanceNm)
    .slice(0, 3); // Top 3 nearest

    setContextMenu({
      lat,
      lon,
      x: containerPoint.x,
      y: containerPoint.y,
      nearestPorts: portsWithDist,
    });
  }, []);

  // Add a waypoint from context menu selection
  const addWaypointFromContextMenu = useCallback((
    type: "coordinate" | "port",
    lat: number,
    lon: number,
    portDetails?: { name: string; locode: string },
  ) => {
    setContextMenu(null);
    const newId = generateId();

    if (type === "port" && portDetails) {
      // Add as port waypoint
      setWaypoints(prev => [...prev, {
        id: newId,
        type: "port" as const,
        order: prev.length,
        port: {
          displayName: portDetails.name,
          portCode: portDetails.locode,
          country: "",
          latitude: lat,
          longitude: lon,
        },
        passage: null,
        manualLat: undefined,
        manualLng: undefined,
        manualName: undefined,
        useManualCoords: false,
        legConfig: prev.length > 0 ? {
          speed: prev[prev.length - 1]?.legConfig?.speed || 12.5,
          condition: prev[prev.length - 1]?.legConfig?.condition || "laden" as const,
          dailyConsumption: prev[prev.length - 1]?.legConfig?.dailyConsumption || 0,
          maxDraft: prev[prev.length - 1]?.legConfig?.maxDraft || "",
        } : undefined,
      } as Waypoint]);
      toast.success(`📍 Added port: ${portDetails.name}`);
    } else {
      // Add as coordinate waypoint
      setWaypoints(prev => [...prev, {
        id: newId,
        type: "port" as const,
        order: prev.length,
        port: null,
        passage: null,
        manualLat: lat,
        manualLng: lon,
        manualName: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
        useManualCoords: true,
        legConfig: prev.length > 0 ? {
          speed: prev[prev.length - 1]?.legConfig?.speed || 12.5,
          condition: prev[prev.length - 1]?.legConfig?.condition || "laden" as const,
          dailyConsumption: prev[prev.length - 1]?.legConfig?.dailyConsumption || 0,
          maxDraft: prev[prev.length - 1]?.legConfig?.maxDraft || "",
        } : undefined,
      } as Waypoint]);
      toast.success(`📍 Added waypoint: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
    }
  }, []);

  // Close context menu on map left-click or Escape
  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    window.addEventListener("click", handleClose);
    window.addEventListener("keydown", handleEscape);
    return () => { window.removeEventListener("click", handleClose); window.removeEventListener("keydown", handleEscape); };
  }, []);

  // ── Defensive: Auto-patch any non-terminal waypoint missing legConfig ──
  // This handles edge cases: saved routes, reordering, adding ports at various positions
  useEffect(() => {
    setWaypoints(prev => {
      let changed = false;
      const patched = prev.map((w, i) => {
        if (i < prev.length - 1 && !w.legConfig) {
          changed = true;
          const defaultSpeed = selectedVessel
            ? selectedVessel.ladenSpeed
            : 12.5;
          const defaultConsumption = selectedVessel
            ? selectedVessel.ladenConsumption
            : 25;
          return {
            ...w,
            legConfig: {
              condition: "laden" as const,
              speed: defaultSpeed,
              dailyConsumption: defaultConsumption,
              maxDraft: "",
            },
          };
        }
        return w;
      });
      return changed ? patched : prev;
    });
  }, [waypoints.length, selectedVessel]);
  
  // Handle leg config changes (condition, speed, consumption, draft)
  const handleLegConfigChange = useCallback((
    waypointId: string,
    field: keyof LegConfig,
    value: string | number
  ) => {
    setWaypoints(prev => prev.map(w => {
      if (w.id !== waypointId || !w.legConfig) return w;
      const updated = { ...w.legConfig, [field]: value };
      // Auto-fill speed AND consumption when condition changes
      if (field === "condition" && selectedVessel) {
        const isLaden = value === "laden";
        updated.speed = isLaden ? selectedVessel.ladenSpeed : selectedVessel.ballastSpeed;
        updated.dailyConsumption = isLaden
          ? selectedVessel.ladenConsumption
          : selectedVessel.ballastConsumption;
      }
      return { ...w, legConfig: updated };
    }));
  }, [selectedVessel]);
  
  // Recalculate ETAs when port times or ETD changes
  useEffect(() => {
    if (result && result.legs.length > 0) {
      const updatedLegs = [...result.legs];
      calculateETAs(updatedLegs, etd, waypoints);
      setResult({
        ...result,
        legs: updatedLegs,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, etd]);

  // Convert waypoints to VoyageMap format
  const voyageMapWaypoints: VoyageMapWaypoint[] = useMemo(() => {
    return waypoints.map((w, i) => ({
      id: w.id,
      port: w.port
        ? {
            id: w.port.portCode,
            name: w.port.displayName,
            locode: w.port.portCode,
            latitude: w.port.latitude,
            longitude: w.port.longitude,
          }
        : w.passage
        ? {
            id: w.passage.id,
            name: w.passage.displayName,
            locode: undefined,
            latitude: w.passage.entryLat,
            longitude: w.passage.entryLng,
          }
        : (w.manualLat !== undefined && w.manualLng !== undefined)
        ? {
            id: `manual-${w.id}`,
            name: w.manualName || `Custom Point (${w.manualLat.toFixed(4)}, ${w.manualLng.toFixed(4)})`,
            locode: undefined,
            latitude: w.manualLat,
            longitude: w.manualLng,
          }
        : null,
      order: i,
    }));
  }, [waypoints]);

  // Handle port selection for a waypoint
  const handlePortSelect = useCallback((waypointId: string, port: NavApiPort) => {
    setWaypoints((prev) =>
      prev.map((w) =>
        w.id === waypointId ? { ...w, port, passage: null, type: "port" as const } : w
      )
    );
  }, []);

  // Handle port clear
  const handlePortClear = useCallback((waypointId: string) => {
    setWaypoints((prev) =>
      prev.map((w) =>
        w.id === waypointId ? { ...w, port: null, passage: null } : w
      )
    );
  }, []);

  // Handle port times change (waiting, loading, idle hours)
  const handlePortTimesChange = useCallback((
    waypointId: string, 
    field: keyof PortTimes, 
    value: number
  ) => {
    setWaypoints((prev) =>
      prev.map((w) =>
        w.id === waypointId
          ? {
              ...w,
              portTimes: {
                waitingHours: w.portTimes?.waitingHours || 0,
                loadingHours: w.portTimes?.loadingHours || 0,
                idleHours: w.portTimes?.idleHours || 0,
                [field]: value,
              },
            }
          : w
      )
    );
  }, []);

  // Handle manual coordinates change with smart paste detection
  const handleManualCoordinates = useCallback((
    waypointId: string,
    field: "manualLat" | "manualLng" | "manualName",
    value: number | string
  ) => {
    // Smart paste detection: if pasting "lat, lng" into either lat or lng field
    if ((field === "manualLat" || field === "manualLng") && typeof value === "string") {
      // Check for comma-separated coordinates like "53.511500, 9.968089"
      const coordMatch = value.match(/^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          setWaypoints((prev) =>
            prev.map((w) =>
              w.id === waypointId
                ? { ...w, port: null, manualLat: lat, manualLng: lng }
                : w
            )
          );
          return;
        }
      }
    }
    
    // Regular single-field update
    setWaypoints((prev) =>
      prev.map((w) =>
        w.id === waypointId
          ? {
              ...w,
              port: null, // Clear port search when using manual coordinates
              [field]: typeof value === "string" && field !== "manualName" 
                ? parseFloat(value) || 0 
                : value,
            }
          : w
      )
    );
  }, []);

  // Add waypoint
  const handleAddWaypoint = useCallback((afterIndex: number) => {
    setWaypoints((prev) => {
      const newWaypoints = [...prev];
      // Determine default config from vessel profile or sensible defaults
      const defaultSpeed = selectedVessel
        ? selectedVessel.ladenSpeed
        : 12.5;
      const defaultConsumption = selectedVessel
        ? selectedVessel.ladenConsumption
        : 25;
      const newWp: Waypoint = {
        id: generateId(),
        type: "port",
        port: null,
        order: afterIndex + 1,
        legConfig: {
          condition: "laden",
          speed: defaultSpeed,
          dailyConsumption: defaultConsumption,
          maxDraft: "",
        },
      };
      newWaypoints.splice(afterIndex + 1, 0, newWp);
      // Ensure the previous last waypoint (now intermediate) also has legConfig
      newWaypoints.forEach((w, i) => {
        if (i < newWaypoints.length - 1 && !w.legConfig) {
          w.legConfig = {
            condition: "laden",
            speed: defaultSpeed,
            dailyConsumption: defaultConsumption,
            maxDraft: "",
          };
        }
      });
      return newWaypoints.map((w, i) => ({ ...w, order: i }));
    });
  }, [selectedVessel]);

  // Remove waypoint
  const handleRemoveWaypoint = useCallback((waypointId: string) => {
    setWaypoints((prev) => {
      if (prev.length <= 2) return prev;
      const filtered = prev.filter((w) => w.id !== waypointId);
      return filtered.map((w, i) => ({ ...w, order: i }));
    });
  }, []);

  // Add passage waypoint
  const handleAddPassage = useCallback((passage: StrategicPassage) => {
    setWaypoints((prev) => {
      const newWaypoints = [...prev];
      const newWp: Waypoint = {
        id: generateId(),
        type: "passage",
        passage,
        order: insertAfterIndex + 1,
      };
      newWaypoints.splice(insertAfterIndex + 1, 0, newWp);
      return newWaypoints.map((w, i) => ({ ...w, order: i }));
    });
    setPassageDialogOpen(false);
    toast.success(`Added ${passage.displayName}`);
  }, [insertAfterIndex]);

  // Helper: Calculate distance between two coordinates [lon, lat]
  const calcDistance = (c1: [number, number], c2: [number, number]) => {
    const lat1 = c1[1] * Math.PI / 180;
    const lat2 = c2[1] * Math.PI / 180;
    const dLon = (c2[0] - c1[0]) * Math.PI / 180;
    const dLat = (c2[1] - c1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 3440.065;
  };

  // Calculate route
  const handleCalculate = useCallback(async () => {
    if (!canCalculate) {
      toast.error("Please select at least 2 waypoints");
      return;
    }

    setIsCalculating(true);
    setResult(null);

    try {
      const legs: RouteResultData["legs"] = [];
      let totalDistanceNm = 0;
      let totalECADistanceNm = 0;
      let totalHRADistanceNm = 0;
      const allEcaZones: string[] = [];
      const allHraZones: string[] = [];
      const allWarnings: string[] = [];
      
      // Vessel draft validation - use max draft across all legs
      const vesselDraft = maxDraftValue;
      const skippedPassages = new Set<string>();
      let totalSailingHours = 0; // Track for per-leg speed estimation
      
      // Track current leg config as we iterate
      let currentLegConfig: LegConfig = waypoints[0]?.legConfig || { condition: "ballast", speed: 12.5, dailyConsumption: 25, maxDraft: "" };
      
      // When vessel draft is set, skip ALL passage waypoints and let NavAPI handle
      if (vesselDraft > 0) {
        for (const wp of validWaypoints) {
          if (wp.type === "passage" && wp.passage) {
            skippedPassages.add(wp.id);
            allWarnings.push(
              `ℹ️ ${wp.passage.displayName}: Using NavAPI draft-aware routing (vessel draft: ${vesselDraft}m).`
            );
          }
        }
        
        if (skippedPassages.size > 0) {
          toast.info(
            `NavAPI will handle ${skippedPassages.size} passage(s) with draft-aware routing (${vesselDraft}m draft).`,
            { duration: 5000 }
          );
        }
      }
      
      // Filter out passages that NavAPI should handle (when draft is set)
      const routeWaypoints = validWaypoints.filter(wp => !skippedPassages.has(wp.id));

      // Track passage direction for each passage waypoint
      // Key: waypoint index in routeWaypoints, Value: { reversed: boolean, entryCoords, exitCoords, entryName, exitName }
      const passageDirections = new Map<number, {
        reversed: boolean;
        entryCoords: [number, number];
        exitCoords: [number, number];
        entryName: string;
        exitName: string;
      }>();

      // First pass: determine passage directions based on adjacent waypoints
      for (let i = 0; i < routeWaypoints.length; i++) {
        const wp = routeWaypoints[i];
        if (wp.type === "passage" && wp.passage) {
          const passage = wp.passage;
          const defaultEntry: [number, number] = [passage.entryLng, passage.entryLat];
          const defaultExit: [number, number] = [passage.exitLng, passage.exitLat];

          // Find the previous and next non-passage waypoints to determine direction
          let prevCoords: [number, number] | null = null;
          for (let j = i - 1; j >= 0; j--) {
            const prevWp = routeWaypoints[j];
            if (prevWp.type === "port" && prevWp.port) {
              prevCoords = [prevWp.port.longitude, prevWp.port.latitude];
              break;
            }
          }

          // Determine if we should reverse the passage direction
          // If the "exit" is closer to the previous waypoint, we're traveling in reverse
          if (prevCoords) {
            const distToEntry = calcDistance(prevCoords, defaultEntry);
            const distToExit = calcDistance(prevCoords, defaultExit);
            const reversed = distToExit < distToEntry;

            passageDirections.set(i, {
              reversed,
              entryCoords: reversed ? defaultExit : defaultEntry,
              exitCoords: reversed ? defaultEntry : defaultExit,
              entryName: reversed ? passage.exitName : passage.entryName,
              exitName: reversed ? passage.entryName : passage.exitName,
            });
          } else {
            // No previous waypoint, use default direction
            passageDirections.set(i, {
              reversed: false,
              entryCoords: defaultEntry,
              exitCoords: defaultExit,
              entryName: passage.entryName,
              exitName: passage.exitName,
            });
          }
        }
      }

      // Calculate each leg
      for (let i = 0; i < routeWaypoints.length - 1; i++) {
        const fromWp = routeWaypoints[i];
        const toWp = routeWaypoints[i + 1];
        
        // Update leg config from source waypoint
        if (fromWp.legConfig) {
          currentLegConfig = fromWp.legConfig;
        }
        const legSpeed = currentLegConfig.speed || 12.5;
        const legDraftStr = currentLegConfig.maxDraft || "";
        const legDraft = legDraftStr ? parseFloat(legDraftStr.replace(',', '.')) : undefined;

        // Determine from/to coordinates and names
        let fromName = "";
        let fromCoords: [number, number] = [0, 0];
        let fromPortCode = "";
        
        let toName = "";
        let toCoords: [number, number] = [0, 0];
        let toPortCode = "";

        // FROM waypoint
        if (fromWp.type === "port" && fromWp.port) {
          fromName = fromWp.port.displayName;
          fromCoords = [fromWp.port.longitude, fromWp.port.latitude];
          fromPortCode = fromWp.port.portCode;
        } else if (fromWp.type === "passage" && fromWp.passage) {
          // Use the computed exit point (direction-aware)
          const dir = passageDirections.get(i);
          if (dir) {
            fromName = `${fromWp.passage.name} (${dir.exitName})`;
            fromCoords = dir.exitCoords;
          } else {
            fromName = `${fromWp.passage.name} (${fromWp.passage.exitName})`;
            fromCoords = [fromWp.passage.exitLng, fromWp.passage.exitLat];
          }
        } else if (fromWp.manualLat !== undefined && fromWp.manualLng !== undefined) {
          // Manual coordinates - no port code, use lat/lng directly
          fromName = fromWp.manualName || `Custom (${fromWp.manualLat.toFixed(4)}, ${fromWp.manualLng.toFixed(4)})`;
          fromCoords = [fromWp.manualLng, fromWp.manualLat];
          fromPortCode = ""; // Empty port code signals API to use coordinates
        }

        // TO waypoint - find its index in validWaypoints
        const toWpIndex = i + 1;
        if (toWp.type === "port" && toWp.port) {
          toName = toWp.port.displayName;
          toCoords = [toWp.port.longitude, toWp.port.latitude];
          toPortCode = toWp.port.portCode;
        } else if (toWp.type === "passage" && toWp.passage) {
          // Use the computed entry point (direction-aware)
          const dir = passageDirections.get(toWpIndex);
          if (dir) {
            toName = `${toWp.passage.name} (${dir.entryName})`;
            toCoords = dir.entryCoords;
          } else {
            toName = `${toWp.passage.name} (${toWp.passage.entryName})`;
            toCoords = [toWp.passage.entryLng, toWp.passage.entryLat];
          }
        } else if (toWp.manualLat !== undefined && toWp.manualLng !== undefined) {
          // Manual coordinates - no port code, use lat/lng directly
          toName = toWp.manualName || `Custom (${toWp.manualLat.toFixed(4)}, ${toWp.manualLng.toFixed(4)})`;
          toCoords = [toWp.manualLng, toWp.manualLat];
          toPortCode = ""; // Empty port code signals API to use coordinates
        }

        // Calculate route segment via NavAPI
        let routeCalculated = false;
        
        // Try port-to-port first
        if (fromPortCode && toPortCode) {
          const etdISO = etd ? new Date(etd).toISOString() : undefined;
          
          const response = await fetch("/api/navapi/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              startPortCode: fromPortCode, 
              endPortCode: toPortCode,
              etd: etdISO,
              draft: legDraft,
            }),
          });
          const data = await response.json();

          // Check for rate limit
          if (data.error === "limit_reached") {
            setShowUpgradeModal(true);
            throw new Error(data.message || "Daily limit reached");
          }

          if (data.success) {
            const legDistanceNm = data.totalDistanceNm || 0;
            // Prefer full GeoJSON geometry (smooth navigational path) over sparse waypoints
            const coordinates: [number, number][] = 
              (data.geometry?.coordinates as [number, number][]) || 
              (data.waypoints || []).map(
                (wp: { lat: number; lon: number }) => [wp.lon, wp.lat] as [number, number]
              );

            // DEFENSE-IN-DEPTH SECA CALCULATION
            // Problem: NavAPI may have outdated Mediterranean SECA data
            // Solution: Calculate BOTH NavAPI SECA and Local Geofence SECA, use the HIGHER value
            // 
            // This ensures we NEVER underestimate SECA distance for:
            // - Mediterranean Sea ECA (effective May 1, 2025 per IMO MEPC.361(79))
            // - Any other zones NavAPI might miss
            
            // Get NavAPI's SECA distance
            const navApiSecaDistanceNm = data.ecaDistanceNm || 0;
            
            // Calculate local geofence SECA distance (checks against our eca-zones.json)
            const localValidation = calculateValidatedZoneDistances(coordinates);
            const localSecaDistanceNm = localValidation.secaDistanceNm || 0;
            
            // Use the HIGHER value (conservative approach to avoid regulatory non-compliance)
            const actualSecaDistanceNm = Math.max(navApiSecaDistanceNm, localSecaDistanceNm);
            
            // Determine zone names from local validation if it has better data
            let secaZoneNames: string[] = [];
            if (actualSecaDistanceNm > 0) {
              if (localSecaDistanceNm >= navApiSecaDistanceNm && localValidation.secaZones.length > 0) {
                // Local validation provided better data - use its zone names
                secaZoneNames = localValidation.secaZones;
              } else {
                secaZoneNames = ["SECA"];
              }
            }
            
            console.log("[SECA Debug] NavAPI SECA:", navApiSecaDistanceNm, 
                        "Local SECA:", localSecaDistanceNm, 
                        "Using MAX:", actualSecaDistanceNm,
                        "Zones:", secaZoneNames,
                        "Med SECA effective:", isMediterraneanSecaEffective());

            // SECA distance only (canals are NOT SECA zones)
            const effectiveEcaDistanceNm = actualSecaDistanceNm;

            // HRA (HIGH RISK AREA) DETECTION
            const hraResult = calculateHRADistances(coordinates);
            const legHraDistanceNm = hraResult.hraDistanceNm;
            const legHraZones = hraResult.hraZones;

            legs.push({
              legNumber: legs.length + 1,
              from: { name: fromName, locode: fromPortCode, coordinates: fromCoords },
              to: { name: toName, locode: toPortCode, coordinates: toCoords },
              distanceNm: legDistanceNm,
              ecaDistanceNm: effectiveEcaDistanceNm,
              hraDistanceNm: legHraDistanceNm,
              isFullECA: actualSecaDistanceNm > 0 && actualSecaDistanceNm >= legDistanceNm * 0.95,
              ecaZones: secaZoneNames,
              hraZones: legHraZones,
              geometry: { coordinates, ecaSegments: [], hraSegments: [] },
              speedKnots: legSpeed,
              condition: currentLegConfig.condition,
            });

            totalDistanceNm += legDistanceNm;
            totalECADistanceNm += effectiveEcaDistanceNm;
            totalHRADistanceNm += legHraDistanceNm;
            routeCalculated = true;

            // Add zones to global list
            secaZoneNames.forEach(zone => {
              if (!allEcaZones.includes(zone)) {
                allEcaZones.push(zone);
              }
            });
            legHraZones.forEach(zone => {
              if (!allHraZones.includes(zone)) {
                allHraZones.push(zone);
              }
            });

            // Show draft restriction warning if route violates canal limits
            if (data.draftWarning) {
              allWarnings.push(data.draftWarning);
              toast.warning(data.draftWarning, { duration: 10000 });
            }
          }
        }

        // If no port-to-port route calculated, use coordinate-based NavAPI routing
        if (!routeCalculated) {
          // Build request body with available port codes and/or coordinates
          const routeRequest: Record<string, unknown> = {};
          
          // From point: use port code if available, otherwise coordinates
          if (fromPortCode) {
            routeRequest.startPortCode = fromPortCode;
          } else {
            // fromCoords is [lon, lat]
            routeRequest.startLat = fromCoords[1];
            routeRequest.startLon = fromCoords[0];
          }
          
          // To point: use port code if available, otherwise coordinates
          if (toPortCode) {
            routeRequest.endPortCode = toPortCode;
          } else {
            // toCoords is [lon, lat]
            routeRequest.endLat = toCoords[1];
            routeRequest.endLon = toCoords[0];
          }

          // Add ETD and Draft to coordinate-based routing
          const etdISO = etd ? new Date(etd).toISOString() : undefined;
          if (etdISO) routeRequest.etd = etdISO;
          if (legDraft) routeRequest.draft = legDraft;

          const response = await fetch("/api/navapi/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(routeRequest),
          });
          const data = await response.json();

          // Check for rate limit
          if (data.error === "limit_reached") {
            setShowUpgradeModal(true);
            throw new Error(data.message || "Daily limit reached");
          }

          if (data.success) {
            const legDistanceNm = data.totalDistanceNm || 0;
            // Prefer full GeoJSON geometry (smooth navigational path) over sparse waypoints
            const coordinates: [number, number][] = 
              (data.geometry?.coordinates as [number, number][]) || 
              (data.waypoints || []).map(
                (wp: { lat: number; lon: number }) => [wp.lon, wp.lat] as [number, number]
              );

            // DEFENSE-IN-DEPTH SECA CALCULATION
            // Problem: NavAPI may have outdated Mediterranean SECA data
            // Solution: Calculate BOTH NavAPI SECA and Local Geofence SECA, use the HIGHER value
            // 
            // This ensures we NEVER underestimate SECA distance for:
            // - Mediterranean Sea ECA (effective May 1, 2025 per IMO MEPC.361(79))
            // - Any other zones NavAPI might miss
            
            // Get NavAPI's SECA distance
            const navApiSecaDistanceNm = data.ecaDistanceNm || 0;
            
            // Calculate local geofence SECA distance (checks against our eca-zones.json)
            const localValidation = calculateValidatedZoneDistances(coordinates);
            const localSecaDistanceNm = localValidation.secaDistanceNm || 0;
            
            // Use the HIGHER value (conservative approach to avoid regulatory non-compliance)
            const actualSecaDistanceNm = Math.max(navApiSecaDistanceNm, localSecaDistanceNm);
            
            // Determine zone names from local validation if it has better data
            let secaZoneNames: string[] = [];
            if (actualSecaDistanceNm > 0) {
              if (localSecaDistanceNm >= navApiSecaDistanceNm && localValidation.secaZones.length > 0) {
                // Local validation provided better data - use its zone names
                secaZoneNames = localValidation.secaZones;
              } else {
                secaZoneNames = ["SECA"];
              }
            }
            
            console.log("[SECA Debug] NavAPI SECA:", navApiSecaDistanceNm, 
                        "Local SECA:", localSecaDistanceNm, 
                        "Using MAX:", actualSecaDistanceNm,
                        "Zones:", secaZoneNames,
                        "Med SECA effective:", isMediterraneanSecaEffective());

            // SECA distance only (canals are NOT SECA zones)
            const effectiveEcaDistanceNm = actualSecaDistanceNm;

            // HRA (HIGH RISK AREA) DETECTION
            const hraResult = calculateHRADistances(coordinates);
            const legHraDistanceNm = hraResult.hraDistanceNm;
            const legHraZones = hraResult.hraZones;

            legs.push({
              legNumber: legs.length + 1,
              from: { name: fromName, locode: fromPortCode || undefined, coordinates: fromCoords },
              to: { name: toName, locode: toPortCode || undefined, coordinates: toCoords },
              distanceNm: legDistanceNm,
              ecaDistanceNm: effectiveEcaDistanceNm,
              hraDistanceNm: legHraDistanceNm,
              isFullECA: actualSecaDistanceNm > 0 && actualSecaDistanceNm >= legDistanceNm * 0.95,
              ecaZones: secaZoneNames,
              hraZones: legHraZones,
              geometry: { coordinates, ecaSegments: [], hraSegments: [] },
              speedKnots: legSpeed,
              condition: currentLegConfig.condition,
            });

            totalDistanceNm += legDistanceNm;
            totalECADistanceNm += effectiveEcaDistanceNm;
            totalHRADistanceNm += legHraDistanceNm;

            // Add zones to global list
            secaZoneNames.forEach(zone => {
              if (!allEcaZones.includes(zone)) {
                allEcaZones.push(zone);
              }
            });
            legHraZones.forEach(zone => {
              if (!allHraZones.includes(zone)) {
                allHraZones.push(zone);
              }
            });
          } else {
            // If NavAPI fails, fall back to straight line
            console.warn(`NavAPI coordinate routing failed for ${fromName} → ${toName}:`, data.error);
            const coordinates: [number, number][] = [fromCoords, toCoords];
            
            // Estimate distance using great circle
            const lat1 = fromCoords[1] * Math.PI / 180;
            const lat2 = toCoords[1] * Math.PI / 180;
            const dLon = (toCoords[0] - fromCoords[0]) * Math.PI / 180;
            const dLat = (toCoords[1] - fromCoords[1]) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
                      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const estimatedDistanceNm = 3440.065 * c;

            legs.push({
              legNumber: legs.length + 1,
              from: { name: fromName, coordinates: fromCoords },
              to: { name: toName, coordinates: toCoords },
              distanceNm: estimatedDistanceNm,
              ecaDistanceNm: 0,
              hraDistanceNm: 0,
              isFullECA: false,
              ecaZones: [],
              hraZones: [],
              geometry: { coordinates, ecaSegments: [], hraSegments: [] },
            });

            totalDistanceNm += estimatedDistanceNm;
          }
        }

        // If TO is a passage, also add the passage transit leg
        if (toWp.type === "passage" && toWp.passage) {
          const passage = toWp.passage;
          const passageDistance = passage.distanceNm || 0;
          const dir = passageDirections.get(toWpIndex);
          const isReversed = dir?.reversed || false;
          
          // Use polyline if available, otherwise create straight line
          let passageCoords: [number, number][];
          if (passage.polyline && passage.polyline.length > 0) {
            passageCoords = passage.polyline.map(
              ([lat, lng]) => [lng, lat] as [number, number]
            );
            // Reverse polyline if traveling in opposite direction
            if (isReversed) {
              passageCoords = passageCoords.slice().reverse();
            }
          } else {
            // Use direction-aware entry/exit
            const entryCoords = dir?.entryCoords || [passage.entryLng, passage.entryLat];
            const exitCoords = dir?.exitCoords || [passage.exitLng, passage.exitLat];
            passageCoords = [entryCoords, exitCoords];
          }

          // Use direction-aware names and coordinates
          const entryName = dir?.entryName || passage.entryName;
          const exitName = dir?.exitName || passage.exitName;
          const entryCoords = dir?.entryCoords || [passage.entryLng, passage.entryLat] as [number, number];
          const exitCoords = dir?.exitCoords || [passage.exitLng, passage.exitLat] as [number, number];

          legs.push({
            legNumber: legs.length + 1,
            from: { name: entryName, coordinates: entryCoords },
            to: { name: exitName, coordinates: exitCoords },
            distanceNm: passageDistance,
            // Canal requires 0.1% sulfur fuel like SECA, count as ECA
            ecaDistanceNm: passageDistance,
            hraDistanceNm: 0,
            isFullECA: true,
            ecaZones: ["Canal"],
            hraZones: [],
            geometry: { coordinates: passageCoords, ecaSegments: [], hraSegments: [] },
          });

          totalDistanceNm += passageDistance;
          // Canal distance counts toward ECA for bunker calculations
          totalECADistanceNm += passageDistance;
        }
      }

      // Calculate estimated days from per-leg sailing hours
      const totalSailingHoursCalc = legs.reduce((sum, leg) => sum + (leg.distanceNm / (leg.speedKnots || 12.5)), 0);
      const estimatedDays = totalSailingHoursCalc > 0 ? totalSailingHoursCalc / 24 : null;

      // Build result
      const routeResult: RouteResultData = {
        summary: {
          totalDistanceNm,
          totalECADistanceNm,
          totalHRADistanceNm,
          estimatedDays,
          openSeaDistanceNm: totalDistanceNm - totalECADistanceNm,
        },
        legs,
        zones: {
          eca: allEcaZones,
          hra: allHraZones,
        },
        warnings: allWarnings,
      };

      // Calculate ETAs for each leg based on per-leg speed and port times
      calculateETAs(legs, etd, validWaypoints);

      setResult(routeResult);

      // ── Auto-fetch time-aware NOAA weather along NavAPI route ──
      // Uses our engine's /route-forecast endpoint with vessel-specific speed curves
      const allCoords = legs.flatMap(leg => leg.geometry.coordinates);
      if (allCoords.length > 0) {
        const step = Math.max(1, Math.floor(allCoords.length / 12));
        const weatherCoords: Array<{ lat: number; lon: number }> = [];
        for (let wi = 0; wi < allCoords.length; wi += step) {
          weatherCoords.push({ lat: allCoords[wi][1], lon: allCoords[wi][0] });
        }
        const lastCoord = allCoords[allCoords.length - 1];
        if (weatherCoords.length === 0 || weatherCoords[weatherCoords.length - 1].lat !== lastCoord[1]) {
          weatherCoords.push({ lat: lastCoord[1], lon: lastCoord[0] });
        }

        // Fire NOAA route forecast (non-blocking)
        const etdISO = etd ? new Date(etd).toISOString() : new Date().toISOString();
        fetchRouteForecast({
          waypoints: weatherCoords,
          etd: etdISO,
          vessel_speed_knots: effectiveSpeed || 12.5,
          vessel_type: selectedVessel?.vesselType || "BULK_CARRIER",
          vessel_dwt: effectiveDWT || 50000,
        }).then(rf => {
          if (!rf?.success || !rf.waypoints?.length) {
            // Fallback: fire legacy Open-Meteo fetch if engine is offline
            fetchWeather(weatherCoords, { forecastDays: Math.min(16, Math.ceil((routeResult.summary.estimatedDays || 7) + 1)) })
              .catch(() => {});
            return;
          }

          // Store delay info
          setRouteForecastDelay({
            delayHours: rf.weather_delay_hours,
            calmHours: rf.total_hours_calm,
            weatherHours: rf.total_hours_weather,
            vesselType: rf.vessel_speed_curve?.vessel_type || "UNKNOWN",
            worstSegment: rf.worst_segment,
          });

          // Map NOAA response → RouteWeatherSummary for existing UI components
          const { classifySeaState } = require("@/types/weather");
          const mappedWaypoints = rf.waypoints.map(wp => ({
            latitude: wp.lat,
            longitude: wp.lon,
            current: {
              waveHeight: wp.wave_height_m,
              waveDirection: wp.wave_direction_deg,
              wavePeriod: wp.wave_period_s,
              windWaveHeight: wp.wind_speed_knots > 15 ? wp.wave_height_m * 0.4 : 0,
              swellWaveHeight: wp.swell_height_m,
              swellWaveDirection: wp.wave_direction_deg,
              swellWavePeriod: wp.wave_period_s,
              oceanCurrentVelocity: 0,
              oceanCurrentDirection: 0,
              seaSurfaceTemperature: wp.sea_surface_temperature || 0,
              severity: classifySeaState(wp.wave_height_m),
            },
            hourly: { time: [], waveHeight: [], waveDirection: [], wavePeriod: [], swellWaveHeight: [], seaSurfaceTemperature: [] },
          }));

          // Compute worst & average conditions
          const worst = rf.worst_segment;
          const avgWave = rf.waypoints.reduce((s, w) => s + w.wave_height_m, 0) / rf.waypoints.length;
          const avgSwell = rf.waypoints.reduce((s, w) => s + w.swell_height_m, 0) / rf.waypoints.length;
          const avgSst = rf.waypoints.reduce((s, w) => s + (w.sea_surface_temperature || 0), 0) / rf.waypoints.length;

          // Build advisories from dangerous/restricted waypoints
          const advisories = rf.waypoints
            .filter(w => w.navigability !== "open")
            .map((w, idx) => ({
              severity: classifySeaState(w.wave_height_m),
              message: w.advisory,
              legIndex: idx,
              location: { lat: w.lat, lon: w.lon },
            }));

          // Inject into existing weatherData via the useWeather hook's internal setter
          // We call fetchWeather with the same coords but the response will be overridden
          // by directly constructing the RouteWeatherSummary and setting it
          const summary = {
            waypoints: mappedWaypoints,
            worstConditions: {
              maxWaveHeight: worst?.wave_height_m || 0,
              maxSwellHeight: worst?.swell_height_m || 0,
              severity: classifySeaState(worst?.wave_height_m || 0),
              location: worst ? { lat: worst.lat, lon: worst.lon } : { lat: 0, lon: 0 },
            },
            averageConditions: {
              avgWaveHeight: Math.round(avgWave * 10) / 10,
              avgSwellHeight: Math.round(avgSwell * 10) / 10,
              avgSeaTemp: Math.round(avgSst * 10) / 10,
              overallSeverity: classifySeaState(avgWave),
            },
            advisories,
            fetchedAt: new Date().toISOString(),
          };

          // ✅ Inject NOAA summary directly — no Open-Meteo call needed
          setWeatherData(summary);

          console.log(
            `[NOAA RouteWeather] ✅ ${rf.waypoints.length} waypoints, ` +
            `delay: +${rf.weather_delay_hours}h, ` +
            `worst: ${worst?.wave_height_m?.toFixed(1) || 0}m @ BF${worst?.beaufort || 0}, ` +
            `vessel: ${rf.vessel_speed_curve?.vessel_type}`
          );
        }).catch(err => {
          console.warn("[NOAA RouteWeather] Engine offline, falling back to Open-Meteo:", err);
          fetchWeather(weatherCoords, { forecastDays: Math.min(16, Math.ceil((routeResult.summary.estimatedDays || 7) + 1)) })
            .catch(() => {});
        });
      }

      // ── Fetch Weather-Optimized Route from Python engine (non-blocking) ──
      // Draws a green dashed line on the map showing the wind/wave/current/ice-optimized path
      setWeatherRouteOverlay(null);
      const firstPort = validWaypoints.find(w => w.port || (w.manualLat !== undefined && w.manualLng !== undefined));
      const lastPort = [...validWaypoints].reverse().find(w => w.port || (w.manualLat !== undefined && w.manualLng !== undefined));
      if (firstPort && lastPort && firstPort !== lastPort) {
        const startLat = firstPort.port?.latitude ?? firstPort.manualLat!;
        const startLon = firstPort.port?.longitude ?? firstPort.manualLng!;
        const endLat = lastPort.port?.latitude ?? lastPort.manualLat!;
        const endLon = lastPort.port?.longitude ?? lastPort.manualLng!;
        fetchWeatherRoute({
          start_lat: startLat,
          start_lon: startLon,
          end_lat: endLat,
          end_lon: endLon,
          vessel_speed_knots: effectiveSpeed,
          daily_consumption_mt: legConsumptions[0]?.dailyConsumption || 28,
        }).then(wr => {
          if (wr && wr.waypoints.length > 0) {
            setWeatherRouteOverlay({
              coordinates: weatherWaypointsToCoordinates(wr.waypoints),
              distanceNm: wr.total_distance_nm,
              estimatedDays: wr.estimated_days,
              estimatedFuelMt: wr.estimated_fuel_mt,
            });
            console.log(`[WeatherRoute] 🟢 Weather route: ${wr.total_distance_nm} NM, ${wr.estimated_days} days`);
          }
        }).catch(() => { /* Engine offline — silently ignore */ });
      }

      // Auto-detect canals from route coordinates
      const canals = detectCanalsInRoute(allCoords);
      setDetectedCanals(canals);
      
      if (canals.length > 0) {
        console.log("[CANAL DETECTION] Detected canals:", canals.map(c => c.name));
        
        // Build primary alternative
        const primaryAlt: RouteAlternative = {
          id: "primary",
          label: `Via ${canals.map(c => c.name).join(", ")}`,
          result: routeResult,
          canalName: canals[0].name,
          totalDays: routeResult.summary.estimatedDays || 0,
          totalDistanceNm: totalDistanceNm,
        };
        
        // Fire parallel no-canal call in the background
        const excludeAreaIds = canals.map(c => c.areaId);
        const avoidLabel = canals.length === 1 
          ? `Avoid ${canals[0].name}` 
          : `Avoid ${canals.map(c => c.name).join(" & ")}`;
        
        // Re-calculate each leg with excluded canals (fire and forget, update state when done)
        (async () => {
          try {
            // Calculate each leg separately with canal exclusion (mirrors primary route logic)
            const altLegs: RouteResultData["legs"] = [];
            let altTotalDistance = 0;
            let altTotalEcaDistance = 0;
            const altEcaZones: string[] = [];
            
            // Use same waypoint pairs as primary route
            const altRouteWaypoints = validWaypoints.filter(wp => 
              wp.port || wp.passage || (wp.manualLat !== undefined && wp.manualLng !== undefined)
            );
            
            for (let i = 0; i < altRouteWaypoints.length - 1; i++) {
              const fromWp = altRouteWaypoints[i];
              const toWp = altRouteWaypoints[i + 1];
              
              // Get port codes and coordinates
              const fromPort = fromWp.port?.portCode || "";
              const toPort = toWp.port?.portCode || "";
              const fromName = fromWp.port?.displayName || fromPort || "Start";
              const toName = toWp.port?.displayName || toPort || "End";
              const fromCoords: [number, number] = [fromWp.port?.longitude || 0, fromWp.port?.latitude || 0];
              const toCoords: [number, number] = [toWp.port?.longitude || 0, toWp.port?.latitude || 0];
              
              // Build request
              const altRequest: Record<string, unknown> = { excludeAreas: excludeAreaIds };
              if (fromPort) {
                altRequest.startPortCode = fromPort;
              } else if (fromWp.manualLat !== undefined && fromWp.manualLng !== undefined) {
                altRequest.startLat = fromWp.manualLat;
                altRequest.startLon = fromWp.manualLng;
              }
              if (toPort) {
                altRequest.endPortCode = toPort;
              } else if (toWp.manualLat !== undefined && toWp.manualLng !== undefined) {
                altRequest.endLat = toWp.manualLat;
                altRequest.endLon = toWp.manualLng;
              }
              
              const response = await fetch("/api/navapi/route", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(altRequest),
              });
              const data = await response.json();
              
              if (data.success !== false && data.totalDistanceNm) {
                const legDist = data.totalDistanceNm || 0;
                const legEca = data.ecaDistanceNm || data.effectiveEcaDistanceNm || 0;
                const altCoords: [number, number][] = 
                  (data.geometry?.coordinates as [number, number][]) || 
                  (data.waypoints || []).map(
                    (wp: { lat: number; lon: number }) => [wp.lon, wp.lat] as [number, number]
                  );
                
                const legConfig = fromWp.legConfig || currentLegConfig;
                const altLegSpeed = legConfig.speed || effectiveSpeed || 12.5;
                
                // HRA detection for alternative route legs
                const altHra = calculateHRADistances(altCoords);
                
                altLegs.push({
                  legNumber: altLegs.length + 1,
                  from: { name: fromName, locode: fromPort || undefined, coordinates: fromCoords },
                  to: { name: toName, locode: toPort || undefined, coordinates: toCoords },
                  distanceNm: legDist,
                  ecaDistanceNm: legEca,
                  hraDistanceNm: altHra.hraDistanceNm,
                  isFullECA: legEca > 0 && legEca >= legDist * 0.95,
                  ecaZones: legEca > 0 ? ["SECA"] : [],
                  hraZones: altHra.hraZones,
                  geometry: { coordinates: altCoords, ecaSegments: [], hraSegments: [] },
                  speedKnots: altLegSpeed,
                  condition: legConfig.condition,
                });
                
                altTotalDistance += legDist;
                altTotalEcaDistance += legEca;
                if (legEca > 0 && !altEcaZones.includes("SECA")) {
                  altEcaZones.push("SECA");
                }
              }
            }
            
            if (altLegs.length > 0) {
              const altLegSpeed = effectiveSpeed || 12.5;
              const altDays = altLegSpeed > 0 ? altTotalDistance / (altLegSpeed * 24) : null;
              
              const altResult: RouteResultData = {
                summary: {
                  totalDistanceNm: altTotalDistance,
                  totalECADistanceNm: altTotalEcaDistance,
                  totalHRADistanceNm: altLegs.reduce((s, l) => s + l.hraDistanceNm, 0),
                  estimatedDays: altDays,
                  openSeaDistanceNm: altTotalDistance - altTotalEcaDistance,
                },
                legs: altLegs,
                zones: { eca: altEcaZones, hra: altLegs.flatMap(l => l.hraZones).filter((z, i, a) => a.indexOf(z) === i) },
                warnings: [],
              };
              
              const avoidAlt: RouteAlternative = {
                id: "avoid-canal",
                label: avoidLabel,
                result: altResult,
                canalName: "",
                totalDays: altDays || 0,
                totalDistanceNm: altTotalDistance,
              };
              
              // ── 3rd Route: SECA Minimized ─────────────────────────
              // Fire a 3rd NavAPI call with secaAvoidance=1 to minimize ECA exposure
              let secaAlt: RouteAlternative | null = null;
              if (totalECADistanceNm > 0) {
                try {
                  const secaLegs: RouteResultData["legs"] = [];
                  let secaTotalDist = 0;
                  let secaTotalEca = 0;
                  
                  for (let i = 0; i < altRouteWaypoints.length - 1; i++) {
                    const fromWpS = altRouteWaypoints[i];
                    const toWpS = altRouteWaypoints[i + 1];
                    const fromPortS = fromWpS.port?.portCode || "";
                    const toPortS = toWpS.port?.portCode || "";
                    const fromNameS = fromWpS.port?.displayName || fromPortS || "Start";
                    const toNameS = toWpS.port?.displayName || toPortS || "End";
                    const fromCoordsS: [number, number] = [fromWpS.port?.longitude || fromWpS.manualLng || 0, fromWpS.port?.latitude || fromWpS.manualLat || 0];
                    const toCoordsS: [number, number] = [toWpS.port?.longitude || toWpS.manualLng || 0, toWpS.port?.latitude || toWpS.manualLat || 0];
                    
                    const secaReq: Record<string, unknown> = { options: { secaAvoidance: 1 } };
                    if (fromPortS) secaReq.startPortCode = fromPortS;
                    else { secaReq.startLat = fromCoordsS[1]; secaReq.startLon = fromCoordsS[0]; }
                    if (toPortS) secaReq.endPortCode = toPortS;
                    else { secaReq.endLat = toCoordsS[1]; secaReq.endLon = toCoordsS[0]; }
                    
                    const secaRes = await fetch("/api/navapi/route", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(secaReq),
                    });
                    const secaData = await secaRes.json();
                    
                    if (secaData.success !== false && secaData.totalDistanceNm) {
                      const sDist = secaData.totalDistanceNm || 0;
                      const sEca = secaData.ecaDistanceNm || 0;
                      const sCoords: [number, number][] = (secaData.geometry?.coordinates as [number, number][]) || [];
                      const sLegConfig = fromWpS.legConfig || currentLegConfig;
                      const sHra = calculateHRADistances(sCoords);
                      
                      secaLegs.push({
                        legNumber: secaLegs.length + 1,
                        from: { name: fromNameS, locode: fromPortS || undefined, coordinates: fromCoordsS },
                        to: { name: toNameS, locode: toPortS || undefined, coordinates: toCoordsS },
                        distanceNm: sDist, ecaDistanceNm: sEca, hraDistanceNm: sHra.hraDistanceNm,
                        isFullECA: sEca > 0 && sEca >= sDist * 0.95,
                        ecaZones: sEca > 0 ? ["SECA"] : [], hraZones: sHra.hraZones,
                        geometry: { coordinates: sCoords, ecaSegments: [], hraSegments: [] },
                        speedKnots: sLegConfig.speed || effectiveSpeed || 12.5,
                        condition: sLegConfig.condition,
                      });
                      secaTotalDist += sDist;
                      secaTotalEca += sEca;
                    }
                  }
                  
                  if (secaLegs.length > 0) {
                    const secaDays = (effectiveSpeed || 12.5) > 0 ? secaTotalDist / ((effectiveSpeed || 12.5) * 24) : null;
                    const secaResult: RouteResultData = {
                      summary: {
                        totalDistanceNm: secaTotalDist,
                        totalECADistanceNm: secaTotalEca,
                        totalHRADistanceNm: secaLegs.reduce((s, l) => s + l.hraDistanceNm, 0),
                        estimatedDays: secaDays,
                        openSeaDistanceNm: secaTotalDist - secaTotalEca,
                      },
                      legs: secaLegs,
                      zones: { eca: secaTotalEca > 0 ? ["SECA"] : [], hra: secaLegs.flatMap(l => l.hraZones).filter((z, i, a) => a.indexOf(z) === i) },
                      warnings: [],
                    };
                    secaAlt = {
                      id: "seca-minimized",
                      label: "SECA Minimized",
                      result: secaResult,
                      canalName: "",
                      totalDays: secaDays || 0,
                      totalDistanceNm: secaTotalDist,
                    };
                    console.log(`[SECA MINIMIZED] Route: ${secaLegs.length} legs, ${Math.round(secaTotalDist)} NM, SECA: ${Math.round(secaTotalEca)} NM`);
                  }
                } catch (err) {
                  console.warn("[SECA MINIMIZED] Failed:", err);
                }
              }
              
              const allAlts = [primaryAlt, avoidAlt];
              if (secaAlt) allAlts.push(secaAlt);
              setRouteAlternatives(allAlts);
              setSelectedAlternativeId("primary");
              console.log(`[CANAL COMPARISON] Alternative route: ${altLegs.length} legs, ${Math.round(altTotalDistance)} NM, ${altDays ? Math.round(altDays * 10) / 10 : "?"} days`);
            }
          } catch (err) {
            console.warn("[CANAL COMPARISON] Failed to calculate alternative:", err);
            setRouteAlternatives([primaryAlt]);
          }
        })();
        
        toast.success(`Route calculated: ${legs.length} leg(s), ${Math.round(totalDistanceNm)} NM via ${canals.map(c => c.name).join(", ")}. Comparing alternatives...`);
      } else {
        // No canals — still generate SECA-minimized if SECA distance > 0
        const primaryAlt: RouteAlternative = {
          id: "primary",
          label: "Optimal Route",
          result: routeResult,
          canalName: "",
          totalDays: routeResult.summary.estimatedDays || 0,
          totalDistanceNm,
        };

        if (totalECADistanceNm > 0) {
          // Fire SECA-minimized route in background
          (async () => {
            try {
              const secaLegs: RouteResultData["legs"] = [];
              let secaTotalDist = 0;
              let secaTotalEca = 0;
              const secaWps = validWaypoints.filter(wp => wp.port || (wp.manualLat !== undefined && wp.manualLng !== undefined));
              
              for (let i = 0; i < secaWps.length - 1; i++) {
                const fWp = secaWps[i];
                const tWp = secaWps[i + 1];
                const fPort = fWp.port?.portCode || "";
                const tPort = tWp.port?.portCode || "";
                const secaReq: Record<string, unknown> = { options: { secaAvoidance: 1 } };
                if (fPort) secaReq.startPortCode = fPort;
                else { secaReq.startLat = fWp.manualLat!; secaReq.startLon = fWp.manualLng!; }
                if (tPort) secaReq.endPortCode = tPort;
                else { secaReq.endLat = tWp.manualLat!; secaReq.endLon = tWp.manualLng!; }
                
                const res = await fetch("/api/navapi/route", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(secaReq),
                });
                const data = await res.json();
                
                if (data.success !== false && data.totalDistanceNm) {
                  const sDist = data.totalDistanceNm || 0;
                  const sEca = data.ecaDistanceNm || 0;
                  const sCoords: [number, number][] = (data.geometry?.coordinates as [number, number][]) || [];
                  const sLegCfg = fWp.legConfig || { condition: "laden" as const, speed: 12.5, dailyConsumption: 25, maxDraft: "" };
                  const sHra = calculateHRADistances(sCoords);
                  
                  secaLegs.push({
                    legNumber: secaLegs.length + 1,
                    from: { name: fWp.port?.displayName || fPort || "Start", locode: fPort || undefined, coordinates: [fWp.port?.longitude || fWp.manualLng || 0, fWp.port?.latitude || fWp.manualLat || 0] },
                    to: { name: tWp.port?.displayName || tPort || "End", locode: tPort || undefined, coordinates: [tWp.port?.longitude || tWp.manualLng || 0, tWp.port?.latitude || tWp.manualLat || 0] },
                    distanceNm: sDist, ecaDistanceNm: sEca, hraDistanceNm: sHra.hraDistanceNm,
                    isFullECA: sEca > 0 && sEca >= sDist * 0.95,
                    ecaZones: sEca > 0 ? ["SECA"] : [], hraZones: sHra.hraZones,
                    geometry: { coordinates: sCoords, ecaSegments: [], hraSegments: [] },
                    speedKnots: sLegCfg.speed || effectiveSpeed || 12.5,
                    condition: sLegCfg.condition,
                  });
                  secaTotalDist += sDist;
                  secaTotalEca += sEca;
                }
              }
              
              if (secaLegs.length > 0) {
                const secaDays = (effectiveSpeed || 12.5) > 0 ? secaTotalDist / ((effectiveSpeed || 12.5) * 24) : null;
                const secaResult: RouteResultData = {
                  summary: {
                    totalDistanceNm: secaTotalDist, totalECADistanceNm: secaTotalEca,
                    totalHRADistanceNm: secaLegs.reduce((s, l) => s + l.hraDistanceNm, 0),
                    estimatedDays: secaDays,
                    openSeaDistanceNm: secaTotalDist - secaTotalEca,
                  },
                  legs: secaLegs,
                  zones: { eca: secaTotalEca > 0 ? ["SECA"] : [], hra: secaLegs.flatMap(l => l.hraZones).filter((z, i, a) => a.indexOf(z) === i) },
                  warnings: [],
                };
                const secaAlt: RouteAlternative = {
                  id: "seca-minimized",
                  label: "SECA Minimized",
                  result: secaResult,
                  canalName: "",
                  totalDays: secaDays || 0,
                  totalDistanceNm: secaTotalDist,
                };
                setRouteAlternatives([primaryAlt, secaAlt]);
                setSelectedAlternativeId("primary");
              } else {
                setRouteAlternatives([primaryAlt]);
              }
            } catch (err) {
              console.warn("[SECA MINIMIZED] Failed:", err);
              setRouteAlternatives([primaryAlt]);
            }
          })();
        } else {
          // No SECA, no canals — still store primary for AI analysis (weather, HRA, safety)
          setRouteAlternatives([primaryAlt]);
          setSelectedAlternativeId("primary");
        }
        toast.success(`Route calculated: ${legs.length} leg(s), ${Math.round(totalDistanceNm)} NM`);
      }
      
      // Refresh usage counter after successful calculation
      usageRefetchRef.current?.();
    } catch (error) {
      console.error("Multi-route calculation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to calculate route");
    } finally {
      setIsCalculating(false);
    }
  }, [canCalculate, validWaypoints, etd, waypoints, maxDraftValue]);

  // ── Post-Calculation: Fire Route Intelligence + AI Analysis ───
  // When routeAlternatives change, enrich with intelligence and fire AI
  const prevAltsRef = useRef<string>("");
  useEffect(() => {
    const altsKey = routeAlternatives.map(a => `${a.id}:${a.totalDistanceNm}`).join("|");
    if (!altsKey || altsKey === prevAltsRef.current || routeAlternatives.length < 1) return;
    prevAltsRef.current = altsKey;

    // Reset AI state
    setAiRecommendation(null);
    setAiError(null);

    // Build port info from waypoints
    const portNames = waypoints
      .filter(w => w.type === "port" && (w.port || w.manualName))
      .map(w => ({ name: w.port?.displayName || w.manualName || "", locode: w.port?.portCode }));

    const vesselType = selectedVessel?.vesselType;
    const vesselDwt = effectiveDWT;

    (async () => {
      // Step 1: Enrich each alternative with intelligence data
      const enrichedAlts: RouteAlternative[] = [];
      for (const alt of routeAlternatives) {
        try {
          const intel = await computeRouteIntelligence({
            detectedCanals: alt.canalName ? [alt.canalName] : [],
            hraZones: alt.result.zones.hra,
            hraDistanceNm: alt.result.summary.totalHRADistanceNm,
            vessel: {
              vesselType,
              dwt: vesselDwt || undefined,
            },
            ports: portNames,
            laden: true,
            voyageDays: alt.totalDays,
          });
          enrichedAlts.push({ ...alt, intel });

          // Auto-fill canal cost from intelligence (editable override)
          if (alt.id === "primary" && intel && intel.canalTolls.totalUsd > 0 && !canalCost) {
            setCanalCost(String(Math.round(intel.canalTolls.totalUsd)));
          }
        } catch (err) {
          console.warn(`[Intelligence] Failed for ${alt.id}:`, err);
          enrichedAlts.push({ ...alt, intel: null });
        }
      }

      // Update alternatives with intelligence data
      setRouteAlternatives(enrichedAlts);

      // ── Step 1b: Multi-Route Weather Comparison ──
      // Fire weather comparison across all alternatives (non-blocking)
      if (enrichedAlts.length >= 1) {
        setIsMultiRouteLoading(true);
        const etdISO = etd ? new Date(etd).toISOString() : new Date().toISOString();
        
        const routeInputs = enrichedAlts.map(alt => {
          // Sample up to 12 waypoints per route
          const allCoords = alt.result.legs.flatMap(leg => leg.geometry.coordinates);
          const step = Math.max(1, Math.floor(allCoords.length / 12));
          const sampled: Array<{ lat: number; lon: number }> = [];
          for (let i = 0; i < allCoords.length; i += step) {
            sampled.push({ lat: allCoords[i][1], lon: allCoords[i][0] });
          }
          // Always include last point
          const last = allCoords[allCoords.length - 1];
          if (sampled.length === 0 || sampled[sampled.length - 1].lat !== last[1]) {
            sampled.push({ lat: last[1], lon: last[0] });
          }
          return {
            route_id: alt.id,
            label: alt.label,
            waypoints: sampled,
            total_distance_nm: alt.totalDistanceNm,
          };
        });

        fetchMultiRouteForecast({
          routes: routeInputs,
          etd: etdISO,
          vessel_speed_knots: effectiveSpeed || 12.5,
          vessel_type: selectedVessel?.vesselType || "BULK_CARRIER",
          vessel_dwt: effectiveDWT || 50000,
        }).then(result => {
          if (result?.success) {
            setMultiRouteComparison(result);
            console.log(
              `[MultiRoute] ✅ ${result.routes.length} routes compared, ` +
              `recommended: ${result.recommended_route_id}`
            );
          }
        }).catch(err => {
          console.warn("[MultiRoute] Engine offline:", err);
        }).finally(() => {
          setIsMultiRouteLoading(false);
        });
      }

      // Step 2: Fire AI analysis if we have 2+ routes
      if (enrichedAlts.length >= 1) {
        setIsAiLoading(true);
        try {
          const aiRoutes = enrichedAlts.map(alt => ({
            id: alt.id,
            label: alt.label,
            distanceNm: alt.totalDistanceNm,
            estimatedDays: alt.totalDays,
            ecaDistanceNm: alt.result.summary.totalECADistanceNm,
            hraDistanceNm: alt.result.summary.totalHRADistanceNm,
            canalTollUsd: alt.intel?.canalTolls.totalUsd || 0,
            warRiskPremiumUsd: alt.intel?.warRisk.premiumUsd || 0,
            cargoRiskUsd: alt.intel?.cargoRisk?.riskExposureUsd || 0,
            portWaitDays: alt.intel?.portCongestion?.totalWaitDays || 0,
            portCongestionCostUsd: alt.intel?.portCongestion?.estimatedCostUsd || 0,
            hullValueUsd: alt.intel?.hullValue.valueUsd || 0,
            totalAdditionalCostsUsd: alt.intel?.totalAdditionalCostsUsd || 0,
            hraZones: alt.result.zones.hra,
            weatherSeverity: weatherData?.averageConditions?.overallSeverity || "Unknown — fetching",
            canals: alt.canalName ? [alt.canalName] : [],
            ecaZones: alt.result.zones.eca,
          }));

          const res = await fetch("/api/ai/route-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              routes: aiRoutes,
              vesselType,
              vesselDwt,
              // Pass live weather forecast data for AI weather analysis
              ...(weatherData ? {
                weatherForecast: {
                  worstConditions: weatherData.worstConditions,
                  averageConditions: weatherData.averageConditions,
                  advisories: weatherData.advisories || [],
                  waypointSummaries: (weatherData.waypoints || []).map(wp => ({
                    lat: wp.latitude,
                    lon: wp.longitude,
                    waveHeight: wp.current.waveHeight,
                    swellHeight: wp.current.swellWaveHeight,
                    severity: wp.current.severity,
                    seaTemp: wp.current.seaSurfaceTemperature,
                    oceanCurrentVelocity: wp.current.oceanCurrentVelocity,
                    oceanCurrentDirection: wp.current.oceanCurrentDirection,
                  })),
                },
              } : {}),
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.recommendation) {
              setAiRecommendation(data.recommendation);
            } else {
              setAiError(data.error || "AI analysis returned no recommendation");
            }
          } else {
            setAiError(`AI analysis failed (${res.status})`);
          }
        } catch (err) {
          console.warn("[AI Route Analysis] Failed:", err);
          setAiError(err instanceof Error ? err.message : "Unknown error");
        } finally {
          setIsAiLoading(false);
        }
      }
    })();
  }, [routeAlternatives.length > 0 ? routeAlternatives.map(a => `${a.id}:${a.totalDistanceNm}`).join("|") : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Nearest Safe Port Analysis ──────────────────────────────────
  // After route calculation, sample waypoints from the primary route
  // and analyze nearest safe port for each using DB ports (2,951+).
  useEffect(() => {
    if (routeAlternatives.length < 1) {
      setSafePortAnalysis(null);
      return;
    }

    const primary = routeAlternatives.find(a => a.id === "primary");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primaryAny = primary as any;
    if (!primaryAny?.geometry?.coordinates?.length) return;

    // Sample ~20 evenly-spaced points from the route geometry
    const coords = primaryAny.geometry.coordinates as [number, number][];
    const sampleCount = Math.min(20, coords.length);
    const step = Math.max(1, Math.floor(coords.length / sampleCount));
    const sampledWaypoints: Array<{ lat: number; lon: number }> = [];
    for (let i = 0; i < coords.length; i += step) {
      sampledWaypoints.push({ lat: coords[i][1], lon: coords[i][0] }); // GeoJSON = [lon, lat]
    }
    // Always include last point
    const last = coords[coords.length - 1];
    if (sampledWaypoints.length > 0 && (sampledWaypoints[sampledWaypoints.length - 1].lat !== last[1] || sampledWaypoints[sampledWaypoints.length - 1].lon !== last[0])) {
      sampledWaypoints.push({ lat: last[1], lon: last[0] });
    }

    // Use DB ports (already loaded in wpiPortsRef) for analysis
    const portSource = wpiPortsRef.current.length > 0
      ? wpiPortsRef.current
      : majorPorts.map(p => ({ name: p.name, locode: p.locode, lat: p.latitude, lon: p.longitude }));

    if (portSource.length > 0 && sampledWaypoints.length > 0) {
      const result = analyzeNearestSafePorts(sampledWaypoints, portSource);
      setSafePortAnalysis(result);
      console.log(`[SafePort] Most remote: ${result.mostRemotePoint.nearestPort} (${result.mostRemotePoint.distanceNm} NM)`);
    }
  }, [routeAlternatives.map(a => `${a.id}:${a.totalDistanceNm}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Weather-Avoidance Deviation Engine ──────────────────────────
  // When weather data arrives, analyze for dangerous clusters and generate
  // a weather-avoidance alternative route via NavAPI.
  const prevWeatherKeyRef = useRef<string>("");
  const weatherDeviationFired = useRef(false);
  useEffect(() => {
    if (!weatherData || routeAlternatives.length < 1) return;
    const weatherKey = `${weatherData.averageConditions.overallSeverity}:${weatherData.worstConditions.maxWaveHeight}`;
    if (weatherKey === prevWeatherKeyRef.current) return;
    prevWeatherKeyRef.current = weatherKey;
    weatherDeviationFired.current = false; // Reset for new weather data
  }, [weatherData?.averageConditions?.overallSeverity, weatherData?.worstConditions?.maxWaveHeight, routeAlternatives.length]);

  // Execute weather deviation + AI re-fire when AI finishes first call
  useEffect(() => {
    if (isAiLoading || weatherDeviationFired.current || !weatherData || routeAlternatives.length < 1) return;
    weatherDeviationFired.current = true;

    (async () => {
      // Step 1: Run deviation engine to detect hazard clusters
      const deviation = analyzeWeatherDeviation(weatherData);
      
      // Step 2: Check bunkering range
      const primaryAlt = routeAlternatives.find(a => a.id === "primary");
      const bunkeringAlert = checkBunkeringRange(
        primaryAlt?.totalDays || 0,
        waypoints[0]?.legConfig?.dailyConsumption,
      );

      // Step 3: If deviation needed, generate weather-avoidance route via NavAPI
      let updatedAlts = [...routeAlternatives];
      const alreadyHasWeatherAlt = routeAlternatives.some(a => a.id === "weather-avoidance");

      if (deviation.hasDeviation && !alreadyHasWeatherAlt && primaryAlt) {
        console.log(`[WEATHER DEVIATION] Detected: ${deviation.reason}`);
        console.log(`[WEATHER DEVIATION] Generating ${deviation.deviationWaypoints.length} deviation waypoints`);

        try {
          // Build multi-leg route through deviation waypoints
          // Route: origin → deviation WP1 → deviation WP2 → deviation WP3 → destination
          const validWps = waypoints.filter(w => w.port || (w.manualLat !== undefined && w.manualLng !== undefined));
          if (validWps.length >= 2) {
            const origin = validWps[0];
            const destination = validWps[validWps.length - 1];

            // Build waypoint chain: origin → deviations → destination
            const allPoints: Array<{ lat: number; lon: number; port?: string }> = [];
            
            // Origin
            const originPort = origin.port?.portCode;
            const originLat = origin.port?.latitude || origin.manualLat || 0;
            const originLon = origin.port?.longitude || origin.manualLng || 0;
            allPoints.push({ lat: originLat, lon: originLon, port: originPort });

            // Deviation waypoints
            for (const dwp of deviation.deviationWaypoints) {
              allPoints.push({ lat: dwp.lat, lon: dwp.lon });
            }

            // Destination
            const destPort = destination.port?.portCode;
            const destLat = destination.port?.latitude || destination.manualLat || 0;
            const destLon = destination.port?.longitude || destination.manualLng || 0;
            allPoints.push({ lat: destLat, lon: destLon, port: destPort });

            // Make NavAPI calls for each segment
            const weatherLegs: RouteResultData["legs"] = [];
            let weatherTotalDist = 0;
            let weatherTotalEca = 0;

            for (let i = 0; i < allPoints.length - 1; i++) {
              const from = allPoints[i];
              const to = allPoints[i + 1];

              const reqBody: Record<string, unknown> = {};
              if (from.port) reqBody.startPortCode = from.port;
              else { reqBody.startLat = from.lat; reqBody.startLon = from.lon; }
              if (to.port) reqBody.endPortCode = to.port;
              else { reqBody.endLat = to.lat; reqBody.endLon = to.lon; }

              try {
                const res = await fetch("/api/navapi/route", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(reqBody),
                });
                const data = await res.json();

                if (data.success !== false && data.totalDistanceNm) {
                  const dist = data.totalDistanceNm || 0;
                  const eca = data.ecaDistanceNm || 0;
                  const coords: [number, number][] = (data.geometry?.coordinates as [number, number][]) || [];
                  const hra = calculateHRADistances(coords);

                  weatherLegs.push({
                    legNumber: weatherLegs.length + 1,
                    from: { name: from.port || `${from.lat.toFixed(1)}°, ${from.lon.toFixed(1)}°`, locode: from.port || undefined, coordinates: [from.lon, from.lat] },
                    to: { name: to.port || `${to.lat.toFixed(1)}°, ${to.lon.toFixed(1)}°`, locode: to.port || undefined, coordinates: [to.lon, to.lat] },
                    distanceNm: dist,
                    ecaDistanceNm: eca,
                    hraDistanceNm: hra.hraDistanceNm,
                    isFullECA: eca > 0 && eca >= dist * 0.95,
                    ecaZones: eca > 0 ? ["SECA"] : [],
                    hraZones: hra.hraZones,
                    geometry: { coordinates: coords, ecaSegments: [], hraSegments: [] },
                    speedKnots: effectiveSpeed || 12.5,
                    condition: "laden" as const,
                  });
                  weatherTotalDist += dist;
                  weatherTotalEca += eca;
                }
              } catch (err) {
                console.warn(`[WEATHER DEVIATION] Leg ${i + 1} failed:`, err);
              }
            }

            if (weatherLegs.length > 0) {
              const weatherDays = (effectiveSpeed || 12.5) > 0 ? weatherTotalDist / ((effectiveSpeed || 12.5) * 24) : null;
              const weatherResult: RouteResultData = {
                summary: {
                  totalDistanceNm: weatherTotalDist,
                  totalECADistanceNm: weatherTotalEca,
                  totalHRADistanceNm: weatherLegs.reduce((s, l) => s + l.hraDistanceNm, 0),
                  estimatedDays: weatherDays,
                  openSeaDistanceNm: weatherTotalDist - weatherTotalEca,
                },
                legs: weatherLegs,
                zones: {
                  eca: weatherTotalEca > 0 ? ["SECA"] : [],
                  hra: weatherLegs.flatMap(l => l.hraZones).filter((z, i, a) => a.indexOf(z) === i),
                },
                warnings: [`Weather avoidance: ${deviation.reason}`],
              };

              const weatherAlt: RouteAlternative = {
                id: "weather-avoidance",
                label: "Weather Avoidance",
                result: weatherResult,
                canalName: "",
                totalDays: weatherDays || 0,
                totalDistanceNm: weatherTotalDist,
              };

              updatedAlts = [...routeAlternatives.filter(a => a.id !== "weather-avoidance"), weatherAlt];
              setRouteAlternatives(updatedAlts);
              console.log(`[WEATHER DEVIATION] Route generated: ${weatherLegs.length} legs, ${Math.round(weatherTotalDist)} NM, ${weatherDays?.toFixed(1)} days`);
            }
          }
        } catch (err) {
          console.warn("[WEATHER DEVIATION] Failed to generate avoidance route:", err);
        }
      } else if (!deviation.hasDeviation) {
        console.log("[WEATHER DEVIATION] No significant hazards — no deviation needed");
      }

      // Step 4: Re-fire AI with weather data + all routes (including weather-avoidance if generated)
      const currentAlts = updatedAlts.length > routeAlternatives.length ? updatedAlts : routeAlternatives;
      if (currentAlts.length >= 1 && aiRecommendation) {
        setIsAiLoading(true);
        try {
          const aiRoutes = currentAlts.map(alt => ({
            id: alt.id,
            label: alt.label,
            distanceNm: alt.totalDistanceNm,
            estimatedDays: alt.totalDays,
            ecaDistanceNm: alt.result.summary.totalECADistanceNm,
            hraDistanceNm: alt.result.summary.totalHRADistanceNm,
            canalTollUsd: alt.intel?.canalTolls.totalUsd || 0,
            warRiskPremiumUsd: alt.intel?.warRisk.premiumUsd || 0,
            cargoRiskUsd: alt.intel?.cargoRisk?.riskExposureUsd || 0,
            portWaitDays: alt.intel?.portCongestion?.totalWaitDays || 0,
            portCongestionCostUsd: alt.intel?.portCongestion?.estimatedCostUsd || 0,
            hullValueUsd: alt.intel?.hullValue.valueUsd || 0,
            totalAdditionalCostsUsd: alt.intel?.totalAdditionalCostsUsd || 0,
            hraZones: alt.result.zones.hra,
            weatherSeverity: weatherData.averageConditions.overallSeverity,
            canals: alt.canalName ? [alt.canalName] : [],
            ecaZones: alt.result.zones.eca,
          }));

          const res = await fetch("/api/ai/route-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              routes: aiRoutes,
              vesselType: selectedVessel?.vesselType,
              vesselDwt: effectiveDWT,
              weatherForecast: {
                worstConditions: weatherData.worstConditions,
                averageConditions: weatherData.averageConditions,
                advisories: weatherData.advisories || [],
                waypointSummaries: (weatherData.waypoints || []).map(wp => ({
                  lat: wp.latitude,
                  lon: wp.longitude,
                  waveHeight: wp.current.waveHeight,
                  swellHeight: wp.current.swellWaveHeight,
                  severity: wp.current.severity,
                  seaTemp: wp.current.seaSurfaceTemperature,
                  oceanCurrentVelocity: wp.current.oceanCurrentVelocity,
                  oceanCurrentDirection: wp.current.oceanCurrentDirection,
                })),
              },
              bunkeringAlert: bunkeringAlert.isLongVoyage ? bunkeringAlert.message : undefined,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.recommendation) {
              setAiRecommendation(data.recommendation);
            }
          }
        } catch (err) {
          console.warn("[AI Re-fire with weather] Failed:", err);
        } finally {
          setIsAiLoading(false);
        }
      }
    })();
  }, [isAiLoading, aiRecommendation, weatherData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get label for waypoint position
  const getWaypointLabel = (index: number, total: number) => {
    if (total >= 3) {
      if (index === 0) return "Starting Point";
      if (index === 1) return "Origin";
      if (index === total - 1) return "Destination";
      return `Waypoint ${index}`;
    }
    if (index === 0) return "Origin";
    if (index === total - 1) return "Destination";
    return `Waypoint ${index}`;
  };

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {/* Upgrade Modal (shown when free limit reached) */}
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />



      {/* ═══════════════════════════════════════════════════
          FULL-SCREEN MAP (always behind everything)
         ═══════════════════════════════════════════════════ */}
      <div className="absolute inset-0 z-0" id="voyage-map-container">
        <VoyageMap
          waypoints={voyageMapWaypoints}
          result={result}
          className="h-full w-full"
          weatherPoints={weatherMapPoints}
          alternativeRoutes={alternativeRouteOverlays}
          onMapClick={handleMapClick}
          onMapRightClick={handleMapRightClick}
          clickModeLabel={activeClickTarget?.label || null}
          vesselPosition={vesselMapPosition || (aisPosition ? { lat: aisPosition.lat, lon: aisPosition.lng, name: selectedVessel?.name || "Vessel" } : null)}
          vesselTrail={vesselTrail}
          isLiveTracking={isLiveTracking}
          nearbyVessels={nearbyMapVessels}
        />

        {/* ── Map Context Menu (right-click) ── */}
        {contextMenu && (
          <div
            className="absolute z-[2000] min-w-[220px] py-1.5 rounded-lg bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 shadow-2xl"
            style={{
              left: Math.min(contextMenu.x, (typeof window !== "undefined" ? window.innerWidth - 260 : 600)),
              top: Math.min(contextMenu.y, (typeof window !== "undefined" ? window.innerHeight - 200 : 400)),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Add destination here (coordinates) */}
            <button
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-100 hover:bg-zinc-700/60 transition-colors text-left"
              onClick={() => addWaypointFromContextMenu("coordinate", contextMenu.lat, contextMenu.lon)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400 shrink-0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>Add destination here</span>
            </button>

            {/* Nearest ports */}
            {contextMenu.nearestPorts.length > 0 && (
              <>
                <div className="border-t border-zinc-700/50 my-1" />
                {contextMenu.nearestPorts.map((port) => (
                  <button
                    key={port.locode}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-100 hover:bg-zinc-700/60 transition-colors text-left"
                    onClick={() => addWaypointFromContextMenu("port", port.lat, port.lon, { name: port.name, locode: port.locode })}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 shrink-0"><path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/></svg>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">Add Port: {port.name}</span>
                      <span className="text-[10px] text-zinc-500">{port.locode} · {port.distanceNm} NM away</span>
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* Coordinates info */}
            <div className="border-t border-zinc-700/50 mt-1 pt-1.5 pb-1 px-3.5">
              <span className="text-[10px] text-zinc-500">{contextMenu.lat.toFixed(4)}°, {contextMenu.lon.toFixed(4)}°</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          DESKTOP: FLOATING SIDE PANEL (lg+)
         ═══════════════════════════════════════════════════ */}
      <div
        className={cn(
          "hidden lg:flex absolute top-0 left-0 bottom-0 z-10 flex-col",
          "bg-background/95 backdrop-blur-md border-r border-border/50 shadow-2xl",
          !isDraggingPanel && "transition-all duration-300 ease-in-out"
        )}
        style={{ width: panelOpen ? panelWidth : 52 }}
      >
        {/* ─── Panel Header ─── */}
        <div className="flex items-center justify-between px-3 h-12 border-b border-border/50 shrink-0">
          {panelOpen ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <Route className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-sm truncate">Route Planner</span>
              </div>
              <div className="flex items-center gap-1">
                <UsageCounter
                  onRefetch={(fn) => { usageRefetchRef.current = fn; }}
                />
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Collapse panel"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setPanelOpen(true)}
              className="w-full flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Expand panel"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ─── Collapsed Icon Strip ─── */}
        {!panelOpen && (
          <div className="flex flex-col items-center gap-1 py-3 px-1">
            <button
              onClick={() => { setPanelOpen(true); }}
              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Ports & Waypoints"
            >
              <MapPin className="h-5 w-5" />
            </button>
            {result && (
              <>
                <button
                  onClick={() => {
                    setPanelOpen(true);
                    setTimeout(() => resultsSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 350);
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Results & Compliance"
                >
                  <BarChart3 className="h-5 w-5" />
                </button>
                {(weatherData || isWeatherLoading) && (
                  <button
                    onClick={() => {
                      setPanelOpen(true);
                      setTimeout(() => weatherSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 350);
                    }}
                    className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Weather Forecast"
                  >
                    <CloudSun className="h-5 w-5" />
                  </button>
                )}
              </>
            )}
            <div className="border-t border-border/50 w-full my-1" />
            <button
              onClick={() => setPanelOpen(true)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Expand panel"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* ─── Expanded Panel Content (scrollable) ─── */}
        {panelOpen && (
          <>
            <div ref={panelScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
              {/* ══ VESSEL-FIRST: Voyage Parameters (moved above waypoints) ══ */}
              <div className="p-3 space-y-2 border-b border-border/30">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Voyage Parameters
                </p>
                <div className="space-y-2">
                  {/* ── Unified Vessel Combobox ── */}
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Ship className="h-3 w-3" />
                      Vessel
                      {selectedVessel && (
                        <span className="text-muted-foreground">({selectedVessel.dwt.toLocaleString()} DWT)</span>
                      )}
                      {!selectedVessel && manualDWT && (
                        <span className="text-muted-foreground">({parseInt(manualDWT).toLocaleString()} DWT)</span>
                      )}
                    </Label>

                    {/* Selected vessel chip — shown when a DB vessel is picked */}
                    {selectedVessel ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-green-500/30 bg-green-500/5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{selectedVessel.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {selectedVessel.vesselType} · {selectedVessel.dwt.toLocaleString()} DWT
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVesselId("");
                            setAisPosition(null);
                            aisAutoFillRef.current = null;
                          }}
                          className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          title="Clear vessel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      /* Combobox input — type to search fleet or enter custom name */
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="Type vessel name or select from fleet..."
                          value={manualVesselName}
                          onChange={(e) => {
                            setManualVesselName(e.target.value);
                            setSelectedVesselId("");
                          }}
                          onFocus={() => setVesselDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setVesselDropdownOpen(false), 200)}
                          className="h-8 text-xs w-full pr-8"
                        />
                        <Ship className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />

                        {/* Fleet suggestions dropdown */}
                        {vesselDropdownOpen && vessels.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 max-h-[180px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg z-[60]">
                            {vessels
                              .filter(v => !manualVesselName || v.name.toLowerCase().includes(manualVesselName.toLowerCase()))
                              .map(v => (
                                <button
                                  key={v.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // Prevent blur
                                    setSelectedVesselId(v.id);
                                    setManualVesselName("");
                                    setVesselDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/20 last:border-0"
                                >
                                  <p className="text-xs font-medium">{v.name}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {v.vesselType} · {v.dwt.toLocaleString()} DWT
                                  </p>
                                </button>
                              ))}
                            {vessels.filter(v => !manualVesselName || v.name.toLowerCase().includes(manualVesselName.toLowerCase())).length === 0 && (
                              <div className="px-3 py-2 text-[10px] text-muted-foreground italic">
                                No matching vessels — using &quot;{manualVesselName}&quot; as custom name
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* AIS Position badge */}
                    {aisPosition && selectedVessel && (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-[10px]">
                        <Satellite className="h-3 w-3 text-cyan-400 shrink-0" />
                        <span className="text-cyan-400 font-medium">AIS Position:</span>
                        <span className="text-muted-foreground truncate">{aisPosition.lat.toFixed(4)}°, {aisPosition.lng.toFixed(4)}°</span>
                        <span className="text-muted-foreground/50 ml-auto shrink-0">
                          {new Date(aisPosition.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {/* DWT — always visible */}
                    <div className="flex items-center gap-2">
                      <Label className="text-[10px] text-muted-foreground shrink-0 w-8">DWT</Label>
                      {selectedVessel ? (
                        <div className="h-7 flex items-center px-2 text-xs text-muted-foreground bg-muted/30 rounded-md border border-border/30 flex-1">
                          {selectedVessel.dwt.toLocaleString()}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          placeholder="e.g. 50000"
                          value={manualDWT}
                          onChange={(e) => setManualDWT(e.target.value)}
                          className="h-7 text-xs flex-1"
                        />
                      )}
                    </div>
                  </div>

                  {/* ETD */}
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      ETD (Departure)
                    </Label>
                    <Input
                      type="datetime-local"
                      value={etd}
                      onChange={(e) => setEtd(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* ══ Compact Waypoints (with click-to-fill) ══ */}
              <div className="p-3 space-y-0 border-b border-border/30">
                {waypoints.map((waypoint, index) => {
                  const isExpanded = expandedWaypoints.has(waypoint.id);
                  const hasLegConfig = waypoint.legConfig && index < waypoints.length - 1;
                  const isLastPort = index === waypoints.length - 1;
                  const isIntermediate = index > 0 && index < waypoints.length - 1;
                  const showPortTimes = index > 0 && waypoint.type === "port"; // All ports except origin get port time
                  const portTimeTotal = (waypoint.portTimes?.waitingHours || 0) + (waypoint.portTimes?.loadingHours || 0);
                  const isClickTarget = activeClickTarget?.waypointId === waypoint.id;
                  const isAisFilled = index === 0 && aisPosition && waypoint.manualName === "__ais__";

                  return (
                    <div key={waypoint.id} className="relative">
                      {/* Vertical connector line */}
                      {index < waypoints.length - 1 && (
                        <div className="absolute left-[18px] top-[28px] bottom-0 w-px bg-border/50" />
                      )}

                      {/* ── Main Row: Badge + Port Input + Click-to-Fill + Expand + Remove ── */}
                      <div className={cn(
                        "flex items-center gap-2 py-1.5 relative z-[1] rounded-md transition-all duration-300",
                        isClickTarget && "ring-2 ring-cyan-400/60 ring-offset-1 ring-offset-background bg-cyan-500/5"
                      )}>
                        {/* Position Badge */}
                        <div
                          className={cn(
                            "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm",
                            index === 0
                              ? "bg-green-500 text-white"
                              : index === waypoints.length - 1
                              ? "bg-red-500 text-white"
                              : "bg-primary/20 text-primary"
                          )}
                        >
                          {index + 1}
                        </div>

                        {/* Port/Passage Input */}
                        <div className="flex-1 min-w-0">
                          {waypoint.type === "passage" && waypoint.passage ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 border rounded-md bg-amber-50 dark:bg-amber-900/20">
                              <Ship className="h-3 w-3 text-amber-600 shrink-0" />
                              <span className="font-medium text-xs truncate">{waypoint.passage.displayName}</span>
                            </div>
                          ) : waypoint.useManualCoords && !waypoint.port ? (
                            <div className="space-y-1">
                              {/* Name field with optional AIS badge */}
                              <div className="flex items-center gap-1">
                                {isAisFilled && (
                                  <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 text-[9px] font-semibold">
                                    <Satellite className="h-2.5 w-2.5" />
                                    AIS
                                  </span>
                                )}
                                <Input
                                  type="text"
                                  placeholder="Name (optional)"
                                  value={(waypoint.manualName && waypoint.manualName !== "__ais__") ? waypoint.manualName : ""}
                                  onChange={(e) => { setWaypoints(prev => prev.map(w => w.id === waypoint.id ? { ...w, manualName: e.target.value } : w)); }}
                                  className="h-7 text-xs flex-1"
                                />
                              </div>
                              <div className="flex gap-1.5">
                                <Input type="text" placeholder="Lat" value={waypoint.manualLat === 0 ? "" : (waypoint.manualLat ?? "")} onChange={(e) => handleManualCoordinates(waypoint.id, "manualLat", e.target.value)} className="h-7 text-xs" />
                                <Input type="text" placeholder="Lng" value={waypoint.manualLng === 0 ? "" : (waypoint.manualLng ?? "")} onChange={(e) => handleManualCoordinates(waypoint.id, "manualLng", e.target.value)} className="h-7 text-xs" />
                              </div>
                              {/* Switch to port search */}
                              <button
                                type="button"
                                onClick={() => setWaypoints(prev => prev.map(w => w.id === waypoint.id ? { ...w, useManualCoords: false, manualLat: undefined, manualLng: undefined, manualName: undefined } : w))}
                                className="text-[9px] text-primary/70 hover:text-primary transition-colors flex items-center gap-0.5"
                              >
                                <MapPin className="h-2.5 w-2.5" />
                                Search port instead
                              </button>
                            </div>
                          ) : (
                            <NavApiPortSearch
                              value={waypoint.port}
                              onSelect={(port) => handlePortSelect(waypoint.id, port)}
                              onClear={() => handlePortClear(waypoint.id)}
                              placeholder={`${getWaypointLabel(index, waypoints.length)} port...`}
                            />
                          )}
                        </div>

                        {/* Click-to-Fill: Map crosshair button */}
                        <button
                          onClick={() => {
                            if (isClickTarget) {
                              // Deactivate
                              setActiveClickTarget(null);
                            } else {
                              // Activate — also switch to manual coords mode if needed
                              if (!waypoint.useManualCoords && !waypoint.port) {
                                setWaypoints(prev => prev.map(w => w.id === waypoint.id ? { ...w, useManualCoords: true } : w));
                              }
                              setActiveClickTarget({
                                waypointId: waypoint.id,
                                waypointIndex: index,
                                label: getWaypointLabel(index, waypoints.length),
                              });
                            }
                          }}
                          className={cn(
                            "p-1 rounded transition-all shrink-0",
                            isClickTarget
                              ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/30 animate-pulse"
                              : "text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10"
                          )}
                          title={isClickTarget ? "Cancel map click" : "Click map to set coordinates"}
                        >
                          <Crosshair className="h-3.5 w-3.5" />
                        </button>

                        {/* Expand chevron (for legs with config OR destination port) */}
                        {(hasLegConfig || (isLastPort && showPortTimes)) && (
                          <button
                            onClick={() => toggleWaypointExpanded(waypoint.id)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                            title={isExpanded ? "Collapse" : isLastPort ? "Edit port times" : "Edit leg config"}
                          >
                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-180")} />
                          </button>
                        )}

                        {/* Remove Button */}
                        {waypoints.length > 2 && (
                          <button
                            onClick={() => handleRemoveWaypoint(waypoint.id)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* ── Collapsed Summary Line (shows when NOT expanded) ── */}
                      {hasLegConfig && !isExpanded && (
                        <button
                          onClick={() => toggleWaypointExpanded(waypoint.id)}
                          className="ml-9 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground py-0.5 pb-2 cursor-pointer transition-colors w-fit"
                        >
                          <span className={cn(
                            "px-1.5 py-px rounded-sm text-[9px] font-semibold uppercase tracking-wide",
                            waypoint.legConfig!.condition === "ballast"
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-amber-500/15 text-amber-400"
                          )}>
                            {waypoint.legConfig!.condition === "ballast" ? "BAL" : "LDN"}
                          </span>
                          <span>{waypoint.legConfig!.speed} kn</span>
                          <span className="text-border">·</span>
                          <span>{waypoint.legConfig!.dailyConsumption} MT/d</span>
                          {waypoint.legConfig!.maxDraft && (
                            <>
                              <span className="text-border">·</span>
                              <span>{waypoint.legConfig!.maxDraft}m</span>
                            </>
                          )}
                          {portTimeTotal > 0 && (
                            <>
                              <span className="text-border">·</span>
                              <span className="text-blue-400">{portTimeTotal}h port</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* ── Collapsed Summary for Destination Port (port time only) ── */}
                      {isLastPort && !hasLegConfig && portTimeTotal > 0 && !isExpanded && (
                        <button
                          onClick={() => toggleWaypointExpanded(waypoint.id)}
                          className="ml-9 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground py-0.5 pb-2 cursor-pointer transition-colors w-fit"
                        >
                          <span className="text-blue-400">{portTimeTotal}h port</span>
                        </button>
                      )}

                      {/* ── Expanded Leg Config (shows when expanded) ── */}
                      {hasLegConfig && isExpanded && (
                        <div className="ml-9 pl-3 border-l-2 border-primary/30 py-1.5 space-y-2 mb-2">
                          {/* Condition + Speed + Consumption */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex rounded-md border border-border overflow-hidden">
                              <button
                                type="button"
                                className={cn(
                                  "px-2 py-0.5 text-[10px] font-medium transition-colors",
                                  waypoint.legConfig!.condition === "ballast"
                                    ? "bg-blue-500 text-white"
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                )}
                                onClick={() => handleLegConfigChange(waypoint.id, "condition", "ballast")}
                              >Ballast</button>
                              <button
                                type="button"
                                className={cn(
                                  "px-2 py-0.5 text-[10px] font-medium transition-colors",
                                  waypoint.legConfig!.condition === "laden"
                                    ? "bg-amber-500 text-white"
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                )}
                                onClick={() => handleLegConfigChange(waypoint.id, "condition", "laden")}
                              >Laden</button>
                            </div>
                            <div className="flex items-center gap-1">
                              <Gauge className="h-3 w-3 text-muted-foreground" />
                              <Input type="number" min={1} max={30} step={0.5} value={waypoint.legConfig!.speed} onChange={(e) => handleLegConfigChange(waypoint.id, "speed", parseFloat(e.target.value) || 0)} className="h-6 w-14 text-xs text-center" />
                              <span className="text-[10px] text-muted-foreground">kn</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Fuel className="h-3 w-3 text-muted-foreground" />
                              <Input type="number" min={0} max={500} step={0.5} value={waypoint.legConfig!.dailyConsumption} onChange={(e) => handleLegConfigChange(waypoint.id, "dailyConsumption", parseFloat(e.target.value) || 0)} className="h-6 w-14 text-xs text-center" />
                              <span className="text-[10px] text-muted-foreground">MT/d</span>
                            </div>
                          </div>
                          {/* Draft + Manual Coords */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1">
                              <Anchor className="h-3 w-3 text-muted-foreground" />
                              <Input type="text" placeholder="Draft" value={waypoint.legConfig!.maxDraft} onChange={(e) => handleLegConfigChange(waypoint.id, "maxDraft", e.target.value)} className="h-6 w-14 text-xs text-center" />
                              <span className="text-[10px] text-muted-foreground">m</span>
                            </div>
                            {!waypoint.port && !waypoint.useManualCoords && (
                              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-muted-foreground px-1" onClick={() => setWaypoints(prev => prev.map(w => w.id === waypoint.id ? { ...w, useManualCoords: true } : w))}>
                                <Navigation className="h-2.5 w-2.5 mr-0.5" /> Lat/Lng
                              </Button>
                            )}
                            {/* Canal button */}
                            <Dialog open={passageDialogOpen && insertAfterIndex === index} onOpenChange={(open) => { setPassageDialogOpen(open); if (open) setInsertAfterIndex(index); }}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-600 px-1">
                                  <Ship className="h-2.5 w-2.5 mr-0.5" /> Canal/Strait
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="z-[60]">
                                <DialogHeader><DialogTitle>Add Canal or Strait</DialogTitle></DialogHeader>
                                <PassageSearchInput onSelect={handleAddPassage} />
                              </DialogContent>
                            </Dialog>
                          </div>
                          {/* Port Times (all non-origin ports) */}
                          {showPortTimes && (
                            <div className="space-y-1.5">
                              <span className="text-[9px] font-semibold text-blue-400 uppercase">Port Time</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground w-8">Wait</span>
                                <Input type="number" min={0} step={1} value={waypoint.portTimes?.waitingHours ?? 0} onChange={(e) => setWaypoints(prev => prev.map(w => w.id === waypoint.id ? { ...w, portTimes: { ...(w.portTimes || { waitingHours: 0, loadingHours: 0, idleHours: 0 }), waitingHours: parseFloat(e.target.value) || 0 } } : w))} className="h-6 flex-1 text-xs" />
                                <span className="text-[10px] text-muted-foreground">hrs</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground w-8">Berth</span>
                                <Input type="number" min={0} step={1} value={waypoint.portTimes?.loadingHours ?? 0} onChange={(e) => setWaypoints(prev => prev.map(w => w.id === waypoint.id ? { ...w, portTimes: { ...(w.portTimes || { waitingHours: 0, loadingHours: 0, idleHours: 0 }), loadingHours: parseFloat(e.target.value) || 0 } } : w))} className="h-6 flex-1 text-xs" />
                                <span className="text-[10px] text-muted-foreground">hrs</span>
                              </div>
                            </div>
                          )}
                          {/* ETD from previous leg */}
                          {isIntermediate && result?.legs[index - 1]?.etd && (
                            <div className="flex items-center gap-1 text-[10px]">
                              <Clock className="h-3 w-3 text-blue-500" />
                              <span className="font-medium text-blue-400">
                                ETD: {new Date(result.legs[index - 1].etd!).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Destination Port: Port Times (last port, no outgoing leg) ── */}
                      {isLastPort && !hasLegConfig && showPortTimes && isExpanded && (
                        <div className="ml-9 pl-3 border-l-2 border-red-500/30 py-1.5 space-y-2 mb-2">
                          <div className="space-y-1.5">
                            <span className="text-[9px] font-semibold text-blue-400 uppercase">Port Time</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground w-8">Wait</span>
                              <Input type="number" min={0} step={1} value={waypoint.portTimes?.waitingHours ?? 0} onChange={(e) => setWaypoints(prev => prev.map(w => w.id === waypoint.id ? { ...w, portTimes: { ...(w.portTimes || { waitingHours: 0, loadingHours: 0, idleHours: 0 }), waitingHours: parseFloat(e.target.value) || 0 } } : w))} className="h-6 flex-1 text-xs" />
                              <span className="text-[10px] text-muted-foreground">hrs</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground w-8">Berth</span>
                              <Input type="number" min={0} step={1} value={waypoint.portTimes?.loadingHours ?? 0} onChange={(e) => setWaypoints(prev => prev.map(w => w.id === waypoint.id ? { ...w, portTimes: { ...(w.portTimes || { waitingHours: 0, loadingHours: 0, idleHours: 0 }), loadingHours: parseFloat(e.target.value) || 0 } } : w))} className="h-6 flex-1 text-xs" />
                              <span className="text-[10px] text-muted-foreground">hrs</span>
                            </div>
                          </div>
                          {/* ETA for destination */}
                          {result?.legs[index - 1]?.eta && (
                            <div className="flex items-center gap-1 text-[10px]">
                              <Clock className="h-3 w-3 text-green-500" />
                              <span className="font-medium text-green-400">
                                ETA: {new Date(result.legs[index - 1].eta!).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add Port */}
                <div className="flex items-center gap-2 pt-2 ml-7">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddWaypoint(waypoints.length - 1)}
                    className="h-6 text-[10px] text-muted-foreground hover:text-primary px-2"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Port
                  </Button>
                </div>
              </div>

              {/* ── Calculate Button ── */}
              <div className="p-3 border-b border-border/30">
                <Button
                  onClick={handleCalculate}
                  disabled={!canCalculate || isCalculating}
                  className="w-full bg-green-600 hover:bg-green-500 text-white"
                  size="sm"
                >
                  {isCalculating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating...</>
                  ) : (
                    <><Navigation className="h-4 w-4 mr-2" />Calculate Voyage ({validWaypoints.length} ports)</>
                  )}
                </Button>
              </div>

              {/* ── Results Strip (compact KPIs) ── */}
              {result && (
                <>
                <div ref={resultsSectionRef}>
                  <ResultsStrip
                    totalDistanceNm={result.summary.totalDistanceNm}
                    estimatedDays={result.summary.estimatedDays}
                    totalLegs={result.legs.length}
                    ecaDistanceNm={result.summary.totalECADistanceNm}
                    hraDistanceNm={result.summary.totalHRADistanceNm}
                    warnings={result.warnings}
                  />
                </div>

                {/* ── Nearest Safe Port Analysis ── */}
                {safePortAnalysis && safePortAnalysis.mostRemotePoint.distanceNm > 0 && (
                  <div className="px-3 py-2 mx-2 mb-2 rounded-lg border border-border/50 bg-card/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Anchor className="h-3 w-3 text-cyan-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Nearest Safe Port</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Most remote point:</span>
                      <span className={cn(
                        "font-medium",
                        safePortAnalysis.mostRemotePoint.distanceNm > 500 ? "text-amber-400" : "text-emerald-400"
                      )}>
                        {safePortAnalysis.mostRemotePoint.nearestPort} — {safePortAnalysis.mostRemotePoint.distanceNm.toLocaleString()} NM
                      </span>
                    </div>
                    {safePortAnalysis.waypoints.filter(w => w.isRemote).length > 0 && (
                      <p className="text-[10px] text-amber-400/70 mt-1">
                        ⚠ {safePortAnalysis.waypoints.filter(w => w.isRemote).length} waypoint(s) are &gt;500 NM from any port
                      </p>
                    )}
                  </div>
                )}
                </>
              )}

              {/* ── Multi-Route Weather Comparison ── */}
              {(multiRouteComparison || isMultiRouteLoading) && result && (
                <div className="mx-2 mb-2">
                  <div className="px-3 py-2 rounded-lg border border-border/50 bg-card/50">
                    <div className="flex items-center gap-1.5 mb-2">
                      <CloudSun className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                        Weather Comparison (ECMWF+NOAA)
                      </span>
                      {isMultiRouteLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                    
                    {multiRouteComparison && multiRouteComparison.routes.length > 0 && (
                      <>
                        {/* Comparison Table */}
                        <div className="overflow-x-auto -mx-1">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="border-b border-border/30">
                                <th className="text-left py-1 px-1 font-medium text-muted-foreground">Route</th>
                                <th className="text-right py-1 px-1 font-medium text-muted-foreground">Delay</th>
                                <th className="text-right py-1 px-1 font-medium text-muted-foreground">Max Wave</th>
                                <th className="text-right py-1 px-1 font-medium text-muted-foreground">Fuel</th>
                                <th className="text-right py-1 px-1 font-medium text-muted-foreground">CO₂</th>
                                <th className="text-center py-1 px-1 font-medium text-muted-foreground">Risk</th>
                              </tr>
                            </thead>
                            <tbody>
                              {multiRouteComparison.routes.map((route) => {
                                const isRecommended = route.route_id === multiRouteComparison.recommended_route_id;
                                const riskColors: Record<string, string> = {
                                  low: "text-emerald-400 bg-emerald-400/10",
                                  moderate: "text-amber-400 bg-amber-400/10",
                                  high: "text-orange-400 bg-orange-400/10",
                                  extreme: "text-red-400 bg-red-400/10",
                                };
                                return (
                                  <tr 
                                    key={route.route_id}
                                    className={cn(
                                      "border-b border-border/20",
                                      isRecommended && "bg-blue-500/5"
                                    )}
                                  >
                                    <td className="py-1.5 px-1">
                                      <div className="flex items-center gap-1">
                                        {isRecommended && (
                                          <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold shrink-0">★</span>
                                        )}
                                        <span className={cn("truncate max-w-[100px]", isRecommended && "font-semibold text-blue-400")}>
                                          {route.label}
                                        </span>
                                      </div>
                                    </td>
                                    <td className={cn("text-right py-1.5 px-1 font-mono", route.weather_delay_hours > 3 ? "text-amber-400" : "text-emerald-400")}>
                                      +{route.weather_delay_hours}h
                                    </td>
                                    <td className={cn("text-right py-1.5 px-1 font-mono", route.max_wave_height_m >= 4 ? "text-orange-400" : "")}>
                                      {route.max_wave_height_m}m
                                    </td>
                                    <td className="text-right py-1.5 px-1 font-mono">
                                      {route.fuel_estimate_mt}
                                    </td>
                                    <td className="text-right py-1.5 px-1 font-mono text-muted-foreground">
                                      {route.co2_estimate_mt}
                                    </td>
                                    <td className="text-center py-1.5 px-1">
                                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", riskColors[route.risk_level] || "")}>
                                        {route.risk_level}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Recommendation */}
                        {multiRouteComparison.recommendation_reason && (
                          <div className="mt-2 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                            <div className="flex items-start gap-1.5">
                              <Zap className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
                              <p className="text-[10px] text-blue-300/90 leading-relaxed">
                                {multiRouteComparison.recommendation_reason}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Source badge */}
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[9px] text-muted-foreground/50">
                            {multiRouteComparison.routes[0]?.waypoint_count || 0} waypoints/route
                          </span>
                          <span className="text-[9px] text-blue-400/50 font-mono">
                            {multiRouteComparison.source}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Live Tracking Panel ── */}
              {result && (
                <div className="px-3 pb-2">
                  <LiveTrackingPanel
                    remainingWaypoints={
                      routeAlternatives.length > 0
                        ? routeAlternatives
                            .find(a => a.id === selectedAlternativeId || a.id === "primary")
                            ?.result?.legs?.flatMap(leg =>
                              leg.geometry?.coordinates?.map((c: number[]) => ({ lat: c[1], lon: c[0] })) || []
                            )
                            ?.filter((_: { lat: number; lon: number }, i: number, arr: { lat: number; lon: number }[]) => {
                              // Sample ~10 evenly spaced waypoints to avoid overloading
                              if (arr.length <= 10) return true;
                              const step = Math.floor(arr.length / 10);
                              return i % step === 0 || i === arr.length - 1;
                            }) || []
                        : waypoints
                            .filter(wp => {
                              const lat = wp.port?.latitude ?? wp.manualLat;
                              const lon = wp.port?.longitude ?? wp.manualLng;
                              return lat != null && lon != null;
                            })
                            .map(wp => ({
                              lat: wp.port?.latitude ?? wp.manualLat ?? 0,
                              lon: wp.port?.longitude ?? wp.manualLng ?? 0,
                            }))
                    }
                    plannedRouteCoords={
                      routeAlternatives.length > 0
                        ? routeAlternatives
                            .find(a => a.id === selectedAlternativeId || a.id === "primary")
                            ?.result?.legs?.flatMap(leg =>
                              leg.geometry?.coordinates?.map((c: number[]) => ({ lat: c[1], lon: c[0] })) || []
                            ) || []
                        : []
                    }
                    vesselName={selectedVessel?.name || "Vessel"}
                    vesselType={selectedVessel?.vesselType || "BULK_CARRIER"}
                    vesselDwt={effectiveDWT || 50000}
                    vesselSpeed={waypoints[0]?.legConfig?.speed || 12.5}
                    aisLat={aisPosition?.lat}
                    aisLon={aisPosition?.lng}
                    onVesselPositionChange={setVesselMapPosition}
                    onTrailUpdate={setVesselTrail}
                    onLiveStateChange={setIsLiveTracking}
                    vesselId={selectedVessel?.id}
                    originPort={waypoints[0]?.port?.displayName || ""}
                    destinationPort={waypoints[waypoints.length - 1]?.port?.displayName || ""}
                    routeDistanceNm={result?.summary?.totalDistanceNm}
                    routeResultJson={result}
                    orgSlug={orgSlug}
                    onNearbyVesselsUpdate={setNearbyMapVessels}
                  />
                </div>
              )}

              {/* ── Drawer Button Bar ── */}
              {result && (
                <DrawerButtonBar
                  activeDrawer={activeDrawer}
                  onOpenDrawer={handleOpenDrawer}
                  hasWeather={!!(weatherData || isWeatherLoading)}
                  hasOptimizer={!!selectedVessel}
                  hasAiInsight={routeAlternatives.length >= 1 || isAiLoading}
                  alertCount={complianceAlertCount}
                />
              )}
            </div>

            {/* ── Pinned Action Bar ── */}
            {result && (
              <div className="p-3 border-t border-border/50 bg-background/95 backdrop-blur">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setIsDownloadingPdf(true);
                      try {
                        const { generateRouteReport } = await import("@/lib/pdf/generate-route-report");
                        await generateRouteReport({
                          result: result as any,
                          waypoints: waypoints as any,
                          speed: effectiveSpeed,
                          vessel: selectedVessel ? {
                            name: selectedVessel.name,
                            dwt: selectedVessel.dwt,
                            vesselType: selectedVessel.vesselType,
                          } : null,
                          mapElementId: "voyage-map-container",
                          weather: weatherData || undefined,
                        });
                        toast.success("Report generated successfully!");
                      } catch (err) {
                        console.error(err);
                        toast.error("Failed to generate report");
                      } finally {
                        setIsDownloadingPdf(false);
                      }
                    }}
                    disabled={isDownloadingPdf}
                    className="w-full gap-1.5 h-8 text-xs"
                  >
                    {isDownloadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                    Generate Report
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                  Route calculated • {result.legs.length} leg{result.legs.length !== 1 ? "s" : ""} • {result.summary.totalDistanceNm.toLocaleString()} NM
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Resize Drag Handle (right edge) ── */}
        {panelOpen && (
          <div
            onMouseDown={handlePanelDragStart}
            className={cn(
              "absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-20 group",
              "hover:bg-primary/20 active:bg-primary/30 transition-colors"
            )}
            title="Drag to resize"
          >
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-1.5 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-0.5 h-0.5 rounded-full bg-primary/60" />
              <div className="w-0.5 h-0.5 rounded-full bg-primary/60" />
              <div className="w-0.5 h-0.5 rounded-full bg-primary/60" />
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          MOBILE: BOTTOM SHEET PANEL (<lg)
         ═══════════════════════════════════════════════════ */}
      <div
        className={cn(
          "lg:hidden absolute left-0 right-0 bottom-0 z-10",
          "bg-background/95 backdrop-blur-md border-t border-border/50 shadow-2xl",
          "transition-all duration-300 ease-in-out rounded-t-2xl",
          panelOpen ? "max-h-[70vh]" : "max-h-14"
        )}
      >
        {/* Handle bar + toggle */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex flex-col items-center pt-2 pb-1"
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Route className="h-3.5 w-3.5" />
            <span className="font-medium">Route Planner</span>
            {result && (
              <span className="text-[10px]">• {result.summary.totalDistanceNm.toLocaleString()} NM</span>
            )}
          </div>
        </button>

        {/* Mobile scrollable content */}
        {panelOpen && (
          <div className="overflow-y-auto max-h-[calc(70vh-3.5rem)] pb-safe">
            {/* Same content structure as desktop — simplified for mobile */}
            <div className="p-3 space-y-2 border-b border-border/30">
              {waypoints.map((waypoint, index) => (
                <div key={waypoint.id} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      index === 0 ? "bg-green-500 text-white"
                        : index === waypoints.length - 1 ? "bg-red-500 text-white"
                        : "bg-primary/20 text-primary"
                    )}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    {waypoint.type === "passage" && waypoint.passage ? (
                      <div className="flex items-center gap-1 px-2 py-1 border rounded-md bg-amber-50 dark:bg-amber-900/20">
                        <Ship className="h-3 w-3 text-amber-600" />
                        <span className="text-xs truncate">{waypoint.passage.displayName}</span>
                      </div>
                    ) : (
                      <NavApiPortSearch
                        value={waypoint.port}
                        onSelect={(port) => handlePortSelect(waypoint.id, port)}
                        onClear={() => handlePortClear(waypoint.id)}
                        placeholder={`${getWaypointLabel(index, waypoints.length)} port...`}
                      />
                    )}
                  </div>
                  {waypoints.length > 2 && (
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveWaypoint(waypoint.id)} className="h-6 w-6 shrink-0">
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Mobile Calculate */}
            <div className="p-3 border-b border-border/30">
              <Button
                onClick={handleCalculate}
                disabled={!canCalculate || isCalculating}
                className="w-full"
                size="sm"
              >
                {isCalculating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating...</>
                ) : (
                  <><Navigation className="h-4 w-4 mr-2" />Calculate ({validWaypoints.length} ports)</>
                )}
              </Button>
            </div>

            {/* Mobile Results */}
            {result && (
              <ResultsCard
                result={result}
                speed={effectiveSpeed}
                onSpeedChange={() => {}}
                isLoading={isCalculating}
                originCountryCode={validWaypoints[0]?.port?.portCode?.substring(0, 2)}
                destinationCountryCode={validWaypoints[validWaypoints.length - 1]?.port?.portCode?.substring(0, 2)}
                selectedVessel={selectedVessel}
                manualDWT={parseFloat(manualDWT) || 0}
                voyageMode={effectiveVoyageMode}
                canalTransitCost={canalCost ? parseFloat(canalCost) || 0 : 0}
                routeComparisonOptions={routeAlternatives.length >= 2 ? routeAlternatives.map(alt => ({
                  id: alt.id,
                  label: alt.label,
                  distanceNm: alt.totalDistanceNm,
                  estimatedDays: alt.totalDays,
                  ecaDistanceNm: alt.result.summary.totalECADistanceNm,
                  canalName: alt.canalName || undefined,
                })) : undefined}
                routeComparisonSelectedId={selectedAlternativeId}
                onRouteComparisonSelect={handleSelectAlternative}
                canalCost={canalCost}
                onCanalCostChange={setCanalCost}
                legConsumptions={legConsumptions}
              />
            )}

            {/* Mobile Actions */}
            {result && (
              <div className="p-3 flex gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={async () => {
                    setIsDownloadingPdf(true);
                    try {
                      const { generateRouteReport } = await import("@/lib/pdf/generate-route-report");
                      await generateRouteReport({
                        result: result as any,
                        waypoints: waypoints as any,
                        speed: effectiveSpeed,
                        vessel: selectedVessel ? { name: selectedVessel.name, dwt: selectedVessel.dwt, vesselType: selectedVessel.vesselType } : null,
                        mapElementId: "voyage-map-container",
                        weather: weatherData || undefined,
                      });
                      toast.success("Report generated!");
                    } catch { toast.error("Failed"); }
                    finally { setIsDownloadingPdf(false); }
                  }}
                  disabled={isDownloadingPdf}
                  className="w-full gap-1.5 h-8 text-xs"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Generate Report
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DETAIL DRAWERS (Sheet panels sliding from right)
         ═══════════════════════════════════════════════════════════ */}

      {/* 📊 Voyage Summary Drawer */}
      <Sheet open={activeDrawer === "summary"} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }}>
        <SheetContent side="right" className="w-[480px] max-w-[90vw] overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-3 border-b border-border/30">
            <SheetTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-blue-400" />
              Voyage Summary
            </SheetTitle>
            <SheetDescription>
              Distance breakdown, ETA, and zone analysis
            </SheetDescription>
          </SheetHeader>
          <div className="p-6">
            {result && (
              <ResultsCard
                result={result}
                speed={effectiveSpeed}
                onSpeedChange={() => {}}
                isLoading={isCalculating}
                originCountryCode={validWaypoints[0]?.port?.portCode?.substring(0, 2)}
                destinationCountryCode={validWaypoints[validWaypoints.length - 1]?.port?.portCode?.substring(0, 2)}
                selectedVessel={selectedVessel}
                manualDWT={parseFloat(manualDWT) || 0}
                voyageMode={effectiveVoyageMode}
                canalTransitCost={canalCost ? parseFloat(canalCost) || 0 : 0}
                routeComparisonOptions={routeAlternatives.length >= 2 ? routeAlternatives.map(alt => ({
                  id: alt.id,
                  label: alt.label,
                  distanceNm: alt.totalDistanceNm,
                  estimatedDays: alt.totalDays,
                  ecaDistanceNm: alt.result.summary.totalECADistanceNm,
                  canalName: alt.canalName || undefined,
                })) : undefined}
                routeComparisonSelectedId={selectedAlternativeId}
                onRouteComparisonSelect={handleSelectAlternative}
                canalCost={canalCost}
                onCanalCostChange={setCanalCost}
                legConsumptions={legConsumptions}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ⚖️ Compliance & Costs Drawer */}
      <Sheet open={activeDrawer === "compliance"} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }}>
        <SheetContent side="right" className="w-[520px] max-w-[90vw] overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-3 border-b border-border/30">
            <SheetTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-emerald-400" />
              Compliance & Cost Analysis
            </SheetTitle>
            <SheetDescription>
              Fuel strategy, ECA/SECA compliance, EU ETS, CII sensitivity, and financial estimate
            </SheetDescription>
          </SheetHeader>
          <div className="p-6">
            {result && (
              <ComplianceInsights
                totalDistanceNm={result.summary.totalDistanceNm}
                ecaDistanceNm={result.summary.totalECADistanceNm}
                hraDistanceNm={result.summary.totalHRADistanceNm}
                ecaZones={result.zones.eca}
                hraZones={result.zones.hra}
                originCountryCode={validWaypoints[0]?.port?.portCode?.substring(0, 2)}
                destinationCountryCode={validWaypoints[validWaypoints.length - 1]?.port?.portCode?.substring(0, 2)}
                speedKnots={effectiveSpeed}
                selectedVessel={selectedVessel ?? undefined}
                manualDWT={parseFloat(manualDWT) || 0}
                voyageMode={effectiveVoyageMode}
                canalTransitCost={canalCost ? parseFloat(canalCost) || 0 : 0}
                legConsumptions={legConsumptions}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 🦵 Leg Breakdown Drawer */}
      <Sheet open={activeDrawer === "legs"} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }}>
        <SheetContent side="right" className="w-[480px] max-w-[90vw] overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-3 border-b border-border/30">
            <SheetTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-purple-400" />
              Leg Breakdown
            </SheetTitle>
            <SheetDescription>
              Detailed per-leg distance, zones, and ECA analysis
            </SheetDescription>
          </SheetHeader>
          <div className="p-6 space-y-3">
            {result?.legs.map((leg) => (
              <div key={leg.legNumber} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-muted/30">
                  <div>
                    <div className="font-medium text-sm">
                      Leg {leg.legNumber}: {leg.from.name} → {leg.to.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {leg.distanceNm.toLocaleString()} NM
                      {leg.isFullECA && <span className="ml-2 text-red-500">(100% ECA)</span>}
                    </div>
                  </div>
                  <div className="w-20 h-2 bg-blue-500/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all"
                      style={{ width: `${leg.distanceNm > 0 ? Math.round((leg.ecaDistanceNm / leg.distanceNm) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <div className="px-3 pb-3 pt-2 space-y-1.5">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Open Sea:</span>{" "}
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {(leg.distanceNm - leg.ecaDistanceNm).toLocaleString()} NM
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">ECA:</span>{" "}
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {leg.ecaDistanceNm.toLocaleString()} NM
                      </span>
                    </div>
                  </div>
                  {leg.ecaZones.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Zones: {leg.ecaZones.join(", ")}
                    </div>
                  )}
                  {leg.hraDistanceNm > 0 && (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      {leg.hraDistanceNm.toLocaleString()} NM in HRA ({leg.hraZones.join(", ")})
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* 🌤 Weather Drawer */}
      <Sheet open={activeDrawer === "weather"} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }}>
        <SheetContent side="right" className="w-[480px] max-w-[90vw] overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-3 border-b border-border/30">
            <SheetTitle className="flex items-center gap-2">
              <CloudSun className="h-5 w-5 text-amber-400" />
              Weather Forecast
            </SheetTitle>
            <SheetDescription>
              Route weather conditions and sea state
            </SheetDescription>
          </SheetHeader>
          <div className="p-6">
            {isWeatherLoading && (
              <div className="text-sm text-muted-foreground flex items-center gap-2 py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading weather data...
              </div>
            )}
            {weatherError && <div className="text-sm text-destructive py-4">{weatherError}</div>}
            {weatherData && <WeatherForecastCard weather={weatherData} />}
            {!weatherData && !isWeatherLoading && !weatherError && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No weather data available. Calculate a route first.
              </div>
            )}
            {weatherData && (
              <Button variant="ghost" size="sm" className="mt-4 text-xs text-muted-foreground" onClick={clearWeather}>
                <X className="h-3 w-3 mr-1" /> Clear Weather Data
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ⚡ Voyage Optimizer Drawer */}
      <Sheet open={activeDrawer === "optimizer"} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }}>
        <SheetContent side="right" className="w-[520px] max-w-[90vw] overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-3 border-b border-border/30">
            <SheetTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-violet-400" />
              Smart Voyage Optimizer
            </SheetTitle>
            <SheetDescription>
              Test multiple speed and eco mode combinations for optimal voyage configuration
            </SheetDescription>
          </SheetHeader>
          <div className="p-6">
            {selectedVessel && result ? (
              <VoyageOptimizerPanel
                vesselProfile={{
                  ladenSpeed: selectedVessel!.ladenSpeed,
                  ballastSpeed: selectedVessel!.ballastSpeed,
                  ladenConsumption: selectedVessel!.ladenConsumption,
                  ballastConsumption: selectedVessel!.ballastConsumption,
                  portConsumption: 3,
                  dailyOpex: 8000,
                }}
                ballastDistanceNm={result!.summary.totalDistanceNm}
                ladenDistanceNm={result!.summary.totalDistanceNm}
                vesselDwt={selectedVessel!.dwt}
                vesselType={selectedVessel!.vesselType}
                weatherData={weatherData}
              />
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Select a vessel and calculate a route to use the optimizer.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 🧠 AI Route Recommendation Drawer */}
      <Sheet open={activeDrawer === "ai-insight"} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }}>
        <SheetContent side="right" className="w-[540px] max-w-[90vw] overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-3 border-b border-border/30">
            <SheetTitle className="flex items-center gap-2">
              <span className="text-rose-400">🧠</span>
              AI Route Recommendation
            </SheetTitle>
            <SheetDescription>
              GPT-4o analysis of safety, profitability, and compliance across route variants
            </SheetDescription>
          </SheetHeader>
          <div className="p-6">
            <AIRouteRecommendationPanel
              recommendation={aiRecommendation}
              routes={routeAlternatives.map(alt => ({
                id: alt.id,
                label: alt.label,
                distanceNm: alt.totalDistanceNm,
                estimatedDays: alt.totalDays,
                ecaDistanceNm: alt.result.summary.totalECADistanceNm,
                hraDistanceNm: alt.result.summary.totalHRADistanceNm,
                canalTollUsd: alt.intel?.canalTolls.totalUsd || 0,
                warRiskPremiumUsd: alt.intel?.warRisk.premiumUsd || 0,
                totalAdditionalCostsUsd: alt.intel?.totalAdditionalCostsUsd || 0,
                canals: alt.canalName ? [alt.canalName] : [],
                hraZones: alt.result.zones.hra || [],
                coordinates: alt.result.legs.map(leg => leg.geometry.coordinates),
              }))}
              isLoading={isAiLoading}
              error={aiError}
              onSelectRoute={(routeId) => {
                handleSelectAlternative(routeId);
                handleCloseDrawer();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}

