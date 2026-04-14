"use client";

/**
 * Results Strip — Compact inline KPI summary after route calculation.
 * Shows: Total NM, Est. Days, Alert count.
 * Used in the Route Planner side panel as a glanceable overview.
 */

import {
  Navigation,
  Clock,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ResultsStripProps {
  totalDistanceNm: number;
  estimatedDays: number | null;
  totalLegs: number;
  ecaDistanceNm: number;
  hraDistanceNm: number;
  warnings: string[];
  className?: string;
}

export function ResultsStrip({
  totalDistanceNm,
  estimatedDays,
  totalLegs,
  ecaDistanceNm,
  hraDistanceNm,
  warnings,
  className,
}: ResultsStripProps) {
  const ecaPercent = totalDistanceNm > 0 ? Math.round((ecaDistanceNm / totalDistanceNm) * 100) : 0;
  const alertCount = (ecaDistanceNm > 0 ? 1 : 0) + (hraDistanceNm > 0 ? 1 : 0) + warnings.filter(w => w.includes("⛔") || w.includes("VIOLATION")).length;

  return (
    <div className={cn(
      "p-3 border-b border-border/30 space-y-2",
      className
    )}>
      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-2">
        {/* Distance */}
        <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="text-sm font-bold text-blue-400 tabular-nums">
            {totalDistanceNm.toLocaleString()}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">NM</div>
        </div>

        {/* Duration */}
        <div className="text-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-sm font-bold text-emerald-400 tabular-nums">
            {estimatedDays ? `${Math.round(estimatedDays * 10) / 10}` : "—"}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Days</div>
        </div>

        {/* Legs */}
        <div className="text-center p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="text-sm font-bold text-purple-400 tabular-nums">
            {totalLegs}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Legs</div>
        </div>
      </div>

      {/* ECA/HRA bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Navigation className="h-2.5 w-2.5" />
            Route Composition
          </span>
          {alertCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <AlertTriangle className="h-2.5 w-2.5" />
              {alertCount} alert{alertCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-blue-500/20 flex">
          {ecaDistanceNm > 0 && (
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${ecaPercent}%` }}
              title={`ECA: ${ecaDistanceNm.toLocaleString()} NM (${ecaPercent}%)`}
            />
          )}
          {hraDistanceNm > 0 && (
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${Math.round((hraDistanceNm / totalDistanceNm) * 100)}%` }}
              title={`HRA: ${hraDistanceNm.toLocaleString()} NM`}
            />
          )}
        </div>
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            Open Sea {(totalDistanceNm - ecaDistanceNm - hraDistanceNm).toLocaleString()} NM
          </span>
          {ecaDistanceNm > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              ECA {ecaDistanceNm.toLocaleString()} NM
            </span>
          )}
          {hraDistanceNm > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              HRA {hraDistanceNm.toLocaleString()} NM
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
