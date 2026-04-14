"use client";

/**
 * CreateOrganizationDrawer
 *
 * Custom replacement for Clerk's `openCreateOrganization()` modal.
 * Uses Sheet (slide-over drawer) with:
 *   - Organization name input with live slug preview
 *   - Optional logo upload
 *   - Creates org via Clerk SDK, sets active, and navigates
 *
 * Fully themed to match the app's dark/light mode.
 * Kept separate from the Clerk built-in so the user can compare both.
 */

import { useState, useRef, useCallback } from "react";
import { useOrganizationList } from "@clerk/nextjs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Plus,
  Loader2,
  Link2,
  Upload,
  Trash2,
  Sparkles,
  ArrowRight,
  AlertCircle,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function toUrlSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CreateOrganizationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrganizationDrawer({
  open,
  onOpenChange,
}: CreateOrganizationDrawerProps) {
  const { createOrganization, setActive, isLoaded } = useOrganizationList();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [orgName, setOrgName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [useCustomSlug, setUseCustomSlug] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Logo state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Derived
  const autoSlug = toUrlSlug(orgName);
  const finalSlug = useCustomSlug ? toUrlSlug(customSlug) : autoSlug;
  const isValid = orgName.trim().length >= 2;

  // ─── Logo Handling ─────────────────────────────────────────────

  const handleLogoSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image must be under 10 MB");
        return;
      }

      setLogoFile(file);
      const url = URL.createObjectURL(file);
      setLogoPreview(url);
    },
    []
  );

  const handleLogoRemove = useCallback(() => {
    setLogoFile(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [logoPreview]);

  // ─── Create Organization ───────────────────────────────────────

  const handleCreate = async () => {
    if (!isValid || !createOrganization || !setActive) return;

    setCreating(true);
    setError(null);

    try {
      // Create the organization
      const org = await createOrganization({
        name: orgName.trim(),
        slug: finalSlug || undefined,
      });

      // Upload logo if provided
      if (logoFile && org) {
        try {
          await org.setLogo({ file: logoFile });
        } catch (logoErr) {
          // Non-fatal — org already created
          console.warn("Logo upload failed after org creation:", logoErr);
        }
      }

      // Set as active organization
      await setActive({ organization: org.id });

      toast.success(`"${org.name}" created successfully!`);

      // Reset form
      setOrgName("");
      setCustomSlug("");
      setUseCustomSlug(false);
      handleLogoRemove();
      onOpenChange(false);

      // Navigate to new org
      const slug = org.slug || toUrlSlug(org.name);
      window.location.href = `/${slug}/dashboard`;
    } catch (err: any) {
      const message =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        "Failed to create organization. Please try again.";
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state on close
      setOrgName("");
      setCustomSlug("");
      setUseCustomSlug(false);
      setError(null);
      handleLogoRemove();
    }
    onOpenChange(newOpen);
  };

  if (!isLoaded) return null;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[440px] p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* ─── Header ─── */}
        <div className="px-6 pt-6 pb-5 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border-b border-border/50">
          <SheetHeader className="p-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-xl font-bold tracking-tight">
                  New Organization
                </SheetTitle>
                <SheetDescription className="text-sm">
                  Create a workspace for your team
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* ─── Form Content ─── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Live Preview Card */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 p-5 space-y-4">
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
              Preview
            </p>
            <div className="flex items-center gap-3.5">
              {/* Logo preview */}
              <div className="relative shrink-0">
                {logoPreview ? (
                  <div className="h-14 w-14 rounded-xl overflow-hidden ring-2 ring-primary/20">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <Avatar className="h-14 w-14 rounded-xl ring-2 ring-border/30">
                    <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-lg font-bold">
                      {orgName ? getInitials(orgName) : (
                        <Building2 className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className={cn(
                    "text-base font-bold truncate transition-colors",
                    orgName ? "text-foreground" : "text-muted-foreground/40"
                  )}
                >
                  {orgName || "Organization Name"}
                </h3>
                <p className="text-xs text-muted-foreground/60 font-mono truncate">
                  /{finalSlug || "slug"}
                </p>
              </div>
            </div>
          </div>

          {/* Organization Name */}
          <div className="space-y-2">
            <Label htmlFor="org-name" className="text-sm font-medium">
              Organization Name{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="org-name"
              placeholder="e.g. Oceanic Shipping Ltd."
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="h-11"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              This is the name that appears in the sidebar and all shared content.
            </p>
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                URL Slug
              </Label>
              <button
                type="button"
                onClick={() => setUseCustomSlug(!useCustomSlug)}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                {useCustomSlug ? "Use auto-generated" : "Customize"}
              </button>
            </div>

            {useCustomSlug ? (
              <Input
                placeholder="custom-slug"
                value={customSlug}
                onChange={(e) =>
                  setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                className="h-10 font-mono text-sm"
              />
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border border-border/50 text-sm text-muted-foreground font-mono">
                /{autoSlug || "..."}
              </div>
            )}
          </div>

          <Separator />

          {/* Logo Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
                <ImageIcon className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <h3 className="text-sm font-semibold">
                Logo{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (optional)
                </span>
              </h3>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
              onChange={handleLogoSelect}
              className="hidden"
              id="org-logo-upload"
            />

            {logoPreview ? (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg overflow-hidden border border-border/50">
                  <img
                    src={logoPreview}
                    alt="Selected logo"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3" />
                    Change
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-destructive"
                    onClick={handleLogoRemove}
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-border/60 bg-muted/30 hover:bg-muted/50 hover:border-border text-muted-foreground hover:text-foreground transition-all group"
              >
                <Upload className="h-4 w-4 group-hover:text-primary transition-colors" />
                <span className="text-sm font-medium">Upload Logo</span>
              </button>
            )}

            <p className="text-xs text-muted-foreground">
              Square image recommended, at least 256×256px. PNG or SVG preferred.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-6 py-4 border-t border-border/50 bg-muted/20">
          <Button
            type="button"
            className="w-full h-11 gap-2 text-sm font-semibold"
            disabled={!isValid || creating}
            onClick={handleCreate}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {creating ? "Creating..." : "Create Organization"}
            {!creating && <ArrowRight className="h-4 w-4 ml-auto" />}
          </Button>
          <p className="text-[10px] text-muted-foreground/50 text-center mt-2 flex items-center justify-center gap-1">
            You&apos;ll be automatically switched to the new workspace
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
