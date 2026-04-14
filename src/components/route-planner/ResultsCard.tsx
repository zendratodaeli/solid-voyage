"use client";

/**
 * Results Card Component
 * 
 * Displays voyage calculation results with summary and leg breakdown.
 */

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Navigation,
  Waves,
  Clock,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ComplianceInsights } from "./ComplianceInsights";
import { RouteComparisonCard } from "./RouteComparisonCard";

interface LegData {
  legNumber: number;
  from: { name: string; locode?: string };
  to: { name: string; locode?: string };
  distanceNm: number;
  ecaDistanceNm: number;
  hraDistanceNm: number;
  isFullECA: boolean;
  ecaZones: string[];
  hraZones: string[];
}

interface RouteResultData {
  summary: {
    totalDistanceNm: number;
    totalECADistanceNm: number;
    totalHRADistanceNm: number;
    estimatedDays: number | null;
    openSeaDistanceNm: number;
  };
  legs: LegData[];
  zones: {
    eca: string[];
    hra: string[];
  };
  warnings: string[];
}

// Vessel data for CII calculations
interface VesselData {
  id: string;
  name: string;
  dwt: number;
  vesselType: string;
  ladenSpeed: number;
  ballastSpeed: number;
  ladenConsumption: number;
  ballastConsumption: number;
  fuelConsumption?: Record<string, { laden: number; ballast: number }>;
  hasScrubber?: boolean;
  fuelTypes?: string[];
}

interface ResultsCardProps {
  result: RouteResultData | null;
  speed: number;
  onSpeedChange: (speed: number) => void;
  isLoading?: boolean;
  originCountryCode?: string;
  destinationCountryCode?: string;
  selectedVessel?: VesselData | null;
  manualDWT?: number;
  voyageMode?: "laden" | "ballast";
  canalTransitCost?: number;
  routeComparisonOptions?: Array<{
    id: string;
    label: string;
    distanceNm: number;
    estimatedDays: number;
    ecaDistanceNm: number;
    canalName?: string;
  }>;
  routeComparisonSelectedId?: string;
  onRouteComparisonSelect?: (id: string) => void;
  canalCost?: string;
  onCanalCostChange?: (cost: string) => void;
  legConsumptions?: Array<{
    condition: "laden" | "ballast";
    dailyConsumption: number;
    distanceNm: number;
    speedKnots: number;
  }>;
}

export function ResultsCard({
  result,
  speed,
  onSpeedChange,
  isLoading = false,
  originCountryCode,
  destinationCountryCode,
  selectedVessel,
  manualDWT = 0,
  voyageMode = "laden",
  canalTransitCost = 0,
  routeComparisonOptions,
  routeComparisonSelectedId,
  onRouteComparisonSelect,
  canalCost,
  onCanalCostChange,
  legConsumptions,
}: ResultsCardProps) {
  const [expandedLegs, setExpandedLegs] = useState<Set<number>>(new Set());

  const toggleLeg = (legNumber: number) => {
    const newExpanded = new Set(expandedLegs);
    if (newExpanded.has(legNumber)) {
      newExpanded.delete(legNumber);
    } else {
      newExpanded.add(legNumber);
    }
    setExpandedLegs(newExpanded);
  };

  if (!result) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-12 text-center">
          <Navigation className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            Select waypoints and calculate to see route details
          </p>
        </CardContent>
      </Card>
    );
  }

  const { summary, legs, warnings } = result;

  // Calculate ETA
  const estimatedDays =
    speed > 0
      ? Math.round((summary.totalDistanceNm / speed / 24) * 10) / 10
      : null;

  return (
    <div className="space-y-4">
      {/* HRA Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warning, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm">{warning}</p>
            </div>
          ))}
        </div>
      )}

      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Voyage Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Total Distance */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {summary.totalDistanceNm.toLocaleString()} NM
              </div>
              <div className="text-xs text-muted-foreground">Total Distance</div>
            </div>

            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {summary.totalECADistanceNm.toLocaleString()} NM
              </div>
              <div className="text-xs text-muted-foreground">ECA Distance</div>
            </div>
          </div>

          {/* HRA Distance (if any) */}
          {summary.totalHRADistanceNm > 0 && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-600" />
                <div>
                  <div className="font-bold text-amber-600 dark:text-amber-400">
                    {summary.totalHRADistanceNm.toLocaleString()} NM in High Risk Areas
                  </div>
                  <div className="text-xs text-muted-foreground">
                    War Risk Insurance may apply
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Estimated Duration */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Est. Duration:</span>
              </div>
              <span className="font-semibold">
                {summary.estimatedDays ? `${Math.round(summary.estimatedDays * 10) / 10} days` : "N/A"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Avg Speed: {Math.round(speed * 10) / 10} kn (set per-leg in route planner)
            </div>
          </div>

          {/* Zones Summary */}
          {result.zones.eca.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">ECA Zones:</span>{" "}
              {result.zones.eca.join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Insights */}
      <ComplianceInsights
        totalDistanceNm={summary.totalDistanceNm}
        ecaDistanceNm={summary.totalECADistanceNm}
        hraDistanceNm={summary.totalHRADistanceNm}
        ecaZones={result.zones.eca}
        hraZones={result.zones.hra}
        originCountryCode={originCountryCode}
        destinationCountryCode={destinationCountryCode}
        speedKnots={speed}
        selectedVessel={selectedVessel}
        manualDWT={manualDWT}
        voyageMode={voyageMode}
        canalTransitCost={canalTransitCost}
        legConsumptions={legConsumptions}
      />

      {/* Leg Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Waves className="h-5 w-5" />
            Leg Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {legs.map((leg) => {
            const isExpanded = expandedLegs.has(leg.legNumber);
            const ecaPercent =
              leg.distanceNm > 0
                ? Math.round((leg.ecaDistanceNm / leg.distanceNm) * 100)
                : 0;

            return (
              <div
                key={leg.legNumber}
                className="border border-border rounded-lg overflow-hidden"
              >
                {/* Leg Header */}
                <button
                  type="button"
                  onClick={() => toggleLeg(leg.legNumber)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}

                  <div className="flex-1 text-left">
                    <div className="font-medium text-sm">
                      Leg {leg.legNumber}: {leg.from.name} → {leg.to.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {leg.distanceNm.toLocaleString()} NM
                      {leg.isFullECA && (
                        <span className="ml-2 text-red-500">(100% ECA)</span>
                      )}
                    </div>
                  </div>

                  {/* Mini ECA Bar */}
                  <div className="w-20 h-2 bg-blue-500/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all"
                      style={{ width: `${ecaPercent}%` }}
                    />
                  </div>
                </button>

                {/* Leg Details (Expanded) */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border bg-muted/30">
                    <div className="grid grid-cols-2 gap-2 text-sm pt-2">
                      <div>
                        <span className="text-muted-foreground">Open Sea:</span>{" "}
                        <span className="font-medium text-blue-600">
                          {(leg.distanceNm - leg.ecaDistanceNm).toLocaleString()} NM
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ECA:</span>{" "}
                        <span className="font-medium text-red-600">
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
                        {leg.hraDistanceNm.toLocaleString()} NM in HRA
                        ({leg.hraZones.join(", ")})
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Route Comparison (below Leg Breakdown) */}
      {routeComparisonOptions && routeComparisonOptions.length >= 2 && onRouteComparisonSelect && (
        <RouteComparisonCard
          options={routeComparisonOptions}
          selectedId={routeComparisonSelectedId || "primary"}
          onSelect={onRouteComparisonSelect}
          canalCost={canalCost || ""}
          onCanalCostChange={onCanalCostChange || (() => {})}
        />
      )}
    </div>
  );
}
