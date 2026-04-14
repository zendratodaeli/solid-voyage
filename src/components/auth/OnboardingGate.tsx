"use client";

/**
 * OnboardingGate
 * 
 * Premium-feeling onboarding form that renders in the main content area
 * when an organization's profile is incomplete. The sidebar remains visible
 * so the user has context, but the content area shows only this form.
 * 
 * Only org admins can submit. Members see a read-only message asking
 * their admin to complete setup.
 */

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useOrgProfile } from "@/components/auth/OrgProfileProvider";
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
  Building2,
  MapPin,
  User,
  Loader2,
  Check,
  Shield,
  Anchor,
  Phone,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Maritime-relevant countries, prioritized ────────────────────

const PRIORITY_COUNTRIES = [
  "Greece",
  "Norway",
  "Singapore",
  "United Kingdom",
  "Denmark",
  "Germany",
  "Netherlands",
  "Japan",
  "South Korea",
  "China",
  "United States",
  "United Arab Emirates",
  "Turkey",
  "India",
  "Hong Kong",
  "Italy",
  "France",
  "Switzerland",
  "Monaco",
  "Marshall Islands",
  "Panama",
  "Liberia",
  "Cyprus",
  "Malta",
  "Bahamas",
  "Bermuda",
  "Indonesia",
  "Philippines",
  "Taiwan",
  "Brazil",
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

// ─── Department options ──────────────────────────────────────────

const DEPARTMENTS = [
  "Chartering",
  "Operations",
  "Technical",
  "Commercial",
  "Finance",
  "Crewing",
  "QHSE",
  "Management",
  "Other",
];

export function OnboardingGate() {
  const { organization, membership } = useOrganization();
  const { profile, refetch } = useOrgProfile();
  const isAdmin = membership?.role === "org:admin";

  // ─── Form State ────────────────────────────────────────────
  const [companyLegalName, setCompanyLegalName] = useState(profile?.companyLegalName ?? "");
  const [companyAddress, setCompanyAddress] = useState(profile?.companyAddress ?? "");
  const [companyCity, setCompanyCity] = useState(profile?.companyCity ?? "");
  const [companyCountry, setCompanyCountry] = useState(profile?.companyCountry ?? "");
  const [companyPostalCode, setCompanyPostalCode] = useState(profile?.companyPostalCode ?? "");
  const [contactFullName, setContactFullName] = useState(profile?.contactFullName ?? "");
  const [contactNickname, setContactNickname] = useState(profile?.contactNickname ?? "");
  const [contactPhone, setContactPhone] = useState(profile?.contactPhone ?? "");
  const [contactDepartment, setContactDepartment] = useState(profile?.contactDepartment ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Required fields validation
  const isFormValid =
    companyLegalName.trim() &&
    companyAddress.trim() &&
    companyCity.trim() &&
    companyCountry.trim() &&
    contactFullName.trim() &&
    contactNickname.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || saving) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/org-profile", {
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save profile");
        return;
      }

      // Success — refetch profile state → gate lifts automatically
      refetch();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Non-Admin View ────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] px-4">
        <div className="max-w-lg w-full text-center space-y-6">
          {/* Icon */}
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-amber-500/15 mx-auto">
            <Shield className="h-10 w-10 text-amber-500" />
          </div>

          <div className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight">
              Organization Setup Required
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Your organization admin needs to complete the company profile setup
              before you can access the platform. Please contact your admin to
              complete this step.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for admin setup...
          </div>
        </div>
      </div>
    );
  }

  // ─── Admin Onboarding Form ─────────────────────────────────

  return (
    <div className="flex items-start justify-center min-h-[80vh] px-4 py-8">
      <div className="max-w-2xl w-full space-y-6">
        {/* ─── Header ─────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border bg-card">
          {/* Gradient header */}
          <div className="relative px-8 pt-8 pb-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            {/* Decorative dots */}
            <div className="absolute top-4 right-4 flex gap-1 opacity-20">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-2 w-2 rounded-full bg-primary" />
              ))}
            </div>

            <div className="flex items-center gap-4">
              {organization?.imageUrl ? (
                <img
                  src={organization.imageUrl}
                  alt={organization.name}
                  className="h-14 w-14 rounded-xl object-contain border bg-background/80 p-1"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Anchor className="h-7 w-7 text-primary" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Complete Your Profile
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Set up <strong>{organization?.name}</strong>&apos;s identity to unlock all platform features
                </p>
              </div>
            </div>

            {/* Progress indicator */}
            <div className="mt-5 flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-primary/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                  style={{ width: isFormValid ? "100%" : "15%" }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                {isFormValid ? "Ready to submit" : "Fill required fields"}
              </span>
            </div>
          </div>

          {/* ─── Form Body ─────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="p-8 pt-6 space-y-8">
            {/* ── Section 1: Company Identity ──────────────── */}
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-border">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
                  <Building2 className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Company Identity</h2>
                  <p className="text-xs text-muted-foreground">Legal entity details for your organization</p>
                </div>
              </div>

              {/* Company Legal Name */}
              <div className="space-y-2">
                <Label htmlFor="companyLegalName" className="text-sm font-medium">
                  Company Legal Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="companyLegalName"
                  placeholder="e.g. Oceanic Shipping Ltd."
                  value={companyLegalName}
                  onChange={(e) => setCompanyLegalName(e.target.value)}
                  className="h-11"
                />
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="companyAddress" className="text-sm font-medium">
                  Street Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="companyAddress"
                  placeholder="e.g. 42 Akti Miaouli"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="h-11"
                />
              </div>

              {/* City + Postal Code — side by side */}
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
                    className="h-11"
                  />
                </div>
              </div>

              {/* Country */}
              <div className="space-y-2">
                <Label htmlFor="companyCountry" className="text-sm font-medium">
                  Country <span className="text-destructive">*</span>
                </Label>
                <Select value={companyCountry} onValueChange={setCompanyCountry}>
                  <SelectTrigger id="companyCountry" className="h-11">
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
            </div>

            {/* ── Section 2: Primary Contact ───────────────── */}
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-border">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
                  <User className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Primary Contact</h2>
                  <p className="text-xs text-muted-foreground">Main point of contact for chartering & operations</p>
                </div>
              </div>

              {/* Full Name + Nickname — side by side */}
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
                    className="h-11"
                  />
                </div>
              </div>

              {/* Phone + Department — side by side */}
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
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactDepartment" className="text-sm font-medium flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    Department
                    <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Select value={contactDepartment} onValueChange={setContactDepartment}>
                    <SelectTrigger id="contactDepartment" className="h-11">
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
            </div>

            {/* ── Error ────────────────────────────────────── */}
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {/* ── Submit ───────────────────────────────────── */}
            <div className="flex items-center gap-4 pt-2">
              <Button
                type="submit"
                size="lg"
                disabled={!isFormValid || saving}
                className={cn(
                  "gap-2 min-w-[200px] transition-all duration-300",
                  isFormValid && !saving && "shadow-lg shadow-primary/25"
                )}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Complete Setup
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                You can update this later in Settings
              </p>
            </div>
          </form>
        </div>

        {/* ─── Security note ──────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
          <Shield className="h-3.5 w-3.5" />
          Your data is stored securely and used only for platform identification
        </div>
      </div>
    </div>
  );
}
