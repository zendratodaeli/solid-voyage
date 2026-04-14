import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { type AuthUser, buildOwnerFilter } from "@/lib/permissions";

type MetricKey = "tce" | "voyagePnl" | "totalBunkerCost" | "totalSeaDays";

interface TimeBucket {
  label: string;
  value: number;
  count: number;
}

export async function GET(request: NextRequest) {
  try {
    const user = (await requireUser()) as AuthUser;

    const { searchParams } = new URL(request.url);
    const metric = (searchParams.get("metric") || "tce") as MetricKey;
    const period = searchParams.get("period") || "6M";

    // Validate metric
    const validMetrics: MetricKey[] = ["tce", "voyagePnl", "totalBunkerCost", "totalSeaDays"];
    if (!validMetrics.includes(metric)) {
      return NextResponse.json(
        { success: false, error: "Invalid metric" },
        { status: 400 }
      );
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now);
    switch (period) {
      case "7D":
        startDate.setDate(now.getDate() - 7);
        break;
      case "1M":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "3M":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "6M":
        startDate.setMonth(now.getMonth() - 6);
        break;
      case "1Y":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 6);
    }

    // Fetch voyages with calculations
    const ownerFilter = buildOwnerFilter(user);
    const voyages = await prisma.voyage.findMany({
      where: {
        ...ownerFilter,
        calculations: { isNot: null },
        createdAt: { gte: startDate },
      },
      include: {
        calculations: {
          select: {
            tce: true,
            voyagePnl: true,
            totalBunkerCost: true,
            totalSeaDays: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Determine bucketing strategy based on period
    const bucketFormat = getBucketFormat(period);
    const bucketMap = new Map<string, { total: number; count: number }>();

    // Pre-fill buckets to ensure continuous timeline
    const buckets = generateBuckets(startDate, now, period);
    for (const label of buckets) {
      bucketMap.set(label, { total: 0, count: 0 });
    }

    // Fill in actual data
    for (const voyage of voyages) {
      const source = voyage.calculations;
      if (!source) continue;

      const val = source[metric];
      if (val === null || val === undefined) continue;

      const label = formatDateToBucket(voyage.createdAt, bucketFormat);
      const existing = bucketMap.get(label) || { total: 0, count: 0 };
      existing.total += val;
      existing.count += 1;
      bucketMap.set(label, existing);
    }

    // Convert to array — use average for rate metrics, sum for absolute
    const isAvgMetric = metric === "tce" || metric === "totalSeaDays";
    const data: TimeBucket[] = [];

    for (const [label, bucket] of bucketMap) {
      data.push({
        label,
        value: bucket.count > 0
          ? (isAvgMetric ? bucket.total / bucket.count : bucket.total)
          : 0,
        count: bucket.count,
      });
    }

    // Calculate summary stats
    const nonEmpty = data.filter((d) => d.count > 0);
    const allValues = nonEmpty.map((d) => d.value);
    const summary = {
      avg: allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0,
      min: allValues.length > 0 ? Math.min(...allValues) : 0,
      max: allValues.length > 0 ? Math.max(...allValues) : 0,
      total: allValues.reduce((a, b) => a + b, 0),
      dataPoints: nonEmpty.length,
    };

    return NextResponse.json({ success: true, data, summary, metric, period });
  } catch (error) {
    console.error("KPI timeseries error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load KPI data" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// BUCKET HELPERS
// ═══════════════════════════════════════════════════════════════════

type BucketFormat = "day" | "week" | "month";

function getBucketFormat(period: string): BucketFormat {
  switch (period) {
    case "7D":
    case "1M":
      return "day";
    case "3M":
      return "week";
    case "6M":
    case "1Y":
      return "month";
    default:
      return "month";
  }
}

function formatDateToBucket(date: Date, format: BucketFormat): string {
  const d = new Date(date);
  switch (format) {
    case "day":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "week": {
      // ISO week start (Monday)
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay() + 1);
      return `W${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    case "month":
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
}

function generateBuckets(start: Date, end: Date, period: string): string[] {
  const format = getBucketFormat(period);
  const buckets: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    buckets.push(formatDateToBucket(cursor, format));

    switch (format) {
      case "day":
        cursor.setDate(cursor.getDate() + 1);
        break;
      case "week":
        cursor.setDate(cursor.getDate() + 7);
        break;
      case "month":
        cursor.setMonth(cursor.getMonth() + 1);
        break;
    }
  }

  // Deduplicate while preserving order
  return [...new Set(buckets)];
}
