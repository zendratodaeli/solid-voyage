"use client";

/**
 * Admin Panel Layout
 * 
 * Self-contained layout for platform administration at /admin/*.
 * Has its own sidebar with admin-specific navigation.
 * No org context dependency — purely platform-level.
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useSuperAdminGuard, type AdminPermissions } from "@/hooks/useSuperAdminGuard";
import {
  Shield,
  LayoutDashboard,
  FileText,
  TrendingUp,
  Settings2,
  Users,
  Newspaper,
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Crown,
  Home,
  BarChart3,
  LogOut,
  Compass,
  Anchor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "admin-sidebar-collapsed";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey: keyof AdminPermissions | null; // null = always visible
}

const ALL_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, permissionKey: null },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3, permissionKey: null },
  { label: "Site Pages", href: "/admin/pages", icon: FileText, permissionKey: "canManagePages" },
  { label: "Market Data", href: "/admin/market-data", icon: TrendingUp, permissionKey: "canManageMarketData" },
  { label: "Maritime Intel", href: "/admin/maritime-intelligence", icon: Compass, permissionKey: "canManageMaritimeIntel" },
  { label: "Port Database", href: "/admin/ports", icon: Anchor, permissionKey: "canManagePorts" },
  { label: "Platform Settings", href: "/admin/platform-settings", icon: Settings2, permissionKey: "canManageSettings" },
  { label: "Platform Admins", href: "/admin/platform-admins", icon: Users, permissionKey: "canManageAdmins" },
  { label: "Newsletter", href: "/admin/newsletter", icon: Newspaper, permissionKey: "canManageNewsletter" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSuperAdmin, isRoot, permissions, loading } = useSuperAdminGuard();
  const { signOut } = useClerk();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_KEY, String(next));
  };

  // Filter nav items based on permissions (root sees everything)
  const visibleNavItems = useMemo(() => {
    if (!permissions) return [];
    if (isRoot) return ALL_NAV_ITEMS;

    return ALL_NAV_ITEMS.filter((item) => {
      if (item.permissionKey === null) return true;
      return permissions[item.permissionKey] === true;
    });
  }, [permissions, isRoot]);

  // Loading state
  if (loading || !isSuperAdmin) {
    return (
      <div className="flex min-h-screen bg-background">
        <div className="w-64 border-r border-border bg-card/50 p-4 space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!mounted) return null;

  const sidebarWidth = collapsed ? "w-16" : "w-64";

  return (
    <div className="flex min-h-screen bg-background">
      {/* ─── Admin Sidebar ─────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen border-r border-border bg-card/80 backdrop-blur-sm z-30 flex flex-col transition-all duration-300",
          sidebarWidth
        )}
      >
        {/* Header */}
        <div className="p-3 border-b border-border">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-white" />
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <p className="text-sm font-bold tracking-tight text-foreground truncate">
                  Admin Panel
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {isRoot ? "Root Administrator" : "Managed Admin"}
                </p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {/* Role Badge */}
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 py-1.5 mb-2">
              <Crown className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/80">
                {isRoot ? "Root Access" : "Managed Access"}
              </span>
            </div>
          )}

          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-10 justify-start gap-3 px-3 overflow-hidden",
                    isActive && "bg-accent text-accent-foreground font-medium"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="whitespace-nowrap truncate">{item.label}</span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Footer — Back to App + Sign Out + Collapse */}
        <div className="p-2 border-t border-border space-y-1">
          <Link href="/" target="_blank">
            <Button
              variant="ghost"
              className="w-full h-10 justify-start gap-3 px-3 text-muted-foreground hover:text-foreground"
              title={collapsed ? "Back to App" : undefined}
            >
              <Home className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">Back to App</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="w-full h-10 justify-start gap-3 px-3 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
            title={collapsed ? "Sign Out" : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="whitespace-nowrap">Sign Out</span>}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="w-full h-8 text-muted-foreground hover:text-foreground"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* ─── Main Content ──────────────────────────────────────── */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          collapsed ? "ml-16" : "ml-64"
        )}
      >
        <div className="p-6 lg:p-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
