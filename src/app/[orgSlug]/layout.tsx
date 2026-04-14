"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { SidebarAccountMenu } from "@/components/auth/SidebarAccountMenu";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { OrgThemeProvider, useOrgTheme } from "@/components/auth/OrgThemeProvider";
import { OrgProfileProvider, useOrgProfile } from "@/components/auth/OrgProfileProvider";
import { OnboardingGate } from "@/components/auth/OnboardingGate";
import { useOrgPath } from "@/hooks/useOrgPath";
import {
  Ship,
  LayoutDashboard,
  Anchor,
  Menu,
  X,
  Map,
  Crown,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Calculator,
  CalendarRange,
  TrendingUp,
  Shield,
  Globe,
  Home,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useOrganization } from "@clerk/nextjs";

const baseNavItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Fleet Operations", path: "/fleet-operations", icon: CalendarRange },
  { label: "Voyages", path: "/voyages", icon: Ship },
  { label: "Vessels", path: "/vessels", icon: Anchor },
  { label: "Operations Map", path: "/operations-map", icon: Map },
  { label: "Laytime", path: "/laytime-calculator", icon: Calculator },
  { label: "Market Data", path: "/market-data", icon: TrendingUp },
  { label: "AI Copilot", path: "/ai-copilot", icon: Sparkles },
];

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 68;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgThemeProvider>
      <OrgProfileProvider>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </OrgProfileProvider>
    </OrgThemeProvider>
  );
}

function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const { organization } = useOrganization();
  const { theme: orgTheme, isPremium, isLoading: themeLoading } = useOrgTheme();
  const { profile, profileComplete, isLoading: profileLoading } = useOrgProfile();
  const { orgSlug, orgPath } = useOrgPath();

  // Build nav items with org-scoped hrefs
  const allNavItems = useMemo(() => {
    const items: Array<{
      label: string;
      path: string;
      icon: any;
      href: string;
      isSub?: boolean;
      parentHref?: string;
    }> = [];
    for (const item of baseNavItems) {
      const parentHref = orgPath(item.path);
      items.push({ ...item, href: parentHref });
      if ((item as any).subItems) {
        for (const sub of (item as any).subItems) {
          items.push({ ...sub, href: orgPath(sub.path), isSub: true, parentHref });
        }
      }
    }
    return items;
  }, [orgPath]);

  // Settings item (shown only when org exists)
  const settingsItem = useMemo(() => {
    if (!organization) return null;
    return { label: "Settings", path: "/settings", icon: Settings, href: orgPath("/settings") };
  }, [organization, orgPath]);


  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === "true") setCollapsed(true);

    // Check super admin status
    fetch("/api/platform/check-access")
      .then((res) => res.json())
      .then((data) => setIsSuperAdmin(data.isSuperAdmin === true))
      .catch(() => setIsSuperAdmin(false));
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  // Determine sidebar logo and label from org + theme
  const orgLogoUrl = organization?.imageUrl || null;
  const hasCustomOrgLogo = !!orgLogoUrl && !orgLogoUrl.includes("/default/");
  const sidebarLabel = organization?.name || "Solid Voyage";
  const isCustomLogo = hasCustomOrgLogo && isPremium;

  // Logo border radius from org profile preferences
  const logoBorderRadiusMap: Record<string, string> = {
    none: "0px", sm: "4px", md: "8px", lg: "16px", full: "50%",
  };
  const logoRadiusCss = logoBorderRadiusMap[profile?.logoBorderRadius ?? "md"] ?? "8px";

  const dashboardHref = orgPath("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* ═══════════════════════════════════════════════
          MOBILE TOP BAR  (< lg only)
         ═══════════════════════════════════════════════ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href={dashboardHref} className="flex items-center gap-2 ml-3">
          {themeLoading ? (
            <>
              <Skeleton className="h-6 w-6 rounded-md shrink-0" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              {isCustomLogo ? (
                <img src={orgLogoUrl} alt={sidebarLabel} className="h-6 w-6 object-contain" style={{ borderRadius: logoRadiusCss }} />
              ) : (
                <Image src="/logo.svg" alt="Solid Voyage" width={24} height={24} className="rounded-md" />
              )}
              <span className="text-base font-bold">{sidebarLabel}</span>
            </>
          )}
        </Link>
        <div className="ml-auto flex items-center gap-2" />
      </div>

      {/* ═══════════════════════════════════════════════
          MOBILE SIDEBAR OVERLAY  (< lg only)
         ═══════════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeMobileMenu}
          />
          {/* Sidebar panel */}
          <aside
            className="absolute top-0 left-0 bottom-0 w-[280px] bg-sidebar border-r border-sidebar-border flex flex-col animate-in slide-in-from-left duration-300"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border shrink-0">
              <Link
                href={dashboardHref}
                className="flex items-center gap-2"
                onClick={closeMobileMenu}
              >
                {themeLoading ? (
                  <>
                    <Skeleton className="h-6 w-6 rounded-md shrink-0" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    {isCustomLogo ? (
                      <img src={orgLogoUrl} alt={sidebarLabel} className="h-6 w-6 object-contain" style={{ borderRadius: logoRadiusCss }} />
                    ) : (
                      <Image src="/logo.svg" alt="Solid Voyage" width={24} height={24} className="rounded-md" />
                    )}
                    <span className="text-base font-bold text-sidebar-foreground">
                      {sidebarLabel}
                    </span>
                  </>
                )}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeMobileMenu}
                className="h-8 w-8 text-sidebar-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {allNavItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileMenu}
                  >
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start gap-3 h-10 text-sidebar-foreground",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
              {/* Settings item */}
              {settingsItem && (
                <>
                  <div className="my-2 border-t border-sidebar-border/50" />
                  <Link href={settingsItem.href} onClick={closeMobileMenu}>
                    <Button
                      variant={pathname.startsWith(settingsItem.href) ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start gap-3 h-10 text-sidebar-foreground",
                        pathname.startsWith(settingsItem.href) && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      )}
                    >
                      <settingsItem.icon className="h-4 w-4 shrink-0" />
                      {settingsItem.label}
                    </Button>
                  </Link>
                </>
              )}
              {/* Super Admin shortcut — mobile */}
              {isSuperAdmin && (
                <>
                  <div className="my-2 border-t border-sidebar-border/50" />
                  <div className="flex items-center gap-2 px-3 py-1">
                    <Shield className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/80">
                      Super Admin
                    </span>
                  </div>
                  <Link href="/admin/pages" target="_blank" onClick={closeMobileMenu}>
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 h-10 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                    >
                      <Shield className="h-4 w-4 shrink-0" />
                      Admin Panel →
                    </Button>
                  </Link>
                </>
              )}
            </nav>

            {/* Bottom section */}
            <div className="border-t border-sidebar-border p-3 space-y-2 shrink-0">
              {isPremium ? (
                <div className="flex items-center gap-3 h-10 px-3 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 transition-all duration-300 hover:bg-blue-500/15 hover:border-blue-400/30">
                  <Sparkles className="h-4 w-4 shrink-0 animate-pulse" />
                  <span className="text-xs font-semibold tracking-wide bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Solid Voyage Starter</span>
                </div>
              ) : (
                <Link href={orgPath("/pricing")} onClick={closeMobileMenu}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-10 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                  >
                    <Crown className="h-4 w-4 shrink-0" />
                    Upgrade Plan
                  </Button>
                </Link>
              )}
              <SidebarAccountMenu />
              {/* Home / Landing Page link */}
              <Link href="/?landing" onClick={closeMobileMenu}>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-10 text-sidebar-foreground"
                >
                  <Globe className="h-4 w-4 shrink-0" />
                  Home
                </Button>
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          DESKTOP SIDEBAR  (lg+ only)
         ═══════════════════════════════════════════════ */}
      <aside
        className="hidden lg:flex fixed top-0 left-0 bottom-0 z-40 flex-col border-r border-sidebar-border bg-sidebar overflow-hidden"
        style={{
          width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
          transition: "width 350ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center h-14 border-b border-sidebar-border shrink-0 px-3">
          <Link
            href={dashboardHref}
            className="flex items-center gap-2 overflow-hidden min-w-0"
          >
            {themeLoading ? (
              <>
                <Skeleton className="h-6 w-6 rounded-md shrink-0" />
                <Skeleton
                  className="h-4 w-24"
                  style={{
                    opacity: collapsed ? 0 : 1,
                    transition: "opacity 200ms ease",
                  }}
                />
              </>
            ) : (
              <>
                {isCustomLogo ? (
                  <img src={orgLogoUrl} alt={sidebarLabel} className="h-6 w-6 object-contain shrink-0" style={{ borderRadius: logoRadiusCss }} />
                ) : (
                  <Image src="/logo.svg" alt="Solid Voyage" width={24} height={24} className="rounded-md shrink-0" />
                )}
                <span
                  className="text-base font-bold text-sidebar-foreground whitespace-nowrap"
                  style={{
                    opacity: collapsed ? 0 : 1,
                    transition: "opacity 200ms ease",
                  }}
                >
                  {sidebarLabel}
                </span>
              </>
            )}
          </Link>
        </div>

        {/* Nav links */}
        {!mounted ? (
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center h-10 rounded-md px-3 gap-3">
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
                <Skeleton
                  className="h-4 w-20"
                  style={{
                    opacity: collapsed ? 0 : 1,
                    transition: "opacity 200ms ease",
                  }}
                />
              </div>
            ))}
          </nav>
        ) : (
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {allNavItems.map((item) => {
              const isActive = pathname === item.href || (pathname.startsWith(item.href) && !item.isSub);
              
              // Sub-items: only show when parent is active or the sub-item itself is active
              if (item.isSub) {
                const parentActive = item.parentHref && pathname.startsWith(item.parentHref);
                const selfActive = pathname.startsWith(item.href);
                const shouldShow = !collapsed && (parentActive || selfActive);
                
                return (
                  <div
                    key={item.href}
                    className="overflow-hidden transition-all duration-200 ease-in-out"
                    style={{
                      maxHeight: shouldShow ? 40 : 0,
                      opacity: shouldShow ? 1 : 0,
                    }}
                  >
                    <Link href={item.href}>
                      <Button
                        variant={selfActive ? "secondary" : "ghost"}
                        className={cn(
                          "w-full h-8 text-sidebar-foreground justify-start gap-2 overflow-hidden pl-11 text-xs",
                          selfActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 shrink-0" />
                        <span className="whitespace-nowrap">{item.label}</span>
                      </Button>
                    </Link>
                  </div>
                );
              }
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "w-full h-10 text-sidebar-foreground justify-start gap-3 overflow-hidden px-3",
                      isActive &&
                        "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span
                      className="whitespace-nowrap"
                      style={{
                        opacity: collapsed ? 0 : 1,
                        transition: "opacity 200ms ease",
                      }}
                    >
                      {item.label}
                    </span>
                  </Button>
                </Link>
              );
            })}
            {/* Settings item */}
            {settingsItem && (
              <>
                <div className="my-2 border-t border-sidebar-border/50" />
                <Link href={settingsItem.href}>
                  <Button
                    variant={pathname.startsWith(settingsItem.href) ? "secondary" : "ghost"}
                    className={cn(
                      "w-full h-10 text-sidebar-foreground justify-start gap-3 px-3 overflow-hidden",
                      pathname.startsWith(settingsItem.href) && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    )}
                    title={collapsed ? settingsItem.label : undefined}
                  >
                    <settingsItem.icon className="h-4 w-4 shrink-0" />
                    <span
                      className="whitespace-nowrap"
                      style={{
                        opacity: collapsed ? 0 : 1,
                        transition: "opacity 200ms ease",
                      }}
                    >
                      {settingsItem.label}
                    </span>
                  </Button>
                </Link>
              </>
            )}
            {/* Super Admin shortcut — only for platform admins */}
            {isSuperAdmin && (
              <>
                <div className="my-2 border-t border-sidebar-border/50" />
                {!collapsed && (
                  <div className="flex items-center gap-2 px-3 py-1">
                    <Shield className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/80">
                      Super Admin
                    </span>
                  </div>
                )}
                <Link href="/admin/pages" target="_blank">
                  <Button
                    variant="ghost"
                    className="w-full h-10 text-sidebar-foreground justify-start gap-3 px-3 overflow-hidden text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                    title={collapsed ? "Admin Panel" : undefined}
                  >
                    <Shield className="h-4 w-4 shrink-0" />
                    <span
                      className="whitespace-nowrap"
                      style={{
                        opacity: collapsed ? 0 : 1,
                        transition: "opacity 200ms ease",
                      }}
                    >
                      Admin Panel →
                    </span>
                  </Button>
                </Link>
              </>
            )}
          </nav>
        )}

        {/* Bottom section */}
        {!mounted ? (
          <div className="border-t border-sidebar-border p-2 space-y-2 shrink-0">
            <div className="flex items-center h-10 gap-3 px-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton
                className="h-4 w-24"
                style={{
                  opacity: collapsed ? 0 : 1,
                  transition: "opacity 200ms ease",
                }}
              />
            </div>
            <div className="flex items-center rounded-lg p-2 gap-3 px-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div
                className="space-y-1.5"
                style={{
                  opacity: collapsed ? 0 : 1,
                  transition: "opacity 200ms ease",
                }}
              >
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-sidebar-border p-2 space-y-1 shrink-0">
            {isPremium ? (
              <div
                className="flex items-center h-10 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 transition-all duration-300 hover:bg-blue-500/15 hover:border-blue-400/30 gap-3 px-3 overflow-hidden"
                title={collapsed ? "Solid Voyage Starter" : undefined}
              >
                <Sparkles className="h-4 w-4 shrink-0 animate-pulse" />
                <span
                  className="text-xs font-semibold tracking-wide whitespace-nowrap bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent"
                  style={{
                    opacity: collapsed ? 0 : 1,
                    transition: "opacity 200ms ease",
                  }}
                >
                  Solid Voyage Starter
                </span>
              </div>
            ) : (
              <Link href={orgPath("/pricing")}>
                <Button
                  variant="ghost"
                  className="w-full h-10 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 justify-start gap-3 px-3 overflow-hidden"
                  title={collapsed ? "Upgrade Plan" : undefined}
                >
                  <Crown className="h-4 w-4 shrink-0" />
                  <span
                    className="whitespace-nowrap"
                    style={{
                      opacity: collapsed ? 0 : 1,
                      transition: "opacity 200ms ease",
                    }}
                  >
                    Upgrade Plan
                  </span>
                </Button>
              </Link>
            )}

            <SidebarAccountMenu collapsed={collapsed} />

            {/* Home / Landing Page link */}
            <Link href="/?landing" target="_blank">
              <Button
                variant="ghost"
                className="w-full h-9 text-sidebar-foreground justify-start gap-3 px-3 overflow-hidden"
                title={collapsed ? "Home" : undefined}
              >
                <Home className="h-4 w-4 shrink-0" />
                <span
                  className="whitespace-nowrap text-sm"
                  style={{
                    opacity: collapsed ? 0 : 1,
                    transition: "opacity 200ms ease",
                  }}
                >
                  Home
                </span>
              </Button>
            </Link>

            {/* Collapse/Expand toggle */}
            <div className="border-t border-sidebar-border pt-1 mt-1">
              <button
                onClick={toggleCollapsed}
                className="flex items-center w-full rounded-md h-9 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground gap-3 px-3 overflow-hidden"
                title={collapsed ? "Expand menu" : "Collapse menu"}
              >
                <div
                  className="shrink-0 transition-transform duration-350"
                  style={{
                    transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <PanelLeftClose className="h-4 w-4" />
                </div>
                <span
                  className="whitespace-nowrap"
                  style={{
                    opacity: collapsed ? 0 : 1,
                    transition: "opacity 200ms ease",
                  }}
                >
                  Collapse menu
                </span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* ═══════════════════════════════════════════════
          MAIN CONTENT (gated by org profile completion)
         ═══════════════════════════════════════════════ */}
      {(() => {
        // Show onboarding gate if profile is incomplete
        if (!profileLoading && !profileComplete) {
          return (
            <main
              className="min-h-screen pt-14 lg:pt-0 transition-[margin] duration-300 ease-in-out"
            >
              <div
                className="hidden lg:block transition-[margin] duration-300 ease-in-out min-h-screen"
                style={{
                  marginLeft: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
                }}
              >
                <div className="container mx-auto px-4 py-6 md:py-8">
                  <OnboardingGate />
                </div>
              </div>
              <div className="lg:hidden min-h-screen">
                <div className="container mx-auto px-4 py-6 md:py-8">
                  <OnboardingGate />
                </div>
              </div>
            </main>
          );
        }

        // Route Planner gets full-bleed layout (no padding) for map cockpit
        const isFullBleed = pathname.endsWith("/route-planner") || pathname.endsWith("/operations-map");
        return (
          <main
            className="min-h-screen pt-14 lg:pt-0 transition-[margin] duration-300 ease-in-out"
          >
            <div
              className="hidden lg:block transition-[margin] duration-300 ease-in-out min-h-screen"
              style={{
                marginLeft: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
              }}
            >
              {isFullBleed ? (
                <div className="h-[calc(100vh)] overflow-hidden">
                  {children}
                </div>
              ) : (
                <div className="container mx-auto px-4 py-6 md:py-8">
                  {children}
                </div>
              )}
            </div>
            <div className="lg:hidden min-h-screen">
              {isFullBleed ? (
                <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
                  {children}
                </div>
              ) : (
                <div className="container mx-auto px-4 py-6 md:py-8">
                  {children}
                </div>
              )}
            </div>
          </main>
        );
      })()}

      {/* AI Copilot — floating button + slide-over panel */}
      <CopilotPanel />
    </div>
  );
}
