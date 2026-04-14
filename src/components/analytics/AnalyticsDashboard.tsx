"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Ship,
  Target,
  Fuel,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
  BarChart,
} from "recharts";

import type {
  FleetAnalyticsResult,
  FleetKpis,
  FleetInsight,
  VesselPerformance,
  MonthlyData,
} from "@/lib/calculations/fleet-analytics";

export function AnalyticsDashboard() {
  const [data, setData] = useState<FleetAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("6");

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fleet-analytics?period=${period}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load");
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  if (error || !data) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{error || "No data available"}</p>
          <Button variant="ghost" className="mt-4 gap-2" onClick={fetchAnalytics}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Fleet Performance</h2>
          <p className="text-muted-foreground text-sm">
            Analytics across {data.kpis.totalVoyages} voyage{data.kpis.totalVoyages !== 1 ? "s" : ""} 
            {data.kpis.completedVoyages > 0 && ` (${data.kpis.completedVoyages} completed with actuals)`}
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
            <SelectItem value="24">Last 2 years</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <KpiCards kpis={data.kpis} />

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TcePnlChart data={data.monthlyTrend} />
        <CostBreakdownChart data={data.monthlyTrend} />
      </div>

      {/* Vessel Comparison + Insights */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <VesselComparisonTable vessels={data.vesselPerformance} />
        </div>
        <InsightsPanel insights={data.insights} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KPI CARDS
// ═══════════════════════════════════════════════════════════════════

function KpiCards({ kpis }: { kpis: FleetKpis }) {
  const cards = [
    {
      icon: DollarSign,
      label: "Avg TCE",
      value: `$${kpis.avgTce.toLocaleString(undefined, { maximumFractionDigits: 0 })}/day`,
      prev: kpis.prevPeriod?.avgTce,
      current: kpis.avgTce,
      higherIsBetter: true,
    },
    {
      icon: TrendingUp,
      label: "Total P&L",
      value: `$${(kpis.totalPnl / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}K`,
      prev: kpis.prevPeriod?.totalPnl,
      current: kpis.totalPnl,
      higherIsBetter: true,
    },
    {
      icon: Ship,
      label: "Fleet Utilization",
      value: `${kpis.fleetUtilization.toFixed(0)}%`,
      prev: kpis.prevPeriod?.fleetUtilization,
      current: kpis.fleetUtilization,
      higherIsBetter: true,
    },
    {
      icon: Fuel,
      label: "Avg Bunker Cost",
      value: `$${kpis.avgBunkerCostPerMt.toLocaleString(undefined, { maximumFractionDigits: 0 })}/MT`,
      prev: kpis.prevPeriod?.avgBunkerCostPerMt,
      current: kpis.avgBunkerCostPerMt,
      higherIsBetter: false,
    },
  ];

  // Add accuracy card if available
  if (kpis.avgEstimateAccuracy !== null) {
    cards.push({
      icon: Target,
      label: "Estimate Accuracy",
      value: `${kpis.avgEstimateAccuracy.toFixed(0)}%`,
      prev: undefined,
      current: kpis.avgEstimateAccuracy,
      higherIsBetter: true,
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {cards.map((card) => {
        const delta = card.prev !== undefined
          ? ((card.current - card.prev) / (card.prev || 1)) * 100
          : null;
        const isPositive = delta !== null && (card.higherIsBetter ? delta > 0 : delta < 0);
        const isNegative = delta !== null && !isPositive && Math.abs(delta) > 1;

        return (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <card.icon className="h-4 w-4" />
                {card.label}
              </div>
              <div className="text-2xl font-bold">{card.value}</div>
              {delta !== null && (
                <div className={`flex items-center gap-1 text-xs mt-1 ${
                  isPositive ? "text-green-400" : isNegative ? "text-red-400" : "text-muted-foreground"
                }`}>
                  {Math.abs(delta) < 1 ? (
                    <Minus className="h-3 w-3" />
                  ) : isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs prev period
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TCE & P&L TREND CHART
// ═══════════════════════════════════════════════════════════════════

function TcePnlChart({ data }: { data: MonthlyData[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">TCE & P&L Trend</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          No voyage data yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">TCE & P&L Trend</CardTitle>
        <CardDescription>Monthly average TCE and total P&L</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="pnl"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
            />
            <YAxis
              yAxisId="tce"
              orientation="right"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => {
                if (name === "totalPnl") return [`$${value.toLocaleString()}`, "Total P&L"];
                if (name === "avgTce") return [`$${value.toLocaleString()}/day`, "Avg TCE"];
                return [value, name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px" }}
              formatter={(value) => (value === "totalPnl" ? "P&L" : "Avg TCE")}
            />
            <Bar
              yAxisId="pnl"
              dataKey="totalPnl"
              fill="hsl(142 71% 45% / 0.6)"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="tce"
              dataKey="avgTce"
              stroke="hsl(250 95% 70%)"
              strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COST BREAKDOWN CHART
// ═══════════════════════════════════════════════════════════════════

function CostBreakdownChart({ data }: { data: MonthlyData[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          No voyage data yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost Breakdown</CardTitle>
        <CardDescription>Monthly bunker vs other voyage costs</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => {
                const label = name === "totalBunkerCost" ? "Bunker" : "Other Costs";
                return [`$${value.toLocaleString()}`, label];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px" }}
              formatter={(value) => (value === "totalBunkerCost" ? "Bunker" : "Other")}
            />
            <Bar
              dataKey="totalBunkerCost"
              stackId="cost"
              fill="hsl(0 84% 60% / 0.7)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="totalOtherCost"
              stackId="cost"
              fill="hsl(43 96% 56% / 0.5)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VESSEL COMPARISON TABLE
// ═══════════════════════════════════════════════════════════════════

function VesselComparisonTable({ vessels }: { vessels: VesselPerformance[] }) {
  if (vessels.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vessel Performance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          No vessel data yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vessel Performance Ranking</CardTitle>
        <CardDescription>Sorted by average TCE (highest first)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 font-medium">#</th>
                <th className="text-left py-2 font-medium">Vessel</th>
                <th className="text-right py-2 font-medium">Voyages</th>
                <th className="text-right py-2 font-medium">Avg TCE</th>
                <th className="text-right py-2 font-medium">Total P&L</th>
                <th className="text-right py-2 font-medium">Utilization</th>
                <th className="text-right py-2 font-medium">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {vessels.map((v, i) => (
                <tr key={v.vesselId} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="py-2.5 font-medium">{v.vesselName}</td>
                  <td className="py-2.5 text-right">{v.voyageCount}</td>
                  <td className="py-2.5 text-right font-medium">
                    ${v.avgTce.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className={`py-2.5 text-right font-medium ${v.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ${(v.totalPnl / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}K
                  </td>
                  <td className="py-2.5 text-right">
                    <Badge variant="secondary" className="text-[10px]">
                      {v.utilizationPercent.toFixed(0)}%
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    {v.avgVariancePercent !== null ? (
                      <span className={`text-xs ${
                        Math.abs(v.avgVariancePercent) < 5 ? "text-green-400" :
                        Math.abs(v.avgVariancePercent) < 15 ? "text-yellow-400" :
                        "text-red-400"
                      }`}>
                        {v.avgVariancePercent > 0 ? "+" : ""}{v.avgVariancePercent.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INSIGHTS PANEL
// ═══════════════════════════════════════════════════════════════════

function InsightsPanel({ insights }: { insights: FleetInsight[] }) {
  const iconMap = {
    positive: <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />,
    info: <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />,
  };

  const bgMap = {
    positive: "bg-green-500/5 border-green-500/20",
    warning: "bg-amber-500/5 border-amber-500/20",
    info: "bg-blue-500/5 border-blue-500/20",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Insights</CardTitle>
        <CardDescription>Auto-generated from your fleet data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={`flex gap-3 p-3 rounded-lg border ${bgMap[insight.type]}`}
          >
            {iconMap[insight.type]}
            <div>
              <p className="text-sm font-medium">{insight.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SKELETON LOADING
// ═══════════════════════════════════════════════════════════════════

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Period Selector + Title Row */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-8 w-32 mb-1" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[280px] w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vessel Table + Insights */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3 w-60" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex gap-4 pb-2 border-b">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="h-3 flex-1" />
                  ))}
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-4 py-2">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <Skeleton key={j} className="h-4 flex-1" />
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg border">
                <Skeleton className="h-4 w-4 rounded shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

