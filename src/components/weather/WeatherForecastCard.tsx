"use client";

/**
 * Weather Forecast Card Component
 *
 * Displays marine weather summary and per-waypoint breakdown
 * for a calculated route. Shown in the route planner results panel.
 */

import { useState } from "react";
import {
  Cloud,
  Waves,
  Wind,
  Thermometer,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Navigation,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RouteWeatherSummary, WaypointWeather } from "@/types/weather";
import { SEVERITY_CONFIG, degreesToCompass } from "@/types/weather";

interface WeatherForecastCardProps {
  weather: RouteWeatherSummary | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
}

export function WeatherForecastCard({
  weather,
  isLoading = false,
  error,
  onRefresh,
  className,
}: WeatherForecastCardProps) {
  const [expandedWaypoints, setExpandedWaypoints] = useState<Set<number>>(
    new Set()
  );

  const toggleWaypoint = (index: number) => {
    const updated = new Set(expandedWaypoints);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setExpandedWaypoints(updated);
  };

  if (isLoading) {
    return (
      <Card className={cn("bg-muted/30", className)}>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-blue-500 mb-3" />
          <p className="text-sm text-muted-foreground">
            Fetching marine weather forecast...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("bg-red-500/5 border-red-500/20", className)}>
        <CardContent className="py-6 text-center">
          <Cloud className="h-8 w-8 mx-auto text-red-400/50 mb-3" />
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">
            {error}
          </p>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!weather) return null;

  const { worstConditions, averageConditions, advisories, waypoints } = weather;
  const worstConfig = SEVERITY_CONFIG[worstConditions.severity];
  const avgConfig = SEVERITY_CONFIG[averageConditions.overallSeverity];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Weather Advisories */}
      {advisories.length > 0 && (
        <div className="space-y-2">
          {advisories.map((advisory, idx) => {
            const config = SEVERITY_CONFIG[advisory.severity];
            return (
              <div
                key={idx}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  config.bgColor,
                  config.borderColor
                )}
              >
                <AlertTriangle
                  className={cn("h-4 w-4 shrink-0 mt-0.5", config.color)}
                />
                <p className={cn("text-sm", config.color)}>
                  {advisory.message}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Weather Forecast
            </CardTitle>
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="h-8 text-xs text-muted-foreground"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 gap-3">
            {/* Worst Conditions */}
            <div
              className={cn(
                "p-3 rounded-lg border",
                worstConfig.bgColor,
                worstConfig.borderColor
              )}
            >
              <div className="flex items-center gap-1 mb-1">
                <Waves className={cn("h-4 w-4", worstConfig.color)} />
                <span className="text-xs text-muted-foreground">
                  Worst Seas
                </span>
              </div>
              <div className={cn("text-xl font-bold", worstConfig.color)}>
                {worstConditions.maxWaveHeight.toFixed(1)}m
              </div>
              <div className="text-xs text-muted-foreground">
                {worstConfig.label}
              </div>
            </div>

            {/* Average Conditions */}
            <div
              className={cn(
                "p-3 rounded-lg border",
                avgConfig.bgColor,
                avgConfig.borderColor
              )}
            >
              <div className="flex items-center gap-1 mb-1">
                <Waves className={cn("h-4 w-4", avgConfig.color)} />
                <span className="text-xs text-muted-foreground">Avg Seas</span>
              </div>
              <div className={cn("text-xl font-bold", avgConfig.color)}>
                {averageConditions.avgWaveHeight.toFixed(1)}m
              </div>
              <div className="text-xs text-muted-foreground">
                {avgConfig.label}
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2 rounded-lg bg-muted/50 text-center">
              <Wind className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm font-semibold">
                {worstConditions.maxSwellHeight.toFixed(1)}m
              </div>
              <div className="text-[10px] text-muted-foreground">Max Swell</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/50 text-center">
              <Thermometer className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm font-semibold">
                {averageConditions.avgSeaTemp.toFixed(1)}°C
              </div>
              <div className="text-[10px] text-muted-foreground">
                Avg Sea Temp
              </div>
            </div>
            <div className="p-2 rounded-lg bg-muted/50 text-center">
              <Waves className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm font-semibold">
                {averageConditions.avgSwellHeight.toFixed(1)}m
              </div>
              <div className="text-[10px] text-muted-foreground">Avg Swell</div>
            </div>
          </div>

          {/* Per-Waypoint Breakdown */}
          {waypoints.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Waypoint Breakdown
              </div>
              {waypoints.map((wp, index) => {
                const isExpanded = expandedWaypoints.has(index);
                const wpConfig = SEVERITY_CONFIG[wp.current.severity];
                return (
                  <WaypointWeatherRow
                    key={index}
                    wp={wp}
                    index={index}
                    isExpanded={isExpanded}
                    onToggle={() => toggleWaypoint(index)}
                    severityConfig={wpConfig}
                  />
                );
              })}
            </div>
          )}

          {/* Fetched timestamp */}
          <div className="text-[10px] text-muted-foreground text-right">
            Updated: {new Date(weather.fetchedAt).toLocaleString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Individual waypoint weather row */
function WaypointWeatherRow({
  wp,
  index,
  isExpanded,
  onToggle,
  severityConfig,
}: {
  wp: WaypointWeather;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  severityConfig: (typeof SEVERITY_CONFIG)[keyof typeof SEVERITY_CONFIG];
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Row Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}

        <div className="flex-1 text-left">
          <span className="text-xs font-medium">
            Point {index + 1}
          </span>
          <span className="text-[10px] text-muted-foreground ml-2">
            ({wp.latitude.toFixed(2)}°, {wp.longitude.toFixed(2)}°)
          </span>
        </div>

        {/* Severity badge */}
        <span
          className={cn(
            "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
            severityConfig.bgColor,
            severityConfig.borderColor,
            severityConfig.color
          )}
        >
          {wp.current.waveHeight.toFixed(1)}m — {severityConfig.label}
        </span>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border bg-muted/30">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <DetailRow
              icon={Waves}
              label="Wave Height"
              value={`${wp.current.waveHeight.toFixed(1)}m`}
            />
            <DetailRow
              icon={Navigation}
              label="Wave Direction"
              value={`${degreesToCompass(wp.current.waveDirection)} (${wp.current.waveDirection.toFixed(0)}°)`}
            />
            <DetailRow
              icon={Waves}
              label="Wave Period"
              value={`${wp.current.wavePeriod.toFixed(1)}s`}
            />
            <DetailRow
              icon={Wind}
              label="Wind Waves"
              value={`${wp.current.windWaveHeight.toFixed(1)}m`}
            />
            <DetailRow
              icon={Waves}
              label="Swell Height"
              value={`${wp.current.swellWaveHeight.toFixed(1)}m`}
            />
            <DetailRow
              icon={Navigation}
              label="Swell Direction"
              value={`${degreesToCompass(wp.current.swellWaveDirection)} (${wp.current.swellWaveDirection.toFixed(0)}°)`}
            />
            <DetailRow
              icon={Waves}
              label="Swell Period"
              value={`${wp.current.swellWavePeriod.toFixed(1)}s`}
            />
            <DetailRow
              icon={Thermometer}
              label="Sea Temp"
              value={`${wp.current.seaSurfaceTemperature.toFixed(1)}°C`}
            />
          </div>

          {wp.current.oceanCurrentVelocity > 0.1 && (
            <div className="text-[10px] text-muted-foreground border-t border-border pt-1.5">
              🔄 Current: {wp.current.oceanCurrentVelocity.toFixed(2)} m/s{" "}
              {degreesToCompass(wp.current.oceanCurrentDirection)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Small labeled row inside expanded details */
function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium ml-auto">{value}</span>
    </div>
  );
}
