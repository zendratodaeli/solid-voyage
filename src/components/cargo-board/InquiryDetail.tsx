"use client";

/**
 * InquiryDetail — Extended slide-over for viewing/editing an inquiry
 * with Vessel Match Panel and Create Voyage gateway
 */

import { useState, useCallback, useTransition } from "react";
import {
  X,
  Ship,
  ExternalLink,
  Loader2,
  ArrowRight,
  Package,
  MapPin,
  Calendar,
  DollarSign,
  Users,
  FileText,
  Zap,
} from "lucide-react";
import {
  getVoyagePrefill,
  type CargoInquiryItem,
  type VoyagePrefill,
} from "@/actions/cargo-inquiry-actions";
import { VesselMatchPanel } from "./VesselMatchPanel";
import { InquiryForm } from "./InquiryForm";

interface InquiryDetailProps {
  inquiry: CargoInquiryItem;
  initialTab?: "overview" | "vessels";
  onClose: () => void;
  onUpdated: () => void;
}

export function InquiryDetail({ inquiry, initialTab = "overview", onClose, onUpdated }: InquiryDetailProps) {
  const [tab, setTab] = useState<"overview" | "vessels" | "edit">(initialTab);
  const [isPending, startTransition] = useTransition();
  const [voyagePrefill, setVoyagePrefill] = useState<VoyagePrefill | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  const handleCreateVoyage = useCallback(() => {
    startTransition(async () => {
      setPrefillError(null);
      const res = await getVoyagePrefill(inquiry.id);
      if (res.success && res.data) {
        // Save prefill to sessionStorage and redirect to voyage creation
        sessionStorage.setItem("voyagePrefill", JSON.stringify(res.data));
        // Navigate to voyage creation — the user's existing voyage form will pick this up
        const orgSlug = window.location.pathname.split("/")[1];
        window.location.href = `/${orgSlug}/voyages?prefill=inquiry&inquiryId=${inquiry.id}`;
      } else {
        setPrefillError(res.error || "Failed to generate voyage data");
      }
    });
  }, [inquiry.id]);

  const URGENCY_LABELS: Record<string, { label: string; color: string }> = {
    URGENT: { label: "Urgent", color: "text-red-400" },
    ACTIVE: { label: "Active", color: "text-amber-400" },
    PLANNING: { label: "Planning", color: "text-emerald-400" },
    OVERDUE: { label: "Overdue", color: "text-gray-400" },
  };

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    NEW: { label: "New-Evaluating", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
    EVALUATING: { label: "New-Evaluating", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
    OFFERED: { label: "Offered-Negotiating", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
    NEGOTIATING: { label: "Offered-Negotiating", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
    FIXED: { label: "Fixed", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    LOST: { label: "Lost", color: "text-red-400 bg-red-500/10 border-red-500/30" },
    EXPIRED: { label: "Expired", color: "text-gray-400 bg-gray-500/10 border-gray-500/30" },
    WITHDRAWN: { label: "Withdrawn", color: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
  };

  if (tab === "edit") {
    return (
      <InquiryForm
        inquiry={inquiry}
        onClose={() => setTab("overview")}
        onSaved={() => { setTab("overview"); onUpdated(); }}
      />
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-over */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <Package className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{inquiry.cargoType}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{inquiry.cargoQuantityMt.toLocaleString()} MT</span>
                <span className="text-muted-foreground/30">•</span>
                <span>{inquiry.loadPort} → {inquiry.dischargePort}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${STATUS_LABELS[inquiry.status]?.color || ""}`}>
              {STATUS_LABELS[inquiry.status]?.label || inquiry.status}
            </span>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {[
            { key: "overview", label: "Overview", icon: FileText },
            { key: "vessels", label: "Fleet Match", icon: Ship },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                tab === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setTab("edit")}
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            Edit
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {tab === "overview" ? (
            <>
              {/* Urgency Banner */}
              {inquiry.urgency && (
                <div className={`flex items-center gap-2 text-sm font-medium ${URGENCY_LABELS[inquiry.urgency]?.color || ""}`}>
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {URGENCY_LABELS[inquiry.urgency]?.label} — {inquiry.laycanStart && (
                    <>
                      Laycan {new Date(inquiry.laycanStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {inquiry.laycanEnd && <> – {new Date(inquiry.laycanEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>}
                    </>
                  )}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <InfoCard icon={<Package className="h-4 w-4" />} label="Cargo" value={`${inquiry.cargoQuantityMt.toLocaleString()} MT ${inquiry.cargoType}`} />
                <InfoCard icon={<MapPin className="h-4 w-4" />} label="Route" value={`${inquiry.loadPort} → ${inquiry.dischargePort}`} />
                {inquiry.freightOffered && (
                  <InfoCard icon={<DollarSign className="h-4 w-4" />} label="Freight" value={`$${inquiry.freightOffered.toFixed(2)}/MT`} accent="emerald" />
                )}
                {inquiry.estimatedRevenue && (
                  <InfoCard icon={<DollarSign className="h-4 w-4" />} label="Est. Revenue" value={`$${inquiry.estimatedRevenue.toLocaleString()}`} accent="purple" />
                )}
                {inquiry.brokerName && (
                  <InfoCard icon={<Users className="h-4 w-4" />} label="Broker" value={inquiry.brokerName} />
                )}
                {inquiry.stowageFactor && (
                  <InfoCard icon={<Package className="h-4 w-4" />} label="Stowage Factor" value={`${inquiry.stowageFactor} m³/MT`} />
                )}
              </div>

              {/* Vessel Candidates Summary */}
              {inquiry.vesselCandidates.length > 0 && (
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vessel Candidates</div>
                  {inquiry.vesselCandidates.map((vc) => (
                    <div key={vc.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Ship className="h-3.5 w-3.5 text-blue-400" />
                        <span className="font-medium">{vc.vesselName}</span>
                        <span className="text-xs text-muted-foreground">{vc.dwt.toLocaleString()} DWT</span>
                        {vc.isSelected && (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-1.5 py-0.5">
                            Selected
                          </span>
                        )}
                      </div>
                      {vc.estimatedTce && (
                        <span className="text-xs text-emerald-400">${vc.estimatedTce.toLocaleString()}/day TCE</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              {inquiry.notes && (
                <div className="rounded-lg border border-border p-4 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</div>
                  <p className="text-sm text-muted-foreground">{inquiry.notes}</p>
                </div>
              )}

              {/* Create Voyage CTA */}
              {inquiry.selectedVesselId && ["OFFERED", "NEGOTIATING", "FIXED"].includes(inquiry.status) && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                  <div className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Ready to create voyage
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A vessel has been selected. Create a voyage to begin calculating economics.
                  </p>
                  {prefillError && (
                    <div className="text-xs text-red-400">{prefillError}</div>
                  )}
                  <button
                    onClick={handleCreateVoyage}
                    disabled={isPending}
                    className="h-9 px-4 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Create Voyage from Inquiry
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Vessels Tab — onVesselChanged is a no-op: optimistic UI handles state locally */
            <VesselMatchPanel inquiry={inquiry} onVesselChanged={() => {}} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0 text-xs text-muted-foreground">
          <span>Created {new Date(inquiry.createdAt).toLocaleDateString("en-GB")} by {inquiry.createdByName || "Unknown"}</span>
          <span>Updated {new Date(inquiry.updatedAt).toLocaleDateString("en-GB")}</span>
        </div>
      </div>
    </>
  );
}

function InfoCard({ icon, label, value, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  const accentColor = accent === "emerald" ? "text-emerald-400" : accent === "purple" ? "text-purple-400" : "text-foreground";
  return (
    <div className="rounded-lg border border-border p-3 space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`text-sm font-medium ${accentColor}`}>{value}</div>
    </div>
  );
}
