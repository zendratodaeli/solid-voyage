"use client";

/**
 * Super Admin — Maritime Intelligence Manager
 *
 * Manages the MaritimeIntelligence singleton — the static data
 * that powers canal toll estimation, war risk premiums, hull value
 * benchmarks, commodity values, port congestion, and currency rates.
 *
 * Tabbed interface mirroring the 6 data categories.
 */

import { useState, useEffect, useCallback } from "react";
import { useSuperAdminGuard } from "@/hooks/useSuperAdminGuard";
import {
  Save,
  RefreshCw,
  Compass,
  Info,
  Anchor,
  Shield,
  Ship,
  Package,
  Clock,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface MaritimeIntelligence {
  id: string;
  // Canal Tariffs
  suezTier1Rate: number;
  suezTier2Rate: number;
  suezTier3Rate: number;
  suezTier4Rate: number;
  suezTier5Rate: number;
  suezBallastDiscount: number;
  suezTankerSurcharge: number;
  panamaTier1Rate: number;
  panamaTier2Rate: number;
  panamaTier3Rate: number;
  panamaContainerPanamax: number;
  panamaContainerNeopanamax: number;
  kielRatePer1000GT: number;
  // War Risk
  gulfAdenRiskScore: number;
  gulfAdenRiskLevel: string;
  gulfAdenIncidents12m: number;
  gulfAdenWarRiskRate: number;
  gulfAdenArmedGuards: string;
  westAfricaRiskScore: number;
  westAfricaRiskLevel: string;
  westAfricaIncidents12m: number;
  westAfricaWarRiskRate: number;
  westAfricaArmedGuards: string;
  malaccaRiskScore: number;
  malaccaRiskLevel: string;
  malaccaIncidents12m: number;
  malaccaWarRiskRate: number;
  malaccaArmedGuards: string;
  // Hull Values
  hullValueCapesize: number;
  hullValuePanamax: number;
  hullValueSupramax: number;
  hullValueHandysize: number;
  hullValueVLCC: number;
  hullValueSuezmax: number;
  hullValueAframax: number;
  hullValueMRTanker: number;
  hullValueLNGCarrier: number;
  hullValueContainerFeeder: number;
  hullValueContainerPanamax: number;
  hullValueGeneralCargo: number;
  hullValueAgeDepreciation: number;
  hullValueMinAgeFactor: number;
  // Commodity Values
  commodityIronOre: number;
  commodityCoalThermal: number;
  commodityCoalCoking: number;
  commodityGrainWheat: number;
  commodityGrainCorn: number;
  commoditySoybeans: number;
  commodityCrudeOil: number;
  commodityCleanProducts: number;
  commodityLNG: number;
  commodityLPG: number;
  commoditySteel: number;
  commodityFertilizer: number;
  commodityCement: number;
  commodityContainerAvg: number;
  commodityDefault: number;
  // Port Congestion
  congestionChinaQingdao: number;
  congestionChinaTianjin: number;
  congestionChinaQinhuangdao: number;
  congestionAustNewcastle: number;
  congestionAustPortHedland: number;
  congestionBrazilSantos: number;
  congestionBrazilTubarao: number;
  congestionIndiaMundra: number;
  congestionIndiaKandla: number;
  congestionUSGulfHouston: number;
  congestionRotterdam: number;
  congestionSingapore: number;
  // Currency
  eurUsdRate: number;
  gbpUsdRate: number;
  nokUsdRate: number;
  // Audit
  lastUpdatedAt: string;
  updatedBy: string | null;
}

type TabId = "canals" | "security" | "hull" | "commodity" | "congestion" | "currency";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { id: "canals", label: "Canal Tariffs", icon: Anchor, color: "text-blue-500" },
  { id: "security", label: "Security & Risk", icon: Shield, color: "text-red-500" },
  { id: "hull", label: "Hull Values", icon: Ship, color: "text-emerald-500" },
  { id: "commodity", label: "Commodity Values", icon: Package, color: "text-amber-500" },
  { id: "congestion", label: "Port Congestion", icon: Clock, color: "text-purple-500" },
  { id: "currency", label: "Currency Rates", icon: DollarSign, color: "text-cyan-500" },
];

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Simple number field with label, hint, and optional prefix */
function NumField({
  id,
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  step,
  min,
  max,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{prefix}</span>
        )}
        <Input
          id={id}
          type="number"
          step={step || "0.01"}
          min={min || "0"}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(prefix && "pl-7", suffix && "pr-12")}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Select field for risk level / armed guards enums */
function SelectField({
  id,
  label,
  hint,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════

export default function MaritimeIntelligencePage() {
  const { isSuperAdmin, loading: guardLoading } = useSuperAdminGuard();
  const [data, setData] = useState<MaritimeIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("canals");

  // Form state — all stringified for input handling
  const [form, setForm] = useState<Record<string, string>>({});

  const setField = useCallback((key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // ─── Fetch Data ──────────────────────────────────────────
  useEffect(() => {
    if (isSuperAdmin) {
      setLoading(true);
      setError(null);
      fetch("/api/platform/maritime-intelligence")
        .then(res => {
          if (!res.ok) throw new Error(res.status === 403 ? "Access denied" : "Failed to fetch");
          return res.json();
        })
        .then((d: MaritimeIntelligence) => {
          setData(d);
          // Stringify all numeric fields for form inputs
          const formData: Record<string, string> = {};
          for (const [k, v] of Object.entries(d)) {
            if (typeof v === "number") formData[k] = String(v);
            else if (typeof v === "string" && k !== "id" && k !== "lastUpdatedAt" && k !== "updatedBy") formData[k] = v;
          }
          setForm(formData);
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [isSuperAdmin]);

  // ─── Save Handler ──────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      // Convert string form values back to typed values
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(form)) {
        // Skip non-data fields
        if (["id", "lastUpdatedAt", "updatedBy"].includes(key)) continue;
        // Risk levels and armed guards are strings (enum)
        if (key.includes("RiskLevel") || key.includes("ArmedGuards")) {
          payload[key] = val;
        } else {
          const num = parseFloat(val);
          if (!isNaN(num)) payload[key] = num;
        }
      }

      const res = await fetch("/api/platform/maritime-intelligence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }

      const updated = await res.json();
      setData(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ─── Loading State ──────────────────────────────────────────
  if (guardLoading || !isSuperAdmin || loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Compass className="h-8 w-8 text-primary" />
          Maritime Intelligence
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage static benchmark data used by the route planner AI for canal toll estimation,
          war risk premiums, hull value assessments, and cargo-at-risk analysis.
        </p>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
        <Info className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium mb-1">How this works</p>
          <p className="text-blue-400/80">
            This data is used globally by the route calculation engine to auto-estimate canal tolls,
            war risk insurance premiums, and cargo value at risk. Update these values periodically
            using published industry sources (SCA circulars, IMB reports, Clarksons valuations).
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
          ✓ Maritime intelligence data updated successfully
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? tab.color : "")} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB: CANAL TARIFFS */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === "canals" && (
          <>
            {/* Suez Canal */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  🇪🇬 Suez Canal (SCA Tariff)
                </CardTitle>
                <CardDescription>
                  Tiered rates per Suez Canal Net Tonnage (SCNT). Source: SCA Toll Circular 2024/2025.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumField id="suezTier1" label="Tier 1: 0–5,000 SCNT" value={form.suezTier1Rate ?? ""} onChange={v => setField("suezTier1Rate", v)} prefix="$" suffix="/ SCNT" />
                  <NumField id="suezTier2" label="Tier 2: 5,001–10,000" value={form.suezTier2Rate ?? ""} onChange={v => setField("suezTier2Rate", v)} prefix="$" suffix="/ SCNT" />
                  <NumField id="suezTier3" label="Tier 3: 10,001–20,000" value={form.suezTier3Rate ?? ""} onChange={v => setField("suezTier3Rate", v)} prefix="$" suffix="/ SCNT" />
                  <NumField id="suezTier4" label="Tier 4: 20,001–30,000" value={form.suezTier4Rate ?? ""} onChange={v => setField("suezTier4Rate", v)} prefix="$" suffix="/ SCNT" />
                  <NumField id="suezTier5" label="Tier 5: 30,000+" value={form.suezTier5Rate ?? ""} onChange={v => setField("suezTier5Rate", v)} prefix="$" suffix="/ SCNT" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 mt-4 pt-4 border-t border-border/30">
                  <NumField id="suezBallast" label="Ballast Discount" value={form.suezBallastDiscount ?? ""} onChange={v => setField("suezBallastDiscount", v)} suffix="%" hint="Discount for unladen (ballast) passage" />
                  <NumField id="suezTanker" label="Tanker Surcharge" value={form.suezTankerSurcharge ?? ""} onChange={v => setField("suezTankerSurcharge", v)} suffix="%" hint="Additional surcharge for tanker vessels" />
                </div>
              </CardContent>
            </Card>

            {/* Panama Canal */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  🇵🇦 Panama Canal (ACP Tariff)
                </CardTitle>
                <CardDescription>
                  Tiered rates per PC/UMS Net Tonnage for bulk/tanker. Per-TEU for containers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <NumField id="panamaTier1" label="Tier 1: 0–10,000 NT" value={form.panamaTier1Rate ?? ""} onChange={v => setField("panamaTier1Rate", v)} prefix="$" suffix="/ NT" />
                  <NumField id="panamaTier2" label="Tier 2: 10,001–20,000" value={form.panamaTier2Rate ?? ""} onChange={v => setField("panamaTier2Rate", v)} prefix="$" suffix="/ NT" />
                  <NumField id="panamaTier3" label="Tier 3: 20,000+" value={form.panamaTier3Rate ?? ""} onChange={v => setField("panamaTier3Rate", v)} prefix="$" suffix="/ NT" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 mt-4 pt-4 border-t border-border/30">
                  <NumField id="panamaPanamax" label="Container: Panamax Locks" value={form.panamaContainerPanamax ?? ""} onChange={v => setField("panamaContainerPanamax", v)} prefix="$" suffix="/ TEU" hint="Per TEU for containers via Panamax locks" />
                  <NumField id="panamaNeo" label="Container: Neopanamax Locks" value={form.panamaContainerNeopanamax ?? ""} onChange={v => setField("panamaContainerNeopanamax", v)} prefix="$" suffix="/ TEU" hint="Per TEU for containers via new locks" />
                </div>
              </CardContent>
            </Card>

            {/* Kiel Canal */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  🇩🇪 Kiel Canal (WSV Tariff)
                </CardTitle>
                <CardDescription>
                  Rate per 1,000 Gross Tonnage in EUR. Converted to USD using the currency rate below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-sm">
                  <NumField id="kielRate" label="Rate per 1,000 GT" value={form.kielRatePer1000GT ?? ""} onChange={v => setField("kielRatePer1000GT", v)} prefix="€" suffix="/ 1000 GT" />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB: SECURITY & WAR RISK */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === "security" && (
          <>
            {/* Gulf of Aden */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Gulf of Aden HRA</CardTitle>
                <CardDescription>
                  High Risk Area covering the Gulf of Aden, Arabian Sea, and Indian Ocean approaches.
                  Source: IMB Piracy Reporting Centre, Joint War Committee.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumField id="gulfAdenScore" label="Risk Score (1-10)" value={form.gulfAdenRiskScore ?? ""} onChange={v => setField("gulfAdenRiskScore", v)} step="1" min="1" max="10" />
                  <SelectField id="gulfAdenLevel" label="Risk Level" value={form.gulfAdenRiskLevel ?? "HIGH"} onChange={v => setField("gulfAdenRiskLevel", v)} options={[
                    { value: "LOW", label: "🟢 LOW" },
                    { value: "MODERATE", label: "🟡 MODERATE" },
                    { value: "HIGH", label: "🟠 HIGH" },
                    { value: "CRITICAL", label: "🔴 CRITICAL" },
                  ]} />
                  <NumField id="gulfAdenInc" label="Incidents (last 12 months)" value={form.gulfAdenIncidents12m ?? ""} onChange={v => setField("gulfAdenIncidents12m", v)} step="1" hint="From IMB annual report" />
                  <NumField id="gulfAdenRate" label="War Risk Premium Rate" value={form.gulfAdenWarRiskRate ?? ""} onChange={v => setField("gulfAdenWarRiskRate", v)} suffix="% hull" step="0.001" hint="% of hull value per transit" />
                  <SelectField id="gulfAdenGuards" label="Armed Guards" value={form.gulfAdenArmedGuards ?? "RECOMMENDED"} onChange={v => setField("gulfAdenArmedGuards", v)} options={[
                    { value: "NONE", label: "Not Required" },
                    { value: "RECOMMENDED", label: "Recommended" },
                    { value: "MANDATORY", label: "Mandatory" },
                  ]} />
                </div>
              </CardContent>
            </Card>

            {/* West Africa */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">West Africa HRA</CardTitle>
                <CardDescription>
                  Gulf of Guinea region including Nigeria, Cameroon, and Equatorial Guinea approaches.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumField id="westAfricaScore" label="Risk Score (1-10)" value={form.westAfricaRiskScore ?? ""} onChange={v => setField("westAfricaRiskScore", v)} step="1" min="1" max="10" />
                  <SelectField id="westAfricaLevel" label="Risk Level" value={form.westAfricaRiskLevel ?? "HIGH"} onChange={v => setField("westAfricaRiskLevel", v)} options={[
                    { value: "LOW", label: "🟢 LOW" },
                    { value: "MODERATE", label: "🟡 MODERATE" },
                    { value: "HIGH", label: "🟠 HIGH" },
                    { value: "CRITICAL", label: "🔴 CRITICAL" },
                  ]} />
                  <NumField id="westAfricaInc" label="Incidents (last 12 months)" value={form.westAfricaIncidents12m ?? ""} onChange={v => setField("westAfricaIncidents12m", v)} step="1" />
                  <NumField id="westAfricaRate" label="War Risk Premium Rate" value={form.westAfricaWarRiskRate ?? ""} onChange={v => setField("westAfricaWarRiskRate", v)} suffix="% hull" step="0.001" />
                  <SelectField id="westAfricaGuards" label="Armed Guards" value={form.westAfricaArmedGuards ?? "RECOMMENDED"} onChange={v => setField("westAfricaArmedGuards", v)} options={[
                    { value: "NONE", label: "Not Required" },
                    { value: "RECOMMENDED", label: "Recommended" },
                    { value: "MANDATORY", label: "Mandatory" },
                  ]} />
                </div>
              </CardContent>
            </Card>

            {/* Malacca */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Strait of Malacca HRA</CardTitle>
                <CardDescription>
                  Critical chokepoint between Malaysia, Indonesia, and Singapore.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumField id="malaccaScore" label="Risk Score (1-10)" value={form.malaccaRiskScore ?? ""} onChange={v => setField("malaccaRiskScore", v)} step="1" min="1" max="10" />
                  <SelectField id="malaccaLevel" label="Risk Level" value={form.malaccaRiskLevel ?? "MODERATE"} onChange={v => setField("malaccaRiskLevel", v)} options={[
                    { value: "LOW", label: "🟢 LOW" },
                    { value: "MODERATE", label: "🟡 MODERATE" },
                    { value: "HIGH", label: "🟠 HIGH" },
                    { value: "CRITICAL", label: "🔴 CRITICAL" },
                  ]} />
                  <NumField id="malaccaInc" label="Incidents (last 12 months)" value={form.malaccaIncidents12m ?? ""} onChange={v => setField("malaccaIncidents12m", v)} step="1" />
                  <NumField id="malaccaRate" label="War Risk Premium Rate" value={form.malaccaWarRiskRate ?? ""} onChange={v => setField("malaccaWarRiskRate", v)} suffix="% hull" step="0.001" />
                  <SelectField id="malaccaGuards" label="Armed Guards" value={form.malaccaArmedGuards ?? "NONE"} onChange={v => setField("malaccaArmedGuards", v)} options={[
                    { value: "NONE", label: "Not Required" },
                    { value: "RECOMMENDED", label: "Recommended" },
                    { value: "MANDATORY", label: "Mandatory" },
                  ]} />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB: HULL VALUES */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === "hull" && (
          <>
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Ship className="h-5 w-5 text-emerald-500" />
                  Hull Value Benchmarks (5-year-old reference)
                </CardTitle>
                <CardDescription>
                  Estimated hull values by vessel type for war risk premium calculation.
                  Source: Clarksons, VesselsValue. Updated quarterly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumField id="hullCape" label="Capesize" value={form.hullValueCapesize ?? ""} onChange={v => setField("hullValueCapesize", v)} prefix="$" hint="170K+ DWT bulk carrier" />
                  <NumField id="hullPana" label="Panamax" value={form.hullValuePanamax ?? ""} onChange={v => setField("hullValuePanamax", v)} prefix="$" hint="65-85K DWT bulk carrier" />
                  <NumField id="hullSupra" label="Supramax" value={form.hullValueSupramax ?? ""} onChange={v => setField("hullValueSupramax", v)} prefix="$" hint="50-65K DWT bulk carrier" />
                  <NumField id="hullHandy" label="Handysize" value={form.hullValueHandysize ?? ""} onChange={v => setField("hullValueHandysize", v)} prefix="$" hint="20-40K DWT bulk carrier" />
                  <NumField id="hullVLCC" label="VLCC" value={form.hullValueVLCC ?? ""} onChange={v => setField("hullValueVLCC", v)} prefix="$" hint="200K+ DWT crude tanker" />
                  <NumField id="hullSuez" label="Suezmax" value={form.hullValueSuezmax ?? ""} onChange={v => setField("hullValueSuezmax", v)} prefix="$" hint="120-200K DWT tanker" />
                  <NumField id="hullAfra" label="Aframax" value={form.hullValueAframax ?? ""} onChange={v => setField("hullValueAframax", v)} prefix="$" hint="80-120K DWT tanker" />
                  <NumField id="hullMR" label="MR Tanker" value={form.hullValueMRTanker ?? ""} onChange={v => setField("hullValueMRTanker", v)} prefix="$" hint="Medium Range product tanker" />
                  <NumField id="hullLNG" label="LNG Carrier" value={form.hullValueLNGCarrier ?? ""} onChange={v => setField("hullValueLNGCarrier", v)} prefix="$" hint="174K cbm LNG carrier" />
                  <NumField id="hullConFeed" label="Container Feeder" value={form.hullValueContainerFeeder ?? ""} onChange={v => setField("hullValueContainerFeeder", v)} prefix="$" hint="< 3,000 TEU" />
                  <NumField id="hullConPana" label="Container Panamax" value={form.hullValueContainerPanamax ?? ""} onChange={v => setField("hullValueContainerPanamax", v)} prefix="$" hint="3,000-5,100 TEU" />
                  <NumField id="hullGeneral" label="General Cargo / MPP" value={form.hullValueGeneralCargo ?? ""} onChange={v => setField("hullValueGeneralCargo", v)} prefix="$" hint="Multi-purpose / break-bulk" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 mt-4 pt-4 border-t border-border/30">
                  <NumField id="hullDepreciation" label="Age Depreciation Rate" value={form.hullValueAgeDepreciation ?? ""} onChange={v => setField("hullValueAgeDepreciation", v)} suffix="% / year" hint="Hull value decreases by this rate per year of vessel age" />
                  <NumField id="hullMinAge" label="Minimum Age Factor" value={form.hullValueMinAgeFactor ?? ""} onChange={v => setField("hullValueMinAgeFactor", v)} step="0.01" max="1" hint="Floor — vessel never valued below this fraction of benchmark (e.g., 0.50 = 50%)" />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB: COMMODITY VALUES */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === "commodity" && (
          <>
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-amber-500" />
                  Commodity Market Values ($/MT)
                </CardTitle>
                <CardDescription>
                  Approximate cargo values per metric ton for Cargo-at-Risk calculations.
                  Source: Platts, Reuters, CBOT. Updated monthly to quarterly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4 p-2 rounded bg-muted/30">
                  💡 These values represent the <strong>cargo commodity value</strong> (what the goods are worth),
                  NOT the freight rate (what we charge to ship them). Used to calculate insurance exposure and value at risk.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumField id="cmIronOre" label="Iron Ore" value={form.commodityIronOre ?? ""} onChange={v => setField("commodityIronOre", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmCoalThermal" label="Coal (Thermal)" value={form.commodityCoalThermal ?? ""} onChange={v => setField("commodityCoalThermal", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmCoalCoking" label="Coal (Coking)" value={form.commodityCoalCoking ?? ""} onChange={v => setField("commodityCoalCoking", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmWheat" label="Grain (Wheat)" value={form.commodityGrainWheat ?? ""} onChange={v => setField("commodityGrainWheat", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmCorn" label="Grain (Corn)" value={form.commodityGrainCorn ?? ""} onChange={v => setField("commodityGrainCorn", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmSoybeans" label="Soybeans" value={form.commoditySoybeans ?? ""} onChange={v => setField("commoditySoybeans", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmCrude" label="Crude Oil" value={form.commodityCrudeOil ?? ""} onChange={v => setField("commodityCrudeOil", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmClean" label="Clean Pet. Products" value={form.commodityCleanProducts ?? ""} onChange={v => setField("commodityCleanProducts", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmLNG" label="LNG" value={form.commodityLNG ?? ""} onChange={v => setField("commodityLNG", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmLPG" label="LPG" value={form.commodityLPG ?? ""} onChange={v => setField("commodityLPG", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmSteel" label="Steel Products" value={form.commoditySteel ?? ""} onChange={v => setField("commoditySteel", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmFertilizer" label="Fertilizer (Urea)" value={form.commodityFertilizer ?? ""} onChange={v => setField("commodityFertilizer", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmCement" label="Cement" value={form.commodityCement ?? ""} onChange={v => setField("commodityCement", v)} prefix="$" suffix="/ MT" />
                  <NumField id="cmContainer" label="Container Avg" value={form.commodityContainerAvg ?? ""} onChange={v => setField("commodityContainerAvg", v)} prefix="$" suffix="/ TEU" hint="Average value of goods per container" />
                  <NumField id="cmDefault" label="Default / Unknown" value={form.commodityDefault ?? ""} onChange={v => setField("commodityDefault", v)} prefix="$" suffix="/ MT" hint="Fallback when cargo type not matched" />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB: PORT CONGESTION */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === "congestion" && (
          <>
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-500" />
                  Port Congestion Profiles (Average Wait Days)
                </CardTitle>
                <CardDescription>
                  Average waiting time at major ports. Used for voyage duration estimates
                  and AI route comparison. Updated quarterly from broker intelligence.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* China */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">🇨🇳 China</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <NumField id="cgQingdao" label="Qingdao" value={form.congestionChinaQingdao ?? ""} onChange={v => setField("congestionChinaQingdao", v)} suffix="days" step="0.5" />
                      <NumField id="cgTianjin" label="Tianjin" value={form.congestionChinaTianjin ?? ""} onChange={v => setField("congestionChinaTianjin", v)} suffix="days" step="0.5" />
                      <NumField id="cgQinhuangdao" label="Qinhuangdao" value={form.congestionChinaQinhuangdao ?? ""} onChange={v => setField("congestionChinaQinhuangdao", v)} suffix="days" step="0.5" />
                    </div>
                  </div>
                  {/* Australia */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">🇦🇺 Australia</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NumField id="cgNewcastle" label="Newcastle" value={form.congestionAustNewcastle ?? ""} onChange={v => setField("congestionAustNewcastle", v)} suffix="days" step="0.5" />
                      <NumField id="cgPortHedland" label="Port Hedland" value={form.congestionAustPortHedland ?? ""} onChange={v => setField("congestionAustPortHedland", v)} suffix="days" step="0.5" />
                    </div>
                  </div>
                  {/* Brazil */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">🇧🇷 Brazil</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NumField id="cgSantos" label="Santos" value={form.congestionBrazilSantos ?? ""} onChange={v => setField("congestionBrazilSantos", v)} suffix="days" step="0.5" />
                      <NumField id="cgTubarao" label="Tubarão" value={form.congestionBrazilTubarao ?? ""} onChange={v => setField("congestionBrazilTubarao", v)} suffix="days" step="0.5" />
                    </div>
                  </div>
                  {/* India */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">🇮🇳 India</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NumField id="cgMundra" label="Mundra" value={form.congestionIndiaMundra ?? ""} onChange={v => setField("congestionIndiaMundra", v)} suffix="days" step="0.5" />
                      <NumField id="cgKandla" label="Kandla" value={form.congestionIndiaKandla ?? ""} onChange={v => setField("congestionIndiaKandla", v)} suffix="days" step="0.5" />
                    </div>
                  </div>
                  {/* US / Europe / Asia hubs */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">🌍 Major Hubs</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <NumField id="cgHouston" label="🇺🇸 Houston (US Gulf)" value={form.congestionUSGulfHouston ?? ""} onChange={v => setField("congestionUSGulfHouston", v)} suffix="days" step="0.5" />
                      <NumField id="cgRotterdam" label="🇳🇱 Rotterdam" value={form.congestionRotterdam ?? ""} onChange={v => setField("congestionRotterdam", v)} suffix="days" step="0.5" />
                      <NumField id="cgSingapore" label="🇸🇬 Singapore" value={form.congestionSingapore ?? ""} onChange={v => setField("congestionSingapore", v)} suffix="days" step="0.5" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB: CURRENCY RATES */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === "currency" && (
          <>
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-cyan-500" />
                  Currency Exchange Rates
                </CardTitle>
                <CardDescription>
                  Used for converting canal tolls (EUR) and port dues (GBP/NOK) to USD.
                  Updated weekly to monthly. Source: ECB, Federal Reserve.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <NumField id="eurUsd" label="EUR/USD" value={form.eurUsdRate ?? ""} onChange={v => setField("eurUsdRate", v)} step="0.001" hint="1 EUR = X USD" />
                  <NumField id="gbpUsd" label="GBP/USD" value={form.gbpUsdRate ?? ""} onChange={v => setField("gbpUsdRate", v)} step="0.001" hint="1 GBP = X USD" />
                  <NumField id="nokUsd" label="NOK/USD" value={form.nokUsdRate ?? ""} onChange={v => setField("nokUsdRate", v)} step="0.0001" hint="1 NOK = X USD" />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* SUBMIT */}
        {/* ══════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Compass className="h-4 w-4" />
            <span>Changes apply immediately to the route calculation engine.</span>
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Update Intelligence Data
              </>
            )}
          </Button>
        </div>

        {data?.lastUpdatedAt && (
          <p className="text-xs text-muted-foreground text-right">
            Last updated: {new Date(data.lastUpdatedAt).toLocaleString()}
            {data.updatedBy && <> by {data.updatedBy}</>}
          </p>
        )}
      </form>
    </div>
  );
}
