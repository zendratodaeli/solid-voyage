"use client";

/**
 * AI Route Recommendation Panel
 *
 * Visual comparison of route alternatives with mini-maps + AI analysis.
 * 
 * Layout:
 * 1. Route variant cards (each with mini-map + key metrics + strengths/weaknesses)
 * 2. AI Summary & Overall Recommendation at the bottom
 */

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Loader2, Brain, ShieldCheck, DollarSign, Scale, Trophy, AlertTriangle, CheckCircle2, Navigation, Clock, Shield, Fuel } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIRouteRecommendation } from "@/app/api/ai/route-analysis/route";

// Dynamically import Leaflet components (no SSR)
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);
const Polyline = dynamic(
  () => import("react-leaflet").then((mod) => mod.Polyline),
  { ssr: false }
);

interface RouteIntelSummary {
  id: string;
  label: string;
  distanceNm: number;
  estimatedDays: number;
  ecaDistanceNm: number;
  hraDistanceNm: number;
  canalTollUsd: number;
  warRiskPremiumUsd: number;
  totalAdditionalCostsUsd: number;
  canals: string[];
  hraZones: string[];
  /** Route geometry for mini-map — array of leg coordinate arrays [lon, lat] */
  coordinates: [number, number][][];
}

interface AIRouteRecommendationPanelProps {
  recommendation: AIRouteRecommendation | null;
  routes: RouteIntelSummary[];
  isLoading: boolean;
  error: string | null;
  onSelectRoute?: (routeId: string) => void;
}

const CONFIDENCE_STYLES = {
  HIGH: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  LOW: "bg-red-500/15 text-red-400 border-red-500/30",
};

/** Colors for route variants on mini-maps */
const ROUTE_COLORS: Record<string, string> = {
  primary: "#3b82f6",         // Blue
  "avoid-canal": "#f97316",   // Orange
  "seca-minimized": "#06b6d4",// Cyan
};

// ═══════════════════════════════════════════════════════════════════
// MINI MAP COMPONENT
// ═══════════════════════════════════════════════════════════════════

function RoutePreviewMap({
  coordinates,
  color,
  className,
}: {
  coordinates: [number, number][][];
  color: string;
  className?: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Ensure Leaflet CSS is loaded
    setReady(true);
  }, []);

  // Calculate bounds from coordinates
  const { center, zoom } = useMemo(() => {
    const allCoords = coordinates.flat();
    if (allCoords.length === 0) return { center: [30, 0] as [number, number], zoom: 2 };

    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const [lon, lat] of allCoords) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;
    const maxSpan = Math.max(latSpan, lonSpan);

    // Approximate zoom from span
    let z = 2;
    if (maxSpan < 5) z = 6;
    else if (maxSpan < 15) z = 5;
    else if (maxSpan < 40) z = 4;
    else if (maxSpan < 80) z = 3;
    else z = 2;

    return { center: [centerLat, centerLon] as [number, number], zoom: z };
  }, [coordinates]);

  if (!ready || coordinates.flat().length < 2) {
    return (
      <div className={cn("bg-muted/30 rounded-lg flex items-center justify-center text-muted-foreground text-xs", className)}>
        No route data
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg overflow-hidden border border-border/30", className)}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />
        {coordinates.map((legCoords, i) => (
          <Polyline
            key={i}
            positions={legCoords.map(([lon, lat]) => [lat, lon] as [number, number])}
            pathOptions={{
              color,
              weight: 3,
              opacity: 0.9,
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════

export function AIRouteRecommendationPanel({
  recommendation,
  routes,
  isLoading,
  error,
  onSelectRoute,
}: AIRouteRecommendationPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="relative">
          <Brain className="h-8 w-8 text-violet-400 animate-pulse" />
          <Loader2 className="h-5 w-5 text-violet-400 animate-spin absolute -bottom-1 -right-1" />
        </div>
        <p className="text-sm text-muted-foreground">AI is analyzing your routes...</p>
        <p className="text-[10px] text-muted-foreground/60">Evaluating safety, profitability & compliance</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
        <p className="text-sm">AI analysis unavailable</p>
        <p className="text-xs mt-1 opacity-60">{error}</p>
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Calculate a route to get AI recommendations</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ════════════════════════════════════════════════════════
          SECTION 1: ROUTE VARIANT CARDS WITH MINI-MAPS
         ════════════════════════════════════════════════════════ */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Visual Route Comparison
        </p>
        <div className="space-y-4">
          {routes.map((route) => {
            const ranking = recommendation.routeRankings?.find(r => r.routeId === route.id);
            const isRecommended = route.id === recommendation.recommendedRouteId;
            const routeColor = ROUTE_COLORS[route.id] || "#8b5cf6";

            return (
              <div
                key={route.id}
                className={cn(
                  "rounded-xl border overflow-hidden transition-all",
                  isRecommended
                    ? "border-violet-500/40 shadow-lg shadow-violet-500/5"
                    : "border-border/40"
                )}
              >
                {/* Card Header */}
                <div className={cn(
                  "flex items-center justify-between px-3 py-2",
                  isRecommended
                    ? "bg-violet-500/10"
                    : "bg-muted/30"
                )}>
                  <div className="flex items-center gap-2">
                    {ranking && (
                      <span className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold",
                        ranking.rank === 1 ? "bg-violet-500/20 text-violet-400" :
                        ranking.rank === 2 ? "bg-blue-500/20 text-blue-400" :
                        "bg-muted text-muted-foreground"
                      )}>
                        #{ranking.rank}
                      </span>
                    )}
                    <span className={cn(
                      "text-sm font-semibold",
                      isRecommended ? "text-violet-400" : "text-foreground"
                    )}>
                      {route.label}
                    </span>
                    {isRecommended && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/25">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div
                    className="w-3 h-3 rounded-full border-2"
                    style={{ borderColor: routeColor, backgroundColor: `${routeColor}40` }}
                  />
                </div>

                {/* Mini Map */}
                <RoutePreviewMap
                  coordinates={route.coordinates}
                  color={routeColor}
                  className="h-[140px]"
                />

                {/* Key Metrics Strip */}
                <div className="grid grid-cols-4 gap-px bg-border/20">
                  <div className="bg-background p-2 text-center">
                    <div className="flex items-center justify-center gap-1 text-[9px] text-muted-foreground mb-0.5">
                      <Navigation className="h-2.5 w-2.5" />
                      Distance
                    </div>
                    <div className="text-xs font-bold tabular-nums">
                      {Math.round(route.distanceNm).toLocaleString()} NM
                    </div>
                  </div>
                  <div className="bg-background p-2 text-center">
                    <div className="flex items-center justify-center gap-1 text-[9px] text-muted-foreground mb-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      Duration
                    </div>
                    <div className="text-xs font-bold tabular-nums">
                      {route.estimatedDays.toFixed(1)} days
                    </div>
                  </div>
                  <div className="bg-background p-2 text-center">
                    <div className="flex items-center justify-center gap-1 text-[9px] text-muted-foreground mb-0.5">
                      <Fuel className="h-2.5 w-2.5" />
                      SECA
                    </div>
                    <div className={cn(
                      "text-xs font-bold tabular-nums",
                      route.ecaDistanceNm === 0 ? "text-emerald-400" : ""
                    )}>
                      {route.ecaDistanceNm === 0 ? "None" : `${Math.round(route.ecaDistanceNm)} NM`}
                    </div>
                  </div>
                  <div className="bg-background p-2 text-center">
                    <div className="flex items-center justify-center gap-1 text-[9px] text-muted-foreground mb-0.5">
                      <DollarSign className="h-2.5 w-2.5" />
                      Add. Costs
                    </div>
                    <div className="text-xs font-bold tabular-nums">
                      ${route.totalAdditionalCostsUsd.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* HRA / Canal badges */}
                {(route.hraDistanceNm > 0 || route.canals.length > 0) && (
                  <div className="px-3 py-1.5 flex flex-wrap gap-1.5 bg-background border-t border-border/20">
                    {route.canals.map(c => (
                      <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        🚢 {c}
                      </span>
                    ))}
                    {route.hraDistanceNm > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                        ⚠️ HRA {Math.round(route.hraDistanceNm)} NM
                      </span>
                    )}
                    {route.warRiskPremiumUsd > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        🛡 War Risk ${route.warRiskPremiumUsd.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {/* AI Verdict for this route */}
                {ranking && (
                  <div className="px-3 py-2.5 bg-background border-t border-border/20">
                    <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
                      {ranking.verdict}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {ranking.strengths && ranking.strengths.length > 0 && (
                        <div className="space-y-0.5">
                          {ranking.strengths.map((s, i) => (
                            <div key={i} className="flex items-start gap-1 text-[10px] text-emerald-400/80">
                              <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" />
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {ranking.weaknesses && ranking.weaknesses.length > 0 && (
                        <div className="space-y-0.5">
                          {ranking.weaknesses.map((w, i) => (
                            <div key={i} className="flex items-start gap-1 text-[10px] text-amber-400/80">
                              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Select this route action */}
                    {onSelectRoute && (
                      <button
                        onClick={() => onSelectRoute(route.id)}
                        className={cn(
                          "mt-2 w-full text-xs font-medium py-1.5 rounded-md transition-colors",
                          isRecommended
                            ? "bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 border border-violet-500/25"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/30"
                        )}
                      >
                        {isRecommended ? "✓ Select Recommended Route" : `Select ${route.label}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECTION 2: AI OVERALL SUMMARY & RECOMMENDATION
         ════════════════════════════════════════════════════════ */}
      <div className="pt-2 border-t border-border/40">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          AI Conclusion
        </p>

        {/* Recommendation Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-blue-500/10 to-emerald-500/10 border border-violet-500/20 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-violet-400">AI Recommendation</span>
                <span className={cn(
                  "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
                  CONFIDENCE_STYLES[recommendation.confidence]
                )}>
                  {recommendation.confidence} confidence
                </span>
              </div>
              <p className="text-sm mt-1.5 text-foreground/90 leading-relaxed">
                {recommendation.summary}
              </p>
            </div>
          </div>
        </div>

        {/* Reasoning Sections */}
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
            <div className="flex items-center gap-2 text-sm font-semibold mb-1.5">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span>Safety Assessment</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pl-6">
              {recommendation.reasoning.safety}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
            <div className="flex items-center gap-2 text-sm font-semibold mb-1.5">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <span>Profitability Analysis</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pl-6">
              {recommendation.reasoning.profitability}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
            <div className="flex items-center gap-2 text-sm font-semibold mb-1.5">
              <Scale className="h-4 w-4 text-blue-400" />
              <span>Compliance & Regulatory</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pl-6">
              {recommendation.reasoning.compliance}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
