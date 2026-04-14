"use client";

import { useOrganization, useOrganizationList, useClerk, useUser } from "@clerk/nextjs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Check, ChevronDown, Plus, Settings, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function CustomOrgSwitcher() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const { user } = useUser();
  const clerk = useClerk();
  const { userMemberships, setActive, isLoaded: isListLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  if (!isOrgLoaded || !isListLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 animate-pulse">
        <div className="h-5 w-5 rounded bg-muted" />
        <div className="h-4 w-20 rounded bg-muted" />
      </div>
    );
  }

  const currentName = organization?.name ?? "Personal";
  const currentImage = organization?.imageUrl;
  const isPersonal = !organization;

  const handleOrgSwitch = async (orgId: string | null) => {
    if (setActive) {
      await setActive({ organization: orgId });
      // Force page reload to re-fetch data for new org context
      window.location.href = "/dashboard";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border",
            "px-2.5 py-1.5 text-sm font-medium",
            "outline-none transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          )}
          aria-label="Switch organization"
        >
          {isPersonal ? (
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/20">
              <User className="h-3 w-3 text-primary" />
            </div>
          ) : (
            <Avatar className="h-5 w-5">
              <AvatarImage src={currentImage} alt={currentName} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                {getInitials(currentName)}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="max-w-[140px] truncate hidden sm:inline">
            {currentName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-64 p-0 overflow-hidden"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-4 py-2.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Workspaces
          </p>
        </div>

        <DropdownMenuSeparator className="my-0" />

        {/* Personal Workspace */}
        <DropdownMenuItem
          className="gap-3 px-4 py-2.5 cursor-pointer"
          onClick={() => handleOrgSwitch(null)}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate">Personal</span>
            <span className="text-xs text-muted-foreground truncate">
              {user?.primaryEmailAddress?.emailAddress}
            </span>
          </div>
          {isPersonal && (
            <Check className="h-4 w-4 text-primary shrink-0" />
          )}
        </DropdownMenuItem>

        {/* Organization List */}
        {userMemberships?.data && userMemberships.data.length > 0 && (
          <>
            <DropdownMenuSeparator className="my-0" />
            {userMemberships.data.map((membership) => {
              const org = membership.organization;
              const isActive = organization?.id === org.id;
              return (
                <DropdownMenuItem
                  key={org.id}
                  className="gap-3 px-4 py-2.5 cursor-pointer"
                  onClick={() => handleOrgSwitch(org.id)}
                >
                  <Avatar className="h-8 w-8 rounded-md">
                    <AvatarImage src={org.imageUrl} alt={org.name} />
                    <AvatarFallback className="rounded-md bg-primary/20 text-primary text-xs font-bold">
                      {getInitials(org.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">
                      {org.name}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {membership.role.replace("org:", "")}
                    </span>
                  </div>
                  {isActive && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        {/* Manage current organization (only when org is active) */}
        {!isPersonal && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <DropdownMenuItem
              className="gap-3 px-4 py-2.5 cursor-pointer"
              onClick={() => clerk.openOrganizationProfile()}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Settings className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm">
                Manage Organization
              </span>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator className="my-0" />

        {/* Create Organization */}
        <DropdownMenuItem
          className="gap-3 px-4 py-2.5 cursor-pointer"
          onClick={() => clerk.openCreateOrganization()}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-border">
            <Plus className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground">
            Create Organization
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
