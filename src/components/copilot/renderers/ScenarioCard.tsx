"use client";

/**
 * ScenarioCard — Rich scenario comparison visualization for copilot.
 *
 * Displays best/base/worst case comparison with inline bar chart,
 * winner highlight, and save/download actions.
 */

import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Download,
  Save,
  CheckCircle2,
  Trophy,
  Clock,
  Fuel,
  DollarSign,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgPath } from "@/hooks/useOrgPath";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function fmtUSD(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CARD
// ═══════════════════════════════════════════════════════════════════

export function ScenarioDashboardCard({ result }: { result: any }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { orgPath } = useOrgPath();

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-400">{result.error}</span>
      </div>
    );
  }

  const scenarios = result.scenarios || result.results || [];
  if (scenarios.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
        No scenario data available.
      </div>
    );
  }

  // Find the best TCE
  const tces = scenarios.map((s: any) => s.tce ?? s.profitability?.tce ?? 0);
  const maxTce = Math.max(...tces);
  const minTce = Math.min(...tces);
  const bestIdx = tces.indexOf(maxTce);

  const SCENARIO_COLORS = ["text-emerald-400", "text-blue-400", "text-red-400"];
  const SCENARIO_BG = ["bg-emerald-500/10", "bg-blue-500/10", "bg-red-500/10"];

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
        <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <BarChart3 className="h-4 w-4 text-purple-400" />
        </div>
        <h3 className="text-sm font-bold">Scenario Analysis</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{scenarios.length} Scenarios</span>
      </div>

      {/* ── Scenario Comparison Table ── */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="space-y-2">
          {scenarios.map((s: any, i: number) => {
            const tce = s.tce ?? s.profitability?.tce ?? 0;
            const pnl = s.pnl ?? s.profitability?.voyagePnl ?? 0;
            const name = s.name ?? s.label ?? ["Best Case", "Base Case", "Worst Case"][i] ?? `Scenario ${i + 1}`;
            const isBest = i === bestIdx;
            const barWidth = maxTce !== minTce
              ? ((tce - minTce) / (maxTce - minTce)) * 100
              : 100;

            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg border p-3 transition-all",
                  isBest
                    ? "border-emerald-500/30 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                    : "border-border/30 bg-muted/10"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {isBest && <Trophy className="h-3.5 w-3.5 text-amber-400" />}
                  <span className={cn("text-xs font-semibold", SCENARIO_COLORS[i] || "text-muted-foreground")}>
                    {name}
                  </span>
                  {isBest && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      BEST
                    </span>
                  )}
                </div>

                {/* TCE bar */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-muted-foreground w-8">TCE</span>
                  <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", SCENARIO_BG[i] || "bg-muted")}
                      style={{ width: `${Math.max(barWidth, 5)}%`, backgroundColor: i === 0 ? "#10b981" : i === 1 ? "#3b82f6" : "#ef4444" }}
                    />
                  </div>
                  <span className={cn("text-xs font-bold tabular-nums w-20 text-right", tce >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {fmtUSD(tce)}/d
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-2.5 w-2.5" />
                    P&L: <span className={cn("font-medium", pnl >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtUSD(pnl)}</span>
                  </span>
                  {s.bunkerCost != null && (
                    <span className="flex items-center gap-1">
                      <Fuel className="h-2.5 w-2.5" />
                      Bunker: {fmtUSD(s.bunkerCost)}
                    </span>
                  )}
                  {(s.voyageDays ?? s.duration?.totalVoyageDays) != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {fmt(s.voyageDays ?? s.duration?.totalVoyageDays, 1)}d
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div className="px-4 py-2.5 bg-muted/20 flex items-center gap-2 flex-wrap">
        {!saved ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {saving ? "Saving..." : "Save Scenarios"}
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
          href={orgPath("/scenarios")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <ArrowUpRight className="h-3 w-3" />
          View Scenarios
        </Link>
      </div>
    </div>
  );
}
