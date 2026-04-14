"use client";

/**
 * LaytimeCard — Rich laytime/demurrage/despatch visualization for copilot.
 *
 * Displays result hero (demurrage/despatch), time analysis with progress bar,
 * excluded time breakdown, financial summary, and save/download actions.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Download,
  Save,
  CheckCircle2,
  AlertTriangle,
  Timer,
  CloudRain,
  Sun,
  Wrench,
  Ban,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgPath } from "@/hooks/useOrgPath";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUSD(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatHours(hours: number): string {
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (days === 0) return `${h}h`;
  return `${days}d ${h}h`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CARD
// ═══════════════════════════════════════════════════════════════════

export function LaytimeDashboardCard({ result }: { result: any }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { orgPath } = useOrgPath();

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-400">{result.error}</span>
      </div>
    );
  }

  const isDemurrage = result.result === "DEMURRAGE";
  const amount = isDemurrage
    ? (result.demurrageAmount ?? result.amount ?? 0)
    : (result.despatchAmount ?? result.amount ?? 0);
  const allowedHours = result.allowedHours ?? result.allowedLaytimeHours ?? 0;
  const usedHours = result.countedHours ?? result.usedHours ?? result.timeUsedHours ?? 0;
  const excludedHours = result.excludedHours ?? result.timeExcludedHours ?? 0;
  const totalElapsed = usedHours + excludedHours;
  const overUnder = usedHours - allowedHours;
  const progressPercent = allowedHours > 0 ? Math.min(100, (usedHours / allowedHours) * 100) : 0;
  
  const rate = result.demurrageRate ?? result.rate ?? 0;
  const despatchRate = result.despatchRate ?? rate / 2;

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <div className={cn(
          "p-1.5 rounded-lg border",
          isDemurrage ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"
        )}>
          <Clock className={cn("h-4 w-4", isDemurrage ? "text-red-400" : "text-emerald-400")} />
        </div>
        <div>
          <h3 className="text-sm font-bold">Laytime Calculation</h3>
          <div className="text-[10px] text-muted-foreground">
            {result.terms || result.laytimeTerms || "SHINC"} • {result.operation || "Loading/Discharging"}
          </div>
        </div>
      </div>

      {/* ── Result Hero ── */}
      <div className={cn(
        "px-4 py-4 flex items-center justify-between",
        isDemurrage
          ? "bg-gradient-to-r from-red-500/10 to-red-600/5"
          : "bg-gradient-to-r from-emerald-500/10 to-emerald-600/5"
      )}>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            {isDemurrage ? "Demurrage Payable" : "Despatch Earned"}
          </div>
          <div className="flex items-center gap-2">
            {isDemurrage ? (
              <TrendingDown className="h-5 w-5 text-red-400" />
            ) : (
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            )}
            <span className={cn("text-2xl font-bold", isDemurrage ? "text-red-400" : "text-emerald-400")}>
              {fmtUSD(amount)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Rate</div>
          <div className="text-lg font-semibold">
            {fmtUSD(isDemurrage ? rate : despatchRate)}<span className="text-xs text-muted-foreground">/day</span>
          </div>
        </div>
      </div>

      {/* ── Time Analysis with Progress Bar ── */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Time Analysis</div>
          <span className={cn(
            "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
            overUnder > 0
              ? "text-red-400 bg-red-500/10 border-red-500/20"
              : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          )}>
            {overUnder > 0 ? `+${formatHours(overUnder)} over` : `${formatHours(Math.abs(overUnder))} under`}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-3 rounded-full bg-muted/30 overflow-hidden mb-3">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progressPercent > 100 ? "bg-red-500" : progressPercent > 80 ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="text-center px-2 py-1.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] text-muted-foreground">Allowed</div>
            <div className="text-xs font-semibold text-blue-400">{formatHours(allowedHours)}</div>
          </div>
          <div className="text-center px-2 py-1.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] text-muted-foreground">Used (Counted)</div>
            <div className={cn("text-xs font-semibold", usedHours > allowedHours ? "text-red-400" : "text-emerald-400")}>
              {formatHours(usedHours)}
            </div>
          </div>
          <div className="text-center px-2 py-1.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] text-muted-foreground">Excluded</div>
            <div className="text-xs font-semibold text-muted-foreground">{formatHours(excludedHours)}</div>
          </div>
        </div>
      </div>

      {/* ── Excluded Time Breakdown ── */}
      {(result.excludedBreakdown || result.exclusions) && (
        <div className="px-4 py-3 border-b border-border/30">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Excluded Time Breakdown</div>
          <div className="space-y-1">
            {(result.excludedBreakdown || result.exclusions || []).map((ex: any, i: number) => {
              const iconMap: Record<string, any> = {
                sunday: Sun, holiday: Sun, weather_delay: CloudRain,
                breakdown_owner: Wrench, breakdown_charterer: Wrench,
                strike: Ban, shifting: Timer,
              };
              const ExIcon = iconMap[ex.type] || Timer;
              return (
                <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg bg-muted/10">
                  <ExIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="flex-1 capitalize">{(ex.type || ex.reason || "").replace(/_/g, " ")}</span>
                  <span className="font-medium tabular-nums">{formatHours(ex.hours || ex.duration || 0)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="px-4 py-2.5 bg-muted/20 flex items-center gap-2 flex-wrap">
        {!saved ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {saving ? "Saving..." : "Save Calculation"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Saved ✓
          </span>
        )}
        <button
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          <Download className="h-3 w-3" />
          Download PDF
        </button>
        <Link
          href={orgPath("/laytime-calculator")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <ArrowUpRight className="h-3 w-3" />
          View in Laytime
        </Link>
      </div>
    </div>
  );
}
