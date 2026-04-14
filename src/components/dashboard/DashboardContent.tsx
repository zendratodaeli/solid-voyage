"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Ship,
  Anchor,
  TrendingUp,
  Plus,
  ArrowRight,
  AlertCircle,
  Fuel,
  Clock,
  DollarSign,
  BarChart3,
  LineChart,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ViewLensProvider, useViewLens } from "./ViewLensContext";
import { ViewLensSelector } from "./ViewLensSelector";
import { KpiChartPanel } from "./KpiChartPanel";
import { VoyageSummaryCard } from "./VoyageSummaryCard";
import {
  formatDays,
  formatNumber,
  formatRelativeTime,
  formatRoute,
  getPnlColor,
} from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import { VOYAGE_STATUS_LABELS } from "@/types";
import type { ViewLens } from "@/types";

// Lazy-load AnalyticsDashboard for management/show_all lens (code-split ~60KB)
const AnalyticsDashboard = dynamic(
  () => import("@/components/analytics/AnalyticsDashboard").then((m) => ({ default: m.AnalyticsDashboard })),
  {
    loading: () => (
      <div className="rounded-xl border bg-card p-8 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Loading analytics...</div>
      </div>
    ),
  }
);

import type {
  Voyage,
  Vessel,
  User,
  VoyageCalculation,
  FreightRecommendation,
  VoyageStatus,
  RecommendationAction,
} from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type VoyageWithRelations = Voyage & {
  vessel: Vessel;
  user?: User | null;
  calculations: VoyageCalculation | null;
  recommendations: FreightRecommendation | null;
};

interface DashboardData {
  vesselCount: number;
  voyageCount: number;
  pendingRecommendations: number;
  recentVoyages: VoyageWithRelations[];
}

interface DashboardContentProps {
  data: DashboardData;
  userName: string;
  userId: string;
  orgSlug: string;
  isAdmin?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function DashboardContent({ data, userName, userId, orgSlug, isAdmin = false }: DashboardContentProps) {
  return (
    <ViewLensProvider>
      <DashboardBody data={data} userName={userName} userId={userId} orgSlug={orgSlug} isAdmin={isAdmin} />
    </ViewLensProvider>
  );
}

function DashboardBody({ data, userName, userId, orgSlug, isAdmin }: DashboardContentProps) {
  const { currentLens } = useViewLens();
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const { formatMoney } = useCurrency();

  // Compute aggregate stats from recent voyages for operator/management views
  const aggregates = computeAggregates(data.recentVoyages);

  const handleMetricClick = (metricKey: string | undefined) => {
    if (!metricKey) return;
    setExpandedMetric((prev) => (prev === metricKey ? null : metricKey));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {getLensTitle(currentLens)}
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {userName || "Captain"}. {getLensSubtitle(currentLens)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewLensSelector isAdmin={isAdmin} />
          <Link href={`/${orgSlug}/voyages/new`}>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Voyage
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards — lens-dependent */}
      <div>
        <div className="grid gap-4 md:grid-cols-3">
          {getStatsCards(currentLens, data, aggregates, orgSlug, handleMetricClick, expandedMetric, formatMoney)}
        </div>

        {/* Expandable KPI Chart Panel */}
        {expandedMetric && (
          <div className="mt-4 pt-4 border-t border-border/40">
            <KpiChartPanel
              metric={expandedMetric as "tce" | "voyagePnl" | "totalBunkerCost" | "totalSeaDays"}
              accent=""
              onClose={() => setExpandedMetric(null)}
            />
          </div>
        )}
      </div>

      {/* Recent Voyages */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            {getLensVoyageTitle(currentLens)}
          </h2>
          <Link href={`/${orgSlug}/voyages`}>
            <Button variant="ghost" size="sm" className="gap-1">
              View All
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {data.recentVoyages.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Ship className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No voyages yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first voyage to start calculating profitability and getting freight recommendations.
              </p>
              <Link href={`/${orgSlug}/voyages/new`}>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create First Voyage
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.recentVoyages.map((voyage) => (
              <VoyageSummaryCard
                key={voyage.id}
                voyage={voyage}
                isOwner={voyage.userId === userId}
                orgSlug={orgSlug}
                lens={currentLens}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions — lens-dependent */}
      <div className="grid gap-4 md:grid-cols-3">
        {getQuickActions(currentLens, orgSlug)}
      </div>

      {/* Fleet Performance Analytics — inline for management & show_all */}
      {(currentLens === "management" || currentLens === "show_all") && (
        <div className="pt-2">
          <Suspense fallback={
            <div className="rounded-xl border bg-card p-8 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground text-sm">Loading analytics...</div>
            </div>
          }>
            <AnalyticsDashboard />
          </Suspense>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AGGREGATE COMPUTATIONS
// ═══════════════════════════════════════════════════════════════════

interface Aggregates {
  avgSeaDays: number;
  avgBunkerCost: number;
  avgPnl: number;
  avgTce: number;
  totalExposure: number;
  voyagesWithCalc: number;
}

function computeAggregates(voyages: VoyageWithRelations[]): Aggregates {
  const withCalc = voyages.filter((v) => v.calculations);
  const count = withCalc.length || 1; // avoid division by zero

  const totalSeaDays = withCalc.reduce((s, v) => s + (v.calculations?.totalSeaDays ?? 0), 0);
  const totalBunkerCost = withCalc.reduce((s, v) => s + (v.calculations?.totalBunkerCost ?? 0), 0);
  const totalPnl = withCalc.reduce((s, v) => s + (v.calculations?.voyagePnl ?? 0), 0);
  const totalTce = withCalc.reduce((s, v) => s + (v.calculations?.tce ?? 0), 0);
  const totalExposure = withCalc.reduce((s, v) => s + (v.calculations?.totalVoyageCost ?? 0), 0);

  return {
    avgSeaDays: totalSeaDays / count,
    avgBunkerCost: totalBunkerCost / count,
    avgPnl: totalPnl / count,
    avgTce: totalTce / count,
    totalExposure,
    voyagesWithCalc: withCalc.length,
  };
}

// ═══════════════════════════════════════════════════════════════════
// LENS-SPECIFIC CONTENT HELPERS
// ═══════════════════════════════════════════════════════════════════

function getLensTitle(lens: ViewLens): string {
  switch (lens) {
    case "shipbroker":
      return "Commercial Dashboard";
    case "operator":
      return "Operations Dashboard";
    case "management":
      return "Management Dashboard";
    case "show_all":
      return "Complete Dashboard";
  }
}

function getLensSubtitle(lens: ViewLens): string {
  switch (lens) {
    case "shipbroker":
      return "Here\u2019s your voyage intelligence overview.";
    case "operator":
      return "Here\u2019s your operational performance summary.";
    case "management":
      return "Here\u2019s your portfolio profit & risk snapshot.";
    case "show_all":
      return "Full overview across all perspectives.";
  }
}

function getLensVoyageTitle(lens: ViewLens): string {
  switch (lens) {
    case "shipbroker":
      return "Recent Voyages";
    case "operator":
      return "Operational Review";
    case "management":
      return "Portfolio Performance";
    case "show_all":
      return "All Voyages";
  }
}

// ═══════════════════════════════════════════════════════════════════
// STATS CARDS PER LENS
// ═══════════════════════════════════════════════════════════════════

function getStatsCards(
  lens: ViewLens,
  data: DashboardData,
  aggregates: Aggregates,
  orgSlug: string,
  onMetricClick?: (metricKey: string | undefined) => void,
  expandedMetric?: string | null,
  formatMoney: (value: number, decimals?: number) => string = (v, d = 2) => `$${v.toFixed(d)}`,
) {
  switch (lens) {
    case "shipbroker":
      return (
        <>
          <StatsCard
            title="Active Vessels"
            value={String(data.vesselCount)}
            icon={<Anchor className="h-5 w-5" />}
            href={`/${orgSlug}/vessels`}
            accent="cyan"
          />
          <StatsCard
            title="Total Voyages"
            value={String(data.voyageCount)}
            icon={<Ship className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            accent="blue"
          />
          <StatsCard
            title="Pending Decisions"
            value={String(data.pendingRecommendations)}
            icon={<AlertCircle className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            highlight={data.pendingRecommendations > 0}
            accent="amber"
          />
        </>
      );

    case "operator":
      return (
        <>
          <StatsCard
            title="Active Vessels"
            value={String(data.vesselCount)}
            icon={<Anchor className="h-5 w-5" />}
            href={`/${orgSlug}/vessels`}
            accent="cyan"
          />
          <StatsCard
            title="Avg Sea Days"
            value={aggregates.voyagesWithCalc > 0 ? formatDays(aggregates.avgSeaDays).replace(" days", "") : "\u2014"}
            suffix={aggregates.voyagesWithCalc > 0 ? "days" : undefined}
            icon={<Clock className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            accent="violet"
            metricKey="totalSeaDays"
            onMetricClick={onMetricClick}
            isExpanded={expandedMetric === "totalSeaDays"}
          />
          <StatsCard
            title="Avg Bunker Cost"
            value={aggregates.voyagesWithCalc > 0 ? formatMoney(aggregates.avgBunkerCost, 0) : "\u2014"}
            icon={<Fuel className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            accent="rose"
            metricKey="totalBunkerCost"
            onMetricClick={onMetricClick}
            isExpanded={expandedMetric === "totalBunkerCost"}
          />
        </>
      );

    case "management":
      return (
        <>
          <StatsCard
            title="Total Voyages"
            value={String(data.voyageCount)}
            icon={<Ship className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            accent="blue"
          />
          <StatsCard
            title="Avg Voyage P&L"
            value={aggregates.voyagesWithCalc > 0 ? formatMoney(aggregates.avgPnl, 0) : "\u2014"}
            icon={<DollarSign className="h-5 w-5" />}
            highlight={aggregates.avgPnl < 0}
            href={`/${orgSlug}/voyages`}
            valueColor={aggregates.avgPnl >= 0 ? "text-green-400" : "text-red-400"}
            accent="emerald"
            metricKey="voyagePnl"
            onMetricClick={onMetricClick}
            isExpanded={expandedMetric === "voyagePnl"}
          />
          <StatsCard
            title="Avg TCE"
            value={aggregates.voyagesWithCalc > 0 ? formatMoney(aggregates.avgTce, 0) : "\u2014"}
            suffix={aggregates.voyagesWithCalc > 0 ? "/day" : undefined}
            icon={<BarChart3 className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            valueColor={aggregates.avgTce >= 0 ? "text-green-400" : "text-red-400"}
            accent="violet"
            metricKey="tce"
            onMetricClick={onMetricClick}
            isExpanded={expandedMetric === "tce"}
          />
        </>
      );

    case "show_all":
      return (
        <>
          <StatsCard
            title="Active Vessels"
            value={String(data.vesselCount)}
            icon={<Anchor className="h-5 w-5" />}
            href={`/${orgSlug}/vessels`}
            accent="cyan"
          />
          <StatsCard
            title="Total Voyages"
            value={String(data.voyageCount)}
            icon={<Ship className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            accent="blue"
          />
          <StatsCard
            title="Pending Decisions"
            value={String(data.pendingRecommendations)}
            icon={<AlertCircle className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            highlight={data.pendingRecommendations > 0}
            accent="amber"
          />
          <StatsCard
            title="Avg Sea Days"
            value={aggregates.voyagesWithCalc > 0 ? formatDays(aggregates.avgSeaDays).replace(" days", "") : "\u2014"}
            suffix={aggregates.voyagesWithCalc > 0 ? "days" : undefined}
            icon={<Clock className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            accent="violet"
            metricKey="totalSeaDays"
            onMetricClick={onMetricClick}
            isExpanded={expandedMetric === "totalSeaDays"}
          />
          <StatsCard
            title="Avg Voyage P&L"
            value={aggregates.voyagesWithCalc > 0 ? formatMoney(aggregates.avgPnl, 0) : "\u2014"}
            icon={<DollarSign className="h-5 w-5" />}
            highlight={aggregates.avgPnl < 0}
            href={`/${orgSlug}/voyages`}
            valueColor={aggregates.avgPnl >= 0 ? "text-green-400" : "text-red-400"}
            accent="emerald"
            metricKey="voyagePnl"
            onMetricClick={onMetricClick}
            isExpanded={expandedMetric === "voyagePnl"}
          />
          <StatsCard
            title="Avg TCE"
            value={aggregates.voyagesWithCalc > 0 ? formatMoney(aggregates.avgTce, 0) : "\u2014"}
            suffix={aggregates.voyagesWithCalc > 0 ? "/day" : undefined}
            icon={<BarChart3 className="h-5 w-5" />}
            href={`/${orgSlug}/voyages`}
            valueColor={aggregates.avgTce >= 0 ? "text-green-400" : "text-red-400"}
            accent="rose"
            metricKey="tce"
            onMetricClick={onMetricClick}
            isExpanded={expandedMetric === "tce"}
          />
        </>
      );
  }
}

// ═══════════════════════════════════════════════════════════════════
// QUICK ACTIONS PER LENS
// ═══════════════════════════════════════════════════════════════════

function getQuickActions(lens: ViewLens, orgSlug: string) {
  switch (lens) {
    case "shipbroker":
      return (
        <>
          <QuickActionCard
            title="Get Freight Recommendation"
            description="Calculate break-even and get market-aligned freight suggestions"
            icon={<TrendingUp className="h-6 w-6 text-blue-400" />}
            iconBg="bg-blue-500/20"
            gradient="from-blue-500/10 to-cyan-500/5"
            borderColor="border-blue-500/20"
            href={`/${orgSlug}/voyages/new`}
            buttonLabel="Start"
          />
          <QuickActionCard
            title="Add New Vessel"
            description="Register vessel specifications for accurate calculations"
            icon={<Anchor className="h-6 w-6 text-emerald-400" />}
            iconBg="bg-emerald-500/20"
            gradient="from-emerald-500/10 to-teal-500/5"
            borderColor="border-emerald-500/20"
            href={`/${orgSlug}/vessels/new`}
            buttonLabel="Add"
          />
          <QuickActionCard
            title="Fleet Operations"
            description="View vessel timeline, assign cargo, and manage fleet schedule"
            icon={<BarChart3 className="h-6 w-6 text-violet-400" />}
            iconBg="bg-violet-500/20"
            gradient="from-violet-500/10 to-purple-500/5"
            borderColor="border-violet-500/20"
            href={`/${orgSlug}/fleet-operations`}
            buttonLabel="View"
          />
        </>
      );

    case "operator":
      return (
        <>
          <QuickActionCard
            title="Review Voyage Operations"
            description="Analyze speed, consumption, and bunker efficiency across voyages"
            icon={<Navigation className="h-6 w-6 text-orange-400" />}
            iconBg="bg-orange-500/20"
            gradient="from-orange-500/10 to-amber-500/5"
            borderColor="border-orange-500/20"
            href={`/${orgSlug}/voyages`}
            buttonLabel="Review"
          />
          <QuickActionCard
            title="Fleet Vessel Status"
            description="Check vessel specifications and operational readiness"
            icon={<Anchor className="h-6 w-6 text-cyan-400" />}
            iconBg="bg-cyan-500/20"
            gradient="from-cyan-500/10 to-sky-500/5"
            borderColor="border-cyan-500/20"
            href={`/${orgSlug}/vessels`}
            buttonLabel="View"
          />
          <QuickActionCard
            title="Fleet Operations"
            description="View vessel timeline, assign cargo, and manage fleet schedule"
            icon={<BarChart3 className="h-6 w-6 text-violet-400" />}
            iconBg="bg-violet-500/20"
            gradient="from-violet-500/10 to-purple-500/5"
            borderColor="border-violet-500/20"
            href={`/${orgSlug}/fleet-operations`}
            buttonLabel="View"
          />
        </>
      );

    case "management":
      return (
        <>
          <QuickActionCard
            title="Portfolio P&L Overview"
            description="Review profitability trends and total exposure across all voyages"
            icon={<LineChart className="h-6 w-6 text-purple-400" />}
            iconBg="bg-purple-500/20"
            gradient="from-purple-500/10 to-violet-500/5"
            borderColor="border-purple-500/20"
            href={`/${orgSlug}/voyages`}
            buttonLabel="Analyze"
          />
          <QuickActionCard
            title="Create New Voyage"
            description="Start a new voyage estimate with scenario comparison"
            icon={<Ship className="h-6 w-6 text-emerald-400" />}
            iconBg="bg-emerald-500/20"
            gradient="from-emerald-500/10 to-teal-500/5"
            borderColor="border-emerald-500/20"
            href={`/${orgSlug}/voyages/new`}
            buttonLabel="Create"
          />
          <QuickActionCard
            title="Fleet Schedule"
            description="View vessel timeline, assign cargo, and manage open positions"
            icon={<BarChart3 className="h-6 w-6 text-violet-400" />}
            iconBg="bg-violet-500/20"
            gradient="from-violet-500/10 to-purple-500/5"
            borderColor="border-violet-500/20"
            href={`/${orgSlug}/fleet-operations`}
            buttonLabel="View"
          />
        </>
      );

    case "show_all":
      return (
        <>
          <QuickActionCard
            title="Get Freight Recommendation"
            description="Calculate break-even and get market-aligned freight suggestions"
            icon={<TrendingUp className="h-6 w-6 text-blue-400" />}
            iconBg="bg-blue-500/20"
            gradient="from-blue-500/10 to-cyan-500/5"
            borderColor="border-blue-500/20"
            href={`/${orgSlug}/voyages/new`}
            buttonLabel="Start"
          />
          <QuickActionCard
            title="Add New Vessel"
            description="Register vessel specifications for accurate calculations"
            icon={<Anchor className="h-6 w-6 text-emerald-400" />}
            iconBg="bg-emerald-500/20"
            gradient="from-emerald-500/10 to-teal-500/5"
            borderColor="border-emerald-500/20"
            href={`/${orgSlug}/vessels/new`}
            buttonLabel="Add"
          />
          <QuickActionCard
            title="Portfolio P&L Overview"
            description="Review profitability trends and total exposure across all voyages"
            icon={<LineChart className="h-6 w-6 text-purple-400" />}
            iconBg="bg-purple-500/20"
            gradient="from-purple-500/10 to-violet-500/5"
            borderColor="border-purple-500/20"
            href={`/${orgSlug}/voyages`}
            buttonLabel="Analyze"
          />
          <QuickActionCard
            title="Review Voyage Operations"
            description="Analyze speed, consumption, and bunker efficiency across voyages"
            icon={<Navigation className="h-6 w-6 text-orange-400" />}
            iconBg="bg-orange-500/20"
            gradient="from-orange-500/10 to-amber-500/5"
            borderColor="border-orange-500/20"
            href={`/${orgSlug}/voyages`}
            buttonLabel="Review"
          />
          <QuickActionCard
            title="Fleet Vessel Status"
            description="Check vessel specifications and operational readiness"
            icon={<Anchor className="h-6 w-6 text-cyan-400" />}
            iconBg="bg-cyan-500/20"
            gradient="from-cyan-500/10 to-sky-500/5"
            borderColor="border-cyan-500/20"
            href={`/${orgSlug}/vessels`}
            buttonLabel="View"
          />
          <QuickActionCard
            title="Fleet Vessel Status"
            description="Check specifications and operational readiness of your fleet"
            icon={<BarChart3 className="h-6 w-6 text-violet-400" />}
            iconBg="bg-violet-500/20"
            gradient="from-violet-500/10 to-purple-500/5"
            borderColor="border-violet-500/20"
            href={`/${orgSlug}/vessels`}
            buttonLabel="View"
          />
        </>
      );
  }
}

// ═══════════════════════════════════════════════════════════════════
// REUSABLE CARD SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function StatsCard({
  title,
  value,
  suffix,
  icon,
  href,
  highlight = false,
  valueColor,
  accent = "primary",
  metricKey,
  onMetricClick,
  isExpanded = false,
}: {
  title: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
  href: string;
  highlight?: boolean;
  valueColor?: string;
  accent?: "primary" | "blue" | "emerald" | "amber" | "violet" | "rose" | "cyan";
  metricKey?: string;
  onMetricClick?: (metricKey: string | undefined) => void;
  isExpanded?: boolean;
}) {
  const accentStyles: Record<string, { iconBg: string; iconText: string; border: string; glow: string; bar: string }> = {
    primary: {
      iconBg: "bg-primary/15",
      iconText: "text-primary",
      border: "hover:border-primary/40",
      glow: "hover:shadow-primary/5",
      bar: "from-primary/60 to-primary/0",
    },
    blue: {
      iconBg: "bg-blue-500/15",
      iconText: "text-blue-400",
      border: "hover:border-blue-500/40",
      glow: "hover:shadow-blue-500/5",
      bar: "from-blue-500/60 to-blue-500/0",
    },
    emerald: {
      iconBg: "bg-emerald-500/15",
      iconText: "text-emerald-400",
      border: "hover:border-emerald-500/40",
      glow: "hover:shadow-emerald-500/5",
      bar: "from-emerald-500/60 to-emerald-500/0",
    },
    amber: {
      iconBg: "bg-amber-500/15",
      iconText: "text-amber-400",
      border: "hover:border-amber-500/40",
      glow: "hover:shadow-amber-500/5",
      bar: "from-amber-500/60 to-amber-500/0",
    },
    violet: {
      iconBg: "bg-violet-500/15",
      iconText: "text-violet-400",
      border: "hover:border-violet-500/40",
      glow: "hover:shadow-violet-500/5",
      bar: "from-violet-500/60 to-violet-500/0",
    },
    rose: {
      iconBg: "bg-rose-500/15",
      iconText: "text-rose-400",
      border: "hover:border-rose-500/40",
      glow: "hover:shadow-rose-500/5",
      bar: "from-rose-500/60 to-rose-500/0",
    },
    cyan: {
      iconBg: "bg-cyan-500/15",
      iconText: "text-cyan-400",
      border: "hover:border-cyan-500/40",
      glow: "hover:shadow-cyan-500/5",
      bar: "from-cyan-500/60 to-cyan-500/0",
    },
  };

  const s = highlight ? accentStyles.amber : accentStyles[accent];
  const isExpandable = !!metricKey && !!onMetricClick;

  const cardContent = (
    <Card
      className={`
        group relative overflow-hidden transition-all duration-300 
        hover:scale-[1.02] hover:shadow-lg ${s.border} ${s.glow}
        ${highlight ? "border-amber-500/40 bg-amber-500/5" : ""}
        ${isExpanded ? `${s.border.replace("hover:", "")} shadow-lg scale-[1.01]` : ""}
        ${isExpandable ? "cursor-pointer" : ""}
      `}
      onClick={isExpandable ? (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onMetricClick(metricKey);
      } : undefined}
    >
      <CardContent className="relative p-5">
        {/* Top: icon + label */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`p-2 rounded-lg ${s.iconBg} ${s.iconText} transition-transform duration-300 group-hover:scale-110`}>
            {icon}
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex-1">
            {title}
          </p>
          {isExpandable && (
            <BarChart3 className={`h-3.5 w-3.5 transition-colors ${isExpanded ? s.iconText : "text-muted-foreground/40"}`} />
          )}
        </div>

        {/* Value */}
        <p className={`text-2xl font-bold tracking-tight ${valueColor ?? ""}`}>
          {value}
          {suffix && (
            <span className="text-sm font-normal text-muted-foreground ml-1">
              {suffix}
            </span>
          )}
        </p>

        {/* Bottom accent bar */}
        <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${s.bar} ${isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity duration-300`} />
      </CardContent>
    </Card>
  );

  // If expandable, don't wrap in Link (clicking toggles chart instead)
  if (isExpandable) {
    return cardContent;
  }

  return <Link href={href}>{cardContent}</Link>;
}

function QuickActionCard({
  title,
  description,
  icon,
  iconBg,
  gradient,
  borderColor,
  href,
  buttonLabel,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  gradient: string;
  borderColor: string;
  href: string;
  buttonLabel: string;
}) {
  return (
    <Card className={`bg-gradient-to-br ${gradient} ${borderColor}`}>
      <CardContent className="flex flex-col h-full p-6">
        <div className="flex items-start gap-4 flex-1">
          <div className={`p-3 rounded-xl ${iconBg} shrink-0`}>{icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Link href={href}>
            <Button variant="secondary" size="sm">
              {buttonLabel}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function VoyageCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-6">
        <div className="h-4 bg-muted rounded w-3/4 mb-4" />
        <div className="h-3 bg-muted rounded w-1/2 mb-6" />
        <div className="space-y-2">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}
