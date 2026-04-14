"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, X } from "lucide-react";

type MetricKey = "tce" | "voyagePnl" | "totalBunkerCost" | "totalSeaDays";
type Period = "7D" | "1M" | "3M" | "6M" | "1Y";

interface TimeBucket {
  label: string;
  value: number;
  count: number;
}

interface Summary {
  avg: number;
  min: number;
  max: number;
  total: number;
  dataPoints: number;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "7D", label: "7D" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
];

const METRIC_CONFIG: Record<MetricKey, {
  label: string;
  format: (v: number) => string;
  color: string;
  colorClass: string;
  bgClass: string;
  unit: string;
}> = {
  tce: {
    label: "Time Charter Equivalent",
    format: (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    color: "hsl(270 80% 65%)",
    colorClass: "bg-violet-500",
    bgClass: "bg-violet-500/20",
    unit: "/day",
  },
  voyagePnl: {
    label: "Voyage P&L",
    format: (v) => `$${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`,
    color: "hsl(142 71% 45%)",
    colorClass: "bg-emerald-500",
    bgClass: "bg-emerald-500/20",
    unit: "",
  },
  totalBunkerCost: {
    label: "Bunker Cost",
    format: (v) => `$${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`,
    color: "hsl(350 80% 60%)",
    colorClass: "bg-rose-500",
    bgClass: "bg-rose-500/20",
    unit: "",
  },
  totalSeaDays: {
    label: "Sea Days",
    format: (v) => `${v.toFixed(1)}`,
    color: "hsl(250 95% 70%)",
    colorClass: "bg-violet-500",
    bgClass: "bg-violet-500/20",
    unit: " days",
  },
};

interface KpiChartPanelProps {
  metric: MetricKey;
  accent: string;
  onClose: () => void;
}

export function KpiChartPanel({ metric, onClose }: KpiChartPanelProps) {
  const [data, setData] = useState<TimeBucket[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("6M");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const config = METRIC_CONFIG[metric];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kpi-timeseries?metric=${metric}&period=${period}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setSummary(json.summary);
      }
    } catch (err) {
      console.error("Failed to fetch KPI data:", err);
    } finally {
      setLoading(false);
    }
  }, [metric, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Determine trend from data points
  const trend = data.length >= 2
    ? (() => {
        const nonEmpty = data.filter((d) => d.count > 0);
        if (nonEmpty.length < 2) return 0;
        const first = nonEmpty[0].value;
        const last = nonEmpty[nonEmpty.length - 1].value;
        return first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
      })()
    : 0;

  const maxValue = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <Card className="border-t-0 rounded-t-none animate-in slide-in-from-top-2 duration-300">
      <CardContent className="pt-4 pb-5 px-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">{config.label}</h3>
            {!loading && summary && summary.dataPoints > 0 && (
              <div className={`flex items-center gap-1 text-xs ${
                Math.abs(trend) < 1 ? "text-muted-foreground" :
                (metric === "totalBunkerCost" ? trend < 0 : trend > 0) ? "text-green-400" :
                "text-red-400"
              }`}>
                {Math.abs(trend) < 1 ? (
                  <Minus className="h-3 w-3" />
                ) : trend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex rounded-lg border bg-muted/30 p-0.5">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                    period === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="flex gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="h-[180px] w-full rounded-md" />
          </div>
        ) : summary && summary.dataPoints > 0 ? (
          <>
            {/* Summary row */}
            <div className="flex gap-8 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Average</p>
                <p className="text-sm font-bold">
                  {config.format(summary.avg)}
                  <span className="text-xs font-normal text-muted-foreground">{config.unit}</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">High</p>
                <p className="text-sm font-medium text-green-400">{config.format(summary.max)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Low</p>
                <p className="text-sm font-medium text-red-400">{config.format(summary.min)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Data Points</p>
                <p className="text-sm font-medium">{summary.dataPoints}</p>
              </div>
            </div>

            {/* CSS Bar Chart */}
            <div className="relative">
              {/* Tooltip */}
              {hoveredIndex !== null && data[hoveredIndex] && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card border rounded-md px-3 py-1.5 text-xs shadow-lg z-10 whitespace-nowrap">
                  <span className="text-muted-foreground">{data[hoveredIndex].label}: </span>
                  <span className="font-semibold">{config.format(data[hoveredIndex].value)}{config.unit}</span>
                  <span className="text-muted-foreground ml-1">({data[hoveredIndex].count} voyage{data[hoveredIndex].count !== 1 ? "s" : ""})</span>
                </div>
              )}

              {/* Average line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/30 z-[1]"
                style={{
                  bottom: `${(summary.avg / maxValue) * 100}%`,
                }}
              >
                <span className="absolute -top-3 right-0 text-[9px] text-muted-foreground bg-card px-1">
                  avg {config.format(summary.avg)}
                </span>
              </div>

              {/* Bars */}
              <div className="flex items-end gap-[2px] h-[160px]">
                {data.map((bucket, i) => {
                  const height = bucket.count > 0
                    ? Math.max((Math.abs(bucket.value) / maxValue) * 100, 4)
                    : 2;
                  const isNegative = bucket.value < 0;
                  const isHovered = hoveredIndex === i;

                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col justify-end relative group"
                      style={{ height: "100%" }}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      <div
                        className={`
                          w-full rounded-t-sm transition-all duration-200 relative
                          ${bucket.count === 0
                            ? "bg-muted/30"
                            : isNegative
                              ? isHovered ? "bg-red-400" : "bg-red-500/60"
                              : isHovered ? config.colorClass : `${config.bgClass}`
                          }
                        `}
                        style={{
                          height: `${height}%`,
                          opacity: bucket.count === 0 ? 0.3 : (isHovered ? 1 : 0.7),
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* X-axis labels (show fewer for readability) */}
              <div className="flex mt-1.5">
                {data.map((bucket, i) => {
                  // Show every Nth label to avoid crowding
                  const showLabel = data.length <= 14
                    || i === 0
                    || i === data.length - 1
                    || i % Math.ceil(data.length / 7) === 0;

                  return (
                    <div key={i} className="flex-1 text-center">
                      {showLabel && (
                        <span className="text-[9px] text-muted-foreground/70">{bucket.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            No voyage data available for this period. Create voyages with calculations to see analytics.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
