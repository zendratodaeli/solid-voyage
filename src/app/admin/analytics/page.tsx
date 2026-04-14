"use client";

/**
 * Admin Analytics Page — Full two-tab analytics dashboard.
 *
 * Tab 1: Traffic Intelligence — Visitors, page views, geo, devices, browsers
 * Tab 2: Platform Growth — Users, orgs, subscribers, voyages over time
 * Tab 3: User Behavior — Feature usage, org health, DAU, engagement
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
  Eye,
  Users,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  FileText,
  Clock,
  ExternalLink,
  ArrowUpRight,
  BarChart3,
  Loader2,
  RefreshCw,
  Chrome,
  TrendingUp,
  Building2,
  Mail,
  Ship,
  Activity,
  Zap,
  Heart,
  AlertCircle,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuperAdminGuard } from "@/hooks/useSuperAdminGuard";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface TrafficData {
  summary: { totalViews: number; viewsInRange: number; uniqueVisitors: number; range: string; days: number };
  series: Array<{ date: string; views: number; visitors: number }>;
  topPages: Array<{ path: string; count: number }>;
  topCountries: Array<{ code: string; name: string; count: number }>;
  topCities: Array<{ city: string; countryCode: string; count: number }>;
  topBrowsers: Array<{ name: string; count: number }>;
  topOS: Array<{ name: string; count: number }>;
  devices: Array<{ type: string; count: number }>;
  topReferrers: Array<{ url: string; count: number }>;
  recentVisitors: Array<{
    id: string; path: string; country: string | null; countryCode: string | null;
    city: string | null; region: string | null; org: string | null; device: string | null;
    browser: string | null; os: string | null; referrer: string | null; createdAt: string;
  }>;
}

interface PlatformPoint {
  date: string; newUsers: number; newOrgs: number; newSubscribers: number; newVoyages: number; newVisitors: number;
  totalUsers: number; totalOrgs: number; totalSubscribers: number; totalVoyages: number; totalVisitors: number;
}

interface PlatformData {
  series: PlatformPoint[];
  totals: {
    users: number; orgs: number; subscribers: number; voyages: number; visitors: number;
    newUsersInRange: number; newOrgsInRange: number; newSubscribersInRange: number; newVoyagesInRange: number; newVisitorsInRange: number;
  };
  range: string; days: number;
}

interface BehaviorData {
  summary: {
    totalEvents: number; eventsInRange: number; uniqueActiveUsers: number;
    avgSessionDuration: number; totalSessions: number; avgPagesPerSession: number;
    range: string; days: number;
  };
  featureUsage: Array<{ feature: string; label: string; count: number }>;
  dauSeries: Array<{ date: string; activeUsers: number }>;
  orgHealth: Array<{
    id: string; name: string; slug: string; healthScore: number;
    lastActive: string | null; eventCount: number; uniqueUsers: number;
    featuresUsed: number; daysSinceLastActivity: number | null;
  }>;
  topUsers: Array<{ userId: string; eventCount: number }>;
  recentActions: Array<{
    id: string; userId: string; orgId: string | null; event: string;
    feature: string; action: string | null; path: string | null;
    duration: number | null; createdAt: string;
  }>;
}

type TabKey = "traffic" | "platform" | "behavior";

const TIME_RANGES = [
  { key: "1d", label: "24h" },
  { key: "7d", label: "7 Days" },
  { key: "1m", label: "30 Days" },
  { key: "3m", label: "3 Months" },
  { key: "6m", label: "6 Months" },
  { key: "1y", label: "1 Year" },
  { key: "all", label: "All Time" },
] as const;

const PLATFORM_METRICS = {
  users:       { color: "#3b82f6", label: "Users",         icon: Users,    gradient: ["#3b82f6", "#1d4ed8"] },
  subscribers: { color: "#10b981", label: "Subscribers",    icon: Mail,     gradient: ["#10b981", "#059669"] },
  orgs:        { color: "#8b5cf6", label: "Organizations",  icon: Building2, gradient: ["#8b5cf6", "#6d28d9"] },
  voyages:     { color: "#f59e0b", label: "Voyages",        icon: Ship,     gradient: ["#f59e0b", "#d97706"] },
};

// ─── Page ───────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { isSuperAdmin, loading: guardLoading } = useSuperAdminGuard();
  const [tab, setTab] = useState<TabKey>("traffic");
  const [range, setRange] = useState("7d");

  // Traffic state
  const [traffic, setTraffic] = useState<TrafficData | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);

  // Platform state
  const [platform, setPlatform] = useState<PlatformData | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformView, setPlatformView] = useState<"growth" | "activity">("growth");
  const [activeMetrics, setActiveMetrics] = useState(new Set(["users", "subscribers", "orgs", "voyages"]));

  // Behavior state
  const [behavior, setBehavior] = useState<BehaviorData | null>(null);
  const [behaviorLoading, setBehaviorLoading] = useState(false);

  const fetchTraffic = useCallback(async (r: string) => {
    setTrafficLoading(true);
    try {
      const res = await fetch(`/api/platform/visitors?range=${r}`);
      if (res.ok) setTraffic(await res.json());
    } catch {} finally { setTrafficLoading(false); }
  }, []);

  const fetchPlatform = useCallback(async (r: string) => {
    setPlatformLoading(true);
    try {
      const res = await fetch(`/api/platform/analytics?range=${r}`);
      if (res.ok) setPlatform(await res.json());
    } catch {} finally { setPlatformLoading(false); }
  }, []);

  const fetchBehavior = useCallback(async (r: string) => {
    setBehaviorLoading(true);
    try {
      const res = await fetch(`/api/platform/behavior?range=${r}`);
      if (res.ok) setBehavior(await res.json());
    } catch {} finally { setBehaviorLoading(false); }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (tab === "traffic") fetchTraffic(range);
    else if (tab === "platform") fetchPlatform(range);
    else fetchBehavior(range);
  }, [isSuperAdmin, tab, range, fetchTraffic, fetchPlatform, fetchBehavior]);

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  if (guardLoading || !isSuperAdmin) return <AnalyticsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {tab === "traffic" ? "Visitor insights & traffic intelligence" : tab === "platform" ? "Platform growth & business metrics" : "User engagement & organization health"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => tab === "traffic" ? fetchTraffic(range) : tab === "platform" ? fetchPlatform(range) : fetchBehavior(range)} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Tabs + Time Range */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tab selector */}
        <div className="flex items-center rounded-xl border border-border/50 bg-muted/10 p-1 w-fit">
          <button onClick={() => setTab("traffic")} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all", tab === "traffic" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Eye className="h-3.5 w-3.5" /> Traffic
          </button>
          <button onClick={() => setTab("platform")} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all", tab === "platform" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Activity className="h-3.5 w-3.5" /> Platform
          </button>
          <button onClick={() => setTab("behavior")} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all", tab === "behavior" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Zap className="h-3.5 w-3.5" /> Behavior
          </button>
        </div>

        {/* Time Range */}
        <div className="flex items-center rounded-xl border border-border/50 bg-muted/10 p-1 w-fit">
          {TIME_RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", range === r.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tab === "traffic" ? (
        <TrafficTab data={traffic} loading={trafficLoading} range={range} />
      ) : tab === "platform" ? (
        <PlatformTab data={platform} loading={platformLoading} range={range} view={platformView} setView={setPlatformView} activeMetrics={activeMetrics} toggleMetric={toggleMetric} />
      ) : (
        <BehaviorTab data={behavior} loading={behaviorLoading} range={range} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRAFFIC TAB
// ═══════════════════════════════════════════════════════════════

function TrafficTab({ data, loading, range }: { data: TrafficData | null; loading: boolean; range: string }) {
  const series = useMemo(() => data?.series.map((p) => ({ ...p, label: fmtBucket(p.date, range) })) || [], [data, range]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {data && (
        <div className="grid gap-3 grid-cols-3">
          <KPICard label="Total Views" value={data.summary.viewsInRange} total={data.summary.totalViews} icon={Eye} color="text-cyan-500" bgColor="bg-cyan-500/10" />
          <KPICard label="Unique Visitors" value={data.summary.uniqueVisitors} icon={Users} color="text-blue-500" bgColor="bg-blue-500/10" />
          <KPICard label="Views / Visitor" value={data.summary.uniqueVisitors > 0 ? +(data.summary.viewsInRange / data.summary.uniqueVisitors).toFixed(1) : 0} icon={ArrowUpRight} color="text-green-500" bgColor="bg-green-500/10" />
        </div>
      )}

      {/* Chart */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0 px-4 pt-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-cyan-500" /><span className="text-xs text-muted-foreground">Page Views</span></div>
            <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-blue-500" /><span className="text-xs text-muted-foreground">Unique Visitors</span></div>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-2 pt-4">
          {loading ? <ChartLoader /> : series.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} /><stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} /></linearGradient>
                  <linearGradient id="uGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.3 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={35} allowDecimals={false} />
                <Tooltip content={<TooltipUI />} />
                <Area type="monotone" dataKey="views" name="Page Views" stroke="#06b6d4" fill="url(#vGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#06b6d4" }} />
                <Area type="monotone" dataKey="visitors" name="Unique Visitors" stroke="#3b82f6" fill="url(#uGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#3b82f6" }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Breakdowns */}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard title="Top Pages" icon={<FileText className="h-3.5 w-3.5 text-pink-500" />} items={data.topPages.map((p) => ({ label: p.path, value: p.count }))} barColor="from-pink-500 to-rose-500" total={data.summary.viewsInRange} />
          <BreakdownCard title="Referrers" icon={<ExternalLink className="h-3.5 w-3.5 text-orange-500" />} items={data.topReferrers.map((r) => ({ label: fmtRef(r.url), value: r.count }))} barColor="from-orange-500 to-amber-500" emptyText="All traffic is direct" total={data.summary.viewsInRange} />
          <BreakdownCard title="Countries" icon={<Globe className="h-3.5 w-3.5 text-violet-500" />} items={data.topCountries.map((c) => ({ label: `${flag(c.code)} ${c.name}`, value: c.count }))} barColor="from-violet-500 to-purple-500" total={data.summary.viewsInRange} />
          <BreakdownCard title="Cities" icon={<MapPin className="h-3.5 w-3.5 text-emerald-500" />} items={data.topCities.map((c) => ({ label: `${flag(c.countryCode)} ${c.city}`, value: c.count }))} barColor="from-emerald-500 to-green-500" total={data.summary.viewsInRange} />
          <BreakdownCard title="Browsers" icon={<Chrome className="h-3.5 w-3.5 text-blue-500" />} items={data.topBrowsers.map((b) => ({ label: b.name, value: b.count }))} barColor="from-blue-500 to-indigo-500" total={data.summary.viewsInRange} />
          <BreakdownCard title="Operating Systems" icon={<Monitor className="h-3.5 w-3.5 text-sky-500" />} items={data.topOS.map((o) => ({ label: o.name, value: o.count }))} barColor="from-sky-500 to-cyan-500" total={data.summary.viewsInRange} />
        </div>
      )}

      {/* Device Split + Live Feed */}
      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Smartphone className="h-3.5 w-3.5 text-cyan-500" />Device Split</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              {data.devices.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">No data</p> : (
                <div className="space-y-4">
                  {data.devices.map((d, i) => {
                    const total = data.devices.reduce((s, x) => s + x.count, 0);
                    const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                    return (<div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><DevIcon d={d.type} className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-medium capitalize">{d.type}</span></div>
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{d.count}</span><span className="text-xs font-bold">{pct}%</span></div>
                      </div>
                      <div className="h-2 rounded-full bg-muted/20 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500" style={{ width: `${pct}%` }} /></div>
                    </div>);
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Eye className="h-3.5 w-3.5 text-cyan-500" />Live Feed<span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /></CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              {data.recentVisitors.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2"><Eye className="h-6 w-6 opacity-30" /><p className="text-xs">No visitors yet</p></div> : (
                <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
                  {data.recentVisitors.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors">
                      <div className="text-base leading-none shrink-0">{flag(v.countryCode)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium truncate">{v.city && v.country ? `${v.city}, ${v.country}` : v.country || "Unknown"}</p>
                          {v.org && <span className="text-[9px] text-muted-foreground truncate max-w-[120px]">· {v.org}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-cyan-400/80 font-mono">{v.path}</span>
                          {v.browser && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><DevIcon d={v.device} className="h-2.5 w-2.5" />{v.browser}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(v.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PLATFORM TAB
// ═══════════════════════════════════════════════════════════════

function PlatformTab({ data, loading, range, view, setView, activeMetrics, toggleMetric }: {
  data: PlatformData | null; loading: boolean; range: string;
  view: "growth" | "activity"; setView: (v: "growth" | "activity") => void;
  activeMetrics: Set<string>; toggleMetric: (k: string) => void;
}) {
  const series = useMemo(() => data?.series.map((p) => ({ ...p, label: fmtBucket(p.date, range) })) || [], [data, range]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Object.entries(PLATFORM_METRICS).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const total = data.totals[key as keyof typeof data.totals] as number;
            const capKey = key.charAt(0).toUpperCase() + key.slice(1);
            const newCount = data.totals[`new${capKey}InRange` as keyof typeof data.totals] as number;
            return (
              <Card key={key}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-2xl font-bold tracking-tight">{total}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{cfg.label}</p>
                      {newCount > 0 && <p className="text-[10px] text-green-400 mt-1">+{newCount} in range</p>}
                    </div>
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cfg.color}15` }}>
                      <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0 px-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />Platform Growth
            </CardTitle>
            <div className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5">
              <button onClick={() => setView("growth")} className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all", view === "growth" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><TrendingUp className="h-3 w-3" /> Growth</button>
              <button onClick={() => setView("activity")} className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all", view === "activity" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><BarChart3 className="h-3 w-3" /> Activity</button>
            </div>
          </div>

          {/* Metric Toggles */}
          {data && (
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(PLATFORM_METRICS).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const isActive = activeMetrics.has(key);
                return (
                  <button key={key} onClick={() => toggleMetric(key)} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs", isActive ? "border-border/50 bg-muted/20" : "border-transparent bg-transparent opacity-40 hover:opacity-60")}>
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: isActive ? cfg.color : "#666" }} />
                    <Icon className="h-3 w-3" style={{ color: isActive ? cfg.color : "#666" }} />
                    <span className="font-medium">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </CardHeader>

        <CardContent className="px-2 pb-2 pt-4">
          {loading ? <ChartLoader /> : series.length === 0 ? <ChartEmpty /> : view === "growth" ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  {Object.entries(PLATFORM_METRICS).map(([key, cfg]) => (
                    <linearGradient key={key} id={`pg-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cfg.gradient[0]} stopOpacity={0.3} /><stop offset="100%" stopColor={cfg.gradient[1]} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.3 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<TooltipUI />} />
                {activeMetrics.has("users") && <Area type="monotone" dataKey="totalUsers" name="Users" stroke={PLATFORM_METRICS.users.color} fill="url(#pg-users)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />}
                {activeMetrics.has("subscribers") && <Area type="monotone" dataKey="totalSubscribers" name="Subscribers" stroke={PLATFORM_METRICS.subscribers.color} fill="url(#pg-subscribers)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />}
                {activeMetrics.has("orgs") && <Area type="monotone" dataKey="totalOrgs" name="Organizations" stroke={PLATFORM_METRICS.orgs.color} fill="url(#pg-orgs)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />}
                {activeMetrics.has("voyages") && <Area type="monotone" dataKey="totalVoyages" name="Voyages" stroke={PLATFORM_METRICS.voyages.color} fill="url(#pg-voyages)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.3 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip content={<TooltipUI />} />
                {activeMetrics.has("users") && <Bar dataKey="newUsers" name="New Users" fill={PLATFORM_METRICS.users.color} radius={[3, 3, 0, 0]} maxBarSize={24} />}
                {activeMetrics.has("subscribers") && <Bar dataKey="newSubscribers" name="New Subscribers" fill={PLATFORM_METRICS.subscribers.color} radius={[3, 3, 0, 0]} maxBarSize={24} />}
                {activeMetrics.has("orgs") && <Bar dataKey="newOrgs" name="New Orgs" fill={PLATFORM_METRICS.orgs.color} radius={[3, 3, 0, 0]} maxBarSize={24} />}
                {activeMetrics.has("voyages") && <Bar dataKey="newVoyages" name="New Voyages" fill={PLATFORM_METRICS.voyages.color} radius={[3, 3, 0, 0]} maxBarSize={24} />}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BEHAVIOR TAB
// ═══════════════════════════════════════════════════════════════

const FEATURE_COLORS: Record<string, string> = {
  route_planner: "#06b6d4",
  fleet_schedule: "#3b82f6",
  ais_dashboard: "#8b5cf6",
  market_data: "#f59e0b",
  vessel_profiles: "#10b981",
  voyage_management: "#ef4444",
  settings: "#6b7280",
  dashboard: "#ec4899",
  admin: "#f97316",
  general: "#94a3b8",
};

function BehaviorTab({ data, loading, range }: { data: BehaviorData | null; loading: boolean; range: string }) {
  const dauFormatted = useMemo(() =>
    data?.dauSeries.map((p) => ({ ...p, label: fmtBucket(p.date, range) })) || [], [data, range]);

  if (loading) return <ChartLoader />;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KPICard label="Active Users" value={data.summary.uniqueActiveUsers} icon={Users} color="text-blue-500" bgColor="bg-blue-500/10" />
          <KPICard label="Total Sessions" value={data.summary.totalSessions} icon={Zap} color="text-amber-500" bgColor="bg-amber-500/10" />
          <KPICard label="Avg Session" value={data.summary.avgSessionDuration} icon={Timer} color="text-green-500" bgColor="bg-green-500/10" suffix="s" />
          <KPICard label="Pages / Session" value={data.summary.avgPagesPerSession} icon={FileText} color="text-pink-500" bgColor="bg-pink-500/10" />
        </div>
      )}

      {/* DAU Chart */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0 px-4 pt-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Daily Active Users</span>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-2 pt-4">
          {dauFormatted.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dauFormatted} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.3 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip content={<TooltipUI />} />
                <Area type="monotone" dataKey="activeUsers" name="Active Users" stroke="#10b981" fill="url(#dauGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#10b981" }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Feature Usage Heatmap */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Feature Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {data.featureUsage.filter((f) => f.count > 0).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No feature data yet — users need to navigate the app</p>
              ) : (
                <div className="space-y-2.5">
                  {data.featureUsage.filter((f) => f.count > 0).map((f, i) => {
                    const maxCount = data.featureUsage[0]?.count || 1;
                    const pct = maxCount > 0 ? Math.round((f.count / maxCount) * 100) : 0;
                    const color = FEATURE_COLORS[f.feature] || "#94a3b8";
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-xs font-medium">{f.label}</span>
                          </div>
                          <span className="text-xs font-semibold">{f.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted/15 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, pct)}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Organization Health Scores */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Heart className="h-3.5 w-3.5 text-red-500" />
                Organization Health
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Score 0–100 based on recency (35%), activity volume (25%), feature breadth (25%), and team size (15%).
                <span className="ml-1">🟢 70+ Healthy · 🟡 40-69 At Risk · 🔴 &lt;40 Needs Attention</span>
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {data.orgHealth.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No organizations yet</p>
              ) : (
                <div className="space-y-3">
                  {data.orgHealth.map((org) => {
                    const scoreColor = org.healthScore >= 70 ? "text-green-400" : org.healthScore >= 40 ? "text-amber-400" : "text-red-400";
                    const scoreBg = org.healthScore >= 70 ? "bg-green-500/10" : org.healthScore >= 40 ? "bg-amber-500/10" : "bg-red-500/10";
                    const statusEmoji = org.healthScore >= 70 ? "🟢" : org.healthScore >= 40 ? "🟡" : "🔴";
                    const statusHint = org.healthScore >= 70 ? "Healthy — actively using the platform" : org.healthScore >= 40 ? "At Risk — low engagement, may need outreach" : "Needs Attention — inactive or barely using features";
                    return (
                      <div key={org.id} className="rounded-lg bg-muted/10 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm cursor-help" title={statusHint}>{statusEmoji}</span>
                            <span className="text-xs font-semibold">{org.name}</span>
                          </div>
                          <span className={cn("text-lg font-bold tabular-nums cursor-help", scoreColor)} title={`Health Score: ${org.healthScore}/100\n\nRecency (35%): How recently the org was active\nVolume (25%): Total activity events in this period\nFeatures (25%): How many features they use (out of 7)\nTeam (15%): Number of active users`}>{org.healthScore}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden mb-2">
                          <div className={cn("h-full rounded-full transition-all duration-500", scoreBg.replace("/10", ""))} style={{ width: `${org.healthScore}%`, backgroundColor: org.healthScore >= 70 ? "#22c55e" : org.healthScore >= 40 ? "#f59e0b" : "#ef4444" }} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="cursor-help" title="Total tracked actions (page views, clicks, etc.) in this time period. More events = more engaged.">
                            <p className="text-[10px] text-muted-foreground">Events</p>
                            <p className="text-xs font-semibold">{org.eventCount}</p>
                          </div>
                          <div className="cursor-help" title="Number of unique team members who used the platform in this period. More users = healthier adoption.">
                            <p className="text-[10px] text-muted-foreground">Users</p>
                            <p className="text-xs font-semibold">{org.uniqueUsers}</p>
                          </div>
                          <div className="cursor-help" title="How many of the 7 core features this org uses: Route Planner, Fleet Schedule, AIS Dashboard, Market Data, Vessel Profiles, Voyage Management, Settings.">
                            <p className="text-[10px] text-muted-foreground">Features</p>
                            <p className="text-xs font-semibold">{org.featuresUsed}/7</p>
                          </div>
                        </div>
                        {org.lastActive && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1" title="When a member of this organization last used the platform">
                            <Clock className="h-2.5 w-2.5" />
                            Last active: {org.daysSinceLastActivity === 0 ? "Today" : org.daysSinceLastActivity === 1 ? "Yesterday" : `${org.daysSinceLastActivity}d ago`}
                          </p>
                        )}
                        {!org.lastActive && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1" title="This organization has been created but no member has logged in yet. Consider reaching out to help them get started.">
                            <AlertCircle className="h-2.5 w-2.5" />
                            Never active — needs onboarding
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

function KPICard({ label, value, total, icon: Icon, color, bgColor, suffix }: { label: string; value: number; total?: number; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string; suffix?: string }) {
  return (
    <Card><CardContent className="p-4"><div className="flex items-start justify-between">
      <div><p className="text-2xl font-bold tracking-tight">{value.toLocaleString()}{suffix && <span className="text-sm text-muted-foreground ml-0.5">{suffix}</span>}</p><p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {total !== undefined && <p className="text-[10px] text-muted-foreground mt-1 pt-1 border-t border-border/30">{total.toLocaleString()} all time</p>}
      </div>
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", bgColor)}><Icon className={cn("h-4 w-4", color)} /></div>
    </div></CardContent></Card>
  );
}

function BreakdownCard({ title, icon, items, barColor, emptyText = "No data", total }: { title: string; icon: React.ReactNode; items: Array<{ label: string; value: number }>; barColor: string; emptyText?: string; total: number }) {
  const maxCount = items[0]?.value || 1;
  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-semibold flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent className="px-4 pb-4">
        {items.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">{emptyText}</p> : (
          <div className="space-y-2">
            {items.slice(0, 8).map((item, i) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (<div key={i} className="group"><div className="flex items-center justify-between mb-0.5"><span className="text-xs font-medium truncate max-w-[200px]">{item.label}</span><div className="flex items-center gap-2 shrink-0"><span className="text-[10px] text-muted-foreground">{pct}%</span><span className="text-xs font-semibold w-8 text-right">{item.value}</span></div></div><div className="h-1.5 rounded-full bg-muted/15 overflow-hidden"><div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", barColor)} style={{ width: `${Math.max(4, (item.value / maxCount) * 100)}%` }} /></div></div>);
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TooltipUI({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (<div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl"><p className="text-[10px] text-muted-foreground mb-1.5 font-medium">{label}</p>{payload.map((e, i) => (<div key={i} className="flex items-center gap-2 text-xs"><div className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} /><span className="text-muted-foreground">{e.name}:</span><span className="font-semibold">{e.value.toLocaleString()}</span></div>))}</div>);
}

function ChartLoader() { return <div className="h-[280px] flex items-center justify-center"><Loader2 className="h-6 w-6 text-muted-foreground animate-spin" /></div>; }
function ChartEmpty() { return <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground gap-2"><BarChart3 className="h-8 w-8 opacity-30" /><p className="text-sm">No data for this period</p></div>; }

function DevIcon({ d, className }: { d: string | null; className?: string }) {
  if (d === "mobile") return <Smartphone className={className} />;
  if (d === "tablet") return <Tablet className={className} />;
  return <Monitor className={className} />;
}

// ─── Helpers ────────────────────────────────────────────────

function flag(code: string | null): string { if (!code || code.length !== 2) return "🌍"; return String.fromCodePoint(...[...code.toUpperCase()].map((c) => c.charCodeAt(0) + 127397)); }
function fmtRef(url: string): string { try { return new URL(url).hostname.replace("www.", ""); } catch { return url || "Direct"; } }
function fmtBucket(date: string, range: string): string { if (date.includes(":")) return date.split(" ")[1] || date; const d = new Date(date + "T00:00:00"); if (range === "1y" || range === "all") return d.toLocaleDateString("en-US", { month: "short" }); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function timeAgo(s: string) { const d = Date.now() - new Date(s).getTime(); const m = Math.floor(d / 60000); const h = Math.floor(d / 3600000); const dy = Math.floor(d / 86400000); if (m < 1) return "Just now"; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`; if (dy < 7) return `${dy}d ago`; return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function AnalyticsSkeleton() { return <div className="space-y-6"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><div className="space-y-1"><Skeleton className="h-6 w-32" /><Skeleton className="h-3.5 w-48" /></div></div><Skeleton className="h-8 w-96 rounded-xl" /><div className="grid gap-3 grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div><Skeleton className="h-[320px] rounded-lg" /></div>; }
