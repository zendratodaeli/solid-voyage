/**
 * Platform Analytics API
 *
 * GET: Returns time-series data for platform growth metrics + visitor data.
 * Query params:
 *   - range: "1d" | "7d" | "1m" | "3m" | "6m" | "1y" | "all"
 *
 * Returns daily bucketed counts for users, orgs, subscribers, voyages, and visitors.
 * Also returns recent visitors with geo data and top pages/countries.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";

const RANGE_MAP: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
  all: 730, // 2 years max
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

    // Fetch all records created after startDate in parallel
    const [users, orgs, subscribers, voyages, pageViews, recentVisitors] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.organization.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.newsletterSubscriber.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true, isActive: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.voyage.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.pageView.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      // Recent visitors with full geo data (last 15)
      prisma.pageView.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          path: true,
          country: true,
          countryCode: true,
          city: true,
          region: true,
          org: true,
          device: true,
          browser: true,
          os: true,
          referrer: true,
          createdAt: true,
        },
      }),
    ]);

    // Fetch cumulative totals BEFORE the start date
    const [usersBeforeCount, orgsBeforeCount, subsBeforeCount, voyagesBeforeCount, viewsBeforeCount] = await Promise.all([
      prisma.user.count({ where: { createdAt: { lt: startDate } } }),
      prisma.organization.count({ where: { createdAt: { lt: startDate } } }),
      prisma.newsletterSubscriber.count({ where: { createdAt: { lt: startDate }, isActive: true } }),
      prisma.voyage.count({ where: { createdAt: { lt: startDate } } }),
      prisma.pageView.count({ where: { createdAt: { lt: startDate } } }),
    ]);

    // Build date buckets
    const bucketFormat = days <= 1 ? "hour" : "day";
    const buckets = new Map<string, { users: number; orgs: number; subscribers: number; voyages: number; visitors: number }>();

    if (bucketFormat === "hour") {
      for (let h = 0; h < 24; h++) {
        const d = new Date(startDate);
        d.setHours(d.getHours() + h);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
        buckets.set(key, { users: 0, orgs: 0, subscribers: 0, voyages: 0, visitors: 0 });
      }
    } else {
      for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        buckets.set(key, { users: 0, orgs: 0, subscribers: 0, voyages: 0, visitors: 0 });
      }
    }

    // Fill buckets
    const toKey = (date: Date) => {
      if (bucketFormat === "hour") {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:00`;
      }
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };

    for (const u of users) { const b = buckets.get(toKey(u.createdAt)); if (b) b.users++; }
    for (const o of orgs) { const b = buckets.get(toKey(o.createdAt)); if (b) b.orgs++; }
    for (const s of subscribers) { const b = buckets.get(toKey(s.createdAt)); if (b) b.subscribers++; }
    for (const v of voyages) { const b = buckets.get(toKey(v.createdAt)); if (b) b.voyages++; }
    for (const pv of pageViews) { const b = buckets.get(toKey(pv.createdAt)); if (b) b.visitors++; }

    // Cumulative totals
    let cumUsers = usersBeforeCount;
    let cumOrgs = orgsBeforeCount;
    let cumSubs = subsBeforeCount;
    let cumVoyages = voyagesBeforeCount;
    let cumVisitors = viewsBeforeCount;

    const series = Array.from(buckets.entries()).map(([date, counts]) => {
      cumUsers += counts.users;
      cumOrgs += counts.orgs;
      cumSubs += counts.subscribers;
      cumVoyages += counts.voyages;
      cumVisitors += counts.visitors;

      return {
        date,
        newUsers: counts.users,
        newOrgs: counts.orgs,
        newSubscribers: counts.subscribers,
        newVoyages: counts.voyages,
        newVisitors: counts.visitors,
        totalUsers: cumUsers,
        totalOrgs: cumOrgs,
        totalSubscribers: cumSubs,
        totalVoyages: cumVoyages,
        totalVisitors: cumVisitors,
      };
    });

    // Top pages (most visited)
    const topPagesRaw = await prisma.pageView.groupBy({
      by: ["path"],
      where: { createdAt: { gte: startDate } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });
    const topPages = topPagesRaw.map((p) => ({ path: p.path, count: p._count.id }));

    // Top countries
    const topCountriesRaw = await prisma.pageView.groupBy({
      by: ["countryCode", "country"],
      where: { createdAt: { gte: startDate }, countryCode: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });
    const topCountries = topCountriesRaw.map((c) => ({
      code: c.countryCode || "??",
      name: c.country || "Unknown",
      count: c._count.id,
    }));

    // Device breakdown
    const deviceBreakdownRaw = await prisma.pageView.groupBy({
      by: ["device"],
      where: { createdAt: { gte: startDate }, device: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const deviceBreakdown = deviceBreakdownRaw.map((d) => ({
      device: d.device || "unknown",
      count: d._count.id,
    }));

    const totals = {
      users: cumUsers,
      orgs: cumOrgs,
      subscribers: cumSubs,
      voyages: cumVoyages,
      visitors: cumVisitors,
      newUsersInRange: users.length,
      newOrgsInRange: orgs.length,
      newSubscribersInRange: subscribers.length,
      newVoyagesInRange: voyages.length,
      newVisitorsInRange: pageViews.length,
    };

    return NextResponse.json({
      series,
      totals,
      range,
      days,
      recentVisitors,
      topPages,
      topCountries,
      deviceBreakdown,
    });
  } catch (error) {
    console.error("[Platform Analytics] Error:", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
