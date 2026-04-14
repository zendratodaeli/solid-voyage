"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOrgPath } from "@/hooks/useOrgPath";
import {
  Calculator,
  Plus,
  X,
  Clock,
  Ship,
  Anchor,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Timer,
  CloudRain,
  Sun,
  Wrench,
  ArrowRightLeft,
  Ban,
  FileText,
  TrendingUp,
  TrendingDown,
  Save,
  Loader2,
  ArrowLeft,
  FileDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────
type LaytimeTerms = "SHINC" | "SHEX" | "SSHEX" | "SHEXUU";
type OperationType = "loading" | "discharging";
type LaytimeMode = "fixed" | "rate";

type EventType =
  | "working"
  | "weather_delay"
  | "sunday"
  | "holiday"
  | "breakdown_owner"
  | "breakdown_charterer"
  | "shifting"
  | "strike"
  | "waiting_berth"
  | "custom_exception";

interface TimeSheetEvent {
  id: string;
  from: string; // ISO datetime-local string
  to: string;
  eventType: EventType;
  remarks: string;
}

interface CharterTerms {
  vesselName: string;
  voyageRef: string;
  portName: string;
  operationType: OperationType;
  laytimeMode: LaytimeMode;
  allowedHours: string;
  cargoQuantity: string;
  loadingRate: string;
  terms: LaytimeTerms;
  demurrageRate: string;
  despatchRate: string;
  norTendered: string;
  laytimeCommenced: string;
  reversible: boolean;
}

// ─── Constants ──────────────────────────────────────────────────
const EVENT_CONFIG: Record<EventType, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  working: { label: "Working", icon: <Timer className="h-3.5 w-3.5" />, color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/20" },
  weather_delay: { label: "Weather Delay", icon: <CloudRain className="h-3.5 w-3.5" />, color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/20" },
  sunday: { label: "Sunday", icon: <Sun className="h-3.5 w-3.5" />, color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/20" },
  holiday: { label: "Holiday", icon: <Sun className="h-3.5 w-3.5" />, color: "text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/20" },
  breakdown_owner: { label: "Breakdown (Owner)", icon: <Wrench className="h-3.5 w-3.5" />, color: "text-red-400", bgColor: "bg-red-500/10 border-red-500/20" },
  breakdown_charterer: { label: "Breakdown (Charterer)", icon: <Wrench className="h-3.5 w-3.5" />, color: "text-purple-400", bgColor: "bg-purple-500/10 border-purple-500/20" },
  shifting: { label: "Shifting", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, color: "text-cyan-400", bgColor: "bg-cyan-500/10 border-cyan-500/20" },
  strike: { label: "Strike", icon: <Ban className="h-3.5 w-3.5" />, color: "text-rose-400", bgColor: "bg-rose-500/10 border-rose-500/20" },
  waiting_berth: { label: "Waiting for Berth", icon: <Anchor className="h-3.5 w-3.5" />, color: "text-slate-400", bgColor: "bg-slate-500/10 border-slate-500/20" },
  custom_exception: { label: "Custom Exception", icon: <FileText className="h-3.5 w-3.5" />, color: "text-gray-400", bgColor: "bg-gray-500/10 border-gray-500/20" },
};

const TERMS_DESCRIPTIONS: Record<LaytimeTerms, string> = {
  SHINC: "Sundays & Holidays Included — laytime counts 24/7",
  SHEX: "Sundays & Holidays Excepted — Sundays/holidays don't count",
  SSHEX: "Saturdays, Sundays & Holidays Excepted",
  SHEXUU: "Sundays & Holidays Excepted Unless Used",
};

// ─── Helpers ────────────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function formatDuration(hours: number): string {
  if (hours < 0) hours = 0;
  const days = Math.floor(hours / 24);
  const hrs = Math.floor(hours % 24);
  const mins = Math.round((hours % 1) * 60);
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function hoursBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, diff / (1000 * 60 * 60));
}

function isSunday(dateStr: string): boolean {
  return new Date(dateStr).getDay() === 0;
}

function isSaturday(dateStr: string): boolean {
  return new Date(dateStr).getDay() === 6;
}

function doesEventCount(event: TimeSheetEvent, terms: LaytimeTerms, onDemurrage: boolean): boolean {
  // "Once on demurrage, always on demurrage" — most exceptions don't apply
  if (onDemurrage && event.eventType !== "breakdown_owner") {
    return true;
  }

  switch (event.eventType) {
    case "working":
      return true;
    case "weather_delay":
      return false; // Weather working days — weather delay never counts
    case "sunday":
      if (terms === "SHINC") return true;
      if (terms === "SHEX" || terms === "SSHEX") return false;
      if (terms === "SHEXUU") return false; // Unless used — but event type is "sunday" (not working)
      return false;
    case "holiday":
      if (terms === "SHINC") return true;
      return false; // All other terms exclude holidays
    case "breakdown_owner":
      return false; // Owner's fault never counts
    case "breakdown_charterer":
      return true; // Charterer's responsibility counts
    case "shifting":
      return false; // Shifting between berths excluded
    case "strike":
      return false; // Strike excluded
    case "waiting_berth":
      return false; // Waiting for berth excluded
    case "custom_exception":
      return false; // Custom exceptions excluded
    default:
      return true;
  }
}

function defaultDatetime(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString().slice(0, 16);
}

function addHoursToDatetime(datetime: string, hours: number): string {
  const d = new Date(datetime);
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

// ─── Types for vessel combobox ──────────────────────────────────
interface FleetVessel {
  id: string;
  name: string;
  imoNumber: string | null;
  vesselType: string;
}

// ─── Component ──────────────────────────────────────────────────
interface LaytimeCalculatorProps {
  existingCalc?: any;
}

export function LaytimeCalculator({ existingCalc }: LaytimeCalculatorProps) {
  const router = useRouter();
  const { orgPath } = useOrgPath();
  const [copied, setCopied] = useState(false);
  const [showTermsHelp, setShowTermsHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const isEditMode = !!existingCalc;

  // ─── Vessel fleet combobox state ─────────────────────────────
  const [fleetVessels, setFleetVessels] = useState<FleetVessel[]>([]);
  const [vesselDropdownOpen, setVesselDropdownOpen] = useState(false);
  const vesselInputRef = useRef<HTMLInputElement>(null);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch fleet vessels on mount
  useEffect(() => {
    fetch("/api/vessels/names")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setFleetVessels(json.data);
        }
      })
      .catch(() => {/* silently ignore — manual entry still works */});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        vesselDropdownRef.current &&
        !vesselDropdownRef.current.contains(e.target as Node) &&
        vesselInputRef.current &&
        !vesselInputRef.current.contains(e.target as Node)
      ) {
        setVesselDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Charter party terms — pre-fill from existingCalc if editing
  const [terms, setTerms] = useState<CharterTerms>(() => {
    if (existingCalc) {
      return {
        vesselName: existingCalc.vesselName || "",
        voyageRef: existingCalc.voyageRef || "",
        portName: existingCalc.portName || "",
        operationType: existingCalc.operationType || "loading",
        laytimeMode: existingCalc.laytimeMode || "fixed",
        allowedHours: String(existingCalc.allowedHours || 72),
        cargoQuantity: existingCalc.cargoQuantity ? String(existingCalc.cargoQuantity) : "",
        loadingRate: existingCalc.loadingRate ? String(existingCalc.loadingRate) : "",
        terms: existingCalc.terms || "SHINC",
        demurrageRate: String(existingCalc.demurrageRate || 25000),
        despatchRate: String(existingCalc.despatchRate || 12500),
        norTendered: existingCalc.norTendered
          ? new Date(existingCalc.norTendered).toISOString().slice(0, 16)
          : defaultDatetime(),
        laytimeCommenced: existingCalc.laytimeCommenced
          ? new Date(existingCalc.laytimeCommenced).toISOString().slice(0, 16)
          : defaultDatetime(),
        reversible: existingCalc.reversible || false,
      };
    }
    return {
      vesselName: "",
      voyageRef: "",
      portName: "",
      operationType: "loading",
      laytimeMode: "fixed",
      allowedHours: "72",
      cargoQuantity: "",
      loadingRate: "",
      terms: "SHINC",
      demurrageRate: "25000",
      despatchRate: "12500",
      norTendered: defaultDatetime(),
      laytimeCommenced: defaultDatetime(),
      reversible: false,
    };
  });

  // Time sheet events — pre-fill from existingCalc if editing
  const [events, setEvents] = useState<TimeSheetEvent[]>(() => {
    if (existingCalc?.events && Array.isArray(existingCalc.events)) {
      return existingCalc.events.map((ev: any) => ({
        id: ev.id || generateId(),
        from: ev.from || "",
        to: ev.to || "",
        eventType: ev.eventType || "working",
        remarks: ev.remarks || "",
      }));
    }
    return [];
  });

  // Computed allowed laytime in hours
  const allowedLaytimeHours = useMemo(() => {
    if (terms.laytimeMode === "fixed") {
      return parseFloat(terms.allowedHours) || 0;
    }
    // Rate-based: cargo quantity / loading rate = days, then * 24
    const cargo = parseFloat(terms.cargoQuantity) || 0;
    const rate = parseFloat(terms.loadingRate) || 1;
    return (cargo / rate) * 24;
  }, [terms.laytimeMode, terms.allowedHours, terms.cargoQuantity, terms.loadingRate]);

  // Calculate results
  const results = useMemo(() => {
    let countedHours = 0;
    let excludedHours = 0;
    const excludedByType: Record<string, number> = {};
    let onDemurrage = false;

    const eventResults = events.map((event) => {
      const duration = hoursBetween(event.from, event.to);
      const counts = doesEventCount(event, terms.terms, onDemurrage);
      
      if (counts) {
        countedHours += duration;
        // Check if we've now entered demurrage
        if (countedHours > allowedLaytimeHours) {
          onDemurrage = true;
        }
      } else {
        excludedHours += duration;
        const typeLabel = EVENT_CONFIG[event.eventType]?.label || event.eventType;
        excludedByType[typeLabel] = (excludedByType[typeLabel] || 0) + duration;
      }

      return { ...event, duration, counts };
    });

    const excessHours = countedHours - allowedLaytimeHours;
    const isDemurrage = excessHours > 0;
    const demurrageRate = parseFloat(terms.demurrageRate) || 0;
    const despatchRate = parseFloat(terms.despatchRate) || 0;

    const demurrageAmount = isDemurrage ? (excessHours / 24) * demurrageRate : 0;
    const despatchAmount = !isDemurrage ? (Math.abs(excessHours) / 24) * despatchRate : 0;

    const progressPercent = allowedLaytimeHours > 0 
      ? Math.min(100, (countedHours / allowedLaytimeHours) * 100) 
      : 0;

    return {
      eventResults,
      countedHours,
      excludedHours,
      excludedByType,
      excessHours,
      isDemurrage,
      demurrageAmount,
      despatchAmount,
      progressPercent,
      onDemurrage,
    };
  }, [events, terms.terms, terms.demurrageRate, terms.despatchRate, allowedLaytimeHours]);

  // Add event
  const addEvent = useCallback(() => {
    const lastEvent = events[events.length - 1];
    const fromTime = lastEvent?.to || terms.laytimeCommenced || defaultDatetime();
    const toTime = addHoursToDatetime(fromTime, 6);

    setEvents((prev) => [
      ...prev,
      {
        id: generateId(),
        from: fromTime,
        to: toTime,
        eventType: "working",
        remarks: "",
      },
    ]);
  }, [events, terms.laytimeCommenced]);

  // Remove event
  const removeEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Update event
  const updateEvent = useCallback((id: string, field: keyof TimeSheetEvent, value: string) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  }, []);

  // Update charter terms
  const updateTerms = useCallback((field: keyof CharterTerms, value: string | boolean) => {
    setTerms((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Copy summary to clipboard
  const copySummary = useCallback(() => {
    const lines = [
      `LAYTIME & DEMURRAGE CALCULATION`,
      `═══════════════════════════════`,
      `Vessel: ${terms.vesselName || "N/A"}`,
      `Voyage: ${terms.voyageRef || "N/A"}`,
      `Port: ${terms.portName || "N/A"} (${terms.operationType})`,
      `Terms: ${terms.terms}`,
      ``,
      `Allowed Laytime: ${formatDuration(allowedLaytimeHours)}`,
      `Time Used (counted): ${formatDuration(results.countedHours)}`,
      `Time Excluded: ${formatDuration(results.excludedHours)}`,
      ``,
      results.isDemurrage
        ? `RESULT: DEMURRAGE — $${results.demurrageAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `RESULT: DESPATCH — $${results.despatchAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ``,
      `Demurrage Rate: $${terms.demurrageRate}/day`,
      `Despatch Rate: $${terms.despatchRate}/day`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    toast.success("Summary copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }, [terms, results, allowedLaytimeHours]);

  // Save / Update to database
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        vesselName: terms.vesselName,
        voyageRef: terms.voyageRef,
        portName: terms.portName,
        operationType: terms.operationType,
        laytimeMode: terms.laytimeMode,
        allowedHours: parseFloat(terms.allowedHours) || 72,
        cargoQuantity: parseFloat(terms.cargoQuantity) || null,
        loadingRate: parseFloat(terms.loadingRate) || null,
        terms: terms.terms,
        demurrageRate: parseFloat(terms.demurrageRate) || 25000,
        despatchRate: parseFloat(terms.despatchRate) || 12500,
        norTendered: terms.norTendered || null,
        laytimeCommenced: terms.laytimeCommenced || null,
        reversible: terms.reversible,
        events: events,
        resultType: results.isDemurrage ? "demurrage" : events.length > 0 ? "despatch" : null,
        resultAmount: results.isDemurrage ? results.demurrageAmount : results.despatchAmount,
        countedHours: results.countedHours,
        excludedHours: results.excludedHours,
      };

      const url = isEditMode ? `/api/laytime/${existingCalc.id}` : "/api/laytime";
      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) {
        toast.success(isEditMode ? "Calculation updated!" : "Calculation saved!");
        if (!isEditMode) {
          router.push(orgPath(`/laytime-calculator/${json.data.id}/edit`));
        } else {
          router.refresh();
        }
      } else {
        toast.error(json.error || "Failed to save");
      }
    } catch (err) {
      toast.error("Failed to save calculation");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [terms, events, results, isEditMode, existingCalc, router, orgPath]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(orgPath("/laytime-calculator"))}
              className="h-8 px-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20 border border-primary/30">
              <Calculator className="h-6 w-6 text-primary" />
            </div>
            {isEditMode ? "Edit Laytime Calculation" : "New Laytime Calculation"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditMode ? "Update this laytime & demurrage calculation" : "Create a new laytime & demurrage calculation"}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          {saving ? "Saving..." : isEditMode ? "Save Changes" : "Save Calculation"}
        </Button>
      </div>

      {/* Sticky Results Bar */}
      {events.length > 0 && (
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border border-border/50 rounded-xl p-4 shadow-xl">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-6 flex-1">
              {/* Progress Bar */}
              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Laytime Used</span>
                  <span>{formatDuration(results.countedHours)} / {formatDuration(allowedLaytimeHours)}</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500 ease-out",
                      results.progressPercent < 70 && "bg-gradient-to-r from-emerald-500 to-emerald-400",
                      results.progressPercent >= 70 && results.progressPercent < 100 && "bg-gradient-to-r from-amber-500 to-amber-400",
                      results.progressPercent >= 100 && "bg-gradient-to-r from-red-500 to-red-400"
                    )}
                    style={{ width: `${Math.min(100, results.progressPercent)}%` }}
                  />
                </div>
              </div>
              
              {/* Status */}
              <div className="flex items-center gap-3">
                {results.isDemurrage ? (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 px-3 py-1 text-sm font-semibold">
                    <TrendingDown className="h-3.5 w-3.5 mr-1.5" />
                    DEMURRAGE
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-3 py-1 text-sm font-semibold">
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                    DESPATCH
                  </Badge>
                )}
                <span className={cn(
                  "text-lg font-bold tabular-nums",
                  results.isDemurrage ? "text-red-400" : "text-emerald-400"
                )}>
                  ${(results.isDemurrage ? results.demurrageAmount : results.despatchAmount)
                    .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={copySummary} className="shrink-0">
              {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
              {copied ? "Copied" : "Copy Summary"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={downloadingPdf}
              onClick={async () => {
                setDownloadingPdf(true);
                try {
                  const { generateLaytimePdf } = await import("@/lib/pdf/laytime-pdf");
                  // Try to get org branding
                  let orgName: string | undefined;
                  let orgLogoUrl: string | undefined;
                  try {
                    const res = await fetch("/api/org-theme");
                    const data = await res.json();
                    if (data.success) {
                      orgName = data.data?.orgName;
                      orgLogoUrl = data.data?.orgLogoUrl;
                    }
                  } catch {}
                  await generateLaytimePdf({
                    terms: terms as any,
                    events,
                    results: results as any,
                    allowedLaytimeHours,
                    orgName,
                    orgLogoUrl,
                  });
                  toast.success("PDF downloaded!");
                } catch (err) {
                  console.error(err);
                  toast.error("Failed to generate PDF");
                } finally {
                  setDownloadingPdf(false);
                }
              }}
            >
              {downloadingPdf ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />}
              {downloadingPdf ? "Generating..." : "Download PDF"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Charter Party Terms */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            Charter Party Terms
          </CardTitle>
          <CardDescription>Enter the contractual terms from the charter party agreement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Row 1: Vessel & Voyage */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vesselName">Vessel Name</Label>
              <div className="relative">
                <Ship className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <Input
                  ref={vesselInputRef}
                  id="vesselName"
                  placeholder={fleetVessels.length > 0 ? "Search fleet or type manually…" : "e.g., MV Pacific Star"}
                  value={terms.vesselName}
                  onChange={(e) => {
                    updateTerms("vesselName", e.target.value);
                    setVesselDropdownOpen(true);
                  }}
                  onFocus={() => setVesselDropdownOpen(true)}
                  className="pl-10"
                  autoComplete="off"
                />
                {fleetVessels.length > 0 && (
                  <ChevronDown
                    className={cn(
                      "absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-transform cursor-pointer",
                      vesselDropdownOpen && "rotate-180"
                    )}
                    onClick={() => {
                      setVesselDropdownOpen((prev) => !prev);
                      vesselInputRef.current?.focus();
                    }}
                  />
                )}

                {/* Vessel fleet dropdown */}
                {vesselDropdownOpen && fleetVessels.length > 0 && (() => {
                  const query = terms.vesselName.toLowerCase().trim();
                  const filtered = query
                    ? fleetVessels.filter(
                        (v) =>
                          v.name.toLowerCase().includes(query) ||
                          (v.imoNumber && v.imoNumber.includes(query))
                      )
                    : fleetVessels;

                  return (
                    <div
                      ref={vesselDropdownRef}
                      className="absolute top-full left-0 right-0 mt-1 z-50 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
                    >
                      {filtered.length > 0 ? (
                        filtered.map((vessel) => (
                          <button
                            key={vessel.id}
                            type="button"
                            className={cn(
                              "flex items-center gap-3 w-full px-3 py-2.5 text-left text-sm hover:bg-accent/50 transition-colors",
                              terms.vesselName === vessel.name && "bg-accent/30"
                            )}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              updateTerms("vesselName", vessel.name);
                              setVesselDropdownOpen(false);
                            }}
                          >
                            <Ship className="h-4 w-4 text-primary/60 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{vessel.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {vessel.vesselType.replace(/_/g, " ")}
                                {vessel.imoNumber && ` · IMO ${vessel.imoNumber}`}
                              </p>
                            </div>
                            {terms.vesselName === vessel.name && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center">
                          <p className="text-sm text-muted-foreground">No fleet vessels match</p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            Press Enter or continue typing to use a custom name
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voyageRef">Voyage Reference</Label>
              <Input
                id="voyageRef"
                placeholder="e.g., VOY-2026-045"
                value={terms.voyageRef}
                onChange={(e) => updateTerms("voyageRef", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portName">Port Name</Label>
              <div className="relative">
                <Anchor className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="portName"
                  placeholder="e.g., Rotterdam"
                  value={terms.portName}
                  onChange={(e) => updateTerms("portName", e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Operation & Terms */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Operation Type</Label>
              <Select
                value={terms.operationType}
                onValueChange={(v) => updateTerms("operationType", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loading">Loading</SelectItem>
                  <SelectItem value="discharging">Discharging</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Laytime Terms</Label>
                <button
                  onClick={() => setShowTermsHelp(!showTermsHelp)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showTermsHelp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Select
                value={terms.terms}
                onValueChange={(v) => updateTerms("terms", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SHINC">SHINC</SelectItem>
                  <SelectItem value="SHEX">SHEX</SelectItem>
                  <SelectItem value="SSHEX">SSHEX</SelectItem>
                  <SelectItem value="SHEXUU">SHEXUU</SelectItem>
                </SelectContent>
              </Select>
              {showTermsHelp && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 mt-1">
                  {TERMS_DESCRIPTIONS[terms.terms]}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Laytime Basis</Label>
              <Select
                value={terms.laytimeMode}
                onValueChange={(v) => updateTerms("laytimeMode", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Hours</SelectItem>
                  <SelectItem value="rate">Rate-Based (MT/day)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Allowed Laytime */}
          {terms.laytimeMode === "fixed" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="allowedHours">Allowed Laytime (hours)</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="allowedHours"
                    type="number"
                    value={terms.allowedHours}
                    onChange={(e) => updateTerms("allowedHours", e.target.value)}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">= {formatDuration(allowedLaytimeHours)}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cargoQuantity">Cargo Quantity (MT)</Label>
                <Input
                  id="cargoQuantity"
                  type="number"
                  placeholder="e.g., 50000"
                  value={terms.cargoQuantity}
                  onChange={(e) => updateTerms("cargoQuantity", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loadingRate">{terms.operationType === "loading" ? "Loading" : "Discharging"} Rate (MT/day)</Label>
                <Input
                  id="loadingRate"
                  type="number"
                  placeholder="e.g., 10000"
                  value={terms.loadingRate}
                  onChange={(e) => updateTerms("loadingRate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Calculated Laytime</Label>
                <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 border text-sm font-medium">
                  {formatDuration(allowedLaytimeHours)}
                </div>
              </div>
            </div>
          )}

          {/* Row 4: Rates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="demurrageRate">Demurrage Rate (USD/day)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">$</span>
                <Input
                  id="demurrageRate"
                  type="number"
                  value={terms.demurrageRate}
                  onChange={(e) => updateTerms("demurrageRate", e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="despatchRate">Despatch Rate (USD/day)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">$</span>
                <Input
                  id="despatchRate"
                  type="number"
                  value={terms.despatchRate}
                  onChange={(e) => updateTerms("despatchRate", e.target.value)}
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">Usually half of demurrage rate</p>
            </div>
          </div>

          {/* Row 5: NOR & Commencement */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="norTendered">NOR Tendered</Label>
              <Input
                id="norTendered"
                type="datetime-local"
                value={terms.norTendered}
                onChange={(e) => updateTerms("norTendered", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Notice of Readiness tendered date/time</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="laytimeCommenced">Laytime Commenced</Label>
              <Input
                id="laytimeCommenced"
                type="datetime-local"
                value={terms.laytimeCommenced}
                onChange={(e) => updateTerms("laytimeCommenced", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">May differ from NOR if delay clause applies</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Time Sheet */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" />
                Time Sheet
              </CardTitle>
              <CardDescription className="mt-1">Log events during cargo operations — durations auto-calculate</CardDescription>
            </div>
            <Button onClick={addEvent} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Event
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No events logged yet.</p>
              <p className="text-xs mt-1">Click &quot;Add Event&quot; to start recording cargo operations.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_80px_180px_1fr_70px_32px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>From</span>
                <span>To</span>
                <span>Duration</span>
                <span>Event Type</span>
                <span>Remarks</span>
                <span className="text-center">Counts?</span>
                <span />
              </div>

              {/* Event Rows */}
              {results.eventResults.map((event, idx) => {
                const config = EVENT_CONFIG[event.eventType];
                return (
                  <div
                    key={event.id}
                    className={cn(
                      "grid grid-cols-[1fr_1fr_80px_180px_1fr_70px_32px] gap-2 items-center px-3 py-2 rounded-lg border transition-all duration-200",
                      event.counts ? "bg-emerald-500/5 border-emerald-500/15" : "bg-amber-500/5 border-amber-500/15",
                      results.isDemurrage && event.counts && results.countedHours - event.duration < allowedLaytimeHours && "bg-red-500/5 border-red-500/15"
                    )}
                  >
                    <Input
                      type="datetime-local"
                      value={event.from}
                      onChange={(e) => updateEvent(event.id, "from", e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="datetime-local"
                      value={event.to}
                      onChange={(e) => updateEvent(event.id, "to", e.target.value)}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-center font-medium tabular-nums">
                      {formatDuration(event.duration)}
                    </span>
                    <Select
                      value={event.eventType}
                      onValueChange={(v) => updateEvent(event.id, "eventType", v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EVENT_CONFIG).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-1.5">
                              <span className={cfg.color}>{cfg.icon}</span>
                              {cfg.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Optional remarks..."
                      value={event.remarks}
                      onChange={(e) => updateEvent(event.id, "remarks", e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex justify-center">
                      {event.counts ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5">
                          YES
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5">
                          NO
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeEvent(event.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}

              {/* Add More */}
              <button
                onClick={addEvent}
                className="w-full py-2.5 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Event Row
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Results */}
      {events.length > 0 && (
        <Card className={cn(
          "border",
          results.isDemurrage ? "border-red-500/30" : "border-emerald-500/30"
        )}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="h-5 w-5 text-primary" />
              Calculation Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Main Result */}
            <div className={cn(
              "rounded-xl p-6 text-center border",
              results.isDemurrage 
                ? "bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20" 
                : "bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20"
            )}>
              <div className={cn(
                "text-sm font-medium uppercase tracking-wider mb-2",
                results.isDemurrage ? "text-red-400" : "text-emerald-400"
              )}>
                {results.isDemurrage ? "Demurrage Payable" : "Despatch Earned"}
              </div>
              <div className={cn(
                "text-4xl font-bold tabular-nums",
                results.isDemurrage ? "text-red-400" : "text-emerald-400"
              )}>
                ${(results.isDemurrage ? results.demurrageAmount : results.despatchAmount)
                  .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {results.isDemurrage
                  ? `${formatDuration(results.excessHours)} over allowed laytime × $${parseFloat(terms.demurrageRate).toLocaleString()}/day`
                  : `${formatDuration(Math.abs(results.excessHours))} saved × $${parseFloat(terms.despatchRate).toLocaleString()}/day`}
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg bg-muted/30 border p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Laytime Allowed</div>
                <div className="text-xl font-semibold">{formatDuration(allowedLaytimeHours)}</div>
              </div>
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4">
                <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Time Counted</div>
                <div className="text-xl font-semibold text-emerald-400">{formatDuration(results.countedHours)}</div>
              </div>
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4">
                <div className="text-xs text-amber-400 uppercase tracking-wider mb-1">Time Excluded</div>
                <div className="text-xl font-semibold text-amber-400">{formatDuration(results.excludedHours)}</div>
              </div>
            </div>

            {/* Excluded time breakdown */}
            {Object.keys(results.excludedByType).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 text-muted-foreground">Excluded Time Breakdown</h4>
                <div className="space-y-2">
                  {Object.entries(results.excludedByType).map(([type, hours]) => (
                    <div key={type} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 border border-border/50">
                      <span className="text-sm">{type}</span>
                      <span className="text-sm font-medium text-amber-400 tabular-nums">{formatDuration(hours)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Calculation Details */}
            <div className="rounded-lg bg-muted/20 border p-4 text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Demurrage Rate:</strong> ${parseFloat(terms.demurrageRate).toLocaleString()}/day</p>
              <p><strong className="text-foreground">Despatch Rate:</strong> ${parseFloat(terms.despatchRate).toLocaleString()}/day</p>
              <p><strong className="text-foreground">Terms:</strong> {terms.terms} — {TERMS_DESCRIPTIONS[terms.terms]}</p>
              <p className="text-[10px] mt-2 italic">Note: &quot;Once on demurrage, always on demurrage&quot; — most exceptions cease to apply once laytime is exceeded, except owner&apos;s fault.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
