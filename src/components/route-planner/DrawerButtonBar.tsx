"use client";

/**
 * Drawer Button Bar — Icon buttons to open detail drawers.
 * Renders 5 buttons: Summary, Compliance, Legs, Weather, Optimizer.
 * Each button has an active state and optional badge.
 */

import {
  Navigation,
  Scale,
  Layers,
  CloudSun,
  Zap,
  AlertTriangle,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DrawerType = "summary" | "compliance" | "legs" | "weather" | "optimizer" | "ai-insight";

interface DrawerButtonBarProps {
  activeDrawer: DrawerType | null;
  onOpenDrawer: (drawer: DrawerType) => void;
  hasWeather?: boolean;
  hasOptimizer?: boolean;
  hasAiInsight?: boolean;
  alertCount?: number;
  className?: string;
}

const DRAWER_BUTTONS: Array<{
  type: DrawerType;
  icon: typeof Navigation;
  label: string;
  shortLabel: string;
  color: string;
  activeColor: string;
}> = [
  {
    type: "summary",
    icon: Navigation,
    label: "Voyage Summary",
    shortLabel: "Summary",
    color: "text-blue-400/70 hover:text-blue-400",
    activeColor: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  },
  {
    type: "compliance",
    icon: Scale,
    label: "Compliance & Costs",
    shortLabel: "Compliance",
    color: "text-emerald-400/70 hover:text-emerald-400",
    activeColor: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  },
  {
    type: "legs",
    icon: Layers,
    label: "Leg Breakdown",
    shortLabel: "Legs",
    color: "text-purple-400/70 hover:text-purple-400",
    activeColor: "text-purple-400 bg-purple-500/15 border-purple-500/30",
  },
  {
    type: "weather",
    icon: CloudSun,
    label: "Weather Forecast",
    shortLabel: "Weather",
    color: "text-amber-400/70 hover:text-amber-400",
    activeColor: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  },
  {
    type: "optimizer",
    icon: Zap,
    label: "Voyage Optimizer",
    shortLabel: "Optimizer",
    color: "text-violet-400/70 hover:text-violet-400",
    activeColor: "text-violet-400 bg-violet-500/15 border-violet-500/30",
  },
  {
    type: "ai-insight",
    icon: Brain,
    label: "AI Recommendation",
    shortLabel: "AI Insight",
    color: "text-rose-400/70 hover:text-rose-400",
    activeColor: "text-rose-400 bg-rose-500/15 border-rose-500/30",
  },
];

export function DrawerButtonBar({
  activeDrawer,
  onOpenDrawer,
  hasWeather = false,
  hasOptimizer = true,
  hasAiInsight = false,
  alertCount = 0,
  className,
}: DrawerButtonBarProps) {
  return (
    <div className={cn("p-3 border-b border-border/30", className)}>
      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
        Detail Panels
      </p>
      <div className="grid grid-cols-6 gap-1.5">
        {DRAWER_BUTTONS.map((btn) => {
          // Hide weather if no weather data, hide optimizer conditionally
          if (btn.type === "weather" && !hasWeather) return null;
          if (btn.type === "optimizer" && !hasOptimizer) return null;
          if (btn.type === "ai-insight" && !hasAiInsight) return null;
          
          const isActive = activeDrawer === btn.type;
          const Icon = btn.icon;

          return (
            <button
              key={btn.type}
              onClick={() => onOpenDrawer(btn.type)}
              className={cn(
                "relative flex flex-col items-center gap-1 p-2 rounded-lg border transition-all duration-200",
                isActive
                  ? btn.activeColor
                  : "border-transparent hover:border-border/50 hover:bg-muted/30 " + btn.color
              )}
              title={btn.label}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[8px] font-medium leading-none">{btn.shortLabel}</span>

              {/* Alert badge on Compliance */}
              {btn.type === "compliance" && alertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white shadow-sm">
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
