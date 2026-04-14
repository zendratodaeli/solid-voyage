"use client";

import { type CiiRating, RATING_CONFIG } from "@/lib/calculations/cii-calculator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CiiRatingBadgeProps {
  rating: CiiRating;
  /** Attained CII value for tooltip */
  attainedCII?: number;
  /** Required CII for tooltip */
  requiredCII?: number;
  /** Size variant */
  size?: "sm" | "md";
  /** Show warning for D/E */
  showWarning?: boolean;
}

export function CiiRatingBadge({
  rating,
  attainedCII,
  requiredCII,
  size = "sm",
  showWarning = true,
}: CiiRatingBadgeProps) {
  const config = RATING_CONFIG[rating];
  const isWarning = showWarning && (rating === "D" || rating === "E");
  
  const sizeClasses = size === "sm"
    ? "w-6 h-6 text-xs"
    : "w-8 h-8 text-sm";

  const badge = (
    <div
      className={`
        ${sizeClasses} rounded-md font-bold flex items-center justify-center
        ${config.bgColor} ${config.color}
        ${isWarning ? "ring-1 ring-red-500/40 animate-pulse" : ""}
        transition-all duration-200
      `}
    >
      {rating}
    </div>
  );

  // Without tooltip data, just return the badge
  if (attainedCII === undefined) return badge;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3">
          <div className="space-y-1.5 text-xs">
            <p className="font-semibold">
              CII Rating: <span className={config.color}>{rating} — {config.label}</span>
            </p>
            <p className="text-muted-foreground">
              Attained: <span className="font-mono font-medium">{attainedCII.toFixed(2)}</span> gCO₂/(dwt·nm)
            </p>
            {requiredCII !== undefined && requiredCII > 0 && (
              <p className="text-muted-foreground">
                Required: <span className="font-mono font-medium">{requiredCII.toFixed(2)}</span> gCO₂/(dwt·nm)
              </p>
            )}
            {isWarning && (
              <p className="text-red-400 font-medium mt-1">
                ⚠️ IMO requires corrective action plan for D/E rated vessels
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
