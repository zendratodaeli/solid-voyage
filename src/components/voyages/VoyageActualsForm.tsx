"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ClipboardCheck, Loader2, Save } from "lucide-react";

interface VoyageActualsFormProps {
  voyageId: string;
  /** Pre-populated from VoyageCalculation estimates */
  estimates?: {
    ballastSeaDays: number;
    ladenSeaDays: number;
    totalSeaDays: number;
    totalPortDays: number;
    totalVoyageDays: number;
    totalBunkerMt: number;
    totalBunkerCost: number;
    totalVoyageCost: number;
    grossRevenue: number | null;
    voyagePnl: number | null;
    tce: number;
  };
  /** Existing actuals (for edit mode) */
  existingActuals?: {
    ballastSeaDays: number;
    ladenSeaDays: number;
    totalSeaDays: number;
    totalPortDays: number;
    totalVoyageDays: number;
    totalBunkerMt: number;
    totalBunkerCost: number;
    totalVoyageCost: number;
    grossRevenue: number | null;
    voyagePnl: number | null;
    tce: number | null;
    notes: string | null;
  } | null;
}

export function VoyageActualsForm({ voyageId, estimates, existingActuals }: VoyageActualsFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form with existing actuals or estimates
  const initial = existingActuals || estimates;

  const [form, setForm] = useState({
    ballastSeaDays: initial?.ballastSeaDays ?? 0,
    ladenSeaDays: initial?.ladenSeaDays ?? 0,
    totalSeaDays: initial?.totalSeaDays ?? 0,
    totalPortDays: initial?.totalPortDays ?? 0,
    totalVoyageDays: initial?.totalVoyageDays ?? 0,
    totalBunkerMt: initial?.totalBunkerMt ?? 0,
    totalBunkerCost: initial?.totalBunkerCost ?? 0,
    totalVoyageCost: initial?.totalVoyageCost ?? 0,
    grossRevenue: initial?.grossRevenue ?? 0,
    voyagePnl: initial?.voyagePnl ?? 0,
    tce: initial?.tce ?? 0,
    notes: (existingActuals?.notes) ?? "",
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: field === "notes" ? value : parseFloat(value) || 0 }));
  };

  // Auto-compute totals when duration fields change
  const handleDurationChange = (field: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const updated = { ...form, [field]: numValue };

    if (["ballastSeaDays", "ladenSeaDays"].includes(field)) {
      updated.totalSeaDays = updated.ballastSeaDays + updated.ladenSeaDays;
      updated.totalVoyageDays = updated.totalSeaDays + updated.totalPortDays;
    }
    if (field === "totalPortDays") {
      updated.totalVoyageDays = updated.totalSeaDays + updated.totalPortDays;
    }

    setForm(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/voyages/${voyageId}/actuals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          grossRevenue: form.grossRevenue || null,
          voyagePnl: form.voyagePnl || null,
          tce: form.tce || null,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to save actuals");
      }

      toast.success(existingActuals ? "Actuals updated!" : "Actuals saved!");
      router.refresh();
    } catch (error) {
      console.error("Save actuals error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-teal-500/30 bg-gradient-to-br from-teal-500/5 to-cyan-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-teal-400" />
          Voyage Actuals
        </CardTitle>
        <CardDescription>
          Enter the actual voyage execution data. Fields are pre-populated with estimated values for reference.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Duration Section */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Duration (Days)</h4>
            <div className="grid gap-4 md:grid-cols-5">
              <FormField
                label="Ballast Sea Days"
                value={form.ballastSeaDays}
                estimate={estimates?.ballastSeaDays}
                onChange={(v) => handleDurationChange("ballastSeaDays", v)}
              />
              <FormField
                label="Laden Sea Days"
                value={form.ladenSeaDays}
                estimate={estimates?.ladenSeaDays}
                onChange={(v) => handleDurationChange("ladenSeaDays", v)}
              />
              <FormField
                label="Total Sea Days"
                value={form.totalSeaDays}
                estimate={estimates?.totalSeaDays}
                readOnly
              />
              <FormField
                label="Port Days"
                value={form.totalPortDays}
                estimate={estimates?.totalPortDays}
                onChange={(v) => handleDurationChange("totalPortDays", v)}
              />
              <FormField
                label="Total Voyage Days"
                value={form.totalVoyageDays}
                estimate={estimates?.totalVoyageDays}
                readOnly
              />
            </div>
          </div>

          {/* Bunker Section */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Bunker</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Total Bunker (MT)"
                value={form.totalBunkerMt}
                estimate={estimates?.totalBunkerMt}
                onChange={(v) => updateField("totalBunkerMt", v)}
              />
              <FormField
                label="Total Bunker Cost (USD)"
                value={form.totalBunkerCost}
                estimate={estimates?.totalBunkerCost}
                onChange={(v) => updateField("totalBunkerCost", v)}
                prefix="$"
              />
            </div>
          </div>

          {/* Financial Section */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Financials</h4>
            <div className="grid gap-4 md:grid-cols-4">
              <FormField
                label="Total Voyage Cost (USD)"
                value={form.totalVoyageCost}
                estimate={estimates?.totalVoyageCost}
                onChange={(v) => updateField("totalVoyageCost", v)}
                prefix="$"
              />
              <FormField
                label="Gross Revenue (USD)"
                value={form.grossRevenue}
                estimate={estimates?.grossRevenue ?? undefined}
                onChange={(v) => updateField("grossRevenue", v)}
                prefix="$"
              />
              <FormField
                label="Voyage P&L (USD)"
                value={form.voyagePnl}
                estimate={estimates?.voyagePnl ?? undefined}
                onChange={(v) => updateField("voyagePnl", v)}
                prefix="$"
              />
              <FormField
                label="TCE (USD/day)"
                value={form.tce}
                estimate={estimates?.tce}
                onChange={(v) => updateField("tce", v)}
                prefix="$"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-muted-foreground">Operator Notes</Label>
            <Textarea
              placeholder="Any notes about the voyage execution (delays, weather, deviations...)"
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {existingActuals ? "Update Actuals" : "Save Actuals"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Form field with optional estimate comparison */
function FormField({
  label,
  value,
  estimate,
  onChange,
  readOnly = false,
  prefix,
}: {
  label: string;
  value: number;
  estimate?: number;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  prefix?: string;
}) {
  const variance = estimate !== undefined && estimate !== 0
    ? ((value - estimate) / estimate) * 100
    : null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          className={`text-sm ${prefix ? "pl-7" : ""} ${readOnly ? "opacity-60" : ""}`}
        />
      </div>
      {estimate !== undefined && (
        <div className="flex items-center gap-1 text-[10px]">
          <span className="text-muted-foreground">
            Est: {prefix}{typeof estimate === 'number' ? estimate.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
          </span>
          {variance !== null && value !== estimate && (
            <span className={variance > 0 ? "text-red-400" : "text-green-400"}>
              ({variance > 0 ? "+" : ""}{variance.toFixed(1)}%)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
