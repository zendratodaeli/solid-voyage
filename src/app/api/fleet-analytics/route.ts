import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { type AuthUser, buildOwnerFilter } from "@/lib/permissions";
import {
  computeFleetAnalytics,
  type VoyageDataRow,
} from "@/lib/calculations/fleet-analytics";

export async function GET(request: NextRequest) {
  try {
    const user = (await requireUser()) as AuthUser;

    // Get period from query params (default 6 months)
    const { searchParams } = new URL(request.url);
    const periodMonths = parseInt(searchParams.get("period") || "6") || 6;

    // Fetch all voyages for the org/user with calculations and actuals
    const ownerFilter = buildOwnerFilter(user);
    const voyages = await prisma.voyage.findMany({
      where: {
        ...ownerFilter,
        // Include voyages that have calculations (i.e., have been computed)
        calculations: { isNot: null },
      },
      include: {
        vessel: { select: { id: true, name: true } },
        calculations: {
          select: {
            totalSeaDays: true,
            totalPortDays: true,
            totalVoyageDays: true,
            totalBunkerMt: true,
            totalBunkerCost: true,
            totalVoyageCost: true,
            grossRevenue: true,
            voyagePnl: true,
            tce: true,
          },
        },
        actuals: {
          select: {
            totalSeaDays: true,
            totalPortDays: true,
            totalVoyageDays: true,
            totalBunkerMt: true,
            totalBunkerCost: true,
            totalVoyageCost: true,
            grossRevenue: true,
            voyagePnl: true,
            tce: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Transform to VoyageDataRow format
    const dataRows: VoyageDataRow[] = voyages.map((v) => ({
      id: v.id,
      vesselId: v.vessel.id,
      vesselName: v.vessel.name,
      status: v.status,
      createdAt: v.createdAt,
      estimate: v.calculations
        ? {
            totalSeaDays: v.calculations.totalSeaDays,
            totalPortDays: v.calculations.totalPortDays,
            totalVoyageDays: v.calculations.totalVoyageDays,
            totalBunkerMt: v.calculations.totalBunkerMt,
            totalBunkerCost: v.calculations.totalBunkerCost,
            totalVoyageCost: v.calculations.totalVoyageCost,
            grossRevenue: v.calculations.grossRevenue,
            voyagePnl: v.calculations.voyagePnl,
            tce: v.calculations.tce,
          }
        : undefined,
      actual: v.actuals
        ? {
            totalSeaDays: v.actuals.totalSeaDays,
            totalPortDays: v.actuals.totalPortDays,
            totalVoyageDays: v.actuals.totalVoyageDays,
            totalBunkerMt: v.actuals.totalBunkerMt,
            totalBunkerCost: v.actuals.totalBunkerCost,
            totalVoyageCost: v.actuals.totalVoyageCost,
            grossRevenue: v.actuals.grossRevenue,
            voyagePnl: v.actuals.voyagePnl,
            tce: v.actuals.tce,
          }
        : undefined,
    }));

    // Compute analytics
    const analytics = computeFleetAnalytics(dataRows, periodMonths);

    return NextResponse.json({ success: true, data: analytics });
  } catch (error) {
    console.error("Fleet analytics error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to compute fleet analytics" },
      { status: 500 }
    );
  }
}
