"use client";

/**
 * OrgThemeProvider
 * 
 * Fetches the active organization's theme (accent color, label)
 * and applies it as CSS custom properties so the entire dashboard
 * reflects the org's branding.
 * 
 * Provides theme data via React context for components that need
 * direct access (e.g., accent color).
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useOrganization } from "@clerk/nextjs";

interface OrgThemeData {
  accentColor: string | null;
  currency: string; // "USD" | "EUR" | "GBP" | "NOK"
  aisAutoRefresh: boolean;
}

interface OrgThemeContextValue {
  theme: OrgThemeData;
  isPremium: boolean;
  isLoading: boolean;
  refetch: () => void;
}

const defaultTheme: OrgThemeData = {
  accentColor: null,
  currency: "USD",
  aisAutoRefresh: false,
};

const OrgThemeContext = createContext<OrgThemeContextValue>({
  theme: defaultTheme,
  isPremium: false,
  isLoading: true,
  refetch: () => {},
});

export function useOrgTheme() {
  return useContext(OrgThemeContext);
}

/**
 * Convert a hex color to oklch-ish CSS values for theming.
 * We use a simpler approach: set the hex as a CSS variable
 * and use it where needed, while also computing a lighter variant.
 */
function applyAccentColor(hex: string) {
  const root = document.documentElement;

  // Set accent as the primary color override
  root.style.setProperty("--org-accent", hex);

  // Convert hex to RGB for alpha variants
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  root.style.setProperty("--org-accent-rgb", `${r} ${g} ${b}`);

  // Apply as primary color (override the theme)
  root.style.setProperty("--primary", hex);
  root.style.setProperty("--sidebar-primary", hex);

  // Compute a light foreground for contrast
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const fgColor = luminance > 0.5 ? "#0f172a" : "#ffffff";
  root.style.setProperty("--primary-foreground", fgColor);
  root.style.setProperty("--sidebar-primary-foreground", fgColor);

  // Ring color matches accent
  root.style.setProperty("--ring", hex);
}

function clearAccentColor() {
  const root = document.documentElement;
  root.style.removeProperty("--org-accent");
  root.style.removeProperty("--org-accent-rgb");
  root.style.removeProperty("--primary");
  root.style.removeProperty("--primary-foreground");
  root.style.removeProperty("--sidebar-primary");
  root.style.removeProperty("--sidebar-primary-foreground");
  root.style.removeProperty("--ring");
}

export function OrgThemeProvider({ children }: { children: React.ReactNode }) {
  const { organization } = useOrganization();
  const [theme, setTheme] = useState<OrgThemeData>(defaultTheme);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTheme = useCallback(async () => {
    if (!organization) {
      setTheme(defaultTheme);
      setIsPremium(false);
      clearAccentColor();
      setIsLoading(false);
      return;
    }

    try {
      // Fetch theme + premium status in parallel
      const [themeRes, usageRes] = await Promise.all([
        fetch("/api/org-theme"),
        fetch("/api/usage"),
      ]);

      // Premium check
      if (usageRes.ok) {
        const usageJson = await usageRes.json();
        setIsPremium(usageJson.data?.routePlanner?.isPaid ?? false);
      } else {
        setIsPremium(false);
      }

      // Theme
      if (!themeRes.ok) {
        setTheme(defaultTheme);
        clearAccentColor();
        return;
      }
      const json = await themeRes.json();
      if (json.success && json.data) {
        const data: OrgThemeData = {
          accentColor: json.data.accentColor ?? null,
          currency: json.data.currency || "USD",
          aisAutoRefresh: json.data.aisAutoRefresh ?? false,
        };
        setTheme(data);

        if (data.accentColor) {
          applyAccentColor(data.accentColor);
        } else {
          clearAccentColor();
        }
      }
    } catch {
      // Silently fail — don't break the layout
    } finally {
      setIsLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  // Clean up on unmount
  useEffect(() => {
    return () => clearAccentColor();
  }, []);

  return (
    <OrgThemeContext.Provider value={{ theme, isPremium, isLoading, refetch: fetchTheme }}>
      {children}
    </OrgThemeContext.Provider>
  );
}
