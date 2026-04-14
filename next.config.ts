import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Fix tinyqueue import issue for searoute-js using Turbopack config
  turbopack: {
    resolveAlias: {
      // Fix for "Queue is not a constructor" error in searoute-js
      tinyqueue: "./node_modules/tinyqueue/index.js",
    },
  },

  // Redirects for consolidated pages (15 pages → 10 pages)
  // IMPORTANT: :orgSlug is constrained to avoid matching /api/*, /_next/*, etc.
  async redirects() {
    // Condition to ensure redirect only fires for real org-slug pages
    // (not /api/*, /_next/*, /sign-in, /sign-up, etc.)
    const orgSlugConstraint = {
      type: "header" as const,
      key: "x-matched-path",       // always set by Next.js
      value: undefined,             // just needs to exist
    };

    return [
      // Cargo Board → Fleet Operations (Pipeline view)
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/cargo-board",
        destination: "/:orgSlug/fleet-operations?view=pipeline",
        permanent: false,
      },
      // Fleet Schedule → Fleet Operations (Timeline view)
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/fleet-schedule",
        destination: "/:orgSlug/fleet-operations?view=timeline",
        permanent: false,
      },
      // Scenarios → Voyages (scenarios are now inline)
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/scenarios",
        destination: "/:orgSlug/voyages",
        permanent: false,
      },
      // AIS Dashboard → Operations Map (Fleet tab)
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/ais-dashboard",
        destination: "/:orgSlug/operations-map?tab=fleet",
        permanent: false,
      },
      // Weather → Operations Map (Weather tab)
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/weather",
        destination: "/:orgSlug/operations-map?tab=weather",
        permanent: false,
      },
      // Route Planner → Operations Map (Route tab)
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/route-planner",
        destination: "/:orgSlug/operations-map?tab=route",
        permanent: false,
      },
      // Settings/Organization → Unified Settings
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/settings/organization",
        destination: "/:orgSlug/settings",
        permanent: false,
      },
      // Settings/Branding → Unified Settings
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/settings/branding",
        destination: "/:orgSlug/settings",
        permanent: false,
      },
      // Fleet Performance Analytics → Dashboard (analytics are inline now)
      {
        source: "/:orgSlug((?!api|_next|sign-in|sign-up)[^/]+)/fleet-performance-analytics",
        destination: "/:orgSlug/dashboard",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
