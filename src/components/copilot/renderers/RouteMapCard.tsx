"use client";

/**
 * RouteMapCard — Rich route planning visualization for copilot.
 *
 * Displays an interactive map with route polyline, SECA zone coloring,
 * origin/destination markers, distance breakdown, and duration estimate.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Navigation,
  MapPin,
  Clock,
  Fuel,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Anchor,
  Ship,
  Globe,
  Waves,
  Route,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgPath } from "@/hooks/useOrgPath";

// Dynamic map import
const CopilotMapWrapper = dynamic(
  () => import("../CopilotMapWrapper"),
  { ssr: false, loading: () => <div className="h-[300px] rounded-xl bg-[#1a1a2e] animate-pulse" /> }
);

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const ZONE_STYLES: Record<string, { color: string; label: string; icon: any; dash?: string }> = {
  open_sea: { color: "#3b82f6", label: "Open Sea", icon: Navigation },
  seca: { color: "#f59e0b", label: "SECA Zone", icon: AlertTriangle, dash: "8, 4" },
  eca: { color: "#f59e0b", label: "ECA Zone", icon: AlertTriangle, dash: "8, 4" },
  canal: { color: "#a855f7", label: "Canal", icon: Anchor },
  hra: { color: "#ef4444", label: "High Risk Area", icon: AlertTriangle },
};

// ═══════════════════════════════════════════════════════════════════
// MAIN ROUTE CARD
// ═══════════════════════════════════════════════════════════════════

export function RouteMapCard({ result }: { result: any }) {
  const [showLegs, setShowLegs] = useState(false);
  const { orgPath } = useOrgPath();

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
        <Route className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-400">{result.error}</span>
      </div>
    );
  }

  const totalDist = result.totalDistanceNm ?? 0;
  const secaDist = result.secaDistanceNm ?? 0;
  const canalDist = result.canalDistanceNm ?? 0;
  const openSeaDist = totalDist - secaDist - canalDist;
  const duration = result.estimatedDuration ?? result.duration;
  const waypoints = result.waypoints || [];
  const legs = result.legs || [];
  const originPort = result.originPort ?? result.from ?? "";
  const destPort = result.destinationPort ?? result.to ?? "";
  const draftWarning = result.draftWarning;
  const speed = result.speed ?? result.estimatedSpeed;

  // Build route coordinates for map — handle both {lat,lon} objects and [lon,lat] tuples
  const routeCoords: [number, number][] = waypoints
    .filter((wp: any) => {
      if (Array.isArray(wp)) return wp.length >= 2;
      return wp.lat != null && wp.lon != null;
    })
    .map((wp: any) => {
      if (Array.isArray(wp)) return [wp[1], wp[0]] as [number, number]; // [lon,lat] → [lat,lon]
      return [wp.lat, wp.lon] as [number, number];
    });

  // Build route segments by zone type
  const routeSegments = legs.length > 0
    ? legs.map((leg: any) => ({
        coords: (leg.waypoints || [])
          .filter((wp: any) => wp.lat != null)
          .map((wp: any) => [wp.lat, wp.lon] as [number, number]),
        type: leg.zoneType || leg.type || "open_sea",
      }))
    : [];

  // Percentage bar data
  const segments = [
    { label: "Open Sea", nm: openSeaDist, color: "#3b82f6" },
    ...(secaDist > 0 ? [{ label: "SECA", nm: secaDist, color: "#f59e0b" }] : []),
    ...(canalDist > 0 ? [{ label: "Canal", nm: canalDist, color: "#a855f7" }] : []),
  ];

  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Route className="h-4 w-4 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold">Route Calculated</h3>
            {(originPort || destPort) && (
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
                {destPort ? (
                  <>
                    <span>{originPort}</span>
                    <span>→</span>
                    <span>{destPort}</span>
                  </>
                ) : (
                  <span>{originPort}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Map ── */}
      {(routeCoords.length > 1 || routeSegments.length > 0) && (
        <CopilotMapWrapper
          routeCoords={routeCoords.length > 1 ? routeCoords : undefined}
          routeSegments={routeSegments.length > 0 ? routeSegments : undefined}
          height={300}
        />
      )}

      {/* ── Distance Summary Bar ── */}
      <div className="px-4 py-3 border-b border-border/30">
        {/* Total Distance Hero */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-2xl font-bold">{formatNumber(totalDist)} NM</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Distance</div>
          </div>
          {duration && (
            <div className="text-right">
              <div className="text-lg font-semibold text-blue-400">
                {typeof duration === "object"
                  ? `${formatNumber(duration.totalDays, 1)} days`
                  : `${formatNumber(duration, 1)} days`}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {speed ? `@ ${speed} kn` : "Est. Duration"}
              </div>
            </div>
          )}
        </div>

        {/* Proportional distance bar */}
        {totalDist > 0 && (
          <div className="space-y-2">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/30">
              {segments.map((seg, i) => (
                <div
                  key={i}
                  className="h-full transition-all"
                  style={{
                    width: `${(seg.nm / totalDist) * 100}%`,
                    backgroundColor: seg.color,
                    opacity: 0.8,
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-4">
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground">{seg.label}</span>
                  <span className="font-semibold">{formatNumber(seg.nm)} NM</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-3 gap-0 border-b border-border/30">
        <div className="px-3 py-2.5 text-center border-r border-border/20">
          <Navigation className="h-3.5 w-3.5 mx-auto mb-1 text-blue-400" />
          <div className="text-xs font-semibold">{formatNumber(openSeaDist)} NM</div>
          <div className="text-[9px] text-muted-foreground">Open Sea</div>
        </div>
        <div className="px-3 py-2.5 text-center border-r border-border/20">
          <AlertTriangle className="h-3.5 w-3.5 mx-auto mb-1 text-amber-400" />
          <div className="text-xs font-semibold">{formatNumber(secaDist)} NM</div>
          <div className="text-[9px] text-muted-foreground">SECA/ECA</div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <Anchor className="h-3.5 w-3.5 mx-auto mb-1 text-purple-400" />
          <div className="text-xs font-semibold">{formatNumber(canalDist)} NM</div>
          <div className="text-[9px] text-muted-foreground">Canal</div>
        </div>
      </div>

      {/* ── Draft Warning ── */}
      {draftWarning && (
        <div className="px-4 py-2.5 flex items-center gap-2 bg-amber-500/5 border-b border-border/30">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-400">{draftWarning}</span>
        </div>
      )}

      {/* ── Leg Details (expandable) ── */}
      {legs.length > 0 && (
        <div className="border-b border-border/30">
          <button
            onClick={() => setShowLegs(!showLegs)}
            className="flex items-center gap-2 px-4 py-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Ship className="h-3 w-3" />
            {showLegs ? "Hide Leg Details" : `Show ${legs.length} Leg Details`}
            {showLegs ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
          </button>
          {showLegs && (
            <div className="px-4 pb-3 space-y-1">
              {legs.map((leg: any, i: number) => {
                const zone = ZONE_STYLES[leg.zoneType || leg.type || "open_sea"] || ZONE_STYLES.open_sea;
                return (
                  <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg border border-border/20 bg-muted/10">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                    <span className="font-medium flex-1">{leg.from || `Leg ${i + 1}`} → {leg.to || ""}</span>
                    <span className="text-muted-foreground tabular-nums">{formatNumber(leg.distanceNm || leg.distance)} NM</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/30" style={{ color: zone.color }}>
                      {zone.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="px-4 py-2.5 bg-muted/20 flex items-center gap-2">
        <Link
          href={(() => {
            const params = new URLSearchParams();
            if (result.originCode) params.set("from", result.originCode);
            if (result.destinationCode) params.set("to", result.destinationCode);
            // Support via port for multi-leg routes
            const portCodes = result.portCodes || [];
            if (portCodes.length > 2) {
              // Middle ports are via points
              params.set("via", portCodes.slice(1, -1).join(","));
            }
            const qs = params.toString();
            return orgPath(`/route-planner${qs ? `?${qs}` : ""}`);
          })()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs font-medium text-purple-400 hover:bg-purple-500/20 transition-colors"
        >
          <ArrowUpRight className="h-3 w-3" />
          View in Route Planner
        </Link>
      </div>
    </div>
  );
}
