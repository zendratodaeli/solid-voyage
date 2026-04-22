"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ship, Radio, Square, MapPin, Navigation, Clock, Gauge, AlertTriangle, Users } from "lucide-react";
import type { TrailPoint, VesselMapPosition } from "@/components/route-planner/VoyageMap";
import { toast } from "sonner";

// Dynamic import for VoyageMap (no SSR)
const VoyageMap = dynamic(
  () => import("@/components/route-planner/VoyageMap").then(mod => mod.VoyageMap),
  { ssr: false }
);

interface NearbyVessel {
  name: string;
  mmsi: string;
  shipType: string;
  flag?: string;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  distanceNm: number;
  objectType: string;
}

interface SessionData {
  id: string;
  vesselName: string;
  vesselType: string;
  vesselDwt: number;
  vesselSpeed: number;
  originPort: string;
  destinationPort: string;
  routeDistanceNm: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  plannedRouteJson: unknown;
  weatherDataJson: unknown;
  complianceJson: unknown;
  trackPoints: Array<{
    id: string;
    lat: number;
    lon: number;
    speed: number | null;
    deviationNm: number;
    deviationStatus: string;
    timestamp: string;
  }>;
  nearbyObjects: NearbyVessel[];
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function LiveTrackingMonitorClient({
  session: initialSession,
}: {
  session: SessionData;
}) {
  const [session, setSession] = useState(initialSession);
  const [isLive, setIsLive] = useState(session.status === "active");
  const [vesselPosition, setVesselPosition] = useState<VesselMapPosition | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [nearbyVessels, setNearbyVessels] = useState<NearbyVessel[]>(session.nearbyObjects || []);
  const [nearbyMapVessels, setNearbyMapVessels] = useState<VesselMapPosition[]>([]);
  const mockIndexRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trailBufferRef = useRef<TrailPoint[]>([]);

  // Parse planned route from JSON
  const plannedRouteCoords = (() => {
    try {
      const routeData = session.plannedRouteJson as { legs?: Array<{ geometry?: { coordinates?: number[][] } }> };
      if (!routeData?.legs) return [];
      return routeData.legs.flatMap(leg =>
        leg.geometry?.coordinates?.map(c => ({ lat: c[1], lon: c[0] })) || []
      );
    } catch {
      return [];
    }
  })();

  // Build VoyageMap result prop from planned route
  const mapResult = (() => {
    try {
      const routeData = session.plannedRouteJson as { legs?: Array<{ geometry?: { coordinates?: number[][] }; from?: { name: string }; to?: { name: string }; distanceNm?: number }> };
      if (!routeData?.legs) return null;
      return {
        summary: { totalDistanceNm: session.routeDistanceNm },
        legs: routeData.legs.map(leg => ({
          geometry: {
            coordinates: (leg.geometry?.coordinates || []) as [number, number][],
            ecaSegments: [] as [number, number][][],
            hraSegments: [] as [number, number][][],
          },
          from: { name: leg.from?.name || "" },
          to: { name: leg.to?.name || "" },
          distanceNm: leg.distanceNm || 0,
        })),
      };
    } catch {
      return null;
    }
  })();

  // Haversine
  const haversineNm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // Compute deviation
  const computeDeviation = useCallback((lat: number, lon: number): TrailPoint["status"] => {
    if (plannedRouteCoords.length === 0) return "on-route";
    let minDist = Infinity;
    for (const point of plannedRouteCoords) {
      const dist = haversineNm(lat, lon, point.lat, point.lon);
      if (dist < minDist) minDist = dist;
    }
    return minDist < 5 ? "on-route" : minDist < 15 ? "minor-deviation" : "off-route";
  }, [plannedRouteCoords]);

  // Load existing track points as trail
  useEffect(() => {
    if (session.trackPoints.length > 0) {
      const existingTrail = session.trackPoints.map(tp => ({
        lat: tp.lat,
        lon: tp.lon,
        timestamp: tp.timestamp,
        deviationNm: tp.deviationNm,
        status: tp.deviationStatus as TrailPoint["status"],
      }));
      setTrail(existingTrail);
      const lastPoint = session.trackPoints[session.trackPoints.length - 1];
      setVesselPosition({
        lat: lastPoint.lat,
        lon: lastPoint.lon,
        name: session.vesselName,
        speed: lastPoint.speed || session.vesselSpeed,
      });
      mockIndexRef.current = Math.floor(
        (lastPoint.lat / (plannedRouteCoords[plannedRouteCoords.length - 1]?.lat || 1)) * plannedRouteCoords.length
      );
    } else if (plannedRouteCoords.length > 0) {
      setVesselPosition({
        lat: plannedRouteCoords[0].lat,
        lon: plannedRouteCoords[0].lon,
        name: session.vesselName,
        speed: session.vesselSpeed,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch nearby vessels
  const fetchNearby = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/ais/area?lat=${lat}&lon=${lon}&radius=20`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setNearbyVessels(data.data);
          setNearbyMapVessels(data.data.map((v: NearbyVessel) => ({
            lat: v.lat,
            lon: v.lon,
            name: v.name,
            speed: v.speed,
            heading: v.heading,
          })));
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Save track points to DB periodically
  const flushTrailToDb = useCallback(async () => {
    if (trailBufferRef.current.length === 0) return;
    const points = [...trailBufferRef.current];
    trailBufferRef.current = [];
    try {
      await fetch(`/api/live-voyages/${session.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackPoints: points.map(p => ({
            lat: p.lat,
            lon: p.lon,
            speed: vesselPosition?.speed,
            deviationNm: p.deviationNm,
            deviationStatus: p.status,
          })),
          nearbyObjects: nearbyVessels.map(v => ({
            ...v,
            objectType: v.objectType || "vessel",
          })),
        }),
      });
    } catch (err) {
      console.warn("[Monitor] Failed to save track points:", err);
    }
  }, [session.id, vesselPosition?.speed, nearbyVessels]);

  // Mock AIS simulation + nearby polling
  useEffect(() => {
    if (!isLive || plannedRouteCoords.length === 0) return;

    const step = Math.max(1, Math.floor(plannedRouteCoords.length / 100));
    const destLat = plannedRouteCoords[plannedRouteCoords.length - 1]?.lat || 0;
    const destLon = plannedRouteCoords[plannedRouteCoords.length - 1]?.lon || 0;

    pollIntervalRef.current = setInterval(async () => {
      mockIndexRef.current += step;
      if (mockIndexRef.current >= plannedRouteCoords.length) {
        mockIndexRef.current = plannedRouteCoords.length - 1;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        // Auto-complete
        setIsLive(false);
        await fetch(`/api/live-voyages/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        await flushTrailToDb();
        toast.success(`🏁 ${session.vesselName} arrived at ${session.destinationPort}!`);
        return;
      }

      const nextPos = plannedRouteCoords[mockIndexRef.current];
      const jLat = nextPos.lat + (Math.random() - 0.5) * 0.04;
      const jLon = nextPos.lon + (Math.random() - 0.5) * 0.04;

      setVesselPosition({ lat: jLat, lon: jLon, name: session.vesselName, speed: session.vesselSpeed });

      const status = computeDeviation(jLat, jLon);
      const minDist = plannedRouteCoords.reduce((min, p) => {
        const d = haversineNm(jLat, jLon, p.lat, p.lon);
        return d < min ? d : min;
      }, Infinity);

      const point: TrailPoint = {
        lat: jLat, lon: jLon,
        timestamp: new Date().toISOString(),
        deviationNm: minDist,
        status,
      };

      setTrail(prev => [...prev, point]);
      trailBufferRef.current.push(point);

      // Check arrival (within 5nm of destination)
      const distToDest = haversineNm(jLat, jLon, destLat, destLon);
      if (distToDest < 5) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setIsLive(false);
        await fetch(`/api/live-voyages/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        await flushTrailToDb();
        toast.success(`🏁 ${session.vesselName} arrived at ${session.destinationPort}!`);
        return;
      }

      // Fetch nearby every 5 ticks (~15s)
      if (mockIndexRef.current % (step * 5) === 0) {
        fetchNearby(jLat, jLon);
      }

      // Flush to DB every 10 ticks (~30s)
      if (mockIndexRef.current % (step * 10) === 0) {
        flushTrailToDb();
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stats
  const onRoutePoints = trail.filter(t => t.status === "on-route").length;
  const deviatedPoints = trail.filter(t => t.status !== "on-route").length;
  const adherencePercent = trail.length > 0 ? Math.round((onRoutePoints / trail.length) * 100) : 100;
  const maxDeviation = trail.length > 0 ? Math.max(...trail.map(t => t.deviationNm)) : 0;

  const handleStop = async () => {
    setIsLive(false);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    await flushTrailToDb();
    await fetch(`/api/live-voyages/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    toast.info("Live tracking paused");
  };

  const handleResume = () => {
    setIsLive(true);
    toast.success("Live tracking resumed");
  };

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ─── Side Panel ─── */}
      <div className="w-[380px] flex-shrink-0 overflow-y-auto border-r border-border/50 bg-card">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ship className="h-5 w-5 text-blue-400" />
              <h1 className="font-semibold text-sm">{session.vesselName}</h1>
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
            </div>
            <Badge variant={isLive ? "destructive" : session.status === "completed" ? "default" : "secondary"} className="text-[10px]">
              {isLive ? "LIVE" : session.status.toUpperCase()}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {session.originPort} → {session.destinationPort}
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Controls */}
          <div className="flex gap-2">
            {isLive ? (
              <Button size="sm" variant="destructive" className="flex-1 h-8 text-xs gap-1.5" onClick={handleStop}>
                <Square className="h-3 w-3" /> Stop Tracking
              </Button>
            ) : session.status !== "completed" ? (
              <Button size="sm" className="flex-1 h-8 text-xs gap-1.5" onClick={handleResume}>
                <Radio className="h-3 w-3" /> Resume Live
              </Button>
            ) : null}
          </div>

          {/* Voyage Info */}
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground">Voyage Details</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Distance</span>
                <span className="font-mono">{Math.round(session.routeDistanceNm).toLocaleString()} NM</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" /> Speed</span>
                <span className="font-mono">{session.vesselSpeed} kn</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Started</span>
                <span className="font-mono">{new Date(session.startedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {session.completedAt && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-mono">{new Date(session.completedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Route Adherence */}
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <Navigation className="h-3 w-3" /> Route Adherence
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className={`text-2xl font-bold ${adherencePercent > 90 ? "text-emerald-400" : adherencePercent > 70 ? "text-amber-400" : "text-red-400"}`}>
                  {adherencePercent}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {onRoutePoints} on-route / {deviatedPoints} deviated
                </div>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${adherencePercent > 90 ? "bg-emerald-500" : adherencePercent > 70 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${adherencePercent}%` }}
                />
              </div>
              {maxDeviation > 0 && (
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span>Max deviation</span>
                  <span className="font-mono">{maxDeviation.toFixed(1)} NM</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current Position */}
          {vesselPosition && (
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-muted-foreground">Current Position</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Latitude</span>
                  <span className="font-mono">{vesselPosition.lat.toFixed(4)}°</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Longitude</span>
                  <span className="font-mono">{vesselPosition.lon.toFixed(4)}°</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Track Points</span>
                  <span className="font-mono">{trail.length}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Nearby Vessels */}
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> Nearby Traffic ({nearbyVessels.length})
                <Badge variant="outline" className="ml-auto text-[9px]">20 NM</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 max-h-[200px] overflow-y-auto">
              {nearbyVessels.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">No vessels detected nearby</p>
              ) : (
                <div className="space-y-1.5">
                  {nearbyVessels.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] py-1 border-b border-border/20 last:border-0">
                      <div>
                        <div className="font-medium text-xs">{v.name}</div>
                        <div className="text-muted-foreground">{v.shipType} · {v.flag}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">{v.distanceNm.toFixed(1)} NM</div>
                        <div className="text-muted-foreground">{v.speed} kn</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Warnings */}
          {trail.some(t => t.status === "off-route") && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-medium text-red-400">Route Deviation Detected</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Vessel deviated &gt;15 NM from planned route at {trail.filter(t => t.status === "off-route").length} positions.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── Map ─── */}
      <div className="flex-1 relative">
        <VoyageMap
          waypoints={[
            { id: "origin", port: { id: "o", name: session.originPort, latitude: plannedRouteCoords[0]?.lat || 0, longitude: plannedRouteCoords[0]?.lon || 0 }, order: 0 },
            { id: "dest", port: { id: "d", name: session.destinationPort, latitude: plannedRouteCoords[plannedRouteCoords.length - 1]?.lat || 0, longitude: plannedRouteCoords[plannedRouteCoords.length - 1]?.lon || 0 }, order: 1 },
          ]}
          result={mapResult}
          className="h-full w-full"
          vesselPosition={vesselPosition}
          vesselTrail={trail}
          isLiveTracking={isLive}
          nearbyVessels={nearbyMapVessels}
        />
      </div>
    </div>
  );
}
