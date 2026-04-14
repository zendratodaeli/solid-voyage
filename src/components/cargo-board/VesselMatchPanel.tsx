"use client";

/**
 * VesselMatchPanel — Shows auto-matched vessels for an inquiry
 * with match scores, add/remove/select capabilities
 */

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  Ship,
  Plus,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Star,
  Anchor,
  Gauge,
  ChevronDown,
  ChevronUp,
  Zap,
  ExternalLink,
} from "lucide-react";
import {
  getMatchingVessels,
  addVesselCandidate,
  removeVesselCandidate,
  selectVesselForInquiry,
  type MatchedVessel,
  type CargoInquiryItem,
} from "@/actions/cargo-inquiry-actions";

interface VesselMatchPanelProps {
  inquiry: CargoInquiryItem;
  onVesselChanged: () => void;
}

export function VesselMatchPanel({ inquiry, onVesselChanged }: VesselMatchPanelProps) {
  const [vessels, setVessels] = useState<MatchedVessel[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadVessels = useCallback(async () => {
    setLoading(true);
    const res = await getMatchingVessels(inquiry.id);
    if (res.success && res.data) setVessels(res.data);
    setLoading(false);
  }, [inquiry.id]);

  useEffect(() => { loadVessels(); }, [loadVessels]);

  const handleAdd = (vesselId: string) => {
    // ── Optimistic: mark as candidate immediately ──
    const prevVessels = vessels;
    setVessels(prev => prev.map(v =>
      v.id === vesselId ? { ...v, isAlreadyCandidate: true } : v
    ));

    startTransition(async () => {
      const res = await addVesselCandidate(inquiry.id, vesselId);
      if (res.success) {
        onVesselChanged();
      } else {
        setVessels(prevVessels); // rollback
      }
    });
  };

  const handleRemove = (vesselId: string) => {
    // ── Optimistic: unmark as candidate immediately ──
    const prevVessels = vessels;
    setVessels(prev => prev.map(v =>
      v.id === vesselId ? { ...v, isAlreadyCandidate: false } : v
    ));

    startTransition(async () => {
      const res = await removeVesselCandidate(inquiry.id, vesselId);
      if (res.success) {
        onVesselChanged();
      } else {
        setVessels(prevVessels); // rollback
      }
    });
  };

  const handleSelect = (vesselId: string) => {
    // ── Optimistic: show as selected immediately ──
    const prevVessels = vessels;
    setVessels(prev => prev.map(v =>
      v.id === vesselId
        ? { ...v, isAlreadyCandidate: true }
        : v
    ));

    startTransition(async () => {
      const res = await selectVesselForInquiry(inquiry.id, vesselId);
      if (res.success) {
        onVesselChanged();
      } else {
        setVessels(prevVessels); // rollback
      }
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Ship className="h-4 w-4 text-blue-400" />
          Fleet Match
          {vessels.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {vessels.length} vessel{vessels.length > 1 ? "s" : ""}
            </span>
          )}
          {inquiry.vesselCandidates.length > 0 && (
            <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5">
              {inquiry.vesselCandidates.length} matched
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
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing fleet...
            </div>
          ) : vessels.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No vessels in your fleet yet
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="text-xs text-muted-foreground mb-2">
                Ranked by match score (DWT, capacity, availability, conflicts)
              </div>

              {/* Vessel Cards */}
              <div className="space-y-2">
                {vessels.map((v) => (
                  <VesselCard
                    key={v.id}
                    vessel={v}
                    isSelected={inquiry.selectedVesselId === v.id}
                    onAdd={() => handleAdd(v.id)}
                    onRemove={() => handleRemove(v.id)}
                    onSelect={() => handleSelect(v.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VESSEL CARD
// ═══════════════════════════════════════════════════════════════════

function VesselCard({
  vessel, isSelected, onAdd, onRemove, onSelect,
}: {
  vessel: MatchedVessel;
  isSelected: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onSelect: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${
        isSelected
          ? "border-emerald-500/50 bg-emerald-500/5"
          : vessel.isAlreadyCandidate
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-border hover:border-border/80"
      }`}
    >
      {/* Top row */}
      <div className="flex items-center gap-3">
        {/* Score badge */}
        <div
          className={`flex items-center justify-center h-10 w-10 rounded-lg border text-sm font-bold shrink-0 ${scoreBg(vessel.matchScore)} ${scoreColor(vessel.matchScore)}`}
        >
          {vessel.matchScore}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{vessel.name}</span>
            {isSelected && (
              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-1.5 py-0.5">
                <Star className="h-2.5 w-2.5" /> Selected
              </span>
            )}
            {vessel.hasConflict && (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{vessel.vesselType.replace(/_/g, " ")}</span>
            <span>{vessel.dwt.toLocaleString()} DWT</span>
            {vessel.dailyTcHireRate && (
              <span>${vessel.dailyTcHireRate.toLocaleString()}/day</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {vessel.isAlreadyCandidate ? (
            <>
              {!isSelected && (
                <button
                  onClick={onSelect}
                  className="h-7 px-2 text-xs rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition flex items-center gap-1"
                  title="Select this vessel"
                >
                  <Check className="h-3 w-3" /> Select
                </button>
              )}
              <button
                onClick={onRemove}
                className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
                title="Remove from candidates"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={onAdd}
              className={`h-7 px-2 text-xs rounded border transition flex items-center gap-1 ${
                vessel.matchScore >= 50
                  ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  : "border-red-500/30 text-red-400 hover:bg-red-500/10"
              }`}
              title={vessel.matchScore >= 50 ? "Add to vessel match list" : `Low match: ${vessel.matchReasons.join(", ")}`}
            >
              {vessel.matchScore >= 50 ? (
                <><Plus className="h-3 w-3" /> Match</>
              ) : (
                <><AlertTriangle className="h-3 w-3" /> Unmatch</>
              )}
            </button>
          )}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            {showDetails ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          {/* Match Reasons */}
          <div className="space-y-1">
            {vessel.matchReasons.map((reason, i) => (
              <div
                key={i}
                className={`text-xs ${
                  reason.startsWith("⚠") ? "text-amber-400" : "text-muted-foreground"
                }`}
              >
                {reason.startsWith("⚠") ? "" : "✓ "}{reason}
              </div>
            ))}
          </div>

          {/* Conflict Warning */}
          {vessel.hasConflict && vessel.conflictNote && (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {vessel.conflictNote}
            </div>
          )}

          {/* Specs grid */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="space-y-0.5">
              <div className="text-muted-foreground/60">Laden Speed</div>
              <div className="font-medium">{vessel.ladenSpeed} kn</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground/60">Ballast Speed</div>
              <div className="font-medium">{vessel.ballastSpeed} kn</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground/60">Control</div>
              <div className="font-medium">{vessel.commercialControl.replace(/_/g, " ")}</div>
            </div>
            {vessel.grainCapacity && (
              <div className="space-y-0.5">
                <div className="text-muted-foreground/60">Grain Cap.</div>
                <div className="font-medium">{vessel.grainCapacity.toLocaleString()} m³</div>
              </div>
            )}
            {vessel.baleCapacity && (
              <div className="space-y-0.5">
                <div className="text-muted-foreground/60">Bale Cap.</div>
                <div className="font-medium">{vessel.baleCapacity.toLocaleString()} m³</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number) {
  if (score >= 70) return "bg-emerald-500/10 border-emerald-500/30";
  if (score >= 40) return "bg-amber-500/10 border-amber-500/30";
  return "bg-red-500/10 border-red-500/30";
}
