"use client";

/**
 * InquiryDockPanel — Draggable inquiry cards for Fleet Schedule
 * 
 * Shows active pipeline inquiries as compact, draggable chips.
 * Each card displays the top 3 best-matched vessels from Fleet Match.
 * Users drag an inquiry onto a vessel row to auto-create a DRAFT voyage.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  GripVertical,
  Loader2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Ship,
  AlertTriangle,
  Zap,
} from "lucide-react";
import {
  getActiveInquiriesForFleet,
  type FleetInquirySummary,
  type TopVesselMatch,
} from "@/actions/cargo-inquiry-actions";

const URGENCY_DOT: Record<string, string> = {
  URGENT: "bg-red-500 animate-pulse",
  ACTIVE: "bg-amber-500",
  PLANNING: "bg-emerald-500",
  OVERDUE: "bg-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "New-Evaluating",
  EVALUATING: "New-Evaluating",
  OFFERED: "Offered-Negotiating",
  NEGOTIATING: "Offered-Negotiating",
};

interface InquiryDockPanelProps {
  onDragStart: (inquiry: FleetInquirySummary) => void;
  onDragEnd: () => void;
  onVoyageDrop?: (voyageId: string) => void;
  isDraggingVoyage?: boolean;
  excludeInquiryIds?: string[];
  refreshKey?: number;
}

const CACHE_KEY = "fleet_dock_inquiries";

export function InquiryDockPanel({ onDragStart, onDragEnd, onVoyageDrop, isDraggingVoyage, excludeInquiryIds = [], refreshKey = 0 }: InquiryDockPanelProps) {
  const [inquiries, setInquiries] = useState<FleetInquirySummary[]>(() => {
    // Instant hydration from cache
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    // Only show loading if no cached data
    if (typeof window !== "undefined") {
      try { return !sessionStorage.getItem(CACHE_KEY); } catch {}
    }
    return true;
  });
  const [expanded, setExpanded] = useState(true);

  const loadInquiries = useCallback(async () => {
    const res = await getActiveInquiriesForFleet();
    if (res.success && res.data) {
      setInquiries(res.data);
      // Persist to cache for next visit
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(res.data)); } catch {}
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadInquiries(); }, [loadInquiries]);

  // Re-fetch when parent signals data has changed (e.g. after optimistic assign/unassign)
  useEffect(() => {
    if (refreshKey > 0) loadInquiries();
  }, [refreshKey, loadInquiries]);

  // Filter out inquiries that have been optimistically assigned
  const visibleInquiries = excludeInquiryIds.length > 0
    ? inquiries.filter(inq => !excludeInquiryIds.includes(inq.id))
    : inquiries;

  const handleDragStart = (e: React.DragEvent, inquiry: FleetInquirySummary) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/inquiry-id", inquiry.id);
    e.dataTransfer.setData("text/plain", `${inquiry.cargoType} ${inquiry.cargoQuantityMt}MT`);
    onDragStart(inquiry);
  };

  const handleDragEnd = () => {
    onDragEnd();
  };

  // Voyage drop zone handlers — always accept drops unconditionally.
  // Browsers restrict custom MIME types during dragover, so we validate in drop only.
  const handleVoyageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleVoyageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const voyageId = e.dataTransfer.getData("application/voyage-id");
    console.log("[DockPanel] Voyage drop received, voyageId:", voyageId);
    if (voyageId && onVoyageDrop) {
      onVoyageDrop(voyageId);
      // Refresh after unassign
      loadInquiries();
    }
  };

  return (
    <div
      data-dock-panel="true"
      className="rounded-xl border bg-card overflow-hidden transition-all border-border relative"
      onDragOver={handleVoyageDragOver}
      onDrop={handleVoyageDrop}
    >
      {/* Voyage unassign drop zone overlay — appears during any voyage drag */}
      {isDraggingVoyage && (
        <div
          className="absolute inset-0 z-[20] bg-amber-500/10 border-2 border-dashed border-amber-500/50 rounded-xl flex items-center justify-center backdrop-blur-[1px]"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const voyageId = e.dataTransfer.getData("application/voyage-id");
            console.log("[DockPanel Overlay] Voyage drop received, voyageId:", voyageId);
            if (voyageId && onVoyageDrop) {
              onVoyageDrop(voyageId);
              loadInquiries();
            }
          }}
        >
          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium bg-card/90 px-4 py-2 rounded-lg border border-amber-500/40 shadow-lg">
            <Package className="h-4 w-4" />
            Drop here to return to inquiries
          </div>
        </div>
      )}

      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10 hover:from-blue-500/15 hover:to-purple-500/15 transition"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4 text-blue-400" />
          <span>Cargo Inquiries</span>
          {visibleInquiries.length > 0 && (
            <span className="text-xs font-normal bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5">
              {visibleInquiries.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading inquiries...
            </div>
          ) : visibleInquiries.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No active inquiries
            </div>
          ) : (
            <>
              <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-1 mb-2">
                Drag onto a vessel row to assign
              </div>
              {visibleInquiries.map((inq) => (
                <InquiryCard
                  key={inq.id}
                  inquiry={inq}
                  onDragStart={(e) => handleDragStart(e, inq)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INQUIRY CARD WITH BEST VESSELS
// ═══════════════════════════════════════════════════════════════════

function InquiryCard({
  inquiry,
  onDragStart,
  onDragEnd,
}: {
  inquiry: FleetInquirySummary;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [showVessels, setShowVessels] = useState(false);
  const topVessels = inquiry.topVessels || [];
  const bestVessel = topVessels[0];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="rounded-lg border border-border bg-background/50 cursor-grab active:cursor-grabbing hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group"
    >
      {/* Main row — always visible */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Drag handle */}
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground/60" />

        {/* Urgency dot */}
        {inquiry.urgency && (
          <div className={`h-2 w-2 rounded-full ${URGENCY_DOT[inquiry.urgency]} shrink-0`} />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{inquiry.cargoType}</span>
            <span className="text-[10px] text-muted-foreground">
              {(inquiry.cargoQuantityMt / 1000).toFixed(0)}K MT
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
            <MapPin className="h-2.5 w-2.5" />
            <span className="truncate">
              {inquiry.loadPort.split(",")[0]} → {inquiry.dischargePort.split(",")[0]}
            </span>
          </div>
        </div>

        {/* Status badge */}
        <span className="text-[9px] text-muted-foreground/60 shrink-0">
          {STATUS_LABEL[inquiry.status] || inquiry.status}
        </span>

        {/* Revenue */}
        {inquiry.freightOffered && (
          <span className="text-[10px] text-emerald-400 font-medium shrink-0">
            ${inquiry.freightOffered.toFixed(0)}
          </span>
        )}
      </div>

      {/* Best Vessel Strip — compact inline summary */}
      {topVessels.length > 0 && (
        <div className="px-2.5 pb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowVessels(!showVessels);
            }}
            className="w-full flex items-center gap-1.5 text-[10px] rounded-md px-2 py-1 bg-blue-500/5 border border-blue-500/15 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all"
          >
            <Zap className="h-2.5 w-2.5 text-blue-400 shrink-0" />
            <span className="text-blue-400/80 font-medium">Best:</span>
            <span className="text-foreground/80 font-medium truncate">{bestVessel.name}</span>
            <ScorePill score={bestVessel.matchScore} />
            {topVessels.length > 1 && (
              <span className="text-muted-foreground/50 ml-auto shrink-0">
                +{topVessels.length - 1} more
              </span>
            )}
            {showVessels ? (
              <ChevronUp className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
            ) : (
              <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
            )}
          </button>

          {/* Expanded: Top 3 vessels detail */}
          {showVessels && (
            <div className="mt-1.5 space-y-1 animate-in slide-in-from-top-1 duration-150">
              {topVessels.map((v, i) => (
                <div
                  key={v.id}
                  className={`flex items-center gap-2 text-[10px] rounded-md px-2 py-1.5 border transition-colors ${
                    i === 0
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-muted/20 border-border/50"
                  }`}
                >
                  {/* Rank */}
                  <span className={`font-bold shrink-0 w-3 text-center ${
                    i === 0 ? "text-emerald-400" : "text-muted-foreground/50"
                  }`}>
                    {i + 1}
                  </span>

                  {/* Vessel icon */}
                  <Ship className={`h-3 w-3 shrink-0 ${
                    i === 0 ? "text-emerald-400" : "text-muted-foreground/50"
                  }`} />

                  {/* Vessel info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-medium truncate ${
                        i === 0 ? "text-foreground" : "text-foreground/70"
                      }`}>
                        {v.name}
                      </span>
                      {v.hasConflict && (
                        <AlertTriangle className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-muted-foreground/60">
                      {v.vesselType.replace(/_/g, " ")} · {(v.dwt / 1000).toFixed(0)}K DWT
                    </div>
                  </div>

                  {/* Score */}
                  <ScorePill score={v.matchScore} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No vessels warning */}
      {topVessels.length === 0 && (
        <div className="px-2.5 pb-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 px-2 py-1 rounded-md bg-muted/10 border border-border/30">
            <Ship className="h-2.5 w-2.5" />
            No fleet vessels match
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCORE PILL
// ═══════════════════════════════════════════════════════════════════

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 70
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : score >= 40
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-red-400 bg-red-500/10 border-red-500/30";

  return (
    <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-bold border shrink-0 ${color}`}>
      {score}
    </span>
  );
}
