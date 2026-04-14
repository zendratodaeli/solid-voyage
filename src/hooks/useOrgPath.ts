"use client";

/**
 * useOrgPath — Organization-scoped navigation hook
 *
 * Resolves the current org slug and provides a helper
 * to prefix any path with the org slug.
 *
 * Slug resolution rules:
 *   - Premium orgs  → uses org name as slug (e.g., "tuhosa")
 *   - Free orgs     → uses Clerk's auto-generated slug (e.g., "solid-voyage-team")
 *   - No org        → "personal"
 *
 * Usage:
 *   const { orgSlug, orgPath } = useOrgPath();
 *   <Link href={orgPath("/dashboard")} />   →  "/tuhosa/dashboard"
 */

import { useOrganization } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useOrgTheme } from "@/components/auth/OrgThemeProvider";

function toUrlSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function useOrgPath() {
  const { organization } = useOrganization();
  const params = useParams();
  const { isPremium } = useOrgTheme();

  // Resolve slug: premium → org name, free → Clerk slug, none → "personal"
  const orgSlug = useMemo(() => {
    // If we're already in an [orgSlug] route, use that
    if (params.orgSlug && typeof params.orgSlug === "string") {
      return params.orgSlug;
    }
    // Derive from Clerk org
    if (organization) {
      if (isPremium) {
        // Premium: use the org's custom name as slug
        return toUrlSlug(organization.name);
      }
      // Free: use Clerk's auto-generated slug
      return organization.slug ?? toUrlSlug(organization.name);
    }
    return "personal";
  }, [params.orgSlug, organization, isPremium]);

  const orgPath = useCallback(
    (path: string) => {
      // Ensure path starts with /
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      return `/${orgSlug}${cleanPath}`;
    },
    [orgSlug]
  );

  return { orgSlug, orgPath, organization };
}
