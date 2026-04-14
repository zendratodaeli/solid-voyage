"use client";

/**
 * InquiryForm — Slide-over for creating/editing cargo inquiries
 */

import { useState, useTransition } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import {
  createCargoInquiry,
  updateCargoInquiry,
  checkConflicts,
  type CargoInquiryItem,
  type ConflictWarning,
} from "@/actions/cargo-inquiry-actions";

interface InquiryFormProps {
  inquiry: CargoInquiryItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export function InquiryForm({ inquiry, onClose, onSaved }: InquiryFormProps) {
  const isEditing = !!inquiry;
  const [isPending, startTransition] = useTransition();
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [warnings, setWarnings] = useState<ConflictWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [cargoType, setCargoType] = useState(inquiry?.cargoType || "");
  const [cargoQuantityMt, setCargoQuantityMt] = useState(inquiry?.cargoQuantityMt?.toString() || "");
  const [stowageFactor, setStowageFactor] = useState(inquiry?.stowageFactor?.toString() || "");
  const [loadPort, setLoadPort] = useState(inquiry?.loadPort || "");
  const [dischargePort, setDischargePort] = useState(inquiry?.dischargePort || "");
  const [loadRegion, setLoadRegion] = useState(inquiry?.loadRegion || "");
  const [dischargeRegion, setDischargeRegion] = useState(inquiry?.dischargeRegion || "");
  const [laycanStart, setLaycanStart] = useState(inquiry?.laycanStart ? inquiry.laycanStart.split("T")[0] : "");
  const [laycanEnd, setLaycanEnd] = useState(inquiry?.laycanEnd ? inquiry.laycanEnd.split("T")[0] : "");
  const [freightOffered, setFreightOffered] = useState(inquiry?.freightOffered?.toString() || "");
  const [commissionPercent, setCommissionPercent] = useState(inquiry?.commissionPercent?.toString() || "");
  const [source, setSource] = useState(inquiry?.source || "");
  const [brokerName, setBrokerName] = useState(inquiry?.brokerName || "");
  const [contactName, setContactName] = useState(inquiry?.contactName || "");
  const [contactEmail, setContactEmail] = useState(inquiry?.contactEmail || "");
  const [notes, setNotes] = useState(inquiry?.notes || "");

  const handleSubmit = async (e: React.FormEvent, asDraft = false) => {
    e.preventDefault();
    setError(null);

    if (!asDraft && (!cargoType.trim() || !cargoQuantityMt || !loadPort.trim() || !dischargePort.trim())) {
      setError("Cargo type, quantity, load port, and discharge port are required.");
      return;
    }

    if (asDraft) setIsDraftSaving(true);

    startTransition(async () => {
      // Check conflicts first
      const conflictRes = await checkConflicts({
        loadPort,
        dischargePort,
        laycanStart: laycanStart || null,
        laycanEnd: laycanEnd || null,
        excludeInquiryId: inquiry?.id,
      });
      if (conflictRes.warnings.length > 0) {
        setWarnings(conflictRes.warnings);
        // Warnings are informational — we still allow saving
      }

      const formData = {
        cargoType: cargoType.trim(),
        cargoQuantityMt: parseFloat(cargoQuantityMt),
        stowageFactor: stowageFactor ? parseFloat(stowageFactor) : null,
        loadPort: loadPort.trim(),
        dischargePort: dischargePort.trim(),
        loadRegion: loadRegion.trim() || null,
        dischargeRegion: dischargeRegion.trim() || null,
        laycanStart: laycanStart || null,
        laycanEnd: laycanEnd || null,
        freightOffered: freightOffered ? parseFloat(freightOffered) : null,
        commissionPercent: commissionPercent ? parseFloat(commissionPercent) : null,
        source: source.trim() || null,
        brokerName: brokerName.trim() || null,
        contactName: contactName.trim() || null,
        contactEmail: contactEmail.trim() || null,
        notes: notes.trim() || null,
        ...(asDraft ? { status: "DRAFT" } : {}),
      };

      let result;
      if (isEditing) {
        result = await updateCargoInquiry(inquiry.id, formData);
      } else {
        result = await createCargoInquiry(formData);
      }

      if (result.success) {
        onSaved();
      } else {
        setError(result.error || "Failed to save");
      }
      setIsDraftSaving(false);
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">
            {isEditing ? "Edit Inquiry" : "New Cargo Inquiry"}
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Potential Conflicts
              </div>
              {warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-300/80 pl-6">{w.message}</div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ─── Cargo Details ─── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Cargo Details
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo Type *" value={cargoType} onChange={setCargoType} placeholder="Coal, Iron Ore, Grain..." />
              <Field label="Quantity (MT) *" value={cargoQuantityMt} onChange={setCargoQuantityMt} type="number" placeholder="65000" />
            </div>
            <Field label="Stowage Factor (m³/MT)" value={stowageFactor} onChange={setStowageFactor} type="number" placeholder="e.g. 0.8 (coal), 1.3 (grain)" />
            {stowageFactor && cargoQuantityMt && (
              <div className="text-xs text-muted-foreground">
                Required cubic capacity: <span className="font-medium text-foreground">
                  {(parseFloat(stowageFactor) * parseFloat(cargoQuantityMt)).toLocaleString()} m³
                </span>
              </div>
            )}
          </fieldset>

          {/* ─── Route ─── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Route
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Load Port *" value={loadPort} onChange={setLoadPort} placeholder="Richards Bay" />
              <Field label="Discharge Port *" value={dischargePort} onChange={setDischargePort} placeholder="ARA" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Load Region" value={loadRegion} onChange={setLoadRegion} placeholder="West Africa" />
              <Field label="Discharge Region" value={dischargeRegion} onChange={setDischargeRegion} placeholder="Europe" />
            </div>
          </fieldset>

          {/* ─── Laycan ─── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Laycan
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Laycan Start" value={laycanStart} onChange={setLaycanStart} type="date" />
              <Field label="Laycan End" value={laycanEnd} onChange={setLaycanEnd} type="date" />
            </div>
          </fieldset>

          {/* ─── Commercial ─── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Commercial
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Freight Offered ($/MT)" value={freightOffered} onChange={setFreightOffered} type="number" placeholder="14.50" />
              <Field label="Commission (%)" value={commissionPercent} onChange={setCommissionPercent} type="number" placeholder="3.75" />
            </div>
            {freightOffered && cargoQuantityMt && (
              <div className="text-xs text-muted-foreground">
                Estimated revenue: <span className="font-medium text-emerald-400">
                  ${(parseFloat(freightOffered) * parseFloat(cargoQuantityMt)).toLocaleString()}
                </span>
              </div>
            )}
          </fieldset>

          {/* ─── Source / Contact ─── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Source & Contact
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source" value={source} onChange={setSource} placeholder="Broker A via email" />
              <Field label="Broker / Company" value={brokerName} onChange={setBrokerName} placeholder="Clarksons" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact Name" value={contactName} onChange={setContactName} placeholder="John Smith" />
              <Field label="Contact Email" value={contactEmail} onChange={setContactEmail} type="email" placeholder="john@broker.com" />
            </div>
          </fieldset>

          {/* ─── Notes ─── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Notes
            </legend>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes about this inquiry..."
              className="w-full h-20 px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </fieldset>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e as any, true)}
            disabled={isPending || isDraftSaving}
            className="h-9 px-4 rounded-md border border-border bg-muted/50 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition disabled:opacity-50 flex items-center gap-2"
          >
            {isDraftSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save as Draft"
            )}
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={isPending || isDraftSaving}
            className="h-9 px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              isEditing ? "Update Inquiry" : "Create Inquiry"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FIELD
// ═══════════════════════════════════════════════════════════════════

function Field({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        step={type === "number" ? "any" : undefined}
        className="w-full h-9 px-3 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
