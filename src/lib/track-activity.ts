/**
 * Activity Tracker — Server-side utility to log user behavior events.
 *
 * Usage:
 *   await trackActivity({ userId, orgId, event: "page_view", feature: "route_planner", path: "/..." });
 *
 * Features mapped from URL paths for automatic classification.
 */

import { prisma } from "@/lib/prisma";

// ─── Feature Mapping ────────────────────────────────────────

const FEATURE_MAP: Array<{ pattern: RegExp; feature: string }> = [
  { pattern: /\/route-planner/i, feature: "route_planner" },
  { pattern: /\/fleet-schedule/i, feature: "fleet_schedule" },
  { pattern: /\/ais/i, feature: "ais_dashboard" },
  { pattern: /\/market-data/i, feature: "market_data" },
  { pattern: /\/vessels/i, feature: "vessel_profiles" },
  { pattern: /\/voyages/i, feature: "voyage_management" },
  { pattern: /\/settings/i, feature: "settings" },
  { pattern: /\/admin/i, feature: "admin" },
  { pattern: /\/dashboard/i, feature: "dashboard" },
];

export function classifyFeature(path: string): string {
  for (const { pattern, feature } of FEATURE_MAP) {
    if (pattern.test(path)) return feature;
  }
  return "general";
}

// ─── Track Activity ────────────────────────────────────────

interface TrackParams {
  userId: string;
  orgId?: string | null;
  event: "page_view" | "action" | "login" | "session_start";
  feature?: string;
  action?: string;
  path?: string;
  metadata?: Record<string, unknown>;
  duration?: number;
}

export async function trackActivity(params: TrackParams): Promise<void> {
  try {
    const feature = params.feature || (params.path ? classifyFeature(params.path) : "general");

    await prisma.activityEvent.create({
      data: {
        userId: params.userId,
        orgId: params.orgId || null,
        event: params.event,
        feature,
        action: params.action || null,
        path: params.path || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        duration: params.duration || null,
      },
    });
  } catch (error) {
    // Non-blocking — never let tracking break the app
    console.error("[Activity Tracker] Error:", error);
  }
}
