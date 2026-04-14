"use client";

/**
 * NavAPI Route Planner Component
 * 
 * Simple two-port route planner using NavAPI (Seametrix) for maritime routing.
 * Features:
 * - NavAPI port search with alias expansion
 * - Real-time route calculation
 * - ECA/Non-ECA distance breakdown
 * - Route visualization on map
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Navigation, Loader2, Anchor, ArrowRight, Ship, MapPin, Fuel, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NavApiPortSearch, type NavApiPort } from "./NavApiPortSearch";
// [REMOVED] NavApiRouteMap was deleted during map consolidation
// import { NavApiRouteMap } from "./NavApiRouteMap";
import { useNavApiRoute, type RouteResult } from "@/hooks/useNavApiRoute";
import { cn } from "@/lib/utils";

interface NavApiRoutePlannerProps {
  onRouteCalculated?: (result: RouteResult) => void;
  className?: string;
  showMap?: boolean;
}

export function NavApiRoutePlanner({
  onRouteCalculated,
  className,
  showMap = true,
}: NavApiRoutePlannerProps) {
  const [originPort, setOriginPort] = useState<NavApiPort | null>(null);
  const [destinationPort, setDestinationPort] = useState<NavApiPort | null>(null);

  const { calculateRoute, isCalculating, result, error } = useNavApiRoute();

  const canCalculate = originPort !== null && destinationPort !== null;

  const handleCalculate = useCallback(async () => {
    if (!originPort || !destinationPort) {
      toast.error("Please select both origin and destination ports");
      return;
    }

    const routeResult = await calculateRoute(originPort, destinationPort);

    if (routeResult.success) {
      toast.success("Route calculated successfully!");
      onRouteCalculated?.(routeResult);
    } else {
      toast.error(routeResult.error || "Failed to calculate route");
    }
  }, [originPort, destinationPort, calculateRoute, onRouteCalculated]);

  const handleSwapPorts = useCallback(() => {
    const temp = originPort;
    setOriginPort(destinationPort);
    setDestinationPort(temp);
  }, [originPort, destinationPort]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Port Selection Card */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            NavAPI Route Planner
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Origin Port */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              Origin Port
            </Label>
            <NavApiPortSearch
              value={originPort}
              onSelect={setOriginPort}
              onClear={() => setOriginPort(null)}
              placeholder="Search origin port..."
            />
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSwapPorts}
              disabled={!originPort && !destinationPort}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="h-4 w-4 rotate-90" />
              <span className="sr-only">Swap ports</span>
            </Button>
          </div>

          {/* Destination Port */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              Destination Port
            </Label>
            <NavApiPortSearch
              value={destinationPort}
              onSelect={setDestinationPort}
              onClear={() => setDestinationPort(null)}
              placeholder="Search destination port..."
            />
          </div>

          {/* Calculate Button */}
          <Button
            onClick={handleCalculate}
            disabled={!canCalculate || isCalculating}
            className="w-full"
            size="lg"
          >
            {isCalculating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Calculating Route...
              </>
            ) : (
              <>
                <Ship className="h-4 w-4 mr-2" />
                Calculate Route
              </>
            )}
          </Button>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Results Card */}
      {result && result.success && (
        <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Anchor className="h-5 w-5 text-primary" />
              Route Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Route Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-green-500" />
                <span className="font-medium">{originPort?.displayName}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{destinationPort?.displayName}</span>
                <MapPin className="h-4 w-4 text-red-500" />
              </div>
            </div>

            {/* Distance Stats */}
            <div className="grid grid-cols-3 gap-4">
              {/* Total Distance */}
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-primary">
                  {result.totalDistanceNm.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })}
                </div>
                <div className="text-xs text-muted-foreground">Total NM</div>
              </div>

              {/* ECA Distance */}
              <div className="text-center p-3 rounded-lg bg-amber-500/10">
                <div className="text-2xl font-bold text-amber-600">
                  {result.ecaDistanceNm.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Fuel className="h-3 w-3" />
                  ECA NM
                </div>
              </div>

              {/* Non-ECA Distance */}
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">
                  {result.nonEcaDistanceNm.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })}
                </div>
                <div className="text-xs text-muted-foreground">Non-ECA NM</div>
              </div>
            </div>

            {/* ECA Percentage Bar */}
            {result.totalDistanceNm > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>ECA Coverage</span>
                  <span>
                    {((result.ecaDistanceNm / result.totalDistanceNm) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{
                      width: `${(result.ecaDistanceNm / result.totalDistanceNm) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Route Map */}
      {showMap && (
        <Card className="border-primary/20 overflow-hidden">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Map className="h-5 w-5 text-primary" />
              Route Map
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 relative">
            {/* NavApiRouteMap was removed during map consolidation */}
            <div className="h-[400px] flex items-center justify-center bg-muted text-muted-foreground">
              Deprecated — use NavApiMultiRoutePlanner instead
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export type { NavApiPort, RouteResult };

