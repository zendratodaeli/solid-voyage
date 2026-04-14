/**
 * User Behavior Analytics API — Returns aggregated user and org behavior data.
 *
 * GET: Returns feature usage, org health, active users, and engagement metrics.
 * Query params:
 *   - range: "7d" | "1m" | "3m" | "6m" | "1y" | "all"
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";

const RANGE_MAP: Record<string, number> = {
  "7d": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365, all: 730,
};

const ALL_FEATURES = [
  "route_planner", "fleet_schedule", "ais_dashboard", "market_data",
  "vessel_profiles", "voyage_management", "settings", "dashboard", "admin", "general",
];

const FEATURE_LABELS: Record<string, string> = {
  route_planner: "Route Planner",
  fleet_schedule: "Fleet Schedule",
  ais_dashboard: "AIS Dashboard",
  market_data: "Market Data",
  vessel_profiles: "Vessel Profiles",
  voyage_management: "Voyage Management",
  settings: "Settings",
  dashboard: "Dashboard",
  admin: "Admin Panel",
  general: "Other Pages",
};

export async function GET(req: Request) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "7d";
    const days = RANGE_MAP[range] || 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── Core Queries ────────────────────────────────────────
    const [
      totalEvents,
      eventsInRange,
      featureUsageRaw,
      dailyActiveUsersRaw,
      topUsersRaw,
      orgActivityRaw,
      recentActionsRaw,
      sessionData,
    ] = await Promise.all([
      // Total events ever
      prisma.activityEvent.count(),
      // Events in range
      prisma.activityEvent.count({ where: { createdAt: { gte: startDate } } }),
      // Feature usage breakdown
      prisma.activityEvent.groupBy({
        by: ["feature"],
        where: { createdAt: { gte: startDate }, event: "page_view" },
        _count: { id: true },
      }),
      // Daily active users (unique users per day)
      prisma.activityEvent.findMany({
        where: { createdAt: { gte: startDate } },
        select: { userId: true, createdAt: true },
      }),
      // Most active users
      prisma.activityEvent.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      // Org activity
      prisma.activityEvent.groupBy({
        by: ["orgId"],
        where: { createdAt: { gte: startDate }, orgId: { not: null } },
        _count: { id: true },
      }),
      // Recent actions (non page_view)
      prisma.activityEvent.findMany({
        where: {
          createdAt: { gte: startDate },
          event: { in: ["action", "login", "session_start"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          userId: true,
          orgId: true,
          event: true,
          feature: true,
          action: true,
          path: true,
          duration: true,
          createdAt: true,
        },
      }),
      // Session durations
      prisma.activityEvent.findMany({
        where: { createdAt: { gte: startDate }, action: "session_end", duration: { not: null } },
        select: { duration: true },
      }),
    ]);

    // ── Feature Usage ───────────────────────────────────────
    const featureUsage = ALL_FEATURES.map((f: string) => {
      const match = featureUsageRaw.find((r: { feature: string; _count: { id: number } }) => r.feature === f);
      return { feature: f, label: FEATURE_LABELS[f] || f, count: match?._count.id || 0 };
    }).sort((a: { count: number }, b: { count: number }) => b.count - a.count);

    // ── DAU/WAU/MAU Time Series ─────────────────────────────
    const dauMap = new Map<string, Set<string>>();
    for (const ev of dailyActiveUsersRaw) {
      const key = ev.createdAt.toISOString().split("T")[0];
      if (!dauMap.has(key)) dauMap.set(key, new Set());
      dauMap.get(key)!.add(ev.userId);
    }
    // Fill empty days
    for (let i = 0; i < days && i < 365; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      if (!dauMap.has(key)) dauMap.set(key, new Set());
    }
    const dauSeries = Array.from(dauMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, users]) => ({ date, activeUsers: users.size }));

    // ── Unique active users in range ────────────────────────
    const allActiveUsers = new Set(dailyActiveUsersRaw.map((e: { userId: string }) => e.userId));
    const uniqueActiveUsers = allActiveUsers.size;

    // ── Session Metrics ─────────────────────────────────────
    const durations = sessionData.map((s: { duration: number | null }) => s.duration!).filter((d: number) => d > 0 && d < 86400);
    const avgSessionDuration = durations.length > 0
      ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
      : 0;
    const totalSessions = durations.length;

    // ── Avg pages per session ───────────────────────────────
    const avgPagesPerSession = totalSessions > 0
      ? +(eventsInRange / Math.max(totalSessions, 1)).toFixed(1)
      : 0;

    // ── Organization Health Scores ──────────────────────────
    // Fetch all orgs
    const allOrgs = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true, createdAt: true },
    });

    // Get last activity per org
    const orgHealth = await Promise.all(
      allOrgs.map(async (org) => {
        const [lastEvent, eventCount, uniqueUsers, featuresUsed] = await Promise.all([
          prisma.activityEvent.findFirst({
            where: { orgId: org.id },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
          prisma.activityEvent.count({
            where: { orgId: org.id, createdAt: { gte: startDate } },
          }),
          prisma.activityEvent.groupBy({
            by: ["userId"],
            where: { orgId: org.id, createdAt: { gte: startDate } },
          }),
          prisma.activityEvent.groupBy({
            by: ["feature"],
            where: { orgId: org.id, createdAt: { gte: startDate }, event: "page_view" },
          }),
        ]);

        const daysSinceLastActivity = lastEvent
          ? Math.floor((Date.now() - lastEvent.createdAt.getTime()) / 86400000)
          : 999;

        // Health score: combination of recency, activity volume, feature breadth, user count
        const recencyScore = Math.max(0, 100 - daysSinceLastActivity * 5); // -5 per day inactive
        const volumeScore = Math.min(100, eventCount * 2); // 50 events = 100
        const featureScore = Math.min(100, (featuresUsed.length / 7) * 100); // 7 features = 100
        const userScore = Math.min(100, uniqueUsers.length * 25); // 4 users = 100
        const healthScore = Math.round(
          recencyScore * 0.35 + volumeScore * 0.25 + featureScore * 0.25 + userScore * 0.15
        );

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          healthScore: Math.max(0, Math.min(100, healthScore)),
          lastActive: lastEvent?.createdAt.toISOString() || null,
          eventCount,
          uniqueUsers: uniqueUsers.length,
          featuresUsed: featuresUsed.length,
          daysSinceLastActivity: lastEvent ? daysSinceLastActivity : null,
        };
      })
    );

    orgHealth.sort((a, b) => b.healthScore - a.healthScore);

    // ── Top Users — resolve names from Clerk ────────────────
    const topUsers = topUsersRaw.map((u: { userId: string; _count: { id: number } }) => ({
      userId: u.userId,
      eventCount: u._count.id,
    }));

    return NextResponse.json({
      summary: {
        totalEvents,
        eventsInRange,
        uniqueActiveUsers,
        avgSessionDuration,
        totalSessions,
        avgPagesPerSession,
        range,
        days,
      },
      featureUsage,
      dauSeries,
      orgHealth,
      topUsers,
      recentActions: recentActionsRaw,
    });
  } catch (error) {
    console.error("[Behavior Analytics] Error:", error);
    return NextResponse.json({ error: "Failed to load behavior analytics" }, { status: 500 });
  }
}
