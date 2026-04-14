"use client";

/**
 * FleetSchedule — Gantt-style fleet deployment timeline
 *
 * Phase 1: Timeline with vessel rows, voyage bars, status colors, tooltips
 * Phase 2: Open Positions panel with "Create Voyage" deep links
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarRange,
  Ship,
  Anchor,
  AlertTriangle,
  Clock,
  DollarSign,
  TrendingUp,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  RefreshCw,
  PanelRightOpen,
  PanelRightClose,
  Building2,
  Timer,
  ArrowUpDown,
  Filter,
  Eye,
  EyeOff,
  Search,
  X,
  SlidersHorizontal,
  Package,
  ArrowRightLeft,
  Undo2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getFleetScheduleData,
  type FleetScheduleData,
  type FleetVesselRow,
  type FleetVoyageBar,
  type FleetGap,
} from "@/actions/fleet-schedule-actions";
import {
  getFleetFilterPresets,
  saveFleetFilterPreset,
  deleteFleetFilterPreset,
  type FilterPreset,
  type FilterPresetData,
} from "@/actions/fleet-preset-actions";
import {
  createDraftVoyageFromDrop,
  getInquiryBadgesForVessels,
  reassignVoyageToVessel,
  unassignVoyageToInquiry,
  type FleetInquirySummary,
} from "@/actions/cargo-inquiry-actions";
import { InquiryDockPanel } from "./InquiryDockPanel";
import { usePusher } from "@/hooks/use-pusher";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

type TimeScale = "week" | "month" | "quarter";
type SortKey = "name" | "openDate" | "dwt" | "idleCost";
type DwtRange = "all" | "handy" | "supra" | "panamax" | "cape";
type OpenWithin = "all" | "7" | "14" | "30" | "60";

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  DRAFT: { bg: "bg-zinc-500/30", border: "border-zinc-500/50", text: "text-zinc-300", label: "Draft" },
  NEW: { bg: "bg-blue-500/30", border: "border-blue-500/50", text: "text-blue-300", label: "New-Evaluating" },
  OFFERED: { bg: "bg-purple-500/40", border: "border-purple-500/60", text: "text-purple-300", label: "Offered-Negotiating" },
  FIXED: { bg: "bg-emerald-500/50", border: "border-emerald-500/70", text: "text-emerald-200", label: "Fixed" },
  COMPLETED: { bg: "bg-teal-500/40", border: "border-teal-500/60", text: "text-teal-300", label: "Completed" },
  REJECTED: { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400", label: "Rejected" },
  LOST: { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400", label: "Lost" },
  EXPIRED: { bg: "bg-gray-500/20", border: "border-gray-500/40", text: "text-gray-400", label: "Expired" },
  WITHDRAWN: { bg: "bg-slate-500/20", border: "border-slate-500/40", text: "text-slate-400", label: "Withdrawn" },
};

const VESSEL_TYPE_LABELS: Record<string, string> = {
  CAPESIZE: "Capesize",
  PANAMAX: "Panamax",
  POST_PANAMAX: "Post-Panamax",
  SUPRAMAX: "Supramax",
  HANDYMAX: "Handymax",
  HANDYSIZE: "Handysize",
  BULK_CARRIER: "Bulk Carrier",
  VLCC: "VLCC",
  SUEZMAX: "Suezmax",
  AFRAMAX: "Aframax",
  MR_TANKER: "MR Tanker",
  LR1_TANKER: "LR1 Tanker",
  LR2_TANKER: "LR2 Tanker",
  CHEMICAL_TANKER: "Chemical Tanker",
  PRODUCT_TANKER: "Product Tanker",
  CONTAINER_FEEDER: "Feeder",
  CONTAINER_PANAMAX: "Panamax Container",
  CONTAINER_POST_PANAMAX: "Post-Panamax Container",
  CONTAINER_ULCV: "ULCV",
  LNG_CARRIER: "LNG Carrier",
  LPG_CARRIER: "LPG Carrier",
  GENERAL_CARGO: "General Cargo",
  MULTI_PURPOSE: "Multi-Purpose",
  HEAVY_LIFT: "Heavy Lift",
  CAR_CARRIER: "Car Carrier",
  RO_RO: "Ro-Ro",
  OTHER: "Other",
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatMoney(v: number, dec = 0): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(dec)}K`;
  return `$${v.toFixed(dec)}`;
}

function formatDwt(dwt: number): string {
  if (dwt >= 1_000) return `${(dwt / 1_000).toFixed(0)}K DWT`;
  return `${dwt.toFixed(0)} DWT`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function FleetSchedule() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  const [data, setData] = useState<FleetScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeScale, setTimeScale] = useState<TimeScale>("month");
  const [showPanel, setShowPanel] = useState(true);
  const [hoveredVoyage, setHoveredVoyage] = useState<string | null>(null);
  const [tooltipVoyage, setTooltipVoyage] = useState<{ bar: FleetVoyageBar; x: number; y: number } | null>(null);
  // Phase 5: Draggable voyage bars for reassign / unassign
  const [draggingVoyage, setDraggingVoyage] = useState<{ voyageId: string; vesselId: string } | null>(null);

  // ── Custom mouse-based drag for voyage bars (replaces broken HTML5 DnD) ──
  const [customDrag, setCustomDrag] = useState<{
    voyageId: string;
    sourceVesselId: string;
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
    active: boolean; // true once moved past threshold
  } | null>(null);
  const [customDragTarget, setCustomDragTarget] = useState<string | null>(null); // vessel ID or '__dock__'

  // ── Sort & Filter State (Phase 1–3) ────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [vesselTypeFilter, setVesselTypeFilter] = useState<string[]>([]);
  const [dwtRange, setDwtRange] = useState<DwtRange>("all");
  const [commercialFilter, setCommercialFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [openWithin, setOpenWithin] = useState<OpenWithin>("all");
  const [portSearch, setPortSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ── Saved Filter Presets ────────────────────────────────────
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // ── Phase 4: Drag & Drop state ────────────────────────────────
  const [draggingInquiry, setDraggingInquiry] = useState<FleetInquirySummary | null>(null);
  const [dropTargetVessel, setDropTargetVessel] = useState<string | null>(null);
  const [dropConfirmation, setDropConfirmation] = useState<{
    inquiryId: string;
    inquiryLabel: string;
    vesselId: string;
    vesselName: string;
  } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [inquiryBadges, setInquiryBadges] = useState<Record<string, { count: number; urgentCount: number }>>({});
  const [assignedInquiryIds, setAssignedInquiryIds] = useState<string[]>([]);
  const [dockRefreshKey, setDockRefreshKey] = useState(0);

  // ── Crosshair state ────────────────────────────────────────────
  const [crosshairX, setCrosshairX] = useState<number | null>(null);
  const [crosshairDate, setCrosshairDate] = useState<Date | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Viewport navigation
  const [viewportStart, setViewportStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d;
  });

  const viewportDays = useMemo(() => {
    switch (timeScale) {
      case "week": return 14;
      case "month": return 60;
      case "quarter": return 120;
    }
  }, [timeScale]);

  const viewportEnd = useMemo(() => {
    const d = new Date(viewportStart);
    d.setDate(d.getDate() + viewportDays);
    return d;
  }, [viewportStart, viewportDays]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, badgesResult] = await Promise.all([
        getFleetScheduleData(),
        getInquiryBadgesForVessels(),
      ]);
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setError(result.error || "Failed to load fleet schedule");
      }
      if (badgesResult.success && badgesResult.data) {
        setInquiryBadges(badgesResult.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent background refresh — syncs server state without showing loading spinner
  const silentRefresh = useCallback(async () => {
    try {
      const [result, badgesResult] = await Promise.all([
        getFleetScheduleData(),
        getInquiryBadgesForVessels(),
      ]);
      if (result.success && result.data) {
        setData(result.data);
      }
      if (badgesResult.success && badgesResult.data) {
        setInquiryBadges(badgesResult.data);
      }
      // Trigger dock panel to re-fetch from server (it will get authoritative data)
      setDockRefreshKey(k => k + 1);
      // Clear exclusion filter after a short delay to let dock panel re-fetch first
      setTimeout(() => setAssignedInquiryIds([]), 2000);
    } catch {
      // Silent — don't show errors for background sync
    }
  }, []);

  // Phase 4: Handle drop confirmation (OPTIMISTIC)
  const handleDropConfirm = useCallback(async () => {
    if (!dropConfirmation || !data) return;

    // Build an optimistic voyage bar from the dragging inquiry data
    const inquiry = draggingInquiry;
    const depDate = inquiry?.laycanStart
      ? new Date(inquiry.laycanStart)
      : new Date();
    const arrDate = inquiry?.laycanEnd
      ? new Date(new Date(inquiry.laycanEnd).getTime() + 14 * 24 * 60 * 60 * 1000)
      : new Date(depDate.getTime() + 21 * 24 * 60 * 60 * 1000);
    const totalDays = Math.max(1, Math.ceil((arrDate.getTime() - depDate.getTime()) / (24 * 60 * 60 * 1000)));

    const optimisticBar: FleetVoyageBar = {
      id: `optimistic-${Date.now()}`, // temporary ID, replaced on refresh
      loadPort: inquiry?.loadPort || dropConfirmation.inquiryLabel,
      dischargePort: inquiry?.dischargePort || "",
      openPort: null,
      status: "DRAFT",
      cargoType: inquiry?.cargoType || null,
      cargoQuantityMt: inquiry?.cargoQuantityMt || 0,
      freightRateUsd: inquiry?.freightOffered || null,
      startDate: depDate.toISOString(),
      endDate: arrDate.toISOString(),
      totalVoyageDays: totalDays,
      tce: null,
      voyagePnl: null,
      breakEvenFreight: null,
      grossRevenue: null,
      totalBunkerCost: null,
      totalVoyageCost: null,
      estimatedDeparture: depDate.toISOString(),
      estimatedArrival: arrDate.toISOString(),
      actualDeparture: null,
      actualArrival: null,
      redeliveryPort: inquiry?.dischargePort || null,
      redeliveryDate: arrDate.toISOString(),
      inquiryStatus: "OFFERED",
    };

    // ── OPTIMISTIC UPDATE: Add voyage bar to target vessel immediately ──
    const snapshot = data;
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        vessels: prev.vessels.map(v => {
          if (v.id === dropConfirmation.vesselId) {
            return {
              ...v,
              voyages: [...v.voyages, optimisticBar].sort(
                (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
              ),
            };
          }
          return v;
        }),
      };
    });

    // Close dialog immediately
    setDropping(false);
    setDropConfirmation(null);
    setDraggingInquiry(null);
    // Hide this inquiry from dock panel immediately
    setAssignedInquiryIds(prev => [...prev, dropConfirmation.inquiryId]);

    toast.success("Draft voyage created", {
      description: `Assigned to ${dropConfirmation.vesselName}`,
    });

    // ── API call in background ──
    try {
      const result = await createDraftVoyageFromDrop(
        dropConfirmation.inquiryId,
        dropConfirmation.vesselId
      );
      if (result.success) {
        // Silent refresh to get real voyage ID, calculations, etc.
        silentRefresh();
      } else {
        // Revert optimistic update
        setData(snapshot);
        toast.error("Failed to create voyage — reverted", {
          description: result.error || "Unknown error",
          duration: 6000,
        });
      }
    } catch (err) {
      // Revert optimistic update
      setData(snapshot);
      toast.error("Failed to create voyage — reverted", {
        description: "An unexpected error occurred. Please try again.",
      });
    }
  }, [dropConfirmation, draggingInquiry, data, silentRefresh]);

  const handleVesselDrop = useCallback(
    (vesselId: string, vesselName: string, vesselDwt: number, inquiryId: string) => {
      if (!draggingInquiry) return;
      setDropTargetVessel(null);

      // ── Immediate DWT safety check ──
      if (vesselDwt < draggingInquiry.cargoQuantityMt) {
        toast.error("Cannot assign cargo to vessel", {
          description: `${vesselName} (DWT ${vesselDwt.toLocaleString()} MT) cannot carry ${draggingInquiry.cargoQuantityMt.toLocaleString()} MT of ${draggingInquiry.cargoType}. DWT capacity is insufficient.`,
          duration: 6000,
        });
        return;
      }

      setDropConfirmation({
        inquiryId,
        inquiryLabel: `${draggingInquiry.cargoType} (${(draggingInquiry.cargoQuantityMt / 1000).toFixed(0)}K MT)`,
        vesselId,
        vesselName,
      });
    },
    [draggingInquiry]
  );

  // ── Voyage bar drag → another vessel = reassign (OPTIMISTIC) ──
  const handleVoyageDropOnVessel = useCallback(
    async (targetVesselId: string, targetVesselName: string, targetVesselDwt: number, voyageId: string) => {
      setDropTargetVessel(null);
      if (!data) return;

      // Find the voyage bar in any vessel to check DWT
      let voyageBar: FleetVoyageBar | undefined;
      let sourceVesselId: string | undefined;
      for (const v of data.vessels) {
        const found = v.voyages.find(voy => voy.id === voyageId);
        if (found) {
          voyageBar = found;
          sourceVesselId = v.id;
          break;
        }
      }

      // Guard: don't drop on the same vessel it's already on
      if (sourceVesselId === targetVesselId) return;

      // DWT safety check
      if (voyageBar?.cargoQuantityMt && targetVesselDwt < voyageBar.cargoQuantityMt) {
        toast.error("Cannot reassign to this vessel", {
          description: `${targetVesselName} (DWT ${targetVesselDwt.toLocaleString()} MT) cannot carry ${voyageBar.cargoQuantityMt.toLocaleString()} MT. DWT insufficient.`,
          duration: 6000,
        });
        return;
      }

      if (!voyageBar || !sourceVesselId) return;

      // ── OPTIMISTIC UPDATE: Move voyage bar in local state immediately ──
      const snapshot = data;
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          vessels: prev.vessels.map(v => {
            if (v.id === sourceVesselId) {
              // Remove from source
              return { ...v, voyages: v.voyages.filter(voy => voy.id !== voyageId) };
            }
            if (v.id === targetVesselId) {
              // Add to target
              return { ...v, voyages: [...v.voyages, voyageBar!].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()) };
            }
            return v;
          }),
        };
      });
      setDraggingVoyage(null);

      toast.success("Voyage reassigned", {
        description: `Moved to ${targetVesselName}`,
      });

      // ── API call in background ──
      const result = await reassignVoyageToVessel(voyageId, targetVesselId);
      if (!result.success) {
        // Revert optimistic update
        setData(snapshot);
        toast.error("Failed to reassign — reverted", {
          description: result.error || "An unexpected error occurred.",
        });
      } else {
        // Silently refresh to get accurate server state (KPIs, open positions, etc.)
        silentRefresh();
      }
    },
    [data, silentRefresh]
  );

  // ── Voyage bar drag → dock panel = unassign (OPTIMISTIC) ──
  const handleVoyageUnassign = useCallback(
    async (voyageId: string) => {
      if (!data) return;

      // ── OPTIMISTIC UPDATE: Remove voyage from vessel immediately ──
      const snapshot = data;
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          vessels: prev.vessels.map(v => ({
            ...v,
            voyages: v.voyages.filter(voy => voy.id !== voyageId),
          })),
        };
      });
      setDraggingVoyage(null);

      toast.success("Returned to inquiries", {
        description: "Cargo inquiry reverted to New-Evaluating status.",
      });

      // ── API call in background ──
      const result = await unassignVoyageToInquiry(voyageId);
      if (!result.success) {
        // Revert optimistic update
        setData(snapshot);
        toast.error("Failed to unassign — reverted", {
          description: result.error || "An unexpected error occurred.",
        });
      } else {
        // Silently refresh to get accurate server state
        silentRefresh();
      }
    },
    [data, silentRefresh]
  );

  // ── Custom drag: Document-level mouse handlers ──────────────────
  useEffect(() => {
    if (!customDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - customDrag.startX;
      const dy = e.clientY - customDrag.startY;
      const moved = Math.abs(dx) > 5 || Math.abs(dy) > 5;

      setCustomDrag(prev => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY, active: prev.active || moved } : null);

      if (moved || customDrag.active) {
        // Hit-test: find vessel row or dock panel under cursor
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (el) {
          const vesselRow = el.closest('[data-vessel-id]') as HTMLElement | null;
          const dockPanel = el.closest('[data-dock-panel]') as HTMLElement | null;
          if (dockPanel) {
            setCustomDragTarget('__dock__');
            setDropTargetVessel(null);
          } else if (vesselRow) {
            const vid = vesselRow.getAttribute('data-vessel-id')!;
            setCustomDragTarget(vid);
            setDropTargetVessel(vid);
          } else {
            setCustomDragTarget(null);
            setDropTargetVessel(null);
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (customDrag.active) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (el) {
          const vesselRow = el.closest('[data-vessel-id]') as HTMLElement | null;
          const dockPanel = el.closest('[data-dock-panel]') as HTMLElement | null;

          if (dockPanel) {
            // Unassign — return to inquiries
            handleVoyageUnassign(customDrag.voyageId);
          } else if (vesselRow) {
            const targetVesselId = vesselRow.getAttribute('data-vessel-id')!;
            if (targetVesselId !== customDrag.sourceVesselId) {
              // Reassign to different vessel
              const targetVessel = data?.vessels.find(v => v.id === targetVesselId);
              if (targetVessel) {
                handleVoyageDropOnVessel(targetVesselId, targetVessel.name, targetVessel.dwt, customDrag.voyageId);
              }
            }
          }
        }
      } else {
        // Short click (no drag movement) → open voyage popover
        const voyageId = customDrag.voyageId;
        for (const v of data?.vessels || []) {
          const bar = v.voyages.find(voy => voy.id === voyageId);
          if (bar) {
            setTooltipVoyage({ bar, x: e.clientX, y: e.clientY + 16 });
            break;
          }
        }
      }

      setCustomDrag(null);
      setCustomDragTarget(null);
      setDraggingVoyage(null);
      setDropTargetVessel(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [customDrag, data, handleVoyageDropOnVessel, handleVoyageUnassign]);

  useEffect(() => {
    fetchData();
    // Load saved presets
    getFleetFilterPresets().then((res) => {
      if (res.success && res.data) setPresets(res.data);
    });
  }, [fetchData]);

  // ── Real-time: Pusher subscription (instant patch + background refresh) ──
  usePusher({
    onVoyageUpdated: useCallback((event: { voyageId: string; status: string }) => {
      // Instant: patch voyage bar status in local state
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          vessels: prev.vessels.map(v => ({
            ...v,
            voyages: v.voyages.map(voy =>
              voy.id === event.voyageId ? { ...voy, status: event.status } : voy
            ),
          })),
        };
      });
      // Background: full refresh for calculations, KPIs, etc.
      silentRefresh();
    }, [silentRefresh]),
    onCargoUpdated: useCallback((event: { voyageId: string | null; status: string }) => {
      // Instant: patch inquiryStatus on the matching voyage bar
      if (event.voyageId) {
        setData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            vessels: prev.vessels.map(v => ({
              ...v,
              voyages: v.voyages.map(voy =>
                voy.id === event.voyageId ? { ...voy, inquiryStatus: event.status } : voy
              ),
            })),
          };
        });
      }
      // Background: full refresh
      silentRefresh();
    }, [silentRefresh]),
  });

  // ── Preset functions ──
  const currentFilters = useCallback((): FilterPresetData => ({
    sortKey,
    hideCompleted,
    vesselTypeFilter,
    dwtRange,
    commercialFilter,
    statusFilter,
    openWithin,
    portSearch,
  }), [sortKey, hideCompleted, vesselTypeFilter, dwtRange, commercialFilter, statusFilter, openWithin, portSearch]);

  const applyPreset = useCallback((preset: FilterPreset) => {
    const f = preset.filters;
    setSortKey((f.sortKey as SortKey) || "name");
    setHideCompleted(f.hideCompleted ?? true);
    setVesselTypeFilter(f.vesselTypeFilter || []);
    setDwtRange((f.dwtRange as DwtRange) || "all");
    setCommercialFilter(f.commercialFilter || "all");
    setStatusFilter(f.statusFilter || []);
    setOpenWithin((f.openWithin as OpenWithin) || "all");
    setPortSearch(f.portSearch || "");
    setActivePresetId(preset.id);
  }, []);

  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim()) return;
    setSavingPreset(true);
    const res = await saveFleetFilterPreset(presetName.trim(), currentFilters());
    setSavingPreset(false);
    if (res.success && res.data) {
      setPresets((prev) => [...prev, res.data!]);
      setActivePresetId(res.data.id);
      setPresetName("");
      setShowSaveDialog(false);
    }
  }, [presetName, currentFilters]);

  const handleDeletePreset = useCallback(async (id: string) => {
    const res = await deleteFleetFilterPreset(id);
    if (res.success) {
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (activePresetId === id) setActivePresetId(null);
    }
  }, [activePresetId]);

  const navigateTimeline = useCallback((direction: "back" | "forward") => {
    setViewportStart((prev) => {
      const d = new Date(prev);
      const shift = Math.floor(viewportDays / 2);
      if (direction === "back") {
        d.setDate(d.getDate() - shift);
      } else {
        d.setDate(d.getDate() + shift);
      }
      return d;
    });
  }, [viewportDays]);

  const goToToday = useCallback(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Show a week before today
    setViewportStart(d);
  }, []);

  // ── Derived: unique vessel types in fleet ──
  const availableVesselTypes = useMemo(() => {
    if (!data) return [];
    const types = [...new Set(data.vessels.map((v) => v.vesselType))];
    return types.sort();
  }, [data]);

  // ── Derived: filtered + sorted vessels ──
  const filteredVessels = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const nowMs = now.getTime();

    let vessels = [...data.vessels];

    // --- FILTER: Hide completed voyages (removes COMPLETED bars, not vessels) ---
    if (hideCompleted) {
      vessels = vessels.map((v) => ({
        ...v,
        voyages: v.voyages.filter((voy) => voy.status !== "COMPLETED"),
      }));
    }

    // --- FILTER: Vessel type ---
    if (vesselTypeFilter.length > 0) {
      vessels = vessels.filter((v) => vesselTypeFilter.includes(v.vesselType));
    }

    // --- FILTER: DWT range ---
    if (dwtRange !== "all") {
      const ranges: Record<string, [number, number]> = {
        handy: [0, 35000],
        supra: [35000, 60000],
        panamax: [60000, 85000],
        cape: [85000, Infinity],
      };
      const [min, max] = ranges[dwtRange];
      vessels = vessels.filter((v) => v.dwt >= min && v.dwt < max);
    }

    // --- FILTER: Commercial control ---
    if (commercialFilter !== "all") {
      vessels = vessels.filter((v) => v.commercialControl === commercialFilter);
    }

    // --- FILTER: Voyage status (show only vessels with matching voyages) ---
    if (statusFilter.length > 0) {
      vessels = vessels.filter((v) =>
        v.voyages.some((voy) => statusFilter.includes(voy.status)) || v.voyages.length === 0
      );
    }

    // --- FILTER: Open within X days ---
    if (openWithin !== "all") {
      const withinDays = parseInt(openWithin);
      const cutoff = nowMs + withinDays * 24 * 60 * 60 * 1000;
      vessels = vessels.filter((v) => {
        if (v.voyages.length === 0) return true; // No voyages = already open
        const lastVoy = v.voyages[v.voyages.length - 1];
        const lastEnd = new Date(lastVoy.endDate).getTime();
        return lastEnd <= cutoff;
      });
    }

    // --- FILTER: Open port search (Phase 3) ---
    if (portSearch.trim()) {
      const q = portSearch.trim().toLowerCase();
      vessels = vessels.filter((v) => {
        if (v.voyages.length === 0) return true; // Show unassigned vessels
        const lastVoy = v.voyages[v.voyages.length - 1];
        const openPort = (lastVoy.redeliveryPort || lastVoy.dischargePort || "").toLowerCase();
        return openPort.includes(q);
      });
    }

    // --- SORT ---
    vessels.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);

        case "openDate": {
          const getOpenDate = (v: FleetVesselRow) => {
            if (v.voyages.length === 0) return 0; // No voyages = open now (top)
            return new Date(v.voyages[v.voyages.length - 1].endDate).getTime();
          };
          return getOpenDate(a) - getOpenDate(b);
        }

        case "dwt":
          return b.dwt - a.dwt; // Largest first

        case "idleCost": {
          const getIdleCost = (v: FleetVesselRow) => {
            if (v.voyages.length === 0) return v.dailyOpex * 30; // Assume 30d idle
            const lastEnd = new Date(v.voyages[v.voyages.length - 1].endDate).getTime();
            if (lastEnd >= nowMs) return 0; // Not idle yet
            const idleDays = (nowMs - lastEnd) / (24 * 60 * 60 * 1000);
            return idleDays * v.dailyOpex;
          };
          return getIdleCost(b) - getIdleCost(a); // Highest cost first
        }

        default:
          return 0;
      }
    });

    return vessels;
  }, [data, sortKey, hideCompleted, vesselTypeFilter, dwtRange, commercialFilter, statusFilter, openWithin, portSearch]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (hideCompleted) count++;
    if (vesselTypeFilter.length > 0) count++;
    if (dwtRange !== "all") count++;
    if (commercialFilter !== "all") count++;
    if (statusFilter.length > 0) count++;
    if (openWithin !== "all") count++;
    if (portSearch.trim()) count++;
    return count;
  }, [hideCompleted, vesselTypeFilter, dwtRange, commercialFilter, statusFilter, openWithin, portSearch]);

  const clearAllFilters = useCallback(() => {
    setHideCompleted(true);
    setVesselTypeFilter([]);
    setDwtRange("all");
    setCommercialFilter("all");
    setStatusFilter([]);
    setOpenWithin("all");
    setPortSearch("");
    setSortKey("name");
  }, []);

  // Loading state
  if (loading) {
    return <FleetScheduleSkeleton />;
  }

  // Error state
  if (error || !data) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{error || "No data"}</p>
          <Button variant="ghost" className="mt-4 gap-2" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (data.vessels.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Ship className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No vessels in fleet</h3>
          <p className="text-muted-foreground text-center mb-4">
            Add vessels to your fleet to see the deployment schedule.
          </p>
          <Link href={`/${orgSlug}/vessels/new`}>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Add First Vessel
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "name", label: "Vessel Name (A→Z)" },
    { key: "openDate", label: "Open Date (soonest)" },
    { key: "dwt", label: "DWT (largest first)" },
    { key: "idleCost", label: "Idle Cost (highest)" },
  ];

  const DWT_PRESETS: { key: DwtRange; label: string }[] = [
    { key: "all", label: "All DWT" },
    { key: "handy", label: "Handy (<35K)" },
    { key: "supra", label: "Supra (35-60K)" },
    { key: "panamax", label: "Panamax (60-85K)" },
    { key: "cape", label: "Cape (85K+)" },
  ];

  const OPEN_WITHIN_OPTIONS: { key: OpenWithin; label: string }[] = [
    { key: "all", label: "All" },
    { key: "7", label: "7 days" },
    { key: "14", label: "14 days" },
    { key: "30", label: "30 days" },
    { key: "60", label: "60 days" },
  ];

  const STATUS_OPTIONS = [
    { key: "DRAFT", label: "Draft" },
    { key: "NEW", label: "New-Evaluating" },
    { key: "OFFERED", label: "Offered-Negotiating" },
    { key: "FIXED", label: "Fixed" },
    { key: "COMPLETED", label: "Completed" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* ── KPI Summary Strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard
            icon={<Ship className="h-4 w-4" />}
            label="Fleet"
            value={`${data.kpis.totalVessels} vessels`}
            accent="cyan"
          />
          <KpiCard
            icon={<CalendarRange className="h-4 w-4" />}
            label="Utilization"
            value={`${data.kpis.utilizationPercent.toFixed(0)}%`}
            accent={data.kpis.utilizationPercent > 70 ? "emerald" : data.kpis.utilizationPercent > 40 ? "amber" : "red"}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Avg TCE"
            value={data.kpis.avgTce > 0 ? `${formatMoney(data.kpis.avgTce)}/d` : "—"}
            accent="violet"
          />
          <KpiCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Total P&L"
            value={formatMoney(data.kpis.totalPnl)}
            accent={data.kpis.totalPnl >= 0 ? "emerald" : "red"}
          />
          <KpiCard
            icon={<Clock className="h-4 w-4" />}
            label="Idle Vessels"
            value={`${data.kpis.idleVessels}`}
            accent={data.kpis.idleVessels > 0 ? "amber" : "emerald"}
          />
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Idle Cost"
            value={data.kpis.totalIdleCost > 0 ? formatMoney(data.kpis.totalIdleCost) : "$0"}
            accent={data.kpis.totalIdleCost > 0 ? "red" : "emerald"}
          />
        </div>

        {/* ── Saved Presets Bar ── */}
        {(presets.length > 0 || showSaveDialog) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Presets</span>
            {presets.map((p) => (
              <div key={p.id} className="group relative">
                <button
                  onClick={() => applyPreset(p)}
                  className={`flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium transition-all border ${
                    activePresetId === p.id
                      ? "bg-primary/20 border-primary/50 text-primary shadow-sm shadow-primary/10"
                      : "bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {p.name}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}

            {/* Inline save dialog */}
            {showSaveDialog ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
                  placeholder="Preset name…"
                  className="h-7 w-[160px] text-xs bg-background border border-border rounded-md px-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleSavePreset}
                  disabled={!presetName.trim() || savingPreset}
                >
                  {savingPreset ? "Saving…" : "Save"}
                </Button>
                <button
                  onClick={() => { setShowSaveDialog(false); setPresetName(""); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="flex items-center gap-1 h-7 px-2.5 rounded-full text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/60 hover:border-border transition-colors"
              >
                <Plus className="h-3 w-3" />
                Save current
              </button>
            )}
          </div>
        )}

        {/* Show save button when no presets exist yet */}
        {presets.length === 0 && !showSaveDialog && (sortKey !== "name" || activeFilterCount > 0) && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveDialog(true)}
              className="flex items-center gap-1.5 h-7 px-3 rounded-full text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/60 hover:border-border transition-colors"
            >
              <Plus className="h-3 w-3" />
              Save as preset
            </button>
            <span className="text-[10px] text-muted-foreground/50">Save current filters for quick access</span>
          </div>
        )}

        {/* ── Timeline Controls ── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateTimeline("back")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs px-3" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateTimeline("forward")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground ml-2">
              {viewportStart.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              {" — "}
              {viewportEnd.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Time scale toggles */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["week", "month", "quarter"] as TimeScale[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setTimeScale(s)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    timeScale === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s === "week" ? "2W" : s === "month" ? "2M" : "QTR"}
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowPanel(!showPanel)}
              title={showPanel ? "Hide open positions" : "Show open positions"}
            >
              {showPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* ── Command Bar: Sort + Filter Strip ──────────────────── */}
        {/* ══════════════════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border/60 bg-card/50 p-2 space-y-2">
          {/* Row 1: Sort + Quick filters + Toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-7 text-xs bg-background border border-border rounded-md px-2 pr-6 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="w-px h-5 bg-border/50" />

            {/* Hide completed toggle */}
            <button
              onClick={() => setHideCompleted(!hideCompleted)}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors border ${
                hideCompleted
                  ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                  : "bg-background border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {hideCompleted ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              Hide Completed
            </button>

            {/* Vessel type multi-select (Phase 1) */}
            {availableVesselTypes.length > 1 && (
              <div className="relative group">
                <button
                  className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors border ${
                    vesselTypeFilter.length > 0
                      ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                      : "bg-background border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Ship className="h-3 w-3" />
                  {vesselTypeFilter.length > 0
                    ? `${vesselTypeFilter.length} type${vesselTypeFilter.length > 1 ? "s" : ""}`
                    : "Vessel Type"}
                </button>
                <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-lg shadow-xl p-2 min-w-[180px] z-50 hidden group-hover:block">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-medium">Vessel Type</p>
                  {availableVesselTypes.map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent/50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={vesselTypeFilter.includes(t)}
                        onChange={() => {
                          setVesselTypeFilter((prev) =>
                            prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                          );
                        }}
                        className="rounded border-border"
                      />
                      {VESSEL_TYPE_LABELS[t] || t}
                    </label>
                  ))}
                  {vesselTypeFilter.length > 0 && (
                    <button
                      onClick={() => setVesselTypeFilter([])}
                      className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center py-1 mt-1 border-t border-border/50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Advanced filters toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors border ${
                showFilters || activeFilterCount > 1
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  : "bg-background border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Filters
              {activeFilterCount > 1 && (
                <span className="bg-amber-500/30 text-amber-300 px-1.5 rounded-full text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Spacer + vessel count badge */}
            <div className="flex-1" />
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-border/60 text-muted-foreground">
              {filteredVessels.length === data.vessels.length
                ? `${data.vessels.length} vessels`
                : `${filteredVessels.length} of ${data.vessels.length} vessels`}
            </Badge>

            {/* Clear all */}
            {(activeFilterCount > 0 || sortKey !== "name") && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 h-7 px-2 rounded-md text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" /> Reset
              </button>
            )}
          </div>

          {/* Row 2: Advanced filters (collapsible) */}
          {showFilters && (
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/30">
              {/* DWT Range (Phase 2) */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">DWT</span>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {DWT_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setDwtRange(p.key)}
                      className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                        dwtRange === p.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-5 bg-border/50" />

              {/* Commercial control (Phase 2) */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Control</span>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {[{ key: "all", label: "All" }, { key: "OWNED_BAREBOAT", label: "Owned" }, { key: "TIME_CHARTER", label: "TC-In" }].map((o) => (
                    <button
                      key={o.key}
                      onClick={() => setCommercialFilter(o.key)}
                      className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                        commercialFilter === o.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-5 bg-border/50" />

              {/* Status filter (Phase 2) */}
              <div className="relative group">
                <button
                  className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[10px] font-medium transition-colors border ${
                    statusFilter.length > 0
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-background border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Filter className="h-3 w-3" />
                  {statusFilter.length > 0
                    ? `${statusFilter.length} status`
                    : "Status"}
                </button>
                <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-lg shadow-xl p-2 min-w-[160px] z-50 hidden group-hover:block">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-medium">Voyage Status</p>
                  {STATUS_OPTIONS.map((s) => (
                    <label
                      key={s.key}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent/50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={statusFilter.includes(s.key)}
                        onChange={() => {
                          setStatusFilter((prev) =>
                            prev.includes(s.key) ? prev.filter((x) => x !== s.key) : [...prev, s.key]
                          );
                        }}
                        className="rounded border-border"
                      />
                      <span className={`w-2 h-2 rounded-full ${
                        STATUS_COLORS[s.key]?.bg.replace("/30", "").replace("/50", "").replace("/40", "").replace("/20", "") || "bg-zinc-500"
                      }`} />
                      {s.label}
                    </label>
                  ))}
                  {statusFilter.length > 0 && (
                    <button
                      onClick={() => setStatusFilter([])}
                      className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center py-1 mt-1 border-t border-border/50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="w-px h-5 bg-border/50" />

              {/* Open within X days (Phase 2) */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Open in</span>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {OPEN_WITHIN_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      onClick={() => setOpenWithin(o.key)}
                      className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                        openWithin === o.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-5 bg-border/50" />

              {/* Open port search (Phase 3) */}
              <div className="relative flex items-center">
                <Search className="absolute left-2 h-3 w-3 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={portSearch}
                  onChange={(e) => setPortSearch(e.target.value)}
                  placeholder="Search open port…"
                  className="h-7 w-[140px] text-[11px] bg-background border border-border rounded-md pl-7 pr-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {portSearch && (
                  <button
                    onClick={() => setPortSearch("")}
                    className="absolute right-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Phase 4: Inquiry Dock Panel ── */}
        <InquiryDockPanel
          onDragStart={(inq) => setDraggingInquiry(inq)}
          onDragEnd={() => { setDraggingInquiry(null); setDropTargetVessel(null); }}
          onVoyageDrop={handleVoyageUnassign}
          isDraggingVoyage={!!draggingVoyage}
          excludeInquiryIds={assignedInquiryIds}
          refreshKey={dockRefreshKey}
        />

        {/* Drag indicator */}
        {draggingInquiry && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-blue-400 animate-pulse">
            <Package className="h-3.5 w-3.5" />
            Dragging: {draggingInquiry.cargoType} ({(draggingInquiry.cargoQuantityMt / 1000).toFixed(0)}K MT) — Drop on a vessel row below
          </div>
        )}
        {draggingVoyage && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 animate-pulse">
            <Ship className="h-3.5 w-3.5" />
            Drag to another vessel to reassign, or drop here to return to inquiries
          </div>
        )}

        {/* ── Main Layout: Timeline + Open Positions Panel ── */}
        <div className="flex gap-4">
          {/* Timeline */}
          <div className={`flex-1 min-w-0 ${showPanel ? "" : ""}`}>
            <Card className="overflow-hidden" onDragOver={(e) => e.preventDefault()}>
              <div
                className="overflow-x-auto"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
              >
                <div className="min-w-[800px]">
                  {/* Date header */}
                  <TimelineHeader
                    viewportStart={viewportStart}
                    viewportDays={viewportDays}
                    now={now}
                    crosshairX={crosshairX}
                    crosshairDate={crosshairDate}
                  />

                  {/* Crosshair container — wraps all vessel rows */}
                  <div
                    ref={timelineRef}
                    className="relative"
                    onDragOver={(e) => e.preventDefault()}
                    onMouseMove={(e) => {
                      // Suppress crosshair during drag to prevent re-renders killing the drag
                      if (draggingVoyage || draggingInquiry) return;
                      const container = timelineRef.current;
                      if (!container) return;
                      const rect = container.getBoundingClientRect();
                      // The vessel label column is 200px, timeline starts after
                      const labelWidth = 200;
                      const mouseX = e.clientX - rect.left;
                      const timelineWidth = rect.width - labelWidth;
                      const relX = mouseX - labelWidth;

                      if (relX < 0 || relX > timelineWidth) {
                        setCrosshairX(null);
                        setCrosshairDate(null);
                        return;
                      }

                      // Convert pixel to day offset (snap to nearest day)
                      const dayFraction = (relX / timelineWidth) * viewportDays;
                      const snappedDay = Math.round(dayFraction);
                      const snappedX = ((snappedDay / viewportDays) * timelineWidth) + labelWidth;

                      // Compute the actual date
                      const date = new Date(viewportStart);
                      date.setDate(date.getDate() + snappedDay);

                      setCrosshairX(snappedX);
                      setCrosshairDate(date);
                    }}
                    onMouseLeave={() => {
                      setCrosshairX(null);
                      setCrosshairDate(null);
                    }}
                  >
                    {/* Weekend shading bands */}
                    <WeekendOverlay
                      viewportStart={viewportStart}
                      viewportDays={viewportDays}
                    />

                    {/* Laycan window overlay when dragging */}
                    {draggingInquiry && draggingInquiry.laycanStart && (
                      <LaycanOverlay
                        viewportStart={viewportStart}
                        viewportDays={viewportDays}
                        laycanStart={draggingInquiry.laycanStart}
                        laycanEnd={draggingInquiry.laycanEnd || draggingInquiry.laycanStart}
                      />
                    )}

                    {/* Crosshair vertical line */}
                    {crosshairX !== null && crosshairDate && (
                      <div
                        className="absolute top-0 bottom-0 w-px border-l border-dashed border-blue-400/50 z-[20] pointer-events-none"
                        style={{ left: `${crosshairX}px` }}
                      >
                        {/* Date pill */}
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shadow-lg shadow-blue-500/20 z-[25]">
                          {crosshairDate.toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </div>
                      </div>
                    )}

                  {/* Vessel rows (filtered + sorted) */}
                  {filteredVessels.length > 0 ? (
                    filteredVessels.map((vessel) => (
                      <VesselRow
                        key={vessel.id}
                        vessel={vessel}
                        viewportStart={viewportStart}
                        viewportDays={viewportDays}
                        now={now}
                        orgSlug={orgSlug}
                        hoveredVoyage={hoveredVoyage}
                        onHoverVoyage={setHoveredVoyage}
                        onClickVoyage={setTooltipVoyage}
                        isDragging={!!draggingInquiry || !!draggingVoyage}
                        isDropTarget={dropTargetVessel === vessel.id}
                        inquiryBadge={inquiryBadges[vessel.id] || null}
                        onDragOver={() => setDropTargetVessel(vessel.id)}
                        onDragLeave={() => setDropTargetVessel(null)}
                        onDrop={(inquiryId: string) => handleVesselDrop(vessel.id, vessel.name, vessel.dwt, inquiryId)}
                        onVoyageDrop={(voyageId: string) => handleVoyageDropOnVessel(vessel.id, vessel.name, vessel.dwt, voyageId)}
                        draggingVoyageVesselId={draggingVoyage?.vesselId ?? null}
                        onVoyageDragStart={(voyageId: string, mouseX: number, mouseY: number) => {
                          setTooltipVoyage(null); // Close popover so it doesn't block drop zones
                          setDraggingVoyage({ voyageId, vesselId: vessel.id });
                          setCustomDrag({
                            voyageId,
                            sourceVesselId: vessel.id,
                            mouseX,
                            mouseY,
                            startX: mouseX,
                            startY: mouseY,
                            active: false,
                          });
                        }}
                        onVoyageDragEnd={() => setDraggingVoyage(null)}
                      />
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Filter className="h-8 w-8 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No vessels match current filters</p>
                      <button
                        onClick={clearAllFilters}
                        className="text-xs text-primary hover:underline mt-2"
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                  </div> {/* end crosshair container */}
                </div>
              </div>
            </Card>
          </div>

          {/* ── Open Positions Panel ── */}
          {showPanel && (
            <div className="w-[320px] shrink-0 hidden xl:block">
              <OpenPositionsPanel
                positions={data.openPositions}
                vessels={data.vessels}
                orgSlug={orgSlug}
                now={now}
              />
            </div>
          )}
        </div>

        {/* Mobile open positions (below timeline) */}
        <div className="xl:hidden">
          <OpenPositionsPanel
            positions={data.openPositions}
            vessels={data.vessels}
            orgSlug={orgSlug}
            now={now}
          />
        </div>
      </div>

      {/* Voyage tooltip/popover */}
      {tooltipVoyage && (
        <VoyagePopover
          bar={tooltipVoyage.bar}
          x={tooltipVoyage.x}
          y={tooltipVoyage.y}
          orgSlug={orgSlug}
          onClose={() => setTooltipVoyage(null)}
          vessels={(data?.vessels || []).map(v => ({ id: v.id, name: v.name, dwt: v.dwt }))}
          currentVesselId={data?.vessels.find(v => v.voyages.some(voy => voy.id === tooltipVoyage.bar.id))?.id}
          onReassign={(voyageId, targetVesselId, targetVesselName, targetVesselDwt) => {
            handleVoyageDropOnVessel(targetVesselId, targetVesselName, targetVesselDwt, voyageId);
            setTooltipVoyage(null);
          }}
          onUnassign={(voyageId) => {
            handleVoyageUnassign(voyageId);
            setTooltipVoyage(null);
          }}
        />
      )}

      {/* Custom drag ghost indicator */}
      {customDrag?.active && (
        <div
          className="fixed z-[200] pointer-events-none"
          style={{ left: customDrag.mouseX + 12, top: customDrag.mouseY - 16 }}
        >
          <div className={`px-3 py-1.5 rounded-lg shadow-xl border text-xs font-semibold flex items-center gap-2 ${
            customDragTarget === '__dock__'
              ? 'bg-amber-500/90 border-amber-400 text-white'
              : customDragTarget && customDragTarget !== customDrag.sourceVesselId
              ? 'bg-blue-500/90 border-blue-400 text-white'
              : 'bg-card border-border text-foreground'
          }`}>
            <Ship className="h-3.5 w-3.5" />
            {customDragTarget === '__dock__'
              ? '↩ Return to inquiries'
              : customDragTarget && customDragTarget !== customDrag.sourceVesselId
              ? `→ Move to ${data?.vessels.find(v => v.id === customDragTarget)?.name || 'vessel'}`
              : 'Drag to a vessel or dock panel'
            }
          </div>
        </div>
      )}

      {/* ── Phase 4: Drop Confirmation Dialog ── */}
      {dropConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Ship className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Create Draft Voyage?</h3>
                <p className="text-xs text-muted-foreground">This will auto-create a DRAFT voyage and assign the inquiry</p>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cargo</span>
                <span className="font-medium">{dropConfirmation.inquiryLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Vessel</span>
                <span className="font-medium text-blue-400">{dropConfirmation.vesselName}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setDropConfirmation(null)}
                disabled={dropping}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDropConfirm}
                disabled={dropping}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition flex items-center gap-2"
              >
                {dropping ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>Create Draft Voyage</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════════════════

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  const accentClass: Record<string, string> = {
    cyan: "text-cyan-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
    red: "text-red-400",
    blue: "text-blue-400",
  };

  return (
    <Card className="bg-card/50">
      <CardContent className="p-3 flex items-center gap-2.5">
        <div className={`${accentClass[accent] || "text-primary"}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-0.5">{label}</p>
          <p className="text-sm font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TIMELINE HEADER (Date axis)
// ═══════════════════════════════════════════════════════════════════

function TimelineHeader({
  viewportStart,
  viewportDays,
  now,
  crosshairX,
  crosshairDate,
}: {
  viewportStart: Date;
  viewportDays: number;
  now: Date;
  crosshairX?: number | null;
  crosshairDate?: Date | null;
}) {
  // ── Tier 1: Month spans (top band) ──
  const monthSpans: { label: string; leftPct: number; widthPct: number; isEven: boolean }[] = [];
  // ── Tier 2: Weekly ticks (bottom row) ──
  const weekTicks: { label: string; position: number }[] = [];
  // ── All gridlines (pass through to vessel rows) ──
  const gridLines: { position: number; isMonth: boolean }[] = [];

  const d = new Date(viewportStart);

  // Collect raw month boundaries and week ticks
  const monthBoundaryDays: number[] = [];

  for (let i = 0; i <= viewportDays; i++) {
    const current = new Date(d);
    current.setDate(current.getDate() + i);

    if (current.getDate() === 1) {
      monthBoundaryDays.push(i);
      gridLines.push({ position: (i / viewportDays) * 100, isMonth: true });
    } else if (current.getDay() === 1) {
      gridLines.push({ position: (i / viewportDays) * 100, isMonth: false });
    }
  }

  // Build month spanning bands
  // Add virtual start (day 0) and end (viewportDays) to slice properly
  const boundaries = [0, ...monthBoundaryDays, viewportDays];
  for (let b = 0; b < boundaries.length - 1; b++) {
    const startDay = boundaries[b];
    const endDay = boundaries[b + 1];
    const midDay = Math.floor((startDay + endDay) / 2);
    const midDate = new Date(d);
    midDate.setDate(midDate.getDate() + midDay);

    const leftPct = (startDay / viewportDays) * 100;
    const widthPct = ((endDay - startDay) / viewportDays) * 100;

    // Only show if wide enough to fit a label
    if (widthPct > 2) {
      monthSpans.push({
        label: midDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        leftPct,
        widthPct,
        isEven: b % 2 === 0,
      });
    }
  }

  // Build weekly ticks with collision avoidance
  for (let i = 0; i <= viewportDays; i++) {
    const current = new Date(d);
    current.setDate(current.getDate() + i);

    if (current.getDay() === 1) {
      // Suppress if within 4 days of any month boundary
      const tooClose = monthBoundaryDays.some((mb) => Math.abs(i - mb) < 4);
      if (!tooClose) {
        weekTicks.push({
          label: current.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          position: (i / viewportDays) * 100,
        });
      }
    }
  }

  // Today marker position
  const todayOffset = daysBetween(viewportStart, now);
  const todayPosition = (todayOffset / viewportDays) * 100;
  const showToday = todayPosition >= 0 && todayPosition <= 100;

  return (
    <div className="relative border-b border-border flex flex-col">
      {/* ── Tier 1: Month spanning bands ── */}
      <div className="flex h-7">
        <div className="w-[200px] shrink-0 sticky left-0 z-[15] bg-card" />
        {monthSpans.map((span, i) => (
          <div
            key={i}
            className={`relative flex items-center justify-center overflow-hidden border-r border-border/40 ${
              span.isEven
                ? "bg-muted/40"
                : "bg-muted/20"
            }`}
            style={{ width: `${span.widthPct}%` }}
          >
            <span className="text-[11px] font-semibold text-foreground/90 tracking-wide uppercase truncate px-2">
              {span.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Tier 2: Week ticks + "VESSEL" label ── */}
      <div className="relative h-6 bg-muted/10 flex items-end">
        {/* Vessel label column */}
        <div className="w-[200px] shrink-0 px-3 pb-1 sticky left-0 z-[15] bg-card">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vessel</span>
        </div>

        {/* Week tick axis */}
        <div className="flex-1 relative h-full">
          {/* Month boundary gridlines */}
          {gridLines.filter(g => g.isMonth).map((g, i) => (
            <div
              key={`m-${i}`}
              className="absolute top-0 bottom-0 w-px bg-border"
              style={{ left: `${g.position}%` }}
            />
          ))}

          {/* Week gridlines */}
          {gridLines.filter(g => !g.isMonth).map((g, i) => (
            <div
              key={`w-${i}`}
              className="absolute top-0 bottom-0 w-px bg-border/20"
              style={{ left: `${g.position}%` }}
            />
          ))}

          {/* Week tick labels */}
          {weekTicks.map((tick, i) => (
            <div
              key={i}
              className="absolute bottom-0 flex items-end pb-0.5"
              style={{ left: `${tick.position}%` }}
            >
              <span className="text-[9px] ml-1 whitespace-nowrap text-muted-foreground/60 font-medium">
                {tick.label}
              </span>
            </div>
          ))}

          {/* Today line */}
          {showToday && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
              style={{ left: `${todayPosition}%` }}
            >
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold leading-tight shadow-lg">
                TODAY
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VESSEL ROW
// ═══════════════════════════════════════════════════════════════════

function VesselRow({
  vessel,
  viewportStart,
  viewportDays,
  now,
  orgSlug,
  hoveredVoyage,
  onHoverVoyage,
  onClickVoyage,
  // Phase 4 props
  isDragging = false,
  isDropTarget = false,
  inquiryBadge = null,
  onDragOver,
  onDragLeave,
  onDrop,
  // Phase 5: voyage drag-drop
  onVoyageDrop,
  draggingVoyageVesselId,
  onVoyageDragStart,
  onVoyageDragEnd,
}: {
  vessel: FleetVesselRow;
  viewportStart: Date;
  viewportDays: number;
  now: Date;
  orgSlug: string;
  hoveredVoyage: string | null;
  onHoverVoyage: (id: string | null) => void;
  onClickVoyage: (data: { bar: FleetVoyageBar; x: number; y: number } | null) => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  inquiryBadge?: { count: number; urgentCount: number } | null;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: (inquiryId: string) => void;
  onVoyageDrop?: (voyageId: string) => void;
  draggingVoyageVesselId?: string | null;
  onVoyageDragStart?: (voyageId: string, mouseX: number, mouseY: number) => void;
  onVoyageDragEnd?: () => void;
}) {
  const isTcIn = vessel.commercialControl === "TIME_CHARTER";
  const tcExpiring = isTcIn && vessel.tcHireEndDate;
  const tcEndDate = tcExpiring ? new Date(vessel.tcHireEndDate!) : null;
  const tcDaysLeft = tcEndDate ? Math.ceil(daysBetween(now, tcEndDate)) : null;

  // TC expiry marker position
  const tcPosition = tcEndDate
    ? (daysBetween(viewportStart, tcEndDate) / viewportDays) * 100
    : null;
  const showTcMarker = tcPosition !== null && tcPosition >= 0 && tcPosition <= 100;

  // Today marker
  const todayOffset = daysBetween(viewportStart, now);
  const todayPosition = (todayOffset / viewportDays) * 100;
  const showToday = todayPosition >= 0 && todayPosition <= 100;

  // Phase 4: Drop zone handlers (inquiry + voyage)
  // IMPORTANT: Always call e.preventDefault() in dragOver to accept drops.
  // Browsers restrict dataTransfer.types for custom MIME types during dragover.
  // All validation happens in handleDrop where getData() is fully available.
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    onDragOver?.();
  };

  const handleDragLeave = () => {
    onDragLeave?.();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragLeave?.();

    // Check for voyage reassignment first
    const voyageId = e.dataTransfer.getData("application/voyage-id");
    if (voyageId && onVoyageDrop) {
      console.log("[FleetSchedule] Voyage drop on vessel:", vessel.name, "voyageId:", voyageId);
      onVoyageDrop(voyageId);
      return;
    }
    // Then check for inquiry drop
    const inquiryId = e.dataTransfer.getData("application/inquiry-id");
    if (inquiryId && onDrop) {
      console.log("[FleetSchedule] Inquiry drop on vessel:", vessel.name, "inquiryId:", inquiryId);
      onDrop(inquiryId);
    }
  };

  return (
    <div
      data-vessel-id={vessel.id}
      className={`flex border-b transition-all group min-h-[56px] ${
        isDropTarget
          ? "border-blue-500 bg-blue-500/10 ring-1 ring-inset ring-blue-500/30"
          : isDragging
          ? "border-border/50 hover:bg-blue-500/5 hover:border-blue-500/30"
          : "border-border/50 hover:bg-accent/20"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Vessel label */}
      <div className="w-[200px] shrink-0 px-3 py-2 flex flex-col justify-center border-r border-border/30 sticky left-0 z-[10] bg-card">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate">{vessel.name}</span>
          {isTcIn && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-amber-500/50 text-amber-400 shrink-0">
              TC
            </Badge>
          )}
          {/* Phase 4: Inquiry badge overlay */}
          {inquiryBadge && inquiryBadge.count > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`text-[8px] px-1.5 py-0 h-4 rounded-full font-bold flex items-center shrink-0 ${
                  inquiryBadge.urgentCount > 0
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}>
                  {inquiryBadge.count}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <p className="font-semibold">{inquiryBadge.count} Active Inquiry{inquiryBadge.count > 1 ? "s" : ""}</p>
                {inquiryBadge.urgentCount > 0 && (
                  <p className="text-red-400">{inquiryBadge.urgentCount} urgent</p>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{VESSEL_TYPE_LABELS[vessel.vesselType] || vessel.vesselType}</span>
          <span>•</span>
          <span>{formatDwt(vessel.dwt)}</span>
        </div>
        {tcDaysLeft !== null && tcDaysLeft <= 30 && (
          <div className="flex items-center gap-1 mt-0.5">
            <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
            <span className="text-[9px] text-amber-400 font-medium">
              TC expires {tcDaysLeft <= 0 ? "expired" : `in ${tcDaysLeft}d`}
            </span>
          </div>
        )}

        {/* Phase 4: Drop target indicator */}
        {isDropTarget && (
          <div className="flex items-center gap-1 mt-1">
            <Package className="h-2.5 w-2.5 text-blue-400" />
            <span className="text-[9px] text-blue-400 font-semibold animate-pulse">
              Drop here
            </span>
          </div>
        )}
      </div>

      {/* Timeline area */}
      <div className="flex-1 relative py-1.5">
        {/* Phase 4: Drop zone overlay */}
        {isDropTarget && (
          <div className="absolute inset-0 border-2 border-dashed border-blue-500/40 rounded-md bg-blue-500/5 z-[10] flex items-center justify-center pointer-events-none">
            <span className="text-xs text-blue-400 font-medium bg-card/80 px-3 py-1 rounded-full border border-blue-500/30">
              Assign cargo to {vessel.name}
            </span>
          </div>
        )}

        {/* Today line (subtle) */}
        {showToday && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500/30 z-[1]"
            style={{ left: `${todayPosition}%` }}
          />
        )}

        {/* TC Expiry marker */}
        {showTcMarker && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-500/60 z-[2] cursor-help"
                style={{ left: `${tcPosition}%` }}
              >
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-500 border border-amber-400" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p className="font-semibold">TC Hire Expires</p>
              <p>{formatDateFull(vessel.tcHireEndDate!)}</p>
              {vessel.dailyTcHireRate && <p>Rate: ${vessel.dailyTcHireRate.toLocaleString()}/day</p>}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Voyage bars */}
        {vessel.voyages.map((voy) => {
          const voyStart = new Date(voy.startDate);
          const voyEnd = new Date(voy.endDate);
          const startOffset = daysBetween(viewportStart, voyStart);
          const endOffset = daysBetween(viewportStart, voyEnd);
          const leftPct = Math.max(0, (startOffset / viewportDays) * 100);
          const rightPct = Math.min(100, (endOffset / viewportDays) * 100);
          const widthPct = rightPct - leftPct;

          // Skip if entirely outside viewport
          if (rightPct < 0 || leftPct > 100) return null;

          // Auto-hide dead voyage bars (user sees them only in Pipeline view)
          const DEAD_STATUSES = ["REJECTED", "LOST", "EXPIRED", "WITHDRAWN"];
          if (DEAD_STATUSES.includes(voy.status)) return null;

          const sc = STATUS_COLORS[voy.status] || STATUS_COLORS.DRAFT;
          const isHovered = hoveredVoyage === voy.id;
          const isFixed = voy.status === "FIXED" || voy.status === "COMPLETED";

          // Inline date labels for the bar
          const startLabel = voyStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          const endLabel = voyEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          const routeLabel = `${voy.loadPort?.split(",")[0]} → ${voy.dischargePort?.split(",")[0]}`;

          return (
            <div
              key={voy.id}
              draggable={true}
              className={`absolute top-1.5 bottom-1.5 rounded-md border cursor-grab active:cursor-grabbing transition-colors duration-150 flex items-center overflow-hidden z-[3] select-none ${
                isFixed
                  ? "bg-emerald-500/40 border-emerald-400/70"
                  : `${sc.bg} ${sc.border}`
              } ${
                isHovered ? "ring-2 ring-white/30 z-[5]" : ""
              }`}
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(widthPct, 0.5)}%`,
              }}
              onMouseEnter={() => { if (!draggingVoyageVesselId) onHoverVoyage(voy.id); }}
              onMouseLeave={() => { if (!draggingVoyageVesselId) onHoverVoyage(null); }}
              onClick={(e) => {
                // Don't open popover if we just finished a drag
                if ((e.currentTarget as HTMLElement).dataset.wasDragged === 'true') {
                  (e.currentTarget as HTMLElement).dataset.wasDragged = 'false';
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                onClickVoyage({
                  bar: voy,
                  x: rect.left + rect.width / 2,
                  y: rect.bottom + 8,
                });
              }}
              onMouseDown={(e) => {
                // Custom drag: start tracking on mousedown
                if (e.button !== 0) return; // left click only
                e.preventDefault(); // prevent native drag and text selection
                onVoyageDragStart?.(voy.id, e.clientX, e.clientY);
              }}
              onDragStart={(e) => {
                // Prevent native HTML5 drag — we use custom mouse drag instead
                e.preventDefault();
              }}
            >
              {/* Status remark badge */}
              {widthPct > 5 && (
                <span className={`absolute top-0 right-0 text-[7px] font-bold px-1 rounded-bl-sm leading-tight z-[1] ${
                  voy.status === "FIXED" || voy.status === "COMPLETED"
                    ? "bg-emerald-500 text-white"
                    : voy.status === "OFFERED"
                    ? "bg-purple-500 text-white"
                    : "bg-blue-500 text-white"
                }`}>
                  {sc.label}
                </span>
              )}

              {/* Wide bar: dates + route */}
              {widthPct > 18 && (
                <div className="px-1.5 flex items-center justify-between min-w-0 w-full">
                  <span className={`text-[9px] font-semibold shrink-0 ${isFixed ? "text-emerald-200" : sc.text}`}>
                    {startLabel}
                  </span>
                  <span className={`text-[9px] font-medium truncate mx-1 opacity-80 ${isFixed ? "text-emerald-200" : sc.text}`}>
                    {routeLabel}
                  </span>
                  <span className={`text-[9px] font-semibold shrink-0 ${isFixed ? "text-emerald-200" : sc.text}`}>
                    {endLabel}
                  </span>
                </div>
              )}
              {/* Medium bar: dates only */}
              {widthPct > 8 && widthPct <= 18 && (
                <div className="px-1 flex items-center justify-between min-w-0 w-full">
                  <span className={`text-[8px] font-semibold shrink-0 ${isFixed ? "text-emerald-200" : sc.text}`}>
                    {startLabel}
                  </span>
                  <span className={`text-[8px] opacity-50 ${isFixed ? "text-emerald-200" : sc.text}`}>→</span>
                  <span className={`text-[8px] font-semibold shrink-0 ${isFixed ? "text-emerald-200" : sc.text}`}>
                    {endLabel}
                  </span>
                </div>
              )}
              {/* Narrow bar: compact single date */}
              {widthPct > 3 && widthPct <= 8 && (
                <div className="px-0.5 flex items-center justify-center w-full">
                  <span className={`text-[7px] font-medium ${sc.text}`}>
                    {startLabel.split(" ")[0]}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Idle gap indicators */}
        {vessel.voyages.length > 0 && (() => {
          const lastVoy = vessel.voyages[vessel.voyages.length - 1];
          const lastEnd = new Date(lastVoy.endDate);
          if (lastEnd < now) {
            const gapDays = Math.ceil(daysBetween(lastEnd, now));
            if (gapDays > 2) {
              const startPct = Math.max(0, (daysBetween(viewportStart, lastEnd) / viewportDays) * 100);
              const endPct = Math.min(100, (daysBetween(viewportStart, now) / viewportDays) * 100);
              const widthPct = endPct - startPct;
              if (widthPct > 3) {
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute top-2 bottom-2 rounded border border-dashed border-amber-500/40 bg-amber-500/5 flex items-center justify-center cursor-help z-[2]"
                        style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                      >
                        {widthPct > 10 && (
                          <span className="text-[9px] text-amber-400/80 font-medium">
                            IDLE {gapDays}d
                          </span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-semibold text-amber-400">⚠ Idle Period</p>
                      <p>{gapDays} days idle since {formatDate(lastVoy.endDate)}</p>
                      {vessel.dailyOpex > 0 && (
                        <p className="text-red-400">OPEX burn: {formatMoney(gapDays * vessel.dailyOpex)}</p>
                      )}
                      <p className="text-muted-foreground">Open @ {lastVoy.dischargePort?.split(",")[0]}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }
            }
          }
          return null;
        })()}

        {/* "OPEN @ port" label after last voyage */}
        {vessel.voyages.length > 0 && (() => {
          const lastVoy = vessel.voyages[vessel.voyages.length - 1];
          const lastEnd = new Date(lastVoy.endDate);
          const endPct = (daysBetween(viewportStart, lastEnd) / viewportDays) * 100;
          if (endPct >= 0 && endPct <= 95) {
            return (
              <div
                className="absolute top-1/2 -translate-y-1/2 z-[2]"
                style={{ left: `${Math.min(endPct + 0.5, 96)}%` }}
              >
                <span className="text-[9px] text-emerald-400/80 font-medium whitespace-nowrap flex items-center gap-0.5">
                  <MapPin className="h-2.5 w-2.5" />
                  OPEN @ {(lastVoy.redeliveryPort || lastVoy.dischargePort)?.split(",")[0]}
                </span>
              </div>
            );
          }
          return null;
        })()}

        {/* No voyages placeholder */}
        {vessel.voyages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-muted-foreground/50">No voyages assigned</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VOYAGE POPOVER
// ═══════════════════════════════════════════════════════════════════

function VoyagePopover({
  bar,
  x,
  y,
  orgSlug,
  onClose,
  vessels,
  currentVesselId,
  onReassign,
  onUnassign,
}: {
  bar: FleetVoyageBar;
  x: number;
  y: number;
  orgSlug: string;
  onClose: () => void;
  vessels?: { id: string; name: string; dwt: number }[];
  currentVesselId?: string;
  onReassign?: (voyageId: string, targetVesselId: string, targetVesselName: string, targetVesselDwt: number) => void;
  onUnassign?: (voyageId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sc = STATUS_COLORS[bar.status] || STATUS_COLORS.DRAFT;
  const [showReassign, setShowReassign] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Clamp position to viewport
  const left = Math.min(Math.max(x - 160, 8), window.innerWidth - 340);
  const top = Math.min(y, window.innerHeight - 400);

  // Filter out current vessel from reassign targets
  const otherVessels = (vessels || []).filter(v => v.id !== currentVesselId);

  return (
    <div
      ref={ref}
      className="fixed z-[100] w-[320px] animate-in fade-in slide-in-from-top-2 duration-150"
      style={{ left, top }}
    >
      <Card className="shadow-xl border-border/80">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold">{bar.loadPort?.split(",")[0]} → {bar.dischargePort?.split(",")[0]}</p>
              <p className="text-xs text-muted-foreground">{formatDateFull(bar.startDate)} — {formatDateFull(bar.endDate)}</p>
            </div>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${sc.border} ${sc.text}`}>
              {sc.label}
            </Badge>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" /> Duration
            </div>
            <div className="font-medium text-right">{bar.totalVoyageDays.toFixed(1)} days</div>

            {bar.tce !== null && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" /> TCE
                </div>
                <div className="font-medium text-right">{formatMoney(bar.tce)}/day</div>
              </>
            )}

            {bar.voyagePnl !== null && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign className="h-3 w-3" /> P&L
                </div>
                <div className={`font-medium text-right ${bar.voyagePnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatMoney(bar.voyagePnl)}
                </div>
              </>
            )}

            {bar.cargoType && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Ship className="h-3 w-3" /> Cargo
                </div>
                <div className="font-medium text-right truncate">
                  {bar.cargoType}, {bar.cargoQuantityMt.toLocaleString()} MT
                </div>
              </>
            )}

            {bar.freightRateUsd && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign className="h-3 w-3" /> Freight
                </div>
                <div className="font-medium text-right">${bar.freightRateUsd}/MT</div>
              </>
            )}
          </div>

          {/* Reassign vessel dropdown */}
          {showReassign && otherVessels.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1 max-h-[120px] overflow-y-auto">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Move to vessel:</p>
              {otherVessels.map(v => (
                <button
                  key={v.id}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-blue-500/20 hover:text-blue-400 transition-colors flex items-center justify-between"
                  onClick={() => {
                    onReassign?.(bar.id, v.id, v.name, v.dwt);
                    onClose();
                  }}
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="text-muted-foreground text-[10px]">{v.dwt.toLocaleString()} DWT</span>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1 border-t border-border/50">
            <Link href={`/${orgSlug}/voyages/${bar.id}`} className="flex-1">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7 cursor-pointer">
                View Voyage
              </Button>
            </Link>
            {onReassign && otherVessels.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2 cursor-pointer border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                onClick={() => setShowReassign(!showReassign)}
              >
                <ArrowRightLeft className="h-3 w-3 mr-1" />
                {showReassign ? "Cancel" : "Move"}
              </Button>
            )}
            {onUnassign && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2 cursor-pointer border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                onClick={() => {
                  onUnassign(bar.id);
                  onClose();
                }}
              >
                <Undo2 className="h-3 w-3 mr-1" />
                Return
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2 cursor-pointer" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


function OpenPositionsPanel({
  positions,
  vessels,
  orgSlug,
  now,
}: {
  positions: FleetGap[];
  vessels: FleetVesselRow[];
  orgSlug: string;
  now: Date;
}) {
  // Get unique vessels for open positions
  const openVessels = useMemo(() => {
    // Vessels with open positions (after their last voyage)
    const vesselMap = new Map<string, FleetGap>();
    for (const pos of positions) {
      if (!pos.endDate) {
        // Indefinitely open — prioritize these
        vesselMap.set(pos.vesselId, pos);
      } else if (!vesselMap.has(pos.vesselId)) {
        vesselMap.set(pos.vesselId, pos);
      }
    }
    return Array.from(vesselMap.values());
  }, [positions]);

  // Also find vessels with zero voyages
  const noVoyageVessels = useMemo(() => {
    return vessels.filter((v) => v.voyages.length === 0);
  }, [vessels]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-400" />
          Open Positions
          <Badge variant="secondary" className="text-[10px] px-1.5 h-4 ml-auto">
            {openVessels.length + noVoyageVessels.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
        {openVessels.length === 0 && noVoyageVessels.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            All vessels are deployed. 🎉
          </p>
        )}

        {/* Vessels with completed voyages + open position */}
        {openVessels.map((pos) => {
          const vessel = vessels.find((v) => v.id === pos.vesselId);
          if (!vessel) return null;

          const isPast = new Date(pos.startDate) <= now;
          const isTcIn = vessel.commercialControl === "TIME_CHARTER";
          const tcExpiring = isTcIn && vessel.tcHireEndDate;
          const tcDaysLeft = tcExpiring
            ? Math.ceil(daysBetween(now, new Date(vessel.tcHireEndDate!)))
            : null;

          return (
            <div
              key={pos.vesselId}
              className={`rounded-lg border p-3 space-y-2 transition-colors ${
                isPast && pos.gapDays > 3
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border/50 bg-card/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {isPast && pos.gapDays > 3 ? (
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    )}
                    {vessel.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {VESSEL_TYPE_LABELS[vessel.vesselType] || vessel.vesselType} • {formatDwt(vessel.dwt)}
                  </p>
                </div>
                {isTcIn && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-amber-500/50 text-amber-400 shrink-0">
                    TC-In
                  </Badge>
                )}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3 w-3 text-emerald-400" />
                  <span>
                    Opens: <span className="text-foreground font-medium">{pos.openPort}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarRange className="h-3 w-3" />
                  <span>
                    Available: <span className="text-foreground font-medium">{formatDate(pos.startDate)}</span>
                    {isPast && <span className="text-emerald-400 ml-1">(now)</span>}
                  </span>
                </div>
                {vessel.dailyOpex > 0 && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    <span>OPEX: ${vessel.dailyOpex.toLocaleString()}/day</span>
                  </div>
                )}
                {isPast && pos.gapDays > 0 && vessel.dailyOpex > 0 && (
                  <div className="flex items-center gap-1.5 text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="font-medium">
                      {pos.gapDays}d idle = {formatMoney(pos.idleCost)} burned
                    </span>
                  </div>
                )}
                {tcDaysLeft !== null && tcDaysLeft <= 30 && (
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <Timer className="h-3 w-3" />
                    <span className="font-medium">
                      TC expires {tcDaysLeft <= 0 ? "expired" : `in ${tcDaysLeft}d`}
                    </span>
                  </div>
                )}
              </div>

              <Link href={`/${orgSlug}/voyages/new?vesselId=${vessel.id}`}>
                <Button variant="secondary" size="sm" className="w-full text-xs h-7 mt-1 gap-1">
                  <Plus className="h-3 w-3" />
                  Create Voyage
                </Button>
              </Link>
            </div>
          );
        })}

        {/* Vessels with zero voyages */}
        {noVoyageVessels.map((vessel) => (
          <div
            key={vessel.id}
            className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
                  {vessel.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {VESSEL_TYPE_LABELS[vessel.vesselType] || vessel.vesselType} • {formatDwt(vessel.dwt)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">No voyages assigned yet</p>
            <Link href={`/${orgSlug}/voyages/new?vesselId=${vessel.id}`}>
              <Button variant="secondary" size="sm" className="w-full text-xs h-7 gap-1">
                <Plus className="h-3 w-3" />
                Create Voyage
              </Button>
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SKELETON LOADING
// ═══════════════════════════════════════════════════════════════════

function FleetScheduleSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-card/50">
            <CardContent className="p-3 flex items-center gap-2.5">
              <div className="w-4 h-4 rounded bg-muted" />
              <div className="space-y-1 flex-1">
                <div className="h-2 w-12 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-muted rounded" />
          <div className="h-8 w-16 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded ml-2" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded" />
        </div>
      </div>

      {/* Timeline */}
      <Card>
        <div className="h-8 bg-muted/30 border-b" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex border-b border-border/50 h-14">
            <div className="w-[200px] shrink-0 px-3 py-2 space-y-1.5 border-r">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-3 w-32 bg-muted rounded" />
            </div>
            <div className="flex-1 relative py-2 px-2">
              <div
                className="absolute top-2 bottom-2 bg-muted/40 rounded"
                style={{ left: `${10 + i * 5}%`, width: `${30 - i * 5}%` }}
              />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WEEKEND OVERLAY — Subtle shading for Saturday/Sunday
// ═══════════════════════════════════════════════════════════════════

function WeekendOverlay({
  viewportStart,
  viewportDays,
}: {
  viewportStart: Date;
  viewportDays: number;
}) {
  const bands: { leftPct: number; widthPct: number }[] = [];
  const dayWidth = 100 / viewportDays;

  for (let i = 0; i < viewportDays; i++) {
    const current = new Date(viewportStart);
    current.setDate(current.getDate() + i);
    const dow = current.getDay();

    // Saturday = 6, Sunday = 0
    if (dow === 6 || dow === 0) {
      const leftPct = (i / viewportDays) * 100;
      // Merge consecutive weekend days (Sat+Sun)
      const last = bands[bands.length - 1];
      if (last && Math.abs(last.leftPct + last.widthPct - leftPct) < 0.5) {
        last.widthPct += dayWidth;
      } else {
        bands.push({ leftPct, widthPct: dayWidth });
      }
    }
  }

  return (
    <>
      {bands.map((band, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 bg-white/[0.025] pointer-events-none z-[0]"
          style={{
            left: `${200 + (band.leftPct / 100) * (100)}%`,
            width: `${(band.widthPct / 100) * 100}%`,
            marginLeft: `${(band.leftPct / 100) * -200}px`,
          }}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LAYCAN OVERLAY — Highlights inquiry's loading window during drag
// ═══════════════════════════════════════════════════════════════════

function LaycanOverlay({
  viewportStart,
  viewportDays,
  laycanStart,
  laycanEnd,
}: {
  viewportStart: Date;
  viewportDays: number;
  laycanStart: string;
  laycanEnd: string;
}) {
  const start = new Date(laycanStart);
  const end = new Date(laycanEnd);
  const startOffset = daysBetween(viewportStart, start);
  const endOffset = daysBetween(viewportStart, end);

  const leftPct = Math.max(0, (startOffset / viewportDays) * 100);
  const rightPct = Math.min(100, (endOffset / viewportDays) * 100);
  const widthPct = rightPct - leftPct;

  if (widthPct <= 0 || leftPct > 100 || rightPct < 0) return null;

  return (
    <div
      className="absolute top-0 bottom-0 bg-blue-500/10 border-l border-r border-dashed border-blue-500/30 pointer-events-none z-[1]"
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        marginLeft: "200px",
      }}
    >
      <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-600/80 text-white text-[8px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow">
        LAYCAN WINDOW
      </div>
    </div>
  );
}
