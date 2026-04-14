/**
 * Fleet Analytics Calculation Engine
 * 
 * Aggregates voyage data for fleet-wide performance analytics:
 * - Monthly time-series (TCE, P&L, bunker cost trends)
 * - Vessel comparison (per-vessel performance ranking)
 * - Variance analysis (estimate vs actual accuracy)
 * - Auto-generated insights
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface VoyageDataRow {
  id: string;
  vesselId: string;
  vesselName: string;
  status: string;
  createdAt: Date;
  // From VoyageCalculation (estimates)
  estimate?: {
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
  // From VoyageActual
  actual?: {
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

export interface MonthlyData {
  month: string; // "2026-01"
  label: string; // "Jan 2026"
  voyageCount: number;
  avgTce: number;
  totalPnl: number;
  totalBunkerCost: number;
  totalOpexCost: number;
  totalOtherCost: number;
  avgAccuracy: number | null; // % accuracy for voyages with actuals
}

export interface VesselPerformance {
  vesselId: string;
  vesselName: string;
  voyageCount: number;
  avgTce: number;
  totalPnl: number;
  avgBunkerCost: number;
  utilizationPercent: number; // sea days / total days
  avgVariancePercent: number | null; // estimate accuracy
}

export interface FleetKpis {
  avgTce: number;
  totalPnl: number;
  fleetUtilization: number;
  avgBunkerCostPerMt: number;
  totalVoyages: number;
  completedVoyages: number;
  avgEstimateAccuracy: number | null;
  prevPeriod: {
    avgTce: number;
    totalPnl: number;
    fleetUtilization: number;
    avgBunkerCostPerMt: number;
  } | null;
}

export interface FleetInsight {
  type: "positive" | "warning" | "info";
  title: string;
  description: string;
}

export interface FleetAnalyticsResult {
  kpis: FleetKpis;
  monthlyTrend: MonthlyData[];
  vesselPerformance: VesselPerformance[];
  insights: FleetInsight[];
}

// ═══════════════════════════════════════════════════════════════════
// GROUPING & AGGREGATION
// ═══════════════════════════════════════════════════════════════════

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

export function groupByMonth(voyages: VoyageDataRow[]): MonthlyData[] {
  const groups = new Map<string, VoyageDataRow[]>();

  for (const v of voyages) {
    const key = getMonthKey(v.createdAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  // Sort keys chronologically
  const sortedKeys = Array.from(groups.keys()).sort();

  return sortedKeys.map((key) => {
    const monthVoyages = groups.get(key)!;
    const withEstimates = monthVoyages.filter((v) => v.estimate);
    const withActuals = monthVoyages.filter((v) => v.actual);

    const avgTce = withEstimates.length > 0
      ? withEstimates.reduce((sum, v) => sum + (v.estimate?.tce ?? 0), 0) / withEstimates.length
      : 0;

    const totalPnl = withEstimates.reduce((sum, v) => sum + (v.estimate?.voyagePnl ?? 0), 0);
    const totalBunkerCost = withEstimates.reduce((sum, v) => sum + (v.estimate?.totalBunkerCost ?? 0), 0);
    
    // Rough split: bunker is explicit, the rest we'll label as "other"
    const totalVoyageCost = withEstimates.reduce((sum, v) => sum + (v.estimate?.totalVoyageCost ?? 0), 0);
    const totalOtherCost = totalVoyageCost - totalBunkerCost;

    // Estimate accuracy for voyages with actuals
    let avgAccuracy: number | null = null;
    if (withActuals.length > 0) {
      const accuracies = withActuals.map((v) => {
        const estTce = v.estimate?.tce ?? 0;
        const actTce = v.actual?.tce ?? 0;
        if (estTce === 0) return 100;
        return Math.max(0, 100 - Math.abs(((actTce - estTce) / estTce) * 100));
      });
      avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    }

    return {
      month: key,
      label: getMonthLabel(key),
      voyageCount: monthVoyages.length,
      avgTce,
      totalPnl,
      totalBunkerCost,
      totalOpexCost: 0, // Can be derived if needed
      totalOtherCost: Math.max(0, totalOtherCost),
      avgAccuracy,
    };
  });
}

export function groupByVessel(voyages: VoyageDataRow[]): VesselPerformance[] {
  const groups = new Map<string, VoyageDataRow[]>();

  for (const v of voyages) {
    if (!groups.has(v.vesselId)) groups.set(v.vesselId, []);
    groups.get(v.vesselId)!.push(v);
  }

  return Array.from(groups.entries()).map(([vesselId, vesselVoyages]) => {
    const withEstimates = vesselVoyages.filter((v) => v.estimate);
    const withActuals = vesselVoyages.filter((v) => v.actual && v.estimate);

    const avgTce = withEstimates.length > 0
      ? withEstimates.reduce((s, v) => s + (v.estimate?.tce ?? 0), 0) / withEstimates.length
      : 0;

    const totalPnl = withEstimates.reduce((s, v) => s + (v.estimate?.voyagePnl ?? 0), 0);
    const avgBunkerCost = withEstimates.length > 0
      ? withEstimates.reduce((s, v) => s + (v.estimate?.totalBunkerCost ?? 0), 0) / withEstimates.length
      : 0;

    const totalSeaDays = withEstimates.reduce((s, v) => s + (v.estimate?.totalSeaDays ?? 0), 0);
    const totalVoyageDays = withEstimates.reduce((s, v) => s + (v.estimate?.totalVoyageDays ?? 0), 0);
    const utilizationPercent = totalVoyageDays > 0 ? (totalSeaDays / totalVoyageDays) * 100 : 0;

    let avgVariancePercent: number | null = null;
    if (withActuals.length > 0) {
      const variances = withActuals.map((v) => {
        const estTce = v.estimate?.tce ?? 0;
        const actTce = v.actual?.tce ?? 0;
        return estTce !== 0 ? ((actTce - estTce) / estTce) * 100 : 0;
      });
      avgVariancePercent = variances.reduce((a, b) => a + b, 0) / variances.length;
    }

    return {
      vesselId,
      vesselName: vesselVoyages[0].vesselName,
      voyageCount: vesselVoyages.length,
      avgTce,
      totalPnl,
      avgBunkerCost,
      utilizationPercent,
      avgVariancePercent,
    };
  }).sort((a, b) => b.avgTce - a.avgTce); // Sort by best TCE first
}

// ═══════════════════════════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════════════════════════

export function computeFleetKpis(
  voyages: VoyageDataRow[],
  periodMonths: number = 6
): FleetKpis {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - periodMonths);
  const prevCutoff = new Date(cutoff);
  prevCutoff.setMonth(prevCutoff.getMonth() - periodMonths);

  const currentPeriod = voyages.filter((v) => v.createdAt >= cutoff);
  const prevPeriod = voyages.filter((v) => v.createdAt >= prevCutoff && v.createdAt < cutoff);

  const computeForPeriod = (voys: VoyageDataRow[]) => {
    const withEstimates = voys.filter((v) => v.estimate);
    const avgTce = withEstimates.length > 0
      ? withEstimates.reduce((s, v) => s + (v.estimate?.tce ?? 0), 0) / withEstimates.length
      : 0;
    const totalPnl = withEstimates.reduce((s, v) => s + (v.estimate?.voyagePnl ?? 0), 0);
    const totalSeaDays = withEstimates.reduce((s, v) => s + (v.estimate?.totalSeaDays ?? 0), 0);
    const totalVoyageDays = withEstimates.reduce((s, v) => s + (v.estimate?.totalVoyageDays ?? 0), 0);
    const fleetUtilization = totalVoyageDays > 0 ? (totalSeaDays / totalVoyageDays) * 100 : 0;
    const totalBunkerMt = withEstimates.reduce((s, v) => s + (v.estimate?.totalBunkerMt ?? 0), 0);
    const totalBunkerCost = withEstimates.reduce((s, v) => s + (v.estimate?.totalBunkerCost ?? 0), 0);
    const avgBunkerCostPerMt = totalBunkerMt > 0 ? totalBunkerCost / totalBunkerMt : 0;

    return { avgTce, totalPnl, fleetUtilization, avgBunkerCostPerMt };
  };

  const currentKpis = computeForPeriod(currentPeriod);
  const prevKpis = prevPeriod.length > 0 ? computeForPeriod(prevPeriod) : null;

  // Estimate accuracy
  const withActuals = currentPeriod.filter((v) => v.actual && v.estimate);
  let avgEstimateAccuracy: number | null = null;
  if (withActuals.length > 0) {
    const accuracies = withActuals.map((v) => {
      const estTce = v.estimate?.tce ?? 0;
      const actTce = v.actual?.tce ?? 0;
      if (estTce === 0) return 100;
      return Math.max(0, 100 - Math.abs(((actTce - estTce) / estTce) * 100));
    });
    avgEstimateAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  }

  return {
    ...currentKpis,
    totalVoyages: currentPeriod.length,
    completedVoyages: currentPeriod.filter((v) => v.status === "COMPLETED").length,
    avgEstimateAccuracy,
    prevPeriod: prevKpis,
  };
}

// ═══════════════════════════════════════════════════════════════════
// INSIGHTS
// ═══════════════════════════════════════════════════════════════════

export function generateInsights(
  kpis: FleetKpis,
  vesselPerf: VesselPerformance[],
  monthlyTrend: MonthlyData[]
): FleetInsight[] {
  const insights: FleetInsight[] = [];

  // TCE trend (compare last 2 months)
  if (monthlyTrend.length >= 2) {
    const last = monthlyTrend[monthlyTrend.length - 1];
    const prev = monthlyTrend[monthlyTrend.length - 2];
    const tceDelta = ((last.avgTce - prev.avgTce) / (prev.avgTce || 1)) * 100;
    if (tceDelta > 5) {
      insights.push({
        type: "positive",
        title: "TCE Trending Up",
        description: `Average TCE increased by ${tceDelta.toFixed(1)}% from ${prev.label} to ${last.label}`,
      });
    } else if (tceDelta < -5) {
      insights.push({
        type: "warning",
        title: "TCE Trending Down",
        description: `Average TCE decreased by ${Math.abs(tceDelta).toFixed(1)}% from ${prev.label} to ${last.label}`,
      });
    }
  }

  // Fleet utilization
  if (kpis.fleetUtilization < 60) {
    insights.push({
      type: "warning",
      title: "Low Fleet Utilization",
      description: `Fleet utilization is at ${kpis.fleetUtilization.toFixed(0)}% — vessels spend significant time in port or idle`,
    });
  } else if (kpis.fleetUtilization > 80) {
    insights.push({
      type: "positive",
      title: "Strong Fleet Utilization",
      description: `Fleet utilization at ${kpis.fleetUtilization.toFixed(0)}% — vessels are being efficiently deployed`,
    });
  }

  // Vessel performance outliers
  if (vesselPerf.length >= 2) {
    const best = vesselPerf[0]; // Sorted by TCE desc
    const worst = vesselPerf[vesselPerf.length - 1];
    const spread = best.avgTce - worst.avgTce;
    if (spread > 3000) {
      insights.push({
        type: "info",
        title: "Wide Performance Spread",
        description: `${best.vesselName} (TCE $${best.avgTce.toLocaleString()}) outperforms ${worst.vesselName} (TCE $${worst.avgTce.toLocaleString()}) by $${spread.toLocaleString()}/day`,
      });
    }
  }

  // Estimate accuracy
  if (kpis.avgEstimateAccuracy !== null) {
    if (kpis.avgEstimateAccuracy >= 90) {
      insights.push({
        type: "positive",
        title: "High Estimate Accuracy",
        description: `Voyage estimates are ${kpis.avgEstimateAccuracy.toFixed(0)}% accurate — your planning is reliable`,
      });
    } else if (kpis.avgEstimateAccuracy < 75) {
      insights.push({
        type: "warning",
        title: "Low Estimate Accuracy",
        description: `Estimate accuracy is at ${kpis.avgEstimateAccuracy.toFixed(0)}% — review vessel consumption profiles and port time assumptions`,
      });
    }
  }

  // Period-over-period P&L comparison
  if (kpis.prevPeriod) {
    const pnlDelta = kpis.totalPnl - kpis.prevPeriod.totalPnl;
    if (pnlDelta > 0) {
      insights.push({
        type: "positive",
        title: "P&L Improvement",
        description: `Total P&L improved by $${pnlDelta.toLocaleString()} compared to the previous period`,
      });
    } else if (pnlDelta < -10000) {
      insights.push({
        type: "warning",
        title: "P&L Decline",
        description: `Total P&L declined by $${Math.abs(pnlDelta).toLocaleString()} compared to the previous period`,
      });
    }
  }

  // No insights fallback
  if (insights.length === 0) {
    insights.push({
      type: "info",
      title: "Collecting Data",
      description: "More voyages with execution actuals will unlock richer fleet insights",
    });
  }

  return insights;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

export function computeFleetAnalytics(
  voyages: VoyageDataRow[],
  periodMonths: number = 6
): FleetAnalyticsResult {
  const kpis = computeFleetKpis(voyages, periodMonths);
  const monthlyTrend = groupByMonth(voyages);
  const vesselPerformance = groupByVessel(voyages);
  const insights = generateInsights(kpis, vesselPerformance, monthlyTrend);

  return { kpis, monthlyTrend, vesselPerformance, insights };
}
