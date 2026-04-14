"use client";

/**
 * Route Planner Client Component
 * 
 * Main orchestrator for the voyage planning dashboard.
 * Layout: Route Builder + Results (top side-by-side) | Map (bottom)
 */

import { useState } from "react";
import { toast } from "sonner";
import { Navigation, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WaypointList, createInitialWaypoints } from "./WaypointList";
import { ResultsCard } from "./ResultsCard";
import { VoyageMap } from "./VoyageMap";

interface Port {
  id: string;
  name: string;
  locode: string;
  country: string;
  latitude: number;
  longitude: number;
  region?: string;
  passagePolyline?: [number, number][] | null;
  passageDistanceNm?: number;
}

interface Waypoint {
  id: string;
  port: Port | null;
  order: number;
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
    geometry: {
      coordinates: [number, number][];
      ecaSegments: [number, number][][];
      hraSegments: [number, number][][];
    };
  }>;
  zones: {
    eca: string[];
    hra: string[];
  };
  warnings: string[];
}

export function RoutePlannerClient() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>(createInitialWaypoints());
  const [result, setResult] = useState<RouteResultData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [avgSpeed, setAvgSpeed] = useState<number>(12.5);

  // Check if we have at least 2 ports selected
  const validWaypoints = waypoints.filter((w) => w.port !== null);
  const canCalculate = validWaypoints.length >= 2;

  const handleCalculate = async () => {
    if (!canCalculate) {
      toast.error("Please select at least 2 ports");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      // Calculate each leg using NavAPI
      const legs: RouteResultData["legs"] = [];
      let totalDistanceNm = 0;
      let totalECADistanceNm = 0;
      const allEcaZones: string[] = [];
      const allWarnings: string[] = [];

      for (let i = 0; i < validWaypoints.length - 1; i++) {
        const fromPort = validWaypoints[i].port!;
        const toPort = validWaypoints[i + 1].port!;

        // Call NavAPI for this leg
        const response = await fetch("/api/navapi/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startPortCode: fromPort.locode,
            endPortCode: toPort.locode,
          }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || `Failed to calculate ${fromPort.name} → ${toPort.name}`);
        }

        // Transform NavAPI result to match existing RouteResultData leg format
        const legDistanceNm = data.totalDistanceNm || 0;
        const legEcaDistanceNm = data.ecaDistanceNm || 0;
        const waypoints = data.waypoints || [];

        // Convert waypoints to coordinates
        const coordinates: [number, number][] = waypoints.map(
          (wp: { lat: number; lon: number }) => [wp.lon, wp.lat] as [number, number]
        );

        legs.push({
          legNumber: i + 1,
          from: {
            name: fromPort.name,
            locode: fromPort.locode,
            coordinates: [fromPort.longitude, fromPort.latitude],
          },
          to: {
            name: toPort.name,
            locode: toPort.locode,
            coordinates: [toPort.longitude, toPort.latitude],
          },
          distanceNm: legDistanceNm,
          ecaDistanceNm: legEcaDistanceNm,
          hraDistanceNm: 0, // NavAPI doesn't provide HRA data
          isFullECA: legEcaDistanceNm > 0 && legEcaDistanceNm >= legDistanceNm * 0.95,
          ecaZones: legEcaDistanceNm > 0 ? ["SECA"] : [],
          hraZones: [],
          geometry: {
            coordinates,
            ecaSegments: [], // Could be populated if NavAPI provides segment data
            hraSegments: [],
          },
        });

        totalDistanceNm += legDistanceNm;
        totalECADistanceNm += legEcaDistanceNm;

        if (legEcaDistanceNm > 0 && !allEcaZones.includes("SECA")) {
          allEcaZones.push("SECA");
        }
      }

      // Calculate estimated days based on speed
      const estimatedDays = avgSpeed > 0 ? totalDistanceNm / (avgSpeed * 24) : null;

      // Build result in existing format
      const routeResult: RouteResultData = {
        summary: {
          totalDistanceNm,
          totalECADistanceNm,
          totalHRADistanceNm: 0,
          estimatedDays,
          openSeaDistanceNm: totalDistanceNm - totalECADistanceNm,
        },
        legs,
        zones: {
          eca: allEcaZones,
          hra: [],
        },
        warnings: allWarnings,
      };

      setResult(routeResult);
      toast.success(`Route calculated via NavAPI: ${Math.round(totalDistanceNm)} NM`);

    } catch (error) {
      console.error("Route calculation error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to calculate route"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* TOP ROW: Route Builder + Results side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Route Builder Card */}
        <Card className="border-primary/20 max-h-[500px] flex flex-col">
          <CardHeader className="pb-2 border-b shrink-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" />
              Route Builder
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 overflow-auto flex-1">
            <WaypointList
              waypoints={waypoints}
              onChange={setWaypoints}
              disabled={isLoading}
            />
            
            {/* Calculate Button */}
            <div className="flex items-center gap-3 sticky bottom-0 bg-card pt-2">
              <Button
                onClick={handleCalculate}
                disabled={!canCalculate || isLoading}
                className="flex-1"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Navigation className="h-4 w-4 mr-2" />
                    Calculate Voyage
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {validWaypoints.length} ports
              </span>
            </div>
            
            {!canCalculate && (
              <p className="text-xs text-muted-foreground text-center">
                Select at least 2 ports to calculate a route
              </p>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Results Cards */}
        <div className="max-h-[500px] overflow-auto">
          {result ? (
            <ResultsCard
              result={result}
              speed={avgSpeed}
              onSpeedChange={setAvgSpeed}
              isLoading={isLoading}
              originCountryCode={validWaypoints[0]?.port?.locode?.substring(0, 2)}
              destinationCountryCode={validWaypoints[validWaypoints.length - 1]?.port?.locode?.substring(0, 2)}
            />
          ) : (
            <Card className="h-[500px] flex items-center justify-center bg-muted/30 border-dashed">
              <CardContent className="text-center py-12">
                <Navigation className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  Calculate a voyage to see results
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Voyage Summary, Compliance Insights, and Leg Breakdown
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* BOTTOM: Map */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <VoyageMap
            waypoints={waypoints}
            result={result}
            className="h-[400px] lg:h-[500px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}
