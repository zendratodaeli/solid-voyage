"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ComparisonMetric {
  label: string;
  estimate: number;
  actual: number;
  unit: string;
  /** Higher actual is worse (e.g., cost, days). Default true. */
  higherIsWorse?: boolean;
}

interface EstimateVsActualCardProps {
  calculation: {
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
  actuals: {
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
  };
}

export function EstimateVsActualCard({ calculation, actuals }: EstimateVsActualCardProps) {
  const metrics: ComparisonMetric[] = [
    { label: "Total Voyage Days", estimate: calculation.totalVoyageDays, actual: actuals.totalVoyageDays, unit: "days", higherIsWorse: true },
    { label: "Ballast Sea Days", estimate: calculation.ballastSeaDays, actual: actuals.ballastSeaDays, unit: "days", higherIsWorse: true },
    { label: "Laden Sea Days", estimate: calculation.ladenSeaDays, actual: actuals.ladenSeaDays, unit: "days", higherIsWorse: true },
    { label: "Port Days", estimate: calculation.totalPortDays, actual: actuals.totalPortDays, unit: "days", higherIsWorse: true },
    { label: "Total Bunker", estimate: calculation.totalBunkerMt, actual: actuals.totalBunkerMt, unit: "MT", higherIsWorse: true },
    { label: "Bunker Cost", estimate: calculation.totalBunkerCost, actual: actuals.totalBunkerCost, unit: "USD", higherIsWorse: true },
    { label: "Voyage Cost", estimate: calculation.totalVoyageCost, actual: actuals.totalVoyageCost, unit: "USD", higherIsWorse: true },
    { label: "Revenue", estimate: calculation.grossRevenue ?? 0, actual: actuals.grossRevenue ?? 0, unit: "USD", higherIsWorse: false },
    { label: "P&L", estimate: calculation.voyagePnl ?? 0, actual: actuals.voyagePnl ?? 0, unit: "USD", higherIsWorse: false },
    { label: "TCE", estimate: calculation.tce, actual: actuals.tce ?? 0, unit: "USD/day", higherIsWorse: false },
  ];

  // Compute overall accuracy score
  const keyMetrics = metrics.filter((m) => ["Total Voyage Days", "Total Bunker", "Voyage Cost", "TCE"].includes(m.label));
  const avgVariance = keyMetrics.reduce((sum, m) => {
    return sum + (m.estimate !== 0 ? Math.abs((m.actual - m.estimate) / m.estimate) * 100 : 0);
  }, 0) / keyMetrics.length;
  const accuracyScore = Math.max(0, 100 - avgVariance);

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-teal-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              Estimate vs Actual
            </CardTitle>
            <CardDescription>
              Compare estimated voyage calculations with actual execution results
            </CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={`text-sm px-3 py-1 ${
              accuracyScore >= 90 ? "bg-green-500/20 text-green-400" :
              accuracyScore >= 75 ? "bg-yellow-500/20 text-yellow-400" :
              "bg-red-500/20 text-red-400"
            }`}
          >
            {accuracyScore.toFixed(0)}% Accuracy
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Header Row */}
        <div className="grid grid-cols-4 gap-4 pb-2 mb-3 border-b text-xs font-semibold text-muted-foreground">
          <div>Metric</div>
          <div className="text-right">Estimate</div>
          <div className="text-right">Actual</div>
          <div className="text-right">Variance</div>
        </div>

        {/* Data Rows */}
        <div className="space-y-1">
          {metrics.map((metric) => (
            <MetricRow key={metric.label} metric={metric} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ metric }: { metric: ComparisonMetric }) {
  const { label, estimate, actual, unit, higherIsWorse = true } = metric;

  const diff = actual - estimate;
  const variancePercent = estimate !== 0 ? ((diff) / estimate) * 100 : 0;

  // Determine if the variance is good or bad
  const isNeutral = Math.abs(variancePercent) < 1;
  const isGood = isNeutral ? false : (higherIsWorse ? diff < 0 : diff > 0);
  const isBad = isNeutral ? false : !isGood;

  const colorClass = isNeutral
    ? "text-muted-foreground"
    : isGood
    ? "text-green-400"
    : "text-red-400";

  const formatValue = (val: number) => {
    if (unit === "USD" || unit === "USD/day") {
      return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    if (unit === "MT") {
      return val.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="grid grid-cols-4 gap-4 py-1.5 text-sm hover:bg-accent/30 rounded px-1 -mx-1 transition-colors">
      <div className="font-medium">{label}</div>
      <div className="text-right text-muted-foreground">
        {formatValue(estimate)}
      </div>
      <div className="text-right font-medium">
        {formatValue(actual)}
      </div>
      <div className={`text-right font-medium flex items-center justify-end gap-1 ${colorClass}`}>
        {isNeutral ? (
          <Minus className="h-3 w-3" />
        ) : isGood ? (
          <TrendingDown className="h-3 w-3" />
        ) : (
          <TrendingUp className="h-3 w-3" />
        )}
        {diff > 0 ? "+" : ""}{variancePercent.toFixed(1)}%
      </div>
    </div>
  );
}
