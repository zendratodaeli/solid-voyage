"use client";

import { useState } from "react";
import {
  Navigation,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Compass,
  Shield,
  Leaf,
  Ship,
  Trophy,
  Medal,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { AutoRouteState, AutoRouteResult, RouteAlternative } from "@/hooks/useVoyageAutoRoute";

interface VoyageRouteStatusProps {
  state: AutoRouteState;
  onRecalculate: () => void;
  /** Called when user selects an alternative route */
  onSelectAlternative?: (alt: RouteAlternative) => void;
  /** Called when user clicks "Deep Dive in Route Planner" */
  onOpenRoutePlanner?: () => void;
}

export function VoyageRouteStatus({
  state,
  onRecalculate,
  onSelectAlternative,
  onOpenRoutePlanner,
}: VoyageRouteStatusProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);

  // ── IDLE: Show hint about missing fields ─────────────────────
  if (state.status === "idle" && !state.isReady) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border/60 bg-muted/20">
        <Compass className="h-4 w-4 text-muted-foreground shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">Auto-Route</span>{" "}
            — Fill the following to auto-calculate distances:
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {state.missingFields.map((field) => (
              <span
                key={field}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── CALCULATING: Pulsing gradient bar ────────────────────────
  if (state.status === "calculating") {
    return (
      <div className="relative overflow-hidden rounded-lg border border-sky-500/30 bg-sky-500/5">
        {/* Animated gradient bar */}
        <div className="absolute inset-0 opacity-20">
          <div className="h-full w-[200%] animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />
        </div>
        <div className="relative flex items-center gap-3 p-3">
          <Loader2 className="h-4 w-4 text-sky-400 animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-sky-300">
              🧭 Calculating optimal sea route...
            </p>
            <p className="text-xs text-sky-400/70 mt-0.5">
              Querying NavAPI with draft-aware routing, ECA zones, and canal detection
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── ERROR: Warning with retry ────────────────────────────────
  if (state.status === "error") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-300">Route calculation failed</p>
          <p className="text-xs text-red-400/70 mt-0.5">{state.error}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-red-300 hover:text-red-200 hover:bg-red-500/10"
          onClick={onRecalculate}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  // ── COMPLETE: Summary strip ──────────────────────────────────
  if (state.status === "complete" && state.result) {
    const { bestRoute, alternatives } = state.result;
    const ecaPercent = bestRoute.totalDistanceNm > 0
      ? Math.round((bestRoute.totalEcaDistanceNm / bestRoute.totalDistanceNm) * 100)
      : 0;
    const hasAlternatives = alternatives.length > 1;
    const hasHRA = bestRoute.totalHraDistanceNm > 0;
    const hasCanals = bestRoute.detectedCanals.length > 0;

    return (
      <>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
          {/* Main summary strip */}
          <div className="p-3 space-y-2">
            {/* Top row: badge + stats */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <Navigation className="h-3 w-3" />
                Auto-Routed · {bestRoute.label}
              </span>
              {hasCanals && bestRoute.detectedCanals.map(canal => (
                <span key={canal} className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
                  🚢 {canal}
                </span>
              ))}
              {hasHRA && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                  <Shield className="h-2.5 w-2.5 inline mr-0.5" /> HRA Zone
                </span>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                Total: <span className="font-semibold text-foreground tabular-nums">{Math.round(bestRoute.totalDistanceNm).toLocaleString()} NM</span>
              </span>
              <span className="text-muted-foreground">
                Sea Days: <span className="font-semibold text-foreground tabular-nums">{bestRoute.estimatedSeaDays.toFixed(1)}</span>
              </span>
              <span className="text-muted-foreground">
                Legs: <span className="font-semibold text-foreground tabular-nums">{bestRoute.legs.length}</span>
              </span>
              {ecaPercent > 0 && (
                <span className="text-amber-400">
                  <Leaf className="h-3 w-3 inline mr-0.5" />
                  ECA: {ecaPercent}%
                </span>
              )}
            </div>

            {/* ECA composition bar */}
            {ecaPercent > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500"
                    style={{ width: `${100 - ecaPercent}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums w-20">
                  Open Sea {100 - ecaPercent}%
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              {hasAlternatives && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                  onClick={() => setShowAlternatives(true)}
                >
                  <Compass className="h-3 w-3 mr-1" />
                  View {alternatives.length - 1} Alternative{alternatives.length > 2 ? "s" : ""}
                </Button>
              )}
              {onOpenRoutePlanner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                  onClick={onOpenRoutePlanner}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Deep Dive in Route Planner
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground ml-auto"
                onClick={onRecalculate}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Recalculate
              </Button>
            </div>
          </div>
        </div>

        {/* ── Alternatives Modal ─────────────────────────────────── */}
        <Dialog open={showAlternatives} onOpenChange={setShowAlternatives}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-sky-400" />
                Route Alternatives
              </DialogTitle>
              <DialogDescription>
                {alternatives.length} routes calculated. Best route is auto-selected — click to switch.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-2">
              {alternatives.map((alt, i) => {
                const isSelected = alt.rank === 1;
                const RankIcon = i === 0 ? Trophy : i === 1 ? Medal : Award;
                const rankColor = i === 0 ? "text-amber-400" : i === 1 ? "text-slate-400" : "text-orange-700";

                return (
                  <button
                    key={alt.id}
                    type="button"
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      isSelected
                        ? "border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                        : "border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-border"
                    }`}
                    onClick={() => {
                      onSelectAlternative?.(alt);
                      setShowAlternatives(false);
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <RankIcon className={`h-5 w-5 ${rankColor}`} />
                      <span className="font-semibold text-sm">{alt.label}</span>
                      {isSelected && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 ml-auto">
                          Selected
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ml-auto ${
                        i === 0
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                          : "bg-muted text-muted-foreground border border-border/50"
                      }`}>
                        Rank #{alt.rank}
                      </span>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-4 gap-3 text-xs mb-2">
                      <div>
                        <p className="text-muted-foreground">Distance</p>
                        <p className="font-semibold text-foreground tabular-nums">
                          {Math.round(alt.totalDistanceNm).toLocaleString()} NM
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Sea Days</p>
                        <p className="font-semibold text-foreground tabular-nums">
                          {alt.estimatedSeaDays.toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">ECA</p>
                        <p className="font-semibold text-foreground tabular-nums">
                          {alt.totalDistanceNm > 0
                            ? Math.round((alt.totalEcaDistanceNm / alt.totalDistanceNm) * 100)
                            : 0}%
                          <span className="text-muted-foreground font-normal ml-1">
                            ({Math.round(alt.totalEcaDistanceNm).toLocaleString()} NM)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Canals</p>
                        <p className="font-semibold text-foreground">
                          {alt.detectedCanals.length > 0
                            ? alt.detectedCanals.join(", ")
                            : "None"}
                        </p>
                      </div>
                    </div>

                    {/* HRA warning */}
                    {alt.totalHraDistanceNm > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-red-400 mb-2">
                        <Shield className="h-3 w-3" />
                        <span>
                          {Math.round(alt.totalHraDistanceNm)} NM through High Risk Area ({alt.hraZones.join(", ")})
                        </span>
                      </div>
                    )}

                    {/* Rank reason */}
                    {alt.rankReason && (
                      <p className="text-xs text-muted-foreground italic">
                        {alt.rankReason}
                      </p>
                    )}

                    {/* Per-leg breakdown */}
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <div className="grid gap-1">
                        {alt.legs.map((leg) => (
                          <div key={leg.legNumber} className="flex items-center gap-2 text-xs">
                            <span className={`shrink-0 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                              leg.condition === "ballast"
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                                : "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                            }`}>
                              {leg.condition === "ballast" ? "BLS" : "LDN"}
                            </span>
                            <span className="text-muted-foreground truncate flex-1">
                              {leg.from} → {leg.to}
                            </span>
                            <span className="font-medium text-foreground tabular-nums shrink-0">
                              {Math.round(leg.distanceNm).toLocaleString()} NM
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Deep Dive button in modal footer */}
            {onOpenRoutePlanner && (
              <div className="pt-3 border-t border-border/50 mt-2">
                <Button
                  variant="outline"
                  className="w-full text-violet-400 border-violet-500/30 hover:bg-violet-500/10"
                  onClick={() => {
                    onOpenRoutePlanner();
                    setShowAlternatives(false);
                  }}
                >
                  <Ship className="h-4 w-4 mr-2" />
                  Deep Dive in Route Planner
                  <ExternalLink className="h-3 w-3 ml-2 opacity-60" />
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-1.5">
                  Opens in a new tab with all voyage data pre-filled
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── IDLE with ready (waiting for trigger) ────────────────────
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border/60 bg-muted/20">
      <Navigation className="h-4 w-4 text-muted-foreground shrink-0" />
      <p className="text-sm text-muted-foreground">
        Auto-route ready — distances will calculate automatically
      </p>
    </div>
  );
}
