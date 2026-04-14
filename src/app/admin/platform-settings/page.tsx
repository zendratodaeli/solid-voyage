"use client";

/**
 * Super Admin — Platform Settings
 *
 * Manage the platform name, logo, favicon, and footer text.
 * Only accessible to platform super admins.
 */

import { useState, useEffect, useRef } from "react";
import { useSuperAdminGuard } from "@/hooks/useSuperAdminGuard";
import {
  Settings2,
  Upload,
  Save,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  Type,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";

interface PlatformSettings {
  id: string;
  platformName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  footerText: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export default function PlatformSettingsPage() {
  const { isSuperAdmin, loading: guardLoading } = useSuperAdminGuard();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    platformName: "Solid Voyage",
    logoUrl: "" as string | null,
    faviconUrl: "" as string | null,
    footerText: "Premium Maritime Freight Intelligence.",
  });

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSuperAdmin) fetchSettings();
  }, [isSuperAdmin]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/platform/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();
      setSettings(data);
      setFormData({
        platformName: data.platformName || "Solid Voyage",
        logoUrl: data.logoUrl || null,
        faviconUrl: data.faviconUrl || null,
        footerText: data.footerText || "Premium Maritime Freight Intelligence.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "logoUrl" | "faviconUrl"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 500KB for logo, 100KB for favicon)
    const maxSize = field === "logoUrl" ? 500 * 1024 : 100 * 1024;
    if (file.size > maxSize) {
      setError(
        `File too large. Maximum size: ${field === "logoUrl" ? "500KB" : "100KB"}`
      );
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setFormData((prev) => ({ ...prev, [field]: base64 }));
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const res = await fetch("/api/platform/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update settings");
      }

      const data = await res.json();
      setSettings(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (guardLoading || !isSuperAdmin || loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings2 className="h-8 w-8 text-primary" />
          Platform Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your platform&apos;s identity — name, logo, and branding across the entire application.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
          ✓ Platform settings updated successfully
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Platform Name */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Type className="h-5 w-5 text-blue-500" />
                Platform Name
              </CardTitle>
              <CardDescription>
                The name displayed in the sidebar, landing page, and browser tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="platformName">Name</Label>
                <Input
                  id="platformName"
                  value={formData.platformName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, platformName: e.target.value }))
                  }
                  placeholder="e.g., Solid Voyage"
                  className="text-lg font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footerText">Footer Tagline</Label>
                <Input
                  id="footerText"
                  value={formData.footerText || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, footerText: e.target.value }))
                  }
                  placeholder="e.g., Premium Maritime Freight Intelligence."
                />
                <p className="text-xs text-muted-foreground">
                  Shown in the landing page footer alongside the copyright notice.
                </p>
              </div>

              {/* Preview */}
              <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground mb-2">Preview</p>
                <div className="flex items-center gap-2">
                  {formData.logoUrl ? (
                    <img
                      src={formData.logoUrl}
                      alt="Logo preview"
                      className="h-6 w-6 rounded-md object-contain"
                    />
                  ) : (
                    <Image
                      src="/logo.svg"
                      alt="Default logo"
                      width={24}
                      height={24}
                      className="rounded-md"
                    />
                  )}
                  <span className="text-base font-bold">
                    {formData.platformName || "Solid Voyage"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  © {new Date().getFullYear()} {formData.platformName || "Solid Voyage"}.{" "}
                  {formData.footerText || ""}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Logo Upload */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-emerald-500" />
                Platform Logo
              </CardTitle>
              <CardDescription>
                Upload a logo for the sidebar, landing page, and PDF reports. Max 500KB, SVG or PNG recommended.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Logo Preview */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-muted/50 border border-border flex items-center justify-center overflow-hidden">
                  {formData.logoUrl ? (
                    <img
                      src={formData.logoUrl}
                      alt="Platform logo"
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <Image
                      src="/logo.svg"
                      alt="Default logo"
                      width={48}
                      height={48}
                      className="rounded-md"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={(e) => handleImageUpload(e, "logoUrl")}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Logo
                  </Button>
                  {formData.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, logoUrl: null }))
                      }
                      className="gap-2 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              {/* Favicon Upload */}
              <div className="border-t border-border pt-4 mt-4">
                <Label className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-purple-500" />
                  Favicon
                  <span className="text-muted-foreground font-normal text-xs">
                    (Max 100KB)
                  </span>
                </Label>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted/50 border border-border flex items-center justify-center overflow-hidden">
                    {formData.faviconUrl ? (
                      <img
                        src={formData.faviconUrl}
                        alt="Favicon"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/png,image/x-icon,image/svg+xml"
                      onChange={(e) => handleImageUpload(e, "faviconUrl")}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => faviconInputRef.current?.click()}
                      className="gap-2"
                    >
                      <Upload className="h-3 w-3" />
                      Upload
                    </Button>
                    {formData.faviconUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, faviconUrl: null }))
                        }
                        className="gap-1 text-red-400 hover:text-red-300 h-7 text-xs"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {settings?.updatedAt && (
              <>Last updated: {new Date(settings.updatedAt).toLocaleString()}</>
            )}
            {settings?.updatedBy && <> by {settings.updatedBy}</>}
          </p>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Platform Settings
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
