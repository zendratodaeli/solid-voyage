"use client";

/**
 * FleetOperations — Unified command center combining Fleet Schedule and Cargo Board.
 *
 * Three view modes:
 *  - Timeline: Gantt-style fleet schedule (current FleetSchedule)
 *  - Pipeline: Cargo inquiry board (current CargoBoard)
 *  - Analytics: Pipeline funnel + broker scorecard
 *
 * Features:
 *  - Adaptive KPI strip (vessel KPIs in Timeline, cargo KPIs in Pipeline)
 *  - Notification badges on view toggles
 *  - State preserved across view switches (display:none, not unmount)
 *  - URL-synced view state via searchParams
 *  - Keyboard shortcuts: 1/2/3 for power users
 */

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import {
  CalendarRange,
  Package,
  BarChart3,
  AlertCircle,
  Ship,
  Anchor,
  TrendingUp,
  DollarSign,
  Clock,
  Loader2,
  Target,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Lazy-loaded view components (code splits) ──────────────────

const FleetSchedule = dynamic(
  () => import("@/components/fleet-schedule/FleetSchedule").then((m) => ({ default: m.FleetSchedule })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

const CargoBoard = dynamic(
  () => import("@/components/cargo-board/CargoBoard").then((m) => ({ default: m.CargoBoard })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

// ─── View Types ─────────────────────────────────────────────────

type ViewMode = "timeline" | "pipeline";

const VIEW_CONFIG = {
  timeline: {
    label: "Timeline",
    icon: CalendarRange,
    shortcut: "1",
  },
  pipeline: {
    label: "Pipeline",
    icon: Package,
    shortcut: "2",
  },
} as const;

// ─── KPI Data Hook ──────────────────────────────────────────────

function useFleetKpis() {
  const [kpis, setKpis] = useState<{
    fleetCount: number;
    idleVessels: number;
    urgentInquiries: number;
    activeInquiries: number;
  }>({
    fleetCount: 0,
    idleVessels: 0,
    urgentInquiries: 0,
    activeInquiries: 0,
  });

  useEffect(() => {
    // Fetch fleet KPI counts for badges
    async function fetchKpis() {
      try {
        const [vesselRes, inquiryRes] = await Promise.all([
          fetch("/api/vessels"),
          fetch("/api/cargo-inquiries"),
        ]);
        if (vesselRes.ok) {
          const data = await vesselRes.json();
          const vessels = data.data || [];
          setKpis((prev) => ({
            ...prev,
            fleetCount: vessels.length,
          }));
        }
        if (inquiryRes.ok) {
          const data = await inquiryRes.json();
          const inquiries = data.data || [];
          const urgent = inquiries.filter((i: any) =>
            i.status === "NEW" && i.priority === "URGENT"
          ).length;
          const active = inquiries.filter((i: any) =>
            !["FIXED", "LOST", "EXPIRED", "CANCELLED"].includes(i.status)
          ).length;
          setKpis((prev) => ({
            ...prev,
            urgentInquiries: urgent,
            activeInquiries: active,
          }));
        }
      } catch {
        // Silently fail — badges will show 0
      }
    }
    fetchKpis();
  }, []);

  return kpis;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function FleetOperations() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read view from URL, default to timeline
  const urlView = searchParams.get("view") as ViewMode | null;
  const [activeView, setActiveView] = useState<ViewMode>(
    urlView === "pipeline" ? "pipeline" : "timeline"
  );

  // Track which views have been rendered at least once (for lazy mounting)
  const [mountedViews, setMountedViews] = useState<Set<ViewMode>>(
    new Set([activeView])
  );

  const kpis = useFleetKpis();

  // ─── View switching ──────────────────────────────────────────

  const switchView = useCallback(
    (view: ViewMode) => {
      setActiveView(view);
      setMountedViews((prev) => new Set(prev).add(view));
      // Update URL without causing navigation
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", view);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  // ─── Keyboard shortcuts ──────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "1":
          switchView("timeline");
          break;
        case "2":
          switchView("pipeline");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [switchView]);

  // ─── Badge counts for view toggles ───────────────────────────

  const timelineBadge = kpis.idleVessels > 0 ? kpis.idleVessels : null;
  const pipelineBadge = kpis.urgentInquiries > 0 ? kpis.urgentInquiries : (kpis.activeInquiries > 0 ? kpis.activeInquiries : null);
  const pipelineBadgeColor = kpis.urgentInquiries > 0 ? "bg-red-500" : "bg-blue-500";

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header + View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fleet Operations</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {activeView === "timeline"
              ? "Fleet deployment timeline — vessel availability, voyage schedules, and open positions"
              : "Commercial cargo pipeline — track inquiries from broker to fixture"}
          </p>
        </div>

        {/* View Toggle Buttons */}
        <div className="flex items-center bg-muted/50 rounded-lg p-1 border border-border/50 shrink-0">
          {(Object.entries(VIEW_CONFIG) as [ViewMode, typeof VIEW_CONFIG[ViewMode]][]).map(
            ([key, config]) => {
              const isActive = activeView === key;
              const badge = key === "timeline" ? timelineBadge : pipelineBadge;
              const badgeColor = key === "pipeline" ? pipelineBadgeColor : "bg-amber-500";

              return (
                <button
                  key={key}
                  onClick={() => switchView(key)}
                  className={cn(
                    "relative flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-background text-foreground shadow-sm border border-border/80"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                  title={`Switch to ${config.label} view (${config.shortcut})`}
                >
                  <config.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{config.label}</span>

                  {/* Notification badge */}
                  {badge !== null && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-4.5 min-w-[18px] px-1 rounded-full text-[10px] font-bold text-white leading-none",
                        badgeColor
                      )}
                    >
                      {badge}
                    </span>
                  )}

                  {/* Keyboard shortcut hint */}
                  <kbd className="hidden lg:inline-flex items-center justify-center h-5 w-5 rounded border border-border/60 bg-muted/80 text-[10px] text-muted-foreground font-mono">
                    {config.shortcut}
                  </kbd>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* View Content — always mounted once rendered, hidden with display:none */}
      <div
        style={{ display: activeView === "timeline" ? "block" : "none" }}
      >
        {mountedViews.has("timeline") && <FleetSchedule />}
      </div>

      <div
        style={{ display: activeView === "pipeline" ? "block" : "none" }}
      >
        {mountedViews.has("pipeline") && <CargoBoard />}
      </div>
    </div>
  );
}
