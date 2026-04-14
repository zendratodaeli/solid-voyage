"use client";

/**
 * UnifiedSettings — All organization settings in one page
 *
 * Combines Organization Profile + Branding into card sections:
 *  1. Company Logo (upload, size, shape)
 *  2. Company Identity (legal name, address, city, country)
 *  3. Primary Contact (name, nickname, phone, department)
 *  4. Branding (accent color) — premium-gated
 *  5. Approval Chain — coming soon placeholder
 *
 * Single Save button saves both org profile AND branding.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useOrgProfile } from "@/components/auth/OrgProfileProvider";
import { useOrgTheme } from "@/components/auth/OrgThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  User,
  Loader2,
  Check,
  Shield,
  Save,
  Phone,
  Briefcase,
  AlertCircle,
  Pencil,
  Eye,
  Upload,
  Trash2,
  ImageIcon,
  Palette,
  Lock,
  Crown,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useOrgPath } from "@/hooks/useOrgPath";

// ─── Constants ──────────────────────────────────────────────────

const BORDER_RADIUS_OPTIONS = [
  { value: "none", label: "Square", css: "0px" },
  { value: "sm", label: "Small", css: "4px" },
  { value: "md", label: "Medium", css: "8px" },
  { value: "lg", label: "Large", css: "16px" },
  { value: "full", label: "Circle", css: "50%" },
] as const;

function getBorderRadiusCss(value: string): string {
  return BORDER_RADIUS_OPTIONS.find((o) => o.value === value)?.css ?? "8px";
}

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

const PRIORITY_COUNTRIES = [
  "Greece", "Norway", "Singapore", "United Kingdom", "Denmark",
  "Germany", "Netherlands", "Japan", "South Korea", "China",
  "United States", "United Arab Emirates", "Turkey", "India",
  "Hong Kong", "Italy", "France", "Switzerland", "Monaco",
  "Marshall Islands", "Panama", "Liberia", "Cyprus", "Malta",
  "Bahamas", "Bermuda", "Indonesia", "Philippines", "Taiwan", "Brazil",
];

const OTHER_COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola",
  "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahrain", "Bangladesh", "Belgium", "Bolivia", "Canada",
  "Chile", "Colombia", "Croatia", "Cuba", "Czech Republic",
  "Ecuador", "Egypt", "Estonia", "Ethiopia", "Finland",
  "Georgia", "Ghana", "Hungary", "Iceland", "Iran",
  "Iraq", "Ireland", "Israel", "Jamaica", "Jordan",
  "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon",
  "Lithuania", "Luxembourg", "Malaysia", "Mexico", "Morocco",
  "Mozambique", "Myanmar", "New Zealand", "Nigeria", "Oman",
  "Pakistan", "Peru", "Poland", "Portugal", "Qatar",
  "Romania", "Russia", "Saudi Arabia", "Serbia", "Slovakia",
  "Slovenia", "South Africa", "Spain", "Sri Lanka", "Sweden",
  "Thailand", "Tunisia", "Ukraine", "Uruguay", "Venezuela",
  "Vietnam", "Yemen",
].filter((c) => !PRIORITY_COUNTRIES.includes(c));

const ALL_COUNTRIES = [...PRIORITY_COUNTRIES, "---", ...OTHER_COUNTRIES];

const DEPARTMENTS = [
  "Chartering", "Operations", "Technical", "Commercial",
  "Finance", "Crewing", "QHSE", "Management", "Other",
];

// ─── Collapsible Section ─────────────────────────────────────────

function Section({
  title,
  icon,
  iconBg,
  iconColor,
  badge,
  defaultOpen = true,
  disabled = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-colors",
      disabled && "opacity-60"
    )}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-3 p-5 transition-colors",
          !disabled && "hover:bg-accent/30 cursor-pointer",
          disabled && "cursor-not-allowed"
        )}
      >
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", iconBg)}>
          {icon}
        </div>
        <div className="flex-1 text-left">
          <h2 className="font-semibold text-sm">{title}</h2>
        </div>
        {badge}
        {!disabled && (
          open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        )}
        {disabled && <Lock className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && !disabled && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/50 pt-4 animate-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function UnifiedSettings() {
  const { organization, membership } = useOrganization();
  const { profile, refetch: refetchProfile } = useOrgProfile();
  const { theme, refetch: refetchTheme } = useOrgTheme();
  const isAdmin = membership?.role === "org:admin";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { orgPath } = useOrgPath();

  // ─── Profile form state ─────────────────────────────────────────
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyCountry, setCompanyCountry] = useState("");
  const [companyPostalCode, setCompanyPostalCode] = useState("");
  const [contactFullName, setContactFullName] = useState("");
  const [contactNickname, setContactNickname] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactDepartment, setContactDepartment] = useState("");

  // ─── Logo state ────────────────────────────────────────────────
  const [logoSize, setLogoSize] = useState(64);
  const [logoBorderRadius, setLogoBorderRadius] = useState("md");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // ─── Branding state ────────────────────────────────────────────
  const [accentColor, setAccentColor] = useState<string>("");
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [checkingPremium, setCheckingPremium] = useState(true);

  // ─── Save state ────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Pre-fill from existing profile
  useEffect(() => {
    if (profile && !loaded) {
      setCompanyLegalName(profile.companyLegalName ?? "");
      setCompanyAddress(profile.companyAddress ?? "");
      setCompanyCity(profile.companyCity ?? "");
      setCompanyCountry(profile.companyCountry ?? "");
      setCompanyPostalCode(profile.companyPostalCode ?? "");
      setContactFullName(profile.contactFullName ?? "");
      setContactNickname(profile.contactNickname ?? "");
      setContactPhone(profile.contactPhone ?? "");
      setContactDepartment(profile.contactDepartment ?? "");
      setLogoSize(profile.logoSize ?? 64);
      setLogoBorderRadius(profile.logoBorderRadius ?? "md");
      setLoaded(true);
    }
  }, [profile, loaded]);

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

  const isFormValid =
    companyLegalName.trim() &&
    companyAddress.trim() &&
    companyCity.trim() &&
    companyCountry.trim() &&
    contactFullName.trim() &&
    contactNickname.trim();

  // ─── Logo Upload ──────────────────────────────────────────────

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization || !isAdmin) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file (PNG, JPG, SVG, etc.)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setLogoError("Image must be under 10 MB.");
      return;
    }

    setUploadingLogo(true);
    setLogoError(null);

    try {
      await organization.setLogo({ file });
      await fetch("/api/org-logo", { method: "POST" });
      refetchProfile();
    } catch (err) {
      console.error("Logo upload failed:", err);
      setLogoError("Failed to upload logo. Please try again.");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [organization, isAdmin, refetchProfile]);

  const handleLogoRemove = useCallback(async () => {
    if (!organization || !isAdmin) return;

    setRemovingLogo(true);
    setLogoError(null);

    try {
      await organization.setLogo({ file: null });
      await fetch("/api/org-logo", { method: "POST" });
      refetchProfile();
    } catch (err) {
      console.error("Logo removal failed:", err);
      setLogoError("Failed to remove logo. Please try again.");
    } finally {
      setRemovingLogo(false);
    }
  }, [organization, isAdmin, refetchProfile]);

  // ─── Save All ─────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || saving || !isAdmin) return;

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      // Save profile and branding in parallel
      const [profileRes, brandingRes] = await Promise.all([
        fetch("/api/org-profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyLegalName: companyLegalName.trim(),
            companyAddress: companyAddress.trim(),
            companyCity: companyCity.trim(),
            companyCountry: companyCountry.trim(),
            companyPostalCode: companyPostalCode.trim() || null,
            contactFullName: contactFullName.trim(),
            contactNickname: contactNickname.trim(),
            contactPhone: contactPhone.trim() || null,
            contactDepartment: contactDepartment.trim() || null,
            logoSize,
            logoBorderRadius,
          }),
        }),
        // Only save branding if premium
        isPremium
          ? fetch("/api/org-theme", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accentColor: accentColor || null,
              }),
            })
          : Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
      ]);

      const profileData = await profileRes.json();
      if (!profileRes.ok) {
        setError(profileData.error || "Failed to save profile");
        return;
      }

      if (isPremium) {
        const brandingData = await brandingRes.json();
        if (!brandingRes.ok) {
          setError(brandingData.error || "Failed to save branding");
          return;
        }
      }

      setSaveSuccess(true);
      refetchProfile();
      if (isPremium) refetchTheme();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleBrandingReset = () => {
    setAccentColor("");
  };

  // ─── Derived ────────────────────────────────────────────────

  const currentLogoUrl = organization?.imageUrl;
  const hasCustomLogo = !!currentLogoUrl && !currentLogoUrl.includes("/default/");
  const previewBorderRadius = getBorderRadiusCss(logoBorderRadius);

  // ─── No Org ────────────────────────────────────────────────

  if (!organization) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="rounded-xl border bg-card p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-muted mx-auto">
            <Settings className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Switch to an organization workspace to manage settings.
          </p>
        </div>
      </div>
    );
  }

  // ─── Settings Page ─────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
          {isAdmin ? (
            <>
              <Pencil className="h-3.5 w-3.5" />
              Admin — Editable
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" />
              View Only
            </>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? `Manage ${organization.name}'s identity, contact, branding, and workflow settings.`
            : `View ${organization.name}'s settings. Only admins can edit.`}
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* ═══ 1. Company Logo ══════════════════════════════════════ */}
        <Section
          title="Company Logo"
          icon={<ImageIcon className="h-4 w-4 text-violet-500" />}
          iconBg="bg-violet-500/15"
          iconColor="text-violet-500"
        >
          <p className="text-xs text-muted-foreground -mt-1">
            Your logo appears in the sidebar, PDFs, and shared content
          </p>

          {/* Logo preview + upload */}
          <div className="flex items-start gap-6">
            {/* Preview */}
            <div className="shrink-0">
              <div
                className={cn(
                  "relative overflow-hidden flex items-center justify-center transition-all duration-200",
                  hasCustomLogo
                    ? ""
                    : "border-2 border-dashed border-border bg-muted/50"
                )}
                style={{
                  width: Math.max(logoSize, 64),
                  height: Math.max(logoSize, 64),
                  borderRadius: previewBorderRadius,
                }}
              >
                {hasCustomLogo ? (
                  <img
                    src={currentLogoUrl}
                    alt={`${organization.name} logo`}
                    className="absolute inset-0 w-full h-full object-cover transition-all duration-200"
                  />
                ) : (
                  <Building2 className="h-8 w-8 text-muted-foreground/40" />
                )}
                {(uploadingLogo || removingLogo) && (
                  <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>

            {/* Upload controls */}
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload-input"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={uploadingLogo || removingLogo}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingLogo ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {hasCustomLogo ? "Change Logo" : "Upload Logo"}
                    </Button>
                    {hasCustomLogo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-muted-foreground hover:text-destructive"
                        disabled={uploadingLogo || removingLogo}
                        onClick={handleLogoRemove}
                      >
                        {removingLogo ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Remove
                      </Button>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended: Square image, at least 256×256px. PNG or SVG preferred.
              </p>
              {logoError && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {logoError}
                </div>
              )}
            </div>
          </div>

          {/* Logo Size Slider */}
          {hasCustomLogo && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Logo Size</Label>
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  {logoSize}px
                </span>
              </div>
              <Slider
                value={[logoSize]}
                onValueChange={([v]) => setLogoSize(v)}
                min={32}
                max={128}
                step={4}
                disabled={!isAdmin}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/60">
                <span>32px</span>
                <span>128px</span>
              </div>
            </div>
          )}

          {/* Border Radius Selector */}
          {hasCustomLogo && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              <Label className="text-sm font-medium">Logo Shape</Label>
              <div className="flex items-center gap-2">
                {BORDER_RADIUS_OPTIONS.map((option) => {
                  const isSelected = logoBorderRadius === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!isAdmin}
                      className={cn(
                        "relative group flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all duration-150",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-transparent hover:border-border hover:bg-muted/50",
                        !isAdmin && "opacity-50 cursor-not-allowed"
                      )}
                      onClick={() => setLogoBorderRadius(option.value)}
                      title={option.label}
                    >
                      <div
                        className={cn(
                          "h-8 w-8 transition-all duration-200",
                          isSelected
                            ? "bg-primary"
                            : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
                        )}
                        style={{ borderRadius: option.css }}
                      />
                      <span
                        className={cn(
                          "text-[10px] font-medium transition-colors",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {option.label}
                      </span>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        {/* ═══ 2. Company Identity ══════════════════════════════════ */}
        <Section
          title="Company Identity"
          icon={<Building2 className="h-4 w-4 text-blue-500" />}
          iconBg="bg-blue-500/15"
          iconColor="text-blue-500"
          badge={<span className="text-[10px] text-muted-foreground">Legal entity details</span>}
        >
          <div className="space-y-2">
            <Label htmlFor="companyLegalName" className="text-sm font-medium">
              Company Legal Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="companyLegalName"
              placeholder="e.g. Oceanic Shipping Ltd."
              value={companyLegalName}
              onChange={(e) => setCompanyLegalName(e.target.value)}
              disabled={!isAdmin}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyAddress" className="text-sm font-medium">
              Street Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="companyAddress"
              placeholder="e.g. 42 Akti Miaouli"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              disabled={!isAdmin}
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyCity" className="text-sm font-medium">
                City <span className="text-destructive">*</span>
              </Label>
              <Input
                id="companyCity"
                placeholder="e.g. Piraeus"
                value={companyCity}
                onChange={(e) => setCompanyCity(e.target.value)}
                disabled={!isAdmin}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyPostalCode" className="text-sm font-medium">
                Postal Code
              </Label>
              <Input
                id="companyPostalCode"
                placeholder="e.g. 185 35"
                value={companyPostalCode}
                onChange={(e) => setCompanyPostalCode(e.target.value)}
                disabled={!isAdmin}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settingsCompanyCountry" className="text-sm font-medium">
              Country <span className="text-destructive">*</span>
            </Label>
            <Select
              value={companyCountry}
              onValueChange={setCompanyCountry}
              disabled={!isAdmin}
            >
              <SelectTrigger id="settingsCompanyCountry" className="h-11">
                <SelectValue placeholder="Select country..." />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                {ALL_COUNTRIES.map((country) =>
                  country === "---" ? (
                    <div key="divider" className="my-1 border-t border-border" />
                  ) : (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* ═══ 3. Primary Contact ══════════════════════════════════ */}
        <Section
          title="Primary Contact"
          icon={<User className="h-4 w-4 text-emerald-500" />}
          iconBg="bg-emerald-500/15"
          iconColor="text-emerald-500"
          badge={<span className="text-[10px] text-muted-foreground">Main point of contact</span>}
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactFullName" className="text-sm font-medium">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contactFullName"
                placeholder="e.g. Nikolaos Papadopoulos"
                value={contactFullName}
                onChange={(e) => setContactFullName(e.target.value)}
                disabled={!isAdmin}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactNickname" className="text-sm font-medium">
                Nickname <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contactNickname"
                placeholder="e.g. Nikos"
                value={contactNickname}
                onChange={(e) => setContactNickname(e.target.value)}
                disabled={!isAdmin}
                className="h-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactPhone" className="text-sm font-medium flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                Phone
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="contactPhone"
                placeholder="e.g. +30 210 458 1234"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                disabled={!isAdmin}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settingsContactDepartment" className="text-sm font-medium flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                Department
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select
                value={contactDepartment}
                onValueChange={setContactDepartment}
                disabled={!isAdmin}
              >
                <SelectTrigger id="settingsContactDepartment" className="h-11">
                  <SelectValue placeholder="Select department..." />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        {/* ═══ 4. Branding (Premium-Gated) ═══════════════════════════ */}
        {checkingPremium ? (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        ) : isPremium ? (
          <Section
            title="Branding"
            icon={<Palette className="h-4 w-4 text-primary" />}
            iconBg="bg-primary/15"
            iconColor="text-primary"
            badge={
              <span className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                <Sparkles className="h-3 w-3" />
                Premium
              </span>
            }
            defaultOpen={false}
          >
            {!isAdmin ? (
              <p className="text-sm text-muted-foreground">Only admins can customize branding.</p>
            ) : (
              <>
                <div>
                  <h3 className="font-medium text-sm mb-1">Accent Color</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Applied to buttons, active states, and highlights
                  </p>
                </div>

                {/* Preset Swatches */}
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
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
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleBrandingReset}
                      className="text-muted-foreground gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </Button>
                  )}
                </div>

                {/* Live Preview */}
                <div className="pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">
                    Preview
                  </p>
                  <div className="flex items-center gap-6">
                    <div className="w-48 rounded-lg border bg-sidebar overflow-hidden">
                      <div className="h-10 border-b border-sidebar-border flex items-center px-3 gap-2">
                        {hasCustomLogo ? (
                          <img
                            src={currentLogoUrl}
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
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">Buttons & Accents</p>
                      <div className="flex gap-2">
                        <div
                          className="px-4 py-2 rounded-md text-xs font-medium text-white"
                          style={{ backgroundColor: accentColor || "var(--primary)" }}
                        >
                          Primary
                        </div>
                        <div
                          className="px-4 py-2 rounded-md text-xs font-medium border"
                          style={{
                            borderColor: accentColor || "var(--primary)",
                            color: accentColor || "var(--primary)",
                          }}
                        >
                          Outline
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Section>
        ) : (
          /* Non-premium: show locked branding card */
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center gap-3 p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 shrink-0">
                <Lock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-sm">Branding</h2>
                <p className="text-xs text-muted-foreground">
                  Customize accent colors — available on <span className="font-semibold text-foreground">Solid Starter</span> plan
                </p>
              </div>
              <Link href={orgPath("/pricing")}>
                <Button size="sm" className="gap-1.5">
                  <Crown className="h-3.5 w-3.5" />
                  Upgrade
                </Button>
              </Link>
            </div>
            {/* Blurred preview */}
            <div className="px-5 pb-5 opacity-40 pointer-events-none select-none">
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
        )}

        {/* ═══ 5. Approval Chain (Coming Soon) ══════════════════════ */}
        <Section
          title="Approval Chain"
          icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
          iconBg="bg-muted"
          iconColor="text-muted-foreground"
          badge={
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
          }
          disabled={true}
        >
          <p>Placeholder</p>
        </Section>

        {/* Error / Success */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {saveSuccess && (
          <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <Check className="h-4 w-4" />
            Settings saved successfully!
          </div>
        )}

        {/* Save Button */}
        {isAdmin && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!isFormValid || saving} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        )}
      </form>

      {/* Security note */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
        <Shield className="h-3.5 w-3.5" />
        Your data is stored securely and used only for platform identification
      </div>
    </div>
  );
}
