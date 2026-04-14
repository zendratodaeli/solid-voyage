"use client";

/**
 * PlatformAnalytics — Full analytics dashboard for admin.
 *
 * Features:
 * - Area chart for cumulative growth (users, subscribers, orgs, voyages, visitors)
 * - Bar chart for daily new activity
 * - Recent visitors table with geo/device data
 * - Top pages & countries breakdowns
 * - Time range selector (1D → All)
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  BarChart3,
  Activity,
  Users,
  Building2,
  Mail,
  Ship,
  Eye,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Loader2,
  FileText,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface SeriesPoint {
  date: string;
  newUsers: number;
  newOrgs: number;
  newSubscribers: number;
  newVoyages: number;
  newVisitors: number;
  totalUsers: number;
  totalOrgs: number;
  totalSubscribers: number;
  totalVoyages: number;
  totalVisitors: number;
}

interface RecentVisitor {
  id: string;
  path: string;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
  org: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  createdAt: string;
}

interface AnalyticsData {
  series: SeriesPoint[];
  totals: {
    users: number;
    orgs: number;
    subscribers: number;
    voyages: number;
    visitors: number;
    newUsersInRange: number;
    newOrgsInRange: number;
    newSubscribersInRange: number;
    newVoyagesInRange: number;
    newVisitorsInRange: number;
  };
  range: string;
  days: number;
  recentVisitors: RecentVisitor[];
  topPages: Array<{ path: string; count: number }>;
  topCountries: Array<{ code: string; name: string; count: number }>;
  deviceBreakdown: Array<{ device: string; count: number }>;
}

// ─── Constants ──────────────────────────────────────────────

const TIME_RANGES = [
  { key: "1d", label: "24h" },
  { key: "7d", label: "7D" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "all", label: "All" },
] as const;

const SERIES_CONFIG = {
  visitors: { color: "#06b6d4", label: "Visitors", icon: Eye, gradient: ["#06b6d4", "#0891b2"] },
  users: { color: "#3b82f6", label: "Users", icon: Users, gradient: ["#3b82f6", "#1d4ed8"] },
  subscribers: { color: "#10b981", label: "Subscribers", icon: Mail, gradient: ["#10b981", "#059669"] },
  orgs: { color: "#8b5cf6", label: "Organizations", icon: Building2, gradient: ["#8b5cf6", "#6d28d9"] },
  voyages: { color: "#f59e0b", label: "Voyages", icon: Ship, gradient: ["#f59e0b", "#d97706"] },
};

type ViewMode = "growth" | "activity";

// ─── Flag Emoji Helper ──────────────────────────────────────
function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "🌍";
  const offset = 127397;
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => c.charCodeAt(0) + offset));
}

// ─── Device Icon Helper ─────────────────────────────────────
function DeviceIcon({ device, className }: { device: string | null; className?: string }) {
  if (device === "mobile") return <Smartphone className={className} />;
  if (device === "tablet") return <Tablet className={className} />;
  return <Monitor className={className} />;
}

// ─── Component ──────────────────────────────────────────────

export function PlatformAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("7d");
  const [viewMode, setViewMode] = useState<ViewMode>("growth");
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    new Set(["visitors", "users", "subscribers"])
  );

  const fetchAnalytics = useCallback(async (r: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/platform/analytics?range=${r}`);
      if (res.ok) setData(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(range);
  }, [range, fetchAnalytics]);

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formattedSeries = useMemo(() => {
    if (!data) return [];
    return data.series.map((p) => ({
      ...p,
      label: formatBucketLabel(p.date, range),
    }));
  }, [data, range]);

  return (
    <div className="space-y-4">
      {/* ── Main Chart ──────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0 px-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Activity className="h-3.5 w-3.5 text-white" />
              </div>
              Platform Analytics
            </CardTitle>

            <div className="flex items-center gap-2">
              {/* View Mode */}
              <div className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5">
                <button
                  onClick={() => setViewMode("growth")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                    viewMode === "growth"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <TrendingUp className="h-3 w-3" /> Growth
                </button>
                <button
                  onClick={() => setViewMode("activity")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                    viewMode === "activity"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <BarChart3 className="h-3 w-3" /> Activity
                </button>
              </div>

              {/* Time Range */}
              <div className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5">
                {TIME_RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                      range === r.key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Metric Toggles */}
          {data && (
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(SERIES_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const isActive = activeMetrics.has(key);
                const total = data.totals[key as keyof typeof data.totals] as number;
                const capKey = key.charAt(0).toUpperCase() + key.slice(1);
                const newInRange = data.totals[`new${capKey}InRange` as keyof typeof data.totals] as number;

                return (
                  <button
                    key={key}
                    onClick={() => toggleMetric(key)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs",
                      isActive
                        ? "border-border/50 bg-muted/20"
                        : "border-transparent bg-transparent opacity-40 hover:opacity-60"
                    )}
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: isActive ? cfg.color : "#666" }}
                    />
                    <Icon className="h-3 w-3" style={{ color: isActive ? cfg.color : "#666" }} />
                    <span className="font-medium">{cfg.label}</span>
                    <span className="text-muted-foreground">{total}</span>
                    {newInRange > 0 && (
                      <span className="text-green-400 text-[10px]">+{newInRange}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardHeader>

        <CardContent className="px-2 pb-2 pt-4">
          {loading ? (
            <div className="h-[300px] flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
          ) : !data || formattedSeries.length === 0 ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground gap-2">
              <BarChart3 className="h-8 w-8 opacity-30" />
              <p className="text-sm">No data for this period</p>
            </div>
          ) : viewMode === "growth" ? (
            <GrowthChart data={formattedSeries} activeMetrics={activeMetrics} />
          ) : (
            <ActivityChart data={formattedSeries} activeMetrics={activeMetrics} />
          )}
        </CardContent>
      </Card>

      {/* ── Visitor Insights Row ────────────────────────────── */}
      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Recent Visitors */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-cyan-500" />
                Recent Visitors
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {data.recentVisitors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Eye className="h-6 w-6 opacity-30" />
                  <p className="text-xs">No visitors recorded yet</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {data.recentVisitors.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors"
                    >
                      {/* Flag + Location */}
                      <div className="text-base leading-none shrink-0">
                        {countryFlag(v.countryCode)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium truncate">
                            {v.city && v.country
                              ? `${v.city}, ${v.country}`
                              : v.country || "Unknown Location"}
                          </p>
                          {v.org && (
                            <span className="text-[9px] text-muted-foreground truncate max-w-[140px]">
                              · {v.org}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <FileText className="h-2.5 w-2.5" />
                            {v.path}
                          </span>
                          {v.browser && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <DeviceIcon device={v.device} className="h-2.5 w-2.5" />
                              {v.browser} · {v.os}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Time */}
                      <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTimeAgo(v.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Top Pages + Countries + Devices */}
          <div className="space-y-4">
            {/* Top Pages */}
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-pink-500" />
                  Top Pages
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {data.topPages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No data</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.topPages.slice(0, 5).map((page, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium truncate">{page.path}</span>
                          </div>
                          <div
                            className="h-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 mt-1"
                            style={{
                              width: `${Math.max(8, (page.count / (data.topPages[0]?.count || 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-muted-foreground shrink-0">
                          {page.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Countries */}
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-violet-500" />
                  Top Countries
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {data.topCountries.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No data</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.topCountries.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-sm shrink-0">{countryFlag(c.code)}</span>
                        <span className="text-xs font-medium flex-1 truncate">{c.name}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground">{c.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Device Breakdown */}
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Monitor className="h-3.5 w-3.5 text-blue-500" />
                  Devices
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {data.deviceBreakdown.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No data</p>
                ) : (
                  <div className="flex items-center gap-3">
                    {data.deviceBreakdown.map((d, i) => {
                      const total = data.deviceBreakdown.reduce((s, x) => s + x.count, 0);
                      const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                      return (
                        <div key={i} className="flex-1 text-center">
                          <DeviceIcon
                            device={d.device}
                            className="h-5 w-5 mx-auto text-muted-foreground mb-1"
                          />
                          <p className="text-sm font-bold">{pct}%</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{d.device}</p>
                          <p className="text-[9px] text-muted-foreground">{d.count} visits</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Growth Chart ───────────────────────────────────────────

function GrowthChart({
  data,
  activeMetrics,
}: {
  data: (SeriesPoint & { label: string })[];
  activeMetrics: Set<string>;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <defs>
          {Object.entries(SERIES_CONFIG).map(([key, cfg]) => (
            <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.gradient[0]} stopOpacity={0.3} />
              <stop offset="100%" stopColor={cfg.gradient[1]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.3 }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        {activeMetrics.has("visitors") && (
          <Area type="monotone" dataKey="totalVisitors" name="Visitors" stroke={SERIES_CONFIG.visitors.color} fill={`url(#gradient-visitors)`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        )}
        {activeMetrics.has("users") && (
          <Area type="monotone" dataKey="totalUsers" name="Users" stroke={SERIES_CONFIG.users.color} fill={`url(#gradient-users)`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        )}
        {activeMetrics.has("subscribers") && (
          <Area type="monotone" dataKey="totalSubscribers" name="Subscribers" stroke={SERIES_CONFIG.subscribers.color} fill={`url(#gradient-subscribers)`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        )}
        {activeMetrics.has("orgs") && (
          <Area type="monotone" dataKey="totalOrgs" name="Organizations" stroke={SERIES_CONFIG.orgs.color} fill={`url(#gradient-orgs)`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        )}
        {activeMetrics.has("voyages") && (
          <Area type="monotone" dataKey="totalVoyages" name="Voyages" stroke={SERIES_CONFIG.voyages.color} fill={`url(#gradient-voyages)`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Activity Chart ─────────────────────────────────────────

function ActivityChart({
  data,
  activeMetrics,
}: {
  data: (SeriesPoint & { label: string })[];
  activeMetrics: Set<string>;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.3 }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={40}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        {activeMetrics.has("visitors") && (
          <Bar dataKey="newVisitors" name="New Visitors" fill={SERIES_CONFIG.visitors.color} radius={[3, 3, 0, 0]} maxBarSize={24} />
        )}
        {activeMetrics.has("users") && (
          <Bar dataKey="newUsers" name="New Users" fill={SERIES_CONFIG.users.color} radius={[3, 3, 0, 0]} maxBarSize={24} />
        )}
        {activeMetrics.has("subscribers") && (
          <Bar dataKey="newSubscribers" name="New Subscribers" fill={SERIES_CONFIG.subscribers.color} radius={[3, 3, 0, 0]} maxBarSize={24} />
        )}
        {activeMetrics.has("orgs") && (
          <Bar dataKey="newOrgs" name="New Orgs" fill={SERIES_CONFIG.orgs.color} radius={[3, 3, 0, 0]} maxBarSize={24} />
        )}
        {activeMetrics.has("voyages") && (
          <Bar dataKey="newVoyages" name="New Voyages" fill={SERIES_CONFIG.voyages.color} radius={[3, 3, 0, 0]} maxBarSize={24} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Custom Tooltip ─────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold">{entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function formatBucketLabel(date: string, range: string): string {
  if (date.includes(":")) return date.split(" ")[1] || date;
  const d = new Date(date + "T00:00:00");
  if (range === "1y" || range === "all") return d.toLocaleDateString("en-US", { month: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
