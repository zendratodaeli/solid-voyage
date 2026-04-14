"use client";

/**
 * Admin Dashboard — Platform Command Center
 *
 * Shows only platform-level metrics the super admin manages.
 * Org-scoped data (vessels, voyages) is excluded by design.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSuperAdminGuard } from "@/hooks/useSuperAdminGuard";
import {
  LayoutDashboard,
  Users,
  Building2,
  Mail,
  FileText,
  Shield,
  Clock,
  TrendingUp,
  UserPlus,
  Send,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Settings2,
  Newspaper,
  ExternalLink,
  Eye,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DashboardData {
  stats: {
    users: { total: number; recentWeek: number };
    organizations: { total: number };
    newsletter: { active: number; pending: number; inactive: number; total: number };
    content: { pages: number };
    admins: { total: number };
  };
  recentActivity: {
    subscribers: Array<{
      id: string;
      email: string;
      isActive: boolean;
      confirmedAt: string | null;
      source: string;
      createdAt: string;
    }>;
  };
  systemStatus: {
    emailConfigured: boolean;
    usingTestDomain: boolean;
    fromEmail: string;
  };
}

export default function AdminDashboard() {
  const { isSuperAdmin, loading: guardLoading } = useSuperAdminGuard();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/platform/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchDashboard();
  }, [isSuperAdmin, fetchDashboard]);

  if (guardLoading || !isSuperAdmin || loading || !data) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <p className="text-red-400 font-medium">{error}</p>
        <Button onClick={fetchDashboard} variant="outline" size="sm">
          Try again
        </Button>
      </div>
    );
  }

  const { stats, recentActivity, systemStatus } = data;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Platform overview</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDashboard} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* ── System Alert ───────────────────────────────────── */}
      {(systemStatus.usingTestDomain || !systemStatus.emailConfigured) && (
        <div className="px-4 py-3 rounded-lg bg-amber-500/8 border border-amber-500/20 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-400 flex-1">
            {!systemStatus.emailConfigured
              ? "No Resend API key configured — emails are disabled."
              : "Using Resend test domain — emails may land in spam."}
          </p>
          <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-400 hover:text-amber-300 gap-1">
              Fix <ExternalLink className="h-3 w-3" />
            </Button>
          </a>
        </div>
      )}

      {/* ── Quick Actions ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/newsletter">
          <Button variant="outline" size="sm" className="gap-2 h-8 text-xs hover:border-primary/40">
            <Send className="h-3.5 w-3.5" /> Compose Newsletter
          </Button>
        </Link>
        <Link href="/admin/pages">
          <Button variant="outline" size="sm" className="gap-2 h-8 text-xs hover:border-primary/40">
            <Plus className="h-3.5 w-3.5" /> Create Page
          </Button>
        </Link>
        <Link href="/admin/platform-admins">
          <Button variant="outline" size="sm" className="gap-2 h-8 text-xs hover:border-primary/40">
            <UserPlus className="h-3.5 w-3.5" /> Add Admin
          </Button>
        </Link>
        <Link href="/admin/platform-settings">
          <Button variant="outline" size="sm" className="gap-2 h-8 text-xs hover:border-primary/40">
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </Button>
        </Link>
      </div>

      {/* ── Stats Grid — 3×2 platform-level metrics ────────── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={Users}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
          label="Users"
          value={stats.users.total}
          sub={stats.users.recentWeek > 0 ? `+${stats.users.recentWeek} this week` : "All time"}
          subColor={stats.users.recentWeek > 0 ? "text-green-400" : "text-muted-foreground"}
          href="/admin/platform-admins"
        />
        <MetricCard
          icon={Building2}
          iconColor="text-violet-500"
          iconBg="bg-violet-500/10"
          label="Organizations"
          value={stats.organizations.total}
          sub="Teams"
          href="/admin/platform-settings"
        />
        <MetricCard
          icon={Mail}
          iconColor="text-green-500"
          iconBg="bg-green-500/10"
          label="Subscribers"
          value={stats.newsletter.total}
          sub={`${stats.newsletter.active} confirmed`}
          subColor="text-green-400"
          href="/admin/newsletter"
        />
        <MetricCard
          icon={Clock}
          iconColor="text-blue-400"
          iconBg="bg-blue-400/10"
          label="Pending"
          value={stats.newsletter.pending}
          sub="Awaiting confirm"
          href="/admin/newsletter"
        />
        <MetricCard
          icon={FileText}
          iconColor="text-pink-500"
          iconBg="bg-pink-500/10"
          label="Pages"
          value={stats.content.pages}
          sub="Published"
          href="/admin/pages"
        />
        <MetricCard
          icon={Shield}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
          label="Admins"
          value={stats.admins.total}
          sub="Platform"
          href="/admin/platform-admins"
        />
      </div>

      {/* ── Insights Row — 3-column ───────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Analytics & Traffic */}
        <Link href="/admin/analytics" className="group">
          <Card className="h-full cursor-pointer border-border/40 hover:border-cyan-500/30 transition-all duration-300">
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <BarChart3 className="h-3.5 w-3.5 text-white" />
                </div>
                Analytics
                <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Visitor insights, traffic intelligence & platform growth metrics.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/10 p-2.5 text-center">
                  <Eye className="h-3.5 w-3.5 text-cyan-500 mx-auto mb-1" />
                  <p className="text-xs font-bold">{stats.content.pages > 0 ? "Live" : "—"}</p>
                  <p className="text-[9px] text-muted-foreground">Page Views</p>
                </div>
                <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-2.5 text-center">
                  <Users className="h-3.5 w-3.5 text-blue-500 mx-auto mb-1" />
                  <p className="text-xs font-bold">{stats.users.total}</p>
                  <p className="text-[9px] text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Recent Subscribers */}
        <Card className="h-full border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-green-500/10 flex items-center justify-center">
                  <Newspaper className="h-3.5 w-3.5 text-green-500" />
                </div>
                Subscribers
              </CardTitle>
              <Link href="/admin/newsletter" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                View all →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {recentActivity.subscribers.length === 0 ? (
              <EmptySlot text="No subscribers yet" icon={Mail} />
            ) : (
              <div className="space-y-2">
                {recentActivity.subscribers.slice(0, 4).map((sub) => {
                  const isPending = !sub.confirmedAt && !sub.isActive;
                  return (
                    <div key={sub.id} className="flex items-center gap-2.5">
                      <div className={cn(
                        "h-7 w-7 rounded-md flex items-center justify-center shrink-0",
                        sub.isActive ? "bg-green-500/10" : isPending ? "bg-blue-500/10" : "bg-red-500/10"
                      )}>
                        {sub.isActive ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                        ) : isPending ? (
                          <Clock className="h-3.5 w-3.5 text-blue-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{sub.email}</p>
                        <p className="text-[10px] text-muted-foreground">{formatTimeAgo(sub.createdAt)}</p>
                      </div>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                        sub.isActive
                          ? "bg-green-500/10 text-green-400"
                          : isPending
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-red-500/10 text-red-400"
                      )}>
                        {sub.isActive ? "Active" : isPending ? "Pending" : "Unsub"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Health */}
        <Card className="h-full border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              </div>
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2.5">
              <HealthRow
                label="Email Service"
                status={systemStatus.emailConfigured && !systemStatus.usingTestDomain ? "healthy" : systemStatus.emailConfigured ? "warning" : "error"}
                detail={systemStatus.emailConfigured ? (systemStatus.usingTestDomain ? "Test domain" : "Verified") : "Not configured"}
              />
              <HealthRow label="Database" status="healthy" detail="Neon PostgreSQL" />
              <HealthRow label="Authentication" status="healthy" detail="Clerk Auth" />
              <HealthRow label="API" status="healthy" detail="Next.js 16" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Components ────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  sub,
  subColor = "text-muted-foreground",
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  label: string;
  value: number;
  sub: string;
  subColor?: string;
  href?: string;
}) {
  const inner = (
    <Card className={cn(
      "h-full transition-all",
      href && "cursor-pointer hover:border-primary/30 group"
    )}>
      <CardContent className="p-4 h-full flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-2xl font-bold tracking-tight leading-none">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
            <Icon className={cn("h-4.5 w-4.5", iconColor)} />
          </div>
        </div>
        <p className={cn("text-[11px] font-medium mt-3 pt-2 border-t border-border/40", subColor)}>
          {sub}
        </p>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

function HealthRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: "healthy" | "warning" | "error";
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-muted/15">
      <div className={cn(
        "h-2 w-2 rounded-full shrink-0",
        status === "healthy" && "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]",
        status === "warning" && "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]",
        status === "error" && "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
      )} />
      <p className="text-xs font-medium flex-1">{label}</p>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptySlot({ text, icon: Icon }: { text: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="h-10 w-10 rounded-xl bg-muted/30 flex items-center justify-center mb-2">
        <Icon className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
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

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-36" />)}
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[108px] rounded-lg" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
      </div>
    </div>
  );
}
