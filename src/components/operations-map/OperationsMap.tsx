"use client";

/**
 * OperationsMap — Unified spatial workspace combining AIS, Route Planner, and Weather.
 *
 * Tab modes:
 *  - Fleet: AIS vessel tracking (AisDashboard)
 *  - Route: Multi-port route planner (NavApiMultiRoutePlanner)
 *  - Weather: Maritime weather dashboard (WeatherDashboard)
 *
 * Features:
 *  - Tabs in header bar, full-bleed layout
 *  - State preserved across tab switches (display:none pattern)
 *  - URL-synced tab state via searchParams
 *  - Keyboard shortcuts: F/R/W for power users
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Radio,
  Map,
  CloudSun,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Lazy-loaded tab components ─────────────────────────────────

const AisDashboard = dynamic(
  () => import("@/components/ais/AisDashboard").then((m) => ({ default: m.AisDashboard })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

const NavApiMultiRoutePlanner = dynamic(
  () => import("@/components/route-planner/NavApiMultiRoutePlanner").then((m) => ({ default: m.NavApiMultiRoutePlanner })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

const WeatherDashboard = dynamic(
  () => import("@/components/weather/WeatherDashboard").then((m) => ({ default: m.WeatherDashboard })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

// ─── Tab Types ──────────────────────────────────────────────────

type TabMode = "fleet" | "route" | "weather";

const TAB_CONFIG = {
  fleet: {
    label: "Fleet",
    icon: Radio,
    shortcut: "F",
    description: "Live AIS vessel tracking and fleet monitoring",
  },
  route: {
    label: "Route",
    icon: Map,
    shortcut: "R",
    description: "Plan multi-port voyages with ECA zone detection",
  },
  weather: {
    label: "Weather",
    icon: CloudSun,
    shortcut: "W",
    description: "Maritime weather forecasts and conditions",
  },
} as const;

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

interface OperationsMapProps {
  orgId: string;
}

export function OperationsMap({ orgId }: OperationsMapProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read tab from URL, default to fleet
  const urlTab = searchParams.get("tab") as TabMode | null;
  const [activeTab, setActiveTab] = useState<TabMode>(
    urlTab === "route" ? "route" : urlTab === "weather" ? "weather" : "fleet"
  );

  // Track which tabs have been rendered at least once
  const [mountedTabs, setMountedTabs] = useState<Set<TabMode>>(
    new Set([activeTab])
  );

  // ─── Tab switching ────────────────────────────────────────────

  const switchTab = useCallback(
    (tab: TabMode) => {
      setActiveTab(tab);
      setMountedTabs((prev) => new Set(prev).add(tab));
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  // ─── Keyboard shortcuts ──────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "f":
          switchTab("fleet");
          break;
        case "r":
          switchTab("route");
          break;
        case "w":
          switchTab("weather");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [switchTab]);

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar — compact header pinned at top */}
      <div className="flex items-center gap-1 px-3 py-2 bg-background/95 backdrop-blur border-b border-border z-10 shrink-0">
        {/* Tab buttons */}
        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/50">
          {(Object.entries(TAB_CONFIG) as [TabMode, typeof TAB_CONFIG[TabMode]][]).map(
            ([key, config]) => {
              const isActive = activeTab === key;

              return (
                <button
                  key={key}
                  onClick={() => switchTab(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
                    isActive
                      ? "bg-background text-foreground shadow-sm border border-border/80"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                  title={`${config.description} (${config.shortcut})`}
                >
                  <config.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{config.label}</span>
                  <kbd className="hidden lg:inline-flex items-center justify-center h-4 min-w-[16px] rounded border border-border/60 bg-muted/80 text-[9px] text-muted-foreground font-mono px-0.5">
                    {config.shortcut}
                  </kbd>
                </button>
              );
            }
          )}
        </div>

        {/* Active tab description */}
        <span className="text-xs text-muted-foreground ml-3 hidden md:inline">
          {TAB_CONFIG[activeTab].description}
        </span>
      </div>

      {/* Tab Content — full-bleed, display:none preserved */}
      <div className="flex-1 relative overflow-hidden">
        {/* Fleet (AIS) */}
        <div
          className="absolute inset-0 overflow-auto"
          style={{ display: activeTab === "fleet" ? "block" : "none" }}
        >
          {mountedTabs.has("fleet") && (
            <div className="p-4 space-y-4">
              <AisDashboard orgId={orgId} />
            </div>
          )}
        </div>

        {/* Route Planner */}
        <div
          className="absolute inset-0"
          style={{ display: activeTab === "route" ? "block" : "none" }}
        >
          {mountedTabs.has("route") && (
            <NavApiMultiRoutePlanner className="h-full w-full" />
          )}
        </div>

        {/* Weather */}
        <div
          className="absolute inset-0 overflow-auto"
          style={{ display: activeTab === "weather" ? "block" : "none" }}
        >
          {mountedTabs.has("weather") && (
            <div className="p-4">
              <WeatherDashboard />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
