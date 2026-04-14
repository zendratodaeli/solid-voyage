"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Settings, User } from "lucide-react";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function CustomUserButton() {
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();

  if (!isLoaded || !user) {
    return (
      <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
    );
  }

  const fullName = user.fullName || user.firstName || "User";
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex items-center gap-2 rounded-full outline-none ring-offset-background transition-all hover:ring-2 hover:ring-ring hover:ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Open user menu"
        >
          <Avatar className="h-9 w-9 cursor-pointer">
            <AvatarImage src={user.imageUrl} alt={fullName} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-64 p-0 overflow-hidden"
        sideOffset={8}
      >
        {/* User Info Header */}
        <div className="px-4 py-3 bg-muted/50">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.imageUrl} alt={fullName} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate">
                {fullName}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {email}
              </span>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator className="my-0" />

        {/* Menu Items */}
        <div className="py-1.5">
          <DropdownMenuItem
            className="gap-2.5 px-4 py-2.5 cursor-pointer"
            onClick={() => openUserProfile()}
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Manage Account</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2.5 px-4 py-2.5 cursor-pointer"
            onClick={() => openUserProfile()}
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span>Settings</span>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="my-0" />

        <div className="py-1.5">
          <DropdownMenuItem
            className="gap-2.5 px-4 py-2.5 cursor-pointer text-destructive focus:text-destructive"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
