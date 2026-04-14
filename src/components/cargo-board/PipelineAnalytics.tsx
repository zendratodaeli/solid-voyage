"use client";

/**
 * PipelineAnalytics — Visual pipeline funnel + KPI insights
 * Shows deal flow, conversion rates, and pipeline health
 */

import { useMemo } from "react";
import {
  TrendingUp,
  BarChart3,
  Target,
  ArrowRight,
  Clock,
  Zap,
} from "lucide-react";
import type { CargoInquiryItem, InquiryStats } from "@/actions/cargo-inquiry-actions";

interface PipelineAnalyticsProps {
  inquiries: CargoInquiryItem[];
  stats: InquiryStats | null;
}

const PIPELINE_ORDER = ["NEW", "OFFERED", "FIXED"];
const PIPELINE_LABELS: Record<string, string> = {
  NEW: "New-Evaluating",
  OFFERED: "Offered-Negotiating",
  FIXED: "Fixed",
};
const PIPELINE_COLORS: Record<string, string> = {
  NEW: "bg-blue-500",
  OFFERED: "bg-purple-500",
  FIXED: "bg-emerald-500",
};

// Map legacy statuses to their merged parent group
const STATUS_GROUP: Record<string, string> = {
  NEW: "NEW",
  EVALUATING: "NEW",
  OFFERED: "OFFERED",
  NEGOTIATING: "OFFERED",
  FIXED: "FIXED",
};

export function PipelineAnalytics({ inquiries, stats }: PipelineAnalyticsProps) {
  const analytics = useMemo(() => {
    const byGroup: Record<string, CargoInquiryItem[]> = {};
    const byCargoType: Record<string, { count: number; revenue: number }> = {};
    const byRegion: Record<string, { count: number; revenue: number }> = {};

    for (const inq of inquiries) {
      // Group inquiries by merged status
      const group = STATUS_GROUP[inq.status] || inq.status;
      if (!byGroup[group]) byGroup[group] = [];
      byGroup[group].push(inq);

      // By cargo type
      if (!byCargoType[inq.cargoType]) byCargoType[inq.cargoType] = { count: 0, revenue: 0 };
      byCargoType[inq.cargoType].count++;
      byCargoType[inq.cargoType].revenue += inq.estimatedRevenue || 0;

      // By load region
      const region = inq.loadRegion || "Unknown";
      if (!byRegion[region]) byRegion[region] = { count: 0, revenue: 0 };
      byRegion[region].count++;
      byRegion[region].revenue += inq.estimatedRevenue || 0;
    }

    // Funnel data (merged stages)
    const funnel = PIPELINE_ORDER.map(status => ({
      status,
      label: PIPELINE_LABELS[status],
      count: (byGroup[status] || []).length,
      revenue: (byGroup[status] || []).reduce((s, i) => s + (i.estimatedRevenue || 0), 0),
    }));

    const maxFunnelCount = Math.max(...funnel.map(f => f.count), 1);

    // Urgency breakdown
    const urgencyBreakdown = {
      URGENT: inquiries.filter(i => i.urgency === "URGENT").length,
      ACTIVE: inquiries.filter(i => i.urgency === "ACTIVE").length,
      PLANNING: inquiries.filter(i => i.urgency === "PLANNING").length,
      OVERDUE: inquiries.filter(i => i.urgency === "OVERDUE").length,
    };

    // Top cargo types
    const topCargo = Object.entries(byCargoType)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    // Top regions
    const topRegions = Object.entries(byRegion)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    // Conversion metrics
    const activeCount = inquiries.filter(i => ["NEW", "EVALUATING", "OFFERED", "NEGOTIATING"].includes(i.status)).length;
    const closedCount = inquiries.filter(i => ["FIXED", "LOST", "EXPIRED", "WITHDRAWN"].includes(i.status)).length;
    const wonCount = inquiries.filter(i => i.status === "FIXED").length;
    const lostCount = inquiries.filter(i => i.status === "LOST").length;

    return {
      funnel,
      maxFunnelCount,
      urgencyBreakdown,
      topCargo,
      topRegions,
      activeCount,
      closedCount,
      wonCount,
      lostCount,
    };
  }, [inquiries]);

  if (inquiries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center justify-center text-center gap-3">
        <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
        <div className="text-muted-foreground">No analytics data</div>
        <div className="text-xs text-muted-foreground">Create inquiries to see pipeline analytics</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ═══ Pipeline Funnel ═══ */}
      <div className="rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-blue-400" />
          Pipeline Funnel
        </div>
        <div className="space-y-3">
          {analytics.funnel.map((stage, idx) => (
            <div key={stage.status} className="flex items-center gap-3">
              <div className="w-20 text-xs text-muted-foreground text-right shrink-0">
                {stage.label}
              </div>
              {idx > 0 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0 -ml-1 -mr-1" />
              )}
              <div className="flex-1 h-7 bg-muted/30 rounded-md overflow-hidden relative">
                <div
                  className={`h-full ${PIPELINE_COLORS[stage.status]} rounded-md transition-all duration-500 flex items-center px-2`}
                  style={{ width: `${Math.max((stage.count / analytics.maxFunnelCount) * 100, stage.count > 0 ? 12 : 0)}%` }}
                >
                  {stage.count > 0 && (
                    <span className="text-xs font-bold text-white whitespace-nowrap">{stage.count}</span>
                  )}
                </div>
              </div>
              <div className="w-24 text-right text-xs text-muted-foreground shrink-0">
                {stage.revenue > 0 ? `$${(stage.revenue / 1000).toFixed(0)}K` : "—"}
              </div>
            </div>
          ))}
        </div>

        {/* Closed summary */}
        <div className="flex items-center gap-4 pt-2 border-t border-border text-xs">
          <span className="text-muted-foreground">Closed:</span>
          <span className="text-emerald-400 font-medium">{analytics.wonCount} Fixed</span>
          <span className="text-red-400">{analytics.lostCount} Lost</span>
          <span className="text-muted-foreground">
            {inquiries.filter(i => i.status === "EXPIRED").length} Expired
          </span>
          <span className="text-muted-foreground">
            {inquiries.filter(i => i.status === "WITHDRAWN").length} Withdrawn
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* ═══ Urgency Breakdown ═══ */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Urgency
          </div>
          <div className="space-y-2">
            {(["URGENT", "ACTIVE", "PLANNING", "OVERDUE"] as const).map(urgency => {
              const count = analytics.urgencyBreakdown[urgency];
              const colors: Record<string, string> = {
                URGENT: "text-red-400 bg-red-500",
                ACTIVE: "text-amber-400 bg-amber-500",
                PLANNING: "text-emerald-400 bg-emerald-500",
                OVERDUE: "text-gray-400 bg-gray-500",
              };
              const labels: Record<string, string> = {
                URGENT: "< 3 days",
                ACTIVE: "3–7 days",
                PLANNING: "> 7 days",
                OVERDUE: "Past laycan",
              };
              return (
                <div key={urgency} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <div className={`h-2 w-2 rounded-full ${colors[urgency].split(" ")[1]}`} />
                    <span className={colors[urgency].split(" ")[0]}>{urgency}</span>
                    <span className="text-muted-foreground/60">{labels[urgency]}</span>
                  </div>
                  <span className="text-xs font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ Conversion Metrics ═══ */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> Conversion
          </div>
          <div className="space-y-3">
            <MetricRow label="Active Pipeline" value={analytics.activeCount.toString()} accent="blue" />
            <MetricRow label="Win Rate" value={stats ? `${stats.winRate.toFixed(1)}%` : "0%"} accent="emerald" />
            <MetricRow label="Pipeline Value" value={stats ? `$${(stats.pipelineValue / 1000).toFixed(0)}K` : "$0"} accent="purple" />
            <MetricRow
              label="Avg Response"
              value={stats ? `${stats.avgResponseHours > 0 ? stats.avgResponseHours.toFixed(0) + "h" : "—"}` : "—"}
              accent="amber"
            />
          </div>
        </div>
      </div>

      {/* ═══ Top Cargo Types ═══ */}
      {analytics.topCargo.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Top Cargo Types
          </div>
          <div className="space-y-2">
            {analytics.topCargo.map(([type, data]) => {
              const maxRevenue = Math.max(...analytics.topCargo.map(([, d]) => d.revenue), 1);
              return (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{type}</span>
                    <span className="text-muted-foreground">
                      {data.count} inquiry{data.count > 1 ? "s" : ""} · ${(data.revenue / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                      style={{ width: `${(data.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  const colors: Record<string, string> = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    purple: "text-purple-400",
    amber: "text-amber-400",
  };
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${colors[accent] || "text-foreground"}`}>{value}</span>
    </div>
  );
}
