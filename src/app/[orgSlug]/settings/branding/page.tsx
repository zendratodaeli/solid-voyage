"use client";

/**
 * Organization Branding Settings Page
 * 
 * Allows premium org admins to customize:
 * - Accent color (applied globally via CSS variables)
 * 
 * Organization logo is managed via Clerk's org profile settings.
 * Non-premium users see a locked upgrade prompt.
 */

import { useState, useEffect } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useOrgTheme } from "@/components/auth/OrgThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Palette,
  Save,
  Lock,
  Crown,
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useOrgPath } from "@/hooks/useOrgPath";

// ─── Preset Colors ───────────────────────────────────────────────

const PRESET_COLORS = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Purple", value: "#a855f7" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
  { name: "Lime", value: "#84cc16" },
  { name: "Sky", value: "#0ea5e9" },
];

export default function BrandingPage() {
  const { organization, membership } = useOrganization();
  const { theme, refetch } = useOrgTheme();

  const [accentColor, setAccentColor] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [checkingPremium, setCheckingPremium] = useState(true);
  const { orgPath } = useOrgPath();

  const isAdmin = membership?.role === "org:admin";

  // Load existing theme
  useEffect(() => {
    if (theme) {
      setAccentColor(theme.accentColor ?? "");
    }
  }, [theme]);

  // Check premium status
  useEffect(() => {
    async function checkPremium() {
      if (!organization) {
        setIsPremium(false);
        setCheckingPremium(false);
        return;
      }
      try {
        const billingRes = await fetch("/api/usage");
        if (billingRes.ok) {
          const data = await billingRes.json();
          setIsPremium(data.data?.routePlanner?.isPaid ?? false);
        } else {
          setIsPremium(false);
        }
      } catch {
        setIsPremium(false);
      } finally {
        setCheckingPremium(false);
      }
    }
    checkPremium();
  }, [organization]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/org-theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accentColor: accentColor || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      setSaveSuccess(true);
      refetch(); // Refresh the theme provider
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setAccentColor("");
    
    setSaving(true);
    try {
      await fetch("/api/org-theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accentColor: null,
          currency: "USD",
        }),
      });
      refetch();
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  // ─── No Org Selected ────────────────────────────────────────────

  if (!organization) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="rounded-xl border bg-card p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-muted mx-auto">
            <Palette className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Organization Branding</h1>
          <p className="text-muted-foreground">
            Switch to an organization workspace to customize branding.
          </p>
        </div>
      </div>
    );
  }

  // ─── Loading ────────────────────────────────────────────────────

  if (checkingPremium) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="rounded-xl border bg-card p-8 text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Checking plan status...</p>
        </div>
      </div>
    );
  }

  // ─── Premium Gate ───────────────────────────────────────────────

  if (!isPremium) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Locked Header */}
          <div className="relative p-8 text-center space-y-4 bg-gradient-to-b from-amber-500/10 to-transparent">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500/20 mx-auto">
              <Lock className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold">Organization Branding</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Customize your organization&apos;s accent color.
              This feature is available on the{" "}
              <span className="font-semibold text-foreground">Solid Starter</span> plan.
            </p>
          </div>

          {/* Feature Preview (blurred) */}
          <div className="p-6 space-y-6 opacity-50 pointer-events-none select-none">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Accent Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.slice(0, 6).map((color) => (
                  <div
                    key={color.value}
                    className="h-8 w-8 rounded-full border-2 border-transparent"
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
            </div>

          </div>

          {/* CTA */}
          <div className="p-6 pt-0">
            <Link href={orgPath("/pricing")}>
              <Button className="w-full gap-2" size="lg">
                <Crown className="h-4 w-4" />
                Upgrade to Solid Starter
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Not Admin ──────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="rounded-xl border bg-card p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-muted mx-auto">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Admin Access Required</h1>
          <p className="text-muted-foreground">
            Only organization admins can customize branding settings.
          </p>
        </div>
      </div>
    );
  }

  // ─── Branding Settings ──────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          Premium Feature
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Branding</h1>
        <p className="text-muted-foreground">
          Customize how {organization.name} looks across the dashboard.
        </p>
      </div>

      {/* Settings Card */}
      <div className="rounded-xl border bg-card divide-y">
        {/* Accent Color */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Palette className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Accent Color</h3>
              <p className="text-sm text-muted-foreground">
                Applied to buttons, active states, and highlights
              </p>
            </div>
          </div>

          {/* Preset Swatches */}
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.value}
                className={cn(
                  "h-9 w-9 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center",
                  accentColor === color.value
                    ? "border-foreground ring-2 ring-offset-2 ring-offset-background ring-foreground/20"
                    : "border-transparent"
                )}
                style={{ backgroundColor: color.value }}
                onClick={() => setAccentColor(color.value)}
                title={color.name}
              >
                {accentColor === color.value && (
                  <Check className="h-4 w-4 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>

          {/* Custom hex input */}
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-full border-2 border-border shrink-0"
              style={{ backgroundColor: accentColor || "transparent" }}
            />
            <Input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="#6366f1"
              className="max-w-[160px] font-mono text-sm"
             />
            {accentColor && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAccentColor("")}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>


      {/* Live Preview */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          Preview
        </h3>
        <div className="flex items-center gap-6">
          {/* Mini sidebar preview */}
          <div className="w-48 rounded-lg border bg-sidebar overflow-hidden">
            <div className="h-10 border-b border-sidebar-border flex items-center px-3 gap-2">
              {organization?.imageUrl ? (
                <img
                  src={organization.imageUrl}
                  alt="Logo"
                  className="h-5 w-5 rounded object-contain"
                />
              ) : (
                <div
                  className="h-5 w-5 rounded"
                  style={{ backgroundColor: accentColor || "var(--primary)" }}
                />
              )}
              <span className="text-xs font-bold text-sidebar-foreground truncate">
                {organization?.name || "Solid Voyage"}
              </span>
            </div>
            <div className="p-2 space-y-1">
              <div
                className="h-7 rounded-md flex items-center px-2 text-[10px] font-medium text-white"
                style={{ backgroundColor: accentColor || "var(--primary)" }}
              >
                Dashboard
              </div>
              <div className="h-7 rounded-md flex items-center px-2 text-[10px] text-sidebar-foreground bg-transparent">
                Voyages
              </div>
              <div className="h-7 rounded-md flex items-center px-2 text-[10px] text-sidebar-foreground bg-transparent">
                Vessels
              </div>
            </div>
          </div>

          {/* Button preview */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Buttons & Accents</p>
            <div className="flex gap-2">
              <div
                className="px-4 py-2 rounded-md text-xs font-medium text-white"
                style={{ backgroundColor: accentColor || "var(--primary)" }}
              >
                Primary Button
              </div>
              <div
                className="px-4 py-2 rounded-md text-xs font-medium border"
                style={{
                  borderColor: accentColor || "var(--primary)",
                  color: accentColor || "var(--primary)",
                }}
              >
                Outline Button
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <Check className="h-4 w-4" />
          Branding saved successfully! Changes are now live.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Branding
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={saving}
          className="gap-2 text-muted-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Default
        </Button>
      </div>
    </div>
  );
}
