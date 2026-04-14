"use server";

/**
 * Fleet Schedule — Server Actions
 *
 * Fetches vessels + voyages + calculations for the fleet timeline view.
 * All data already exists — this is purely a read operation.
 */

import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/clerk";
import { buildOwnerFilter, buildVoyageListFilter, type AuthUser } from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface FleetVoyageBar {
  id: string;
  loadPort: string;
  dischargePort: string;
  openPort: string | null;
  status: string;
  cargoType: string | null;
  cargoQuantityMt: number;
  freightRateUsd: number | null;
  // Timeline
  startDate: string; // ISO string
  endDate: string; // ISO string
  totalVoyageDays: number;
  // Calculations
  tce: number | null;
  voyagePnl: number | null;
  breakEvenFreight: number | null;
  grossRevenue: number | null;
  totalBunkerCost: number | null;
  totalVoyageCost: number | null;
  // Schedule fields
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  redeliveryPort: string | null;
  redeliveryDate: string | null;
  // Linked inquiry commercial status (from Cargo Board pipeline)
  inquiryStatus: string | null;
}

export interface FleetVesselRow {
  id: string;
  name: string;
  vesselType: string;
  dwt: number;
  dailyOpex: number;
  commercialControl: string;
  tcHireEndDate: string | null;
  tcHireStartDate: string | null;
  dailyTcHireRate: number | null;
  voyages: FleetVoyageBar[];
}

export interface FleetGap {
  vesselId: string;
  vesselName: string;
  startDate: string;
  endDate: string | null; // null = indefinitely open
  gapDays: number;
  openPort: string;
  dailyOpex: number;
  idleCost: number;
}

export interface FleetKpiSummary {
  totalVessels: number;
  activeVoyages: number;
  utilizationPercent: number;
  avgTce: number;
  totalPnl: number;
  idleVessels: number;
  totalIdleDays: number;
  totalIdleCost: number;
}

export interface FleetScheduleData {
  vessels: FleetVesselRow[];
  openPositions: FleetGap[];
  kpis: FleetKpiSummary;
  timeRange: { start: string; end: string };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ACTION
// ═══════════════════════════════════════════════════════════════════

export async function getFleetScheduleData(): Promise<{
  success: boolean;
  data?: FleetScheduleData;
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    const vesselFilter = buildOwnerFilter(user);
    const voyageFilter = await buildVoyageListFilter(user);

    // Fetch vessels + their voyages with calculations
    const vessels = await prisma.vessel.findMany({
      where: vesselFilter,
      include: {
        voyages: {
          where: voyageFilter,
          include: {
            calculations: {
              select: {
                totalVoyageDays: true,
                tce: true,
                voyagePnl: true,
                breakEvenFreight: true,
                grossRevenue: true,
                totalBunkerCost: true,
                totalVoyageCost: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    // Fetch linked cargo inquiry statuses for all voyages in one query
    const allVoyageIds = vessels.flatMap((v) => v.voyages.map((voy) => voy.id));
    const linkedInquiries = allVoyageIds.length > 0
      ? await prisma.cargoInquiry.findMany({
          where: { voyageId: { in: allVoyageIds } },
          select: { voyageId: true, status: true },
        })
      : [];
    const inquiryStatusByVoyageId = new Map(
      linkedInquiries.map((ci) => [ci.voyageId, ci.status])
    );

    // Build the timeline window: 1 month back → 3 months forward
    const now = new Date();
    const timeStart = new Date(now);
    timeStart.setMonth(timeStart.getMonth() - 1);
    timeStart.setDate(1);
    const timeEnd = new Date(now);
    timeEnd.setMonth(timeEnd.getMonth() + 3);
    timeEnd.setDate(0); // last day of the month

    // Transform vessel data
    const vesselRows: FleetVesselRow[] = vessels.map((v) => {
      const voyageBars: FleetVoyageBar[] = v.voyages
        .filter((voy) => voy.calculations) // Only voyages with calculations
        .map((voy) => {
          const calc = voy.calculations!;
          const totalDays = calc.totalVoyageDays || 1;

          // Determine start date: estimatedDeparture > createdAt
          const startDate = voy.estimatedDeparture
            ? new Date(voy.estimatedDeparture)
            : new Date(voy.createdAt);

          // Determine end date: estimatedArrival > start + totalDays
          const endDate = voy.estimatedArrival
            ? new Date(voy.estimatedArrival)
            : new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);

          return {
            id: voy.id,
            loadPort: voy.loadPort,
            dischargePort: voy.dischargePort,
            openPort: voy.openPort,
            status: voy.status,
            cargoType: voy.cargoType,
            cargoQuantityMt: voy.cargoQuantityMt,
            freightRateUsd: voy.freightRateUsd,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            totalVoyageDays: totalDays,
            tce: calc.tce,
            voyagePnl: calc.voyagePnl,
            breakEvenFreight: calc.breakEvenFreight,
            grossRevenue: calc.grossRevenue,
            totalBunkerCost: calc.totalBunkerCost,
            totalVoyageCost: calc.totalVoyageCost,
            estimatedDeparture: voy.estimatedDeparture?.toISOString() ?? null,
            estimatedArrival: voy.estimatedArrival?.toISOString() ?? null,
            actualDeparture: voy.actualDeparture?.toISOString() ?? null,
            actualArrival: voy.actualArrival?.toISOString() ?? null,
            redeliveryPort: voy.redeliveryPort ?? null,
            redeliveryDate: voy.redeliveryDate?.toISOString() ?? null,
            // Find linked inquiry's commercial status
            inquiryStatus: inquiryStatusByVoyageId.get(voy.id) ?? null,
          };
        })
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      return {
        id: v.id,
        name: v.name,
        vesselType: v.vesselType,
        dwt: v.dwt,
        dailyOpex: v.dailyOpex ?? 0,
        commercialControl: v.commercialControl,
        tcHireEndDate: v.tcHireEndDate?.toISOString() ?? null,
        tcHireStartDate: v.tcHireStartDate?.toISOString() ?? null,
        dailyTcHireRate: v.dailyTcHireRate ?? null,
        voyages: voyageBars,
      };
    });

    // Compute open positions (gaps between voyages)
    const openPositions: FleetGap[] = [];
    const nowMs = now.getTime();

    for (const vessel of vesselRows) {
      const voys = vessel.voyages;
      if (voys.length === 0) {
        // Vessel with zero voyages = fully idle
        openPositions.push({
          vesselId: vessel.id,
          vesselName: vessel.name,
          startDate: timeStart.toISOString(),
          endDate: null,
          gapDays: Math.ceil((nowMs - timeStart.getTime()) / (24 * 60 * 60 * 1000)),
          openPort: "Unknown",
          dailyOpex: vessel.dailyOpex,
          idleCost: 0, // Can't calculate without knowing when idle started
        });
        continue;
      }

      // Gap after last voyage
      const lastVoy = voys[voys.length - 1];
      const lastEnd = new Date(lastVoy.endDate);
      if (lastEnd.getTime() < nowMs + 90 * 24 * 60 * 60 * 1000) {
        // Last voyage ends within 90 days — show open position
        const gapDays = Math.max(0, Math.ceil((nowMs - lastEnd.getTime()) / (24 * 60 * 60 * 1000)));
        openPositions.push({
          vesselId: vessel.id,
          vesselName: vessel.name,
          startDate: lastEnd.toISOString(),
          endDate: null,
          gapDays: Math.max(0, gapDays),
          openPort: lastVoy.redeliveryPort || lastVoy.dischargePort,
          dailyOpex: vessel.dailyOpex,
          idleCost: Math.max(0, gapDays) * vessel.dailyOpex,
        });
      }

      // Gaps between voyages
      for (let i = 0; i < voys.length - 1; i++) {
        const current = voys[i];
        const next = voys[i + 1];
        const currentEnd = new Date(current.endDate);
        const nextStart = new Date(next.startDate);
        const gapMs = nextStart.getTime() - currentEnd.getTime();
        const gapDays = Math.ceil(gapMs / (24 * 60 * 60 * 1000));

        if (gapDays > 1) {
          openPositions.push({
            vesselId: vessel.id,
            vesselName: vessel.name,
            startDate: currentEnd.toISOString(),
            endDate: nextStart.toISOString(),
            gapDays,
            openPort: current.redeliveryPort || current.dischargePort,
            dailyOpex: vessel.dailyOpex,
            idleCost: gapDays * vessel.dailyOpex,
          });
        }
      }
    }

    // Sort open positions: most urgent first (soonest open date that's past or near future)
    openPositions.sort((a, b) => {
      const aDate = new Date(a.startDate).getTime();
      const bDate = new Date(b.startDate).getTime();
      // Past gaps first (they're costing money NOW), then future
      const aIsPast = aDate <= nowMs;
      const bIsPast = bDate <= nowMs;
      if (aIsPast && !bIsPast) return -1;
      if (!aIsPast && bIsPast) return 1;
      return aDate - bDate;
    });

    // Compute fleet KPIs
    const allVoyages = vesselRows.flatMap((v) => v.voyages);
    const activeVoyages = allVoyages.filter(
      (v) => v.status !== "COMPLETED" && v.status !== "REJECTED"
    );
    const totalVoyageDays = allVoyages.reduce((sum, v) => sum + v.totalVoyageDays, 0);
    const calendarDays = Math.max(
      1,
      Math.ceil((timeEnd.getTime() - timeStart.getTime()) / (24 * 60 * 60 * 1000))
    );
    const maxFleetDays = vesselRows.length * calendarDays;
    const utilizationPercent = maxFleetDays > 0
      ? Math.min(100, (totalVoyageDays / maxFleetDays) * 100)
      : 0;

    const voyagesWithTce = allVoyages.filter((v) => v.tce !== null && v.tce > 0);
    const avgTce = voyagesWithTce.length > 0
      ? voyagesWithTce.reduce((sum, v) => sum + (v.tce ?? 0), 0) / voyagesWithTce.length
      : 0;

    const totalPnl = allVoyages.reduce((sum, v) => sum + (v.voyagePnl ?? 0), 0);
    const idleVessels = openPositions.filter((g) => g.gapDays > 0 && new Date(g.startDate).getTime() <= nowMs).length;
    const totalIdleDays = openPositions.reduce((sum, g) => sum + Math.max(0, g.gapDays), 0);
    const totalIdleCost = openPositions.reduce((sum, g) => sum + g.idleCost, 0);

    const kpis: FleetKpiSummary = {
      totalVessels: vesselRows.length,
      activeVoyages: activeVoyages.length,
      utilizationPercent,
      avgTce,
      totalPnl,
      idleVessels,
      totalIdleDays,
      totalIdleCost,
    };

    return {
      success: true,
      data: {
        vessels: vesselRows,
        openPositions,
        kpis,
        timeRange: {
          start: timeStart.toISOString(),
          end: timeEnd.toISOString(),
        },
      },
    };
  } catch (error) {
    console.error("Fleet schedule error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load fleet schedule",
    };
  }
}
