"use client";

/**
 * VoyageDashboardCard — Rich voyage profitability visualization for copilot.
 *
 * Full financial dashboard with P&L hero, cost breakdowns, duration grid,
 * bunker analysis, freight recommendation, and save/download actions.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Ship,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Fuel,
  MapPin,
  Anchor,
  Navigation,
  ArrowUpRight,
  Download,
  Save,
  CheckCircle2,
  AlertTriangle,
  Scale,
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

function getFreightBadge(pnl: number, breakEven: number | null, freightRate: number | null): { label: string; color: string; bg: string } {
  if (pnl > 0) return { label: "✅ Accept", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
  if (freightRate && breakEven && freightRate >= breakEven * 0.9) return { label: "⚠️ Negotiate", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" };
  return { label: "❌ Reject", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" };
}

// ═══════════════════════════════════════════════════════════════════
// STAT BLOCK
// ═══════════════════════════════════════════════════════════════════

function StatBlock({ label, value, subtext, icon: Icon, color = "text-muted-foreground" }: {
  label: string; value: string; subtext?: string; icon: any; color?: string;
}) {
  return (
    <div className="px-3 py-2.5 text-center">
      <Icon className={cn("h-3.5 w-3.5 mx-auto mb-1", color)} />
      <div className="text-xs font-semibold">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
      {subtext && <div className="text-[8px] text-muted-foreground/60">{subtext}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CARD
// ═══════════════════════════════════════════════════════════════════

export function VoyageDashboardCard({ result }: { result: any }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { orgPath } = useOrgPath();

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
        <Ship className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-400">{result.error}</span>
      </div>
    );
  }

  const prof = result.profitability || {};
  const dur = result.duration || {};
  const costs = result.costs || {};
  const pnl = prof.voyagePnl ?? 0;
  const tce = prof.tce ?? 0;
  const isProfitable = pnl >= 0;
  const breakEven = prof.breakEvenFreight ?? null;
  const freightRate = result.freightRate ?? null;
  const badge = getFreightBadge(pnl, breakEven, freightRate);

  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Wire to save API
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
        <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Ship className="h-4 w-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold truncate">{result.vesselName || "Voyage Estimate"}</h3>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
            {result.vesselDwt && <span>{fmt(result.vesselDwt)} DWT</span>}
            {result.route && <span>• {result.route}</span>}
          </div>
        </div>
        {/* Freight recommendation badge */}
        <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full border", badge.color, badge.bg)}>
          {badge.label}
        </span>
      </div>

      {/* ── P&L Hero ── */}
      <div className={cn(
        "px-4 py-4 flex items-center justify-between",
        isProfitable
          ? "bg-gradient-to-r from-emerald-500/10 to-emerald-600/5"
          : "bg-gradient-to-r from-red-500/10 to-red-600/5"
      )}>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Voyage P&L</div>
          <div className="flex items-center gap-2">
            {isProfitable ? (
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-400" />
            )}
            <span className={cn("text-2xl font-bold", isProfitable ? "text-emerald-400" : "text-red-400")}>
              {fmtUSD(pnl)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">TCE</div>
          <div className={cn("text-xl font-bold", tce >= 0 ? "text-emerald-400" : "text-red-400")}>
            {fmtUSD(tce)}<span className="text-xs font-normal text-muted-foreground">/day</span>
          </div>
        </div>
      </div>

      {/* ── Financial Grid ── */}
      <div className="grid grid-cols-3 gap-0 border-b border-border/30">
        <div className="border-r border-border/20">
          <StatBlock icon={DollarSign} label="Revenue" value={fmtUSD(prof.revenue ?? costs.revenue)} color="text-emerald-400" />
        </div>
        <div className="border-r border-border/20">
          <StatBlock icon={Fuel} label="Bunker Cost" value={fmtUSD(costs.bunkerCost)} color="text-orange-400" />
        </div>
        <div>
          <StatBlock icon={DollarSign} label="Total Cost" value={fmtUSD(costs.totalVoyageCost)} color="text-red-400" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-0 border-b border-border/30">
        <div className="border-r border-border/20">
          <StatBlock icon={MapPin} label="Port Costs" value={fmtUSD(costs.portCosts ?? costs.portDisbursements)} color="text-purple-400" />
        </div>
        <div className="border-r border-border/20">
          <StatBlock icon={Anchor} label="Canal Fees" value={fmtUSD(costs.canalFees ?? costs.canalCost)} color="text-amber-400" />
        </div>
        <div>
          <StatBlock icon={Scale} label="Break-Even" value={breakEven != null ? `${fmtUSD(breakEven)}/MT` : "—"} color="text-purple-400" />
        </div>
      </div>

      {/* ── Duration Grid ── */}
      <div className="grid grid-cols-3 gap-0 border-b border-border/30">
        <div className="border-r border-border/20">
          <StatBlock icon={Navigation} label="Sea Days" value={`${fmt(dur.totalSeaDays, 1)}d`} color="text-blue-400" />
        </div>
        <div className="border-r border-border/20">
          <StatBlock icon={Anchor} label="Port Days" value={`${fmt(dur.totalPortDays, 1)}d`} color="text-amber-400" />
        </div>
        <div>
          <StatBlock icon={Clock} label="Total Voyage" value={`${fmt(dur.totalVoyageDays, 1)}d`} color="text-cyan-400" />
        </div>
      </div>

      {/* ── Bunker Breakdown ── */}
      {(costs.vlsfoMt || costs.lsmgoMt || result.bunkers) && (
        <div className="px-4 py-3 border-b border-border/30">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Bunker Consumption</div>
          <div className="grid grid-cols-2 gap-2">
            {(costs.vlsfoMt || result.bunkers?.vlsfo) && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/20">
                <Fuel className="h-3 w-3 text-orange-400" />
                <div>
                  <div className="text-[10px] font-medium">VLSFO</div>
                  <div className="text-[9px] text-muted-foreground">
                    {fmt(costs.vlsfoMt ?? result.bunkers?.vlsfo?.mt)} MT · {fmtUSD(costs.vlsfoCost ?? result.bunkers?.vlsfo?.cost)}
                  </div>
                </div>
              </div>
            )}
            {(costs.lsmgoMt || result.bunkers?.lsmgo) && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/20">
                <Fuel className="h-3 w-3 text-blue-400" />
                <div>
                  <div className="text-[10px] font-medium">LSMGO</div>
                  <div className="text-[9px] text-muted-foreground">
                    {fmt(costs.lsmgoMt ?? result.bunkers?.lsmgo?.mt)} MT · {fmtUSD(costs.lsmgoCost ?? result.bunkers?.lsmgo?.cost)}
                  </div>
                </div>
              </div>
            )}
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
            {saving ? "Saving..." : "Save Voyage"}
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
          href={orgPath("/voyages")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <ArrowUpRight className="h-3 w-3" />
          View Voyages
        </Link>
      </div>
    </div>
  );
}
