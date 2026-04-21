"use client";

/**
 * LiveTrackingPanel
 *
 * Enterprise-grade live vessel tracking with dynamic re-routing.
 * Shows current vessel position, weather along remaining route,
 * and actionable advisories (proceed / slow_down / deviate / shelter).
 *
 * Auto-refreshes weather analysis every 15 minutes.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Navigation,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Shield,
  Clock,
  Anchor,
  Wind,
  Waves,
  Radio,
  RefreshCw,
  Power,
  Gauge,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════

interface RerouteAdvisory {
  type: "proceed" | "slow_down" | "deviate" | "shelter";
  severity: "info" | "warning" | "critical";
  message: string;
  affected_waypoint_idx: number;
  wave_height_m: number;
  wind_speed_knots: number;
  beaufort: number;
}

interface WaypointForecast {
  lat: number;
  lon: number;
  eta: string;
  hours_from_departure: number;
  distance_from_departure_nm: number;
  wave_height_m: number;
  wind_speed_knots: number;
  beaufort: number;
  pressure_hpa: number;
  navigability: string;
}

interface RerouteResponse {
  success: boolean;
  current_position: { lat: number; lon: number };
  remaining_distance_nm: number;
  original_hours_remaining: number;
  weather_adjusted_hours: number;
  new_delay_hours: number;
  advisories: RerouteAdvisory[];
  overall_recommendation: string;
  risk_level: "low" | "moderate" | "high" | "extreme";
  waypoint_forecasts: WaypointForecast[];
  source: string;
  cycle: string | null;
}

/** Trail point for map visualization */
export interface TrailPoint {
  lat: number;
  lon: number;
  timestamp: string;
  deviationNm: number;
  status: "on-route" | "minor-deviation" | "off-route";
}

interface LiveTrackingPanelProps {
  /** Remaining waypoints from route planner */
  remainingWaypoints?: Array<{ lat: number; lon: number }>;
  /** Full planned route coordinates for deviation comparison */
  plannedRouteCoords?: Array<{ lat: number; lon: number }>;
  /** Vessel info */
  vesselName?: string;
  vesselType?: string;
  vesselDwt?: number;
  vesselSpeed?: number;
  /** AIS position if available from vessel selection */
  aisLat?: number | null;
  aisLon?: number | null;
  /** Callback when position updates */
  onPositionUpdate?: (lat: number, lon: number) => void;
  /** Callback to send vessel position to map */
  onVesselPositionChange?: (position: { lat: number; lon: number; name: string; speed: number } | null) => void;
  /** Callback to send trail data to map */
  onTrailUpdate?: (trail: TrailPoint[]) => void;
  /** Callback to notify parent of live tracking state */
  onLiveStateChange?: (isLive: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const RISK_CONFIG = {
  low: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle, label: "LOW RISK" },
  moderate: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: AlertTriangle, label: "MODERATE" },
  high: { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", icon: AlertTriangle, label: "HIGH RISK" },
  extreme: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: Shield, label: "EXTREME" },
} as const;

const ADVISORY_CONFIG = {
  proceed: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  slow_down: { icon: Gauge, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  deviate: { icon: Navigation, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  shelter: { icon: Anchor, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
} as const;

const NAV_COLORS = {
  open: "text-emerald-400",
  moderate: "text-amber-400",
  restricted: "text-orange-400",
  dangerous: "text-red-400",
} as const;

// ═══════════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function LiveTrackingPanel({
  remainingWaypoints = [],
  plannedRouteCoords = [],
  vesselName = "Unknown Vessel",
  vesselType = "BULK_CARRIER",
  vesselDwt = 50000,
  vesselSpeed = 12.5,
  aisLat,
  aisLon,
  onPositionUpdate,
  onVesselPositionChange,
  onTrailUpdate,
  onLiveStateChange,
}: LiveTrackingPanelProps) {
  // State
  const [isLive, setIsLive] = useState(false);
  const [currentLat, setCurrentLat] = useState("");
  const [currentLon, setCurrentLon] = useState("");
  const [rerouteData, setRerouteData] = useState<RerouteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [expandedWaypoints, setExpandedWaypoints] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoFilledRef = useRef(false);
  const [positionTrail, setPositionTrail] = useState<TrailPoint[]>([]);
  const mockIndexRef = useRef(0);
  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Haversine distance (nm) ──
  const haversineNm = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3440.065; // Earth radius in nautical miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }, []);

  // ── Compute deviation from planned route ──
  const computeDeviation = useCallback((lat: number, lon: number): { deviationNm: number; status: TrailPoint["status"] } => {
    if (plannedRouteCoords.length === 0) return { deviationNm: 0, status: "on-route" };
    
    // Find nearest point on planned route
    let minDist = Infinity;
    for (const point of plannedRouteCoords) {
      const dist = haversineNm(lat, lon, point.lat, point.lon);
      if (dist < minDist) minDist = dist;
    }
    
    // Thresholds: <5nm = on-route, 5-15nm = minor, >15nm = off-route
    const status: TrailPoint["status"] = minDist < 5 ? "on-route" : minDist < 15 ? "minor-deviation" : "off-route";
    return { deviationNm: minDist, status };
  }, [plannedRouteCoords, haversineNm]);

  // ── Add position to trail ──
  const addToTrail = useCallback((lat: number, lon: number) => {
    const { deviationNm, status } = computeDeviation(lat, lon);
    const point: TrailPoint = {
      lat, lon,
      timestamp: new Date().toISOString(),
      deviationNm,
      status,
    };
    setPositionTrail(prev => {
      const updated = [...prev, point];
      onTrailUpdate?.(updated);
      return updated;
    });
    onVesselPositionChange?.({ lat, lon, name: vesselName, speed: vesselSpeed });
  }, [computeDeviation, onTrailUpdate, onVesselPositionChange, vesselName, vesselSpeed]);

  // ── Auto-fill from AIS position ──
  useEffect(() => {
    if (aisLat != null && aisLon != null && !autoFilledRef.current) {
      setCurrentLat(aisLat.toFixed(3));
      setCurrentLon(aisLon.toFixed(3));
      autoFilledRef.current = true;
      // Show vessel on map immediately
      onVesselPositionChange?.({ lat: aisLat, lon: aisLon, name: vesselName, speed: vesselSpeed });
    }
  }, [aisLat, aisLon, vesselName, vesselSpeed, onVesselPositionChange]);

  // ── Parse coordinate (handles European comma locale) ──
  const parseCoord = (val: string): number => {
    return parseFloat(val.replace(",", "."));
  };

  // ── Validate coordinates ──
  const hasValidCoords = currentLat.trim() !== "" && currentLon.trim() !== "" &&
    !isNaN(parseCoord(currentLat)) && !isNaN(parseCoord(currentLon));

  // ── Fetch reroute analysis ──
  const fetchReroute = useCallback(async () => {
    const lat = parseCoord(currentLat);
    const lon = parseCoord(currentLon);
    if (isNaN(lat) || isNaN(lon) || remainingWaypoints.length === 0) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/weather-routing/reroute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_lat: lat,
          current_lon: lon,
          remaining_waypoints: remainingWaypoints,
          vessel_speed_knots: vesselSpeed,
          vessel_type: vesselType,
          vessel_dwt: vesselDwt,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: RerouteResponse = await res.json();
      setRerouteData(data);
      setLastChecked(new Date());
      onPositionUpdate?.(lat, lon);

      // Alert on dangerous conditions
      if (data.risk_level === "extreme" || data.risk_level === "high") {
        toast.error(`⚠️ ${data.overall_recommendation}`, { duration: 8000 });
      }
    } catch (err) {
      console.warn("[LiveTracking] Reroute analysis unavailable:", err);
      // Only show toast for manual checks, not during auto-refresh
      if (!isLive) {
        toast.error("Failed to analyze route weather");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentLat, currentLon, remainingWaypoints, vesselSpeed, vesselType, vesselDwt, onPositionUpdate]);

  // ── Auto-refresh when live ──
  useEffect(() => {
    if (isLive) {
      fetchReroute();
      intervalRef.current = setInterval(fetchReroute, REFRESH_INTERVAL_MS);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLive, fetchReroute]);

  // ── Mock AIS Simulation (demo mode) ──
  // Moves vessel along planned route coords every 3s (compressed 5-min intervals)
  // When live NavAPI AIS tokens are available, replace this with real AIS polling
  useEffect(() => {
    if (isLive && plannedRouteCoords.length > 0) {
      // Add starting position to trail
      const lat = parseCoord(currentLat);
      const lon = parseCoord(currentLon);
      if (!isNaN(lat) && !isNaN(lon)) {
        addToTrail(lat, lon);
      }

      // Start mock movement along route (every 3 seconds for demo)
      const MOCK_INTERVAL_MS = 3000; // 3s = simulates 5-min AIS
      const step = Math.max(1, Math.floor(plannedRouteCoords.length / 100)); // ~100 positions total

      mockIntervalRef.current = setInterval(() => {
        mockIndexRef.current += step;
        if (mockIndexRef.current >= plannedRouteCoords.length) {
          // Reached destination
          mockIndexRef.current = plannedRouteCoords.length - 1;
          if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);
          toast.success("🏁 Vessel arrived at destination!");
          return;
        }

        const nextPos = plannedRouteCoords[mockIndexRef.current];
        // Add slight random deviation for realism (±0.02°)
        const jitterLat = nextPos.lat + (Math.random() - 0.5) * 0.04;
        const jitterLon = nextPos.lon + (Math.random() - 0.5) * 0.04;

        setCurrentLat(jitterLat.toFixed(3));
        setCurrentLon(jitterLon.toFixed(3));
        addToTrail(jitterLat, jitterLon);
      }, MOCK_INTERVAL_MS);
    }

    return () => {
      if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);
    };
  }, [isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify parent of live state ──
  useEffect(() => {
    onLiveStateChange?.(isLive);
    if (!isLive) {
      // Clear trail when stopping
      mockIndexRef.current = 0;
    }
  }, [isLive, onLiveStateChange]);

  // ── Format time ──
  const formatEta = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
      " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (hours: number) => {
    const d = Math.floor(hours / 24);
    const h = Math.round(hours % 24);
    return d > 0 ? `${d}d ${h}h` : `${h}h`;
  };

  const risk = rerouteData ? RISK_CONFIG[rerouteData.risk_level] : null;

  return (
    <Card className="border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Radio className={cn("h-5 w-5", isLive ? "text-red-500 animate-pulse" : "text-muted-foreground")} />
            Live Tracking
            {isLive && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {lastChecked && (
              <span className="text-[10px] text-muted-foreground">
                {lastChecked.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC
              </span>
            )}
            <Button
              size="sm"
              variant={isLive ? "destructive" : "default"}
              className="h-7 text-xs gap-1.5"
              onClick={() => setIsLive(!isLive)}
              disabled={!hasValidCoords || remainingWaypoints.length === 0}
            >
              <Power className="h-3.5 w-3.5" />
              {isLive ? "Stop" : "Start"} Live
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Position Input ── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Current Latitude</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="35.500"
              value={currentLat}
              onChange={(e) => setCurrentLat(e.target.value)}
              className="h-8 text-sm font-mono"
              disabled={isLive}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Current Longitude</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="-40.200"
              value={currentLon}
              onChange={(e) => setCurrentLon(e.target.value)}
              className="h-8 text-sm font-mono"
              disabled={isLive}
            />
          </div>
        </div>

        {/* Manual check button */}
        {!isLive && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs gap-1.5"
            onClick={fetchReroute}
            disabled={isLoading || !hasValidCoords || remainingWaypoints.length === 0}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            {isLoading ? "Analyzing..." : "Check Route Weather Now"}
          </Button>
        )}

        {/* ── No waypoints warning ── */}
        {remainingWaypoints.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Navigation className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Calculate a route first to enable live tracking</p>
          </div>
        )}

        {/* ── Results ── */}
        {rerouteData && risk && (
          <div className="space-y-3">

            {/* Risk banner */}
            <div className={cn(
              "rounded-lg border p-3",
              risk.bg, risk.border
            )}>
              <div className="flex items-center gap-2 mb-1.5">
                <risk.icon className={cn("h-4 w-4", risk.color)} />
                <span className={cn("text-xs font-bold uppercase tracking-wider", risk.color)}>
                  {risk.label}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {rerouteData.overall_recommendation}
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Remaining</div>
                <div className="text-sm font-bold tabular-nums">{rerouteData.remaining_distance_nm.toLocaleString()} nm</div>
              </div>
              <div className="rounded-lg bg-muted/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">ETA (calm)</div>
                <div className="text-sm font-bold tabular-nums">{formatDuration(rerouteData.original_hours_remaining)}</div>
              </div>
              <div className="rounded-lg bg-muted/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Wx Delay</div>
                <div className={cn(
                  "text-sm font-bold tabular-nums",
                  rerouteData.new_delay_hours > 4 ? "text-orange-400" :
                  rerouteData.new_delay_hours > 0 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {rerouteData.new_delay_hours > 0 ? `+${rerouteData.new_delay_hours}h` : "None"}
                </div>
              </div>
            </div>

            {/* Advisories */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Advisories ({rerouteData.advisories.length})
              </div>
              {rerouteData.advisories.map((adv, i) => {
                const cfg = ADVISORY_CONFIG[adv.type] || ADVISORY_CONFIG.proceed;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border p-2.5 flex items-start gap-2.5",
                      cfg.bg, cfg.border
                    )}
                  >
                    <cfg.icon className={cn("h-4 w-4 mt-0.5 shrink-0", cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground leading-relaxed">
                        {adv.message}
                      </p>
                      {(adv.wave_height_m > 0 || adv.wind_speed_knots > 0) && (
                        <div className="flex items-center gap-3 mt-1">
                          {adv.wave_height_m > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Waves className="h-3 w-3" /> {adv.wave_height_m.toFixed(1)}m
                            </span>
                          )}
                          {adv.wind_speed_knots > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Wind className="h-3 w-3" /> {adv.wind_speed_knots.toFixed(0)}kn
                            </span>
                          )}
                          {adv.beaufort > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              BF{adv.beaufort}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Waypoint forecasts (expandable) */}
            {rerouteData.waypoint_forecasts.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedWaypoints(!expandedWaypoints)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
                >
                  {expandedWaypoints ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Waypoint Weather ({rerouteData.waypoint_forecasts.length})
                </button>

                {expandedWaypoints && (
                  <div className="mt-2 space-y-1.5">
                    {rerouteData.waypoint_forecasts.map((wp, i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-muted/20 border border-[hsl(var(--border))]/50 p-2 flex items-center gap-3 text-xs"
                      >
                        <div className="flex items-center gap-1.5 shrink-0 w-16">
                          <MapPin className={cn("h-3 w-3", NAV_COLORS[wp.navigability as keyof typeof NAV_COLORS] || "text-muted-foreground")} />
                          <span className="font-mono text-muted-foreground">WP{i}</span>
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <span className="font-mono tabular-nums text-foreground">
                            {wp.lat.toFixed(1)}°, {wp.lon.toFixed(1)}°
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground tabular-nums">
                            {formatEta(wp.eta)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {wp.wind_speed_knots > 0 && (
                            <span className="flex items-center gap-0.5 text-muted-foreground">
                              <Wind className="h-3 w-3" /> {wp.wind_speed_knots.toFixed(0)}kn
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] px-1.5 py-0",
                              NAV_COLORS[wp.navigability as keyof typeof NAV_COLORS] || "text-muted-foreground"
                            )}
                          >
                            {wp.navigability}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Source + auto-refresh indicator */}
            <div className="flex items-center justify-between pt-1 border-t border-[hsl(var(--border))]/30">
              <span className="text-[10px] text-muted-foreground">
                {rerouteData.source} · Cycle {rerouteData.cycle ? new Date(rerouteData.cycle).toISOString().slice(0, 13) + "Z" : "—"}
              </span>
              {isLive && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-400" />
                  Auto-refresh: 15 min
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
