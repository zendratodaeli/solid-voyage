/**
 * Visitor Analytics API — Dedicated endpoint for the analytics page.
 *
 * GET: Returns detailed visitor analytics data.
 * Query params:
 *   - range: "1d" | "7d" | "1m" | "3m" | "6m" | "1y" | "all"
 *
 * Returns time-series page views, unique visitors,
 * top pages, referrers, countries, cities, browsers, OS, devices.
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
  all: 730,
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
      totalViews,
      viewsInRange,
      allViewsInRange,
      recentVisitors,
    ] = await Promise.all([
      prisma.pageView.count(),
      prisma.pageView.count({ where: { createdAt: { gte: startDate } } }),
      prisma.pageView.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true, ip: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.pageView.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          path: true,
          ip: true,
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

    // ── Unique visitors (by IP) ────────────────────────────
    const uniqueIps = new Set(allViewsInRange.map((v) => v.ip).filter(Boolean));
    const uniqueVisitors = uniqueIps.size;

    // ── Time Series (views per bucket) ─────────────────────
    const bucketFormat = days <= 1 ? "hour" : "day";
    const buckets = new Map<string, { views: number; uniqueIps: Set<string> }>();

    if (bucketFormat === "hour") {
      for (let h = 0; h < 24; h++) {
        const d = new Date(startDate);
        d.setHours(d.getHours() + h);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
        buckets.set(key, { views: 0, uniqueIps: new Set() });
      }
    } else {
      for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        buckets.set(key, { views: 0, uniqueIps: new Set() });
      }
    }

    const toKey = (date: Date) => {
      if (bucketFormat === "hour") {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:00`;
      }
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };

    for (const v of allViewsInRange) {
      const key = toKey(v.createdAt);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.views++;
        if (v.ip) bucket.uniqueIps.add(v.ip);
      }
    }

    const series = Array.from(buckets.entries()).map(([date, data]) => ({
      date,
      views: data.views,
      visitors: data.uniqueIps.size,
    }));

    // ── Aggregations ────────────────────────────────────────
    const [
      topPagesRaw,
      topCountriesRaw,
      topCitiesRaw,
      topBrowsersRaw,
      topOsRaw,
      topDevicesRaw,
      topReferrersRaw,
    ] = await Promise.all([
      prisma.pageView.groupBy({
        by: ["path"],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 15,
      }),
      prisma.pageView.groupBy({
        by: ["countryCode", "country"],
        where: { createdAt: { gte: startDate }, countryCode: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 15,
      }),
      prisma.pageView.groupBy({
        by: ["city", "countryCode"],
        where: { createdAt: { gte: startDate }, city: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 15,
      }),
      prisma.pageView.groupBy({
        by: ["browser"],
        where: { createdAt: { gte: startDate }, browser: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      prisma.pageView.groupBy({
        by: ["os"],
        where: { createdAt: { gte: startDate }, os: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      prisma.pageView.groupBy({
        by: ["device"],
        where: { createdAt: { gte: startDate }, device: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      prisma.pageView.groupBy({
        by: ["referrer"],
        where: {
          createdAt: { gte: startDate },
          referrer: { not: null },
          NOT: { referrer: "" },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      summary: {
        totalViews,
        viewsInRange,
        uniqueVisitors,
        range,
        days,
      },
      series,
      topPages: topPagesRaw.map((p) => ({ path: p.path, count: p._count.id })),
      topCountries: topCountriesRaw.map((c) => ({
        code: c.countryCode || "??",
        name: c.country || "Unknown",
        count: c._count.id,
      })),
      topCities: topCitiesRaw.map((c) => ({
        city: c.city || "Unknown",
        countryCode: c.countryCode || "??",
        count: c._count.id,
      })),
      topBrowsers: topBrowsersRaw.map((b) => ({ name: b.browser || "Unknown", count: b._count.id })),
      topOS: topOsRaw.map((o) => ({ name: o.os || "Unknown", count: o._count.id })),
      devices: topDevicesRaw.map((d) => ({ type: d.device || "unknown", count: d._count.id })),
      topReferrers: topReferrersRaw.map((r) => ({
        url: r.referrer || "Direct",
        count: r._count.id,
      })),
      recentVisitors: recentVisitors.map((v) => ({
        ...v,
        ip: undefined, // Don't expose IP to frontend
      })),
    });
  } catch (error) {
    console.error("[Visitor Analytics] Error:", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
