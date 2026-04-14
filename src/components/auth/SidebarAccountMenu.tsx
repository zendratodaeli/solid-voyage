"use client";

/**
 * SidebarAccountMenu
 *
 * Unified sidebar bottom bar that merges user account + org switcher
 * into a single dropdown. Shows:
 *   - User avatar + current org/name as trigger
 *   - Account section (Manage Account)
 *   - Organization section (switch, manage, create)
 *   - Theme toggle + Sign Out
 *
 * "Personal" workspace is intentionally removed — this is a B2B
 * platform where every user must belong to an organization.
 */

import { useState } from "react";
import { useOrganization, useOrganizationList, useClerk, useUser } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Moon,
  Settings,
  Sun,
  UserCog,
  FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSettingsDrawer } from "@/components/auth/AccountSettingsDrawer";
import { CreateOrganizationDrawer } from "@/components/auth/CreateOrganizationDrawer";

function toUrlSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface SidebarAccountMenuProps {
  collapsed?: boolean;
}

export function SidebarAccountMenu({ collapsed = false }: SidebarAccountMenuProps) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const { signOut, openOrganizationProfile } = useClerk();
  const { userMemberships, setActive, isLoaded: isListLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const { theme, setTheme } = useTheme();

  // Custom drawer state
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [createOrgDrawerOpen, setCreateOrgDrawerOpen] = useState(false);

  // Loading state
  if (!isUserLoaded || !isOrgLoaded) {
    return (
      <div className={cn(
        "flex items-center gap-3 rounded-lg p-2",
        collapsed ? "justify-center" : "px-3"
      )}>
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        {!collapsed && (
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        )}
      </div>
    );
  }

  if (!user) return null;

  const fullName = user.fullName || user.firstName || "User";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const currentOrgName = organization?.name ?? "No Organization";

  const handleOrgSwitch = async (orgId: string, orgSlug?: string) => {
    if (setActive) {
      await setActive({ organization: orgId });
      const slug = orgSlug || "personal";
      window.location.href = `/${slug}/dashboard`;
    }
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center w-full rounded-lg outline-none transition-all duration-200",
            "hover:bg-sidebar-accent/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ring-offset-sidebar",
            collapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"
          )}
          aria-label="Open account menu"
        >
          <div className="relative shrink-0">
            <Avatar className="h-8 w-8 ring-2 ring-sidebar-border/50 transition-all duration-200 group-hover:ring-primary/30">
              <AvatarImage src={user.imageUrl} alt={fullName} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            {organization && (
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-sidebar" />
            )}
          </div>
          {!collapsed && (
            <>
              <div className="flex flex-col items-start min-w-0 flex-1 text-left">
                <span className="text-sm font-semibold text-sidebar-foreground truncate max-w-full">
                  {fullName}
                </span>
                <span className="text-[11px] text-muted-foreground truncate max-w-full">
                  {currentOrgName}
                </span>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
        className="w-[260px] p-0 rounded-xl border-border/60 shadow-xl shadow-black/20 max-h-[calc(100vh-80px)] flex flex-col"
        sideOffset={8}
      >
        {/* ─── User Header ─── */}
        <div className="px-3.5 py-3 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent shrink-0">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/20">
              <AvatarImage src={user.imageUrl} alt={fullName} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold truncate">{fullName}</span>
              <span className="text-[11px] text-muted-foreground truncate">{email}</span>
            </div>
          </div>
        </div>

        {/* ─── Scrollable Content ─── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <DropdownMenuSeparator className="my-0" />

          {/* Account */}
          <div className="p-1">
            <div className="px-3 pt-1 pb-1">
              <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
                My Account
              </span>
            </div>
            <div className="max-h-[140px] overflow-y-auto">
              <DropdownMenuItem
                className="gap-2.5 px-3 py-2 cursor-pointer rounded-lg text-[13px]"
                onClick={() => setAccountDrawerOpen(true)}
              >
                <UserCog className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">Manage Account</span>
              </DropdownMenuItem>
            </div>
          </div>

          <DropdownMenuSeparator className="my-0" />

          {/* Organization Section */}
          <div className="p-1">
            <div className="px-3 pt-1 pb-1">
              <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
                Organizations
              </span>
            </div>

            {/* Org List */}
            <div className="max-h-[140px] overflow-y-auto">
              {isListLoaded && userMemberships?.data?.map((membership) => {
                const org = membership.organization;
                const isActive = organization?.id === org.id;
                return (
                  <DropdownMenuItem
                    key={org.id}
                    className={cn(
                      "gap-2.5 px-3 py-1.5 cursor-pointer rounded-lg transition-all duration-150",
                      isActive && "bg-primary/8"
                    )}
                    onClick={() => handleOrgSwitch(org.id, org.slug ?? toUrlSlug(org.name))}
                  >
                    <Avatar className={cn(
                      "h-6 w-6 rounded-md shrink-0",
                      isActive && "ring-1.5 ring-primary/30"
                    )}>
                      <AvatarImage src={org.imageUrl} alt={org.name} className="rounded-md" />
                      <AvatarFallback className="rounded-md bg-primary/15 text-primary text-[8px] font-bold">
                        {getInitials(org.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={cn(
                        "text-[13px] truncate leading-tight",
                        isActive ? "font-semibold" : "font-medium"
                      )}>
                        {org.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 capitalize leading-tight">
                        {membership.role.replace("org:", "")}
                      </span>
                    </div>
                    {isActive && (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </DropdownMenuItem>
                );
              })}

              {/* No orgs state */}
              {isListLoaded && (!userMemberships?.data || userMemberships.data.length === 0) && (
                <div className="px-3 py-2 text-center">
                  <p className="text-[11px] text-muted-foreground/60">No organizations yet</p>
                </div>
              )}
            </div>

            <DropdownMenuSeparator className="my-0.5 mx-2" />

            {/* Org Actions */}
            {organization && (
              <DropdownMenuItem
                className="gap-2.5 px-3 py-2 cursor-pointer rounded-lg text-[13px]"
                onClick={() => openOrganizationProfile()}
              >
                <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Manage Organization</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="gap-2.5 px-3 py-2 cursor-pointer rounded-lg text-[13px]"
              onClick={() => setCreateOrgDrawerOpen(true)}
            >
              <FolderPlus className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>Create Organization</span>
            </DropdownMenuItem>
          </div>
        </div>

        {/* ─── Sticky Footer: Theme + Sign Out ─── */}
        <div className="border-t border-border/60 p-1 shrink-0">
          <div className="flex items-center">
            <DropdownMenuItem
              className="flex-1 gap-2 px-3 py-2 cursor-pointer rounded-lg text-[12px] justify-center"
              onClick={(e) => {
                e.preventDefault();
                setTheme(theme === "dark" ? "light" : "dark");
              }}
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-indigo-400" />
              )}
              <span className="text-muted-foreground">
                {theme === "dark" ? "Light" : "Dark"}
              </span>
            </DropdownMenuItem>

            <div className="w-px h-4 bg-border/40 shrink-0" />

            <DropdownMenuItem
              className="flex-1 gap-2 px-3 py-2 cursor-pointer rounded-lg text-[12px] text-destructive focus:text-destructive focus:bg-destructive/10 justify-center"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="font-medium">Sign Out</span>
            </DropdownMenuItem>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Custom Drawers */}
    <AccountSettingsDrawer
      open={accountDrawerOpen}
      onOpenChange={setAccountDrawerOpen}
    />
    <CreateOrganizationDrawer
      open={createOrgDrawerOpen}
      onOpenChange={setCreateOrgDrawerOpen}
    />
  </>
  );
}
