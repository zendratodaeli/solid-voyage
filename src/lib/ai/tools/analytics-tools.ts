/**
 * Fleet Analytics & History Tools for AI Copilot
 *
 * Wraps fleet analytics engine and voyage history queries.
 * Compatible with AI SDK v6.
 */

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  computeFleetAnalytics,
  type VoyageDataRow,
} from "@/lib/calculations/fleet-analytics";

// ═══════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════

const fleetAnalyticsSchema = z.object({
  orgId: z.string().describe("Organization ID"),
  periodMonths: z.number().optional().describe("Analysis period in months (default: 6)"),
});

const voyageHistorySchema = z.object({
  orgId: z.string().describe("Organization ID"),
  status: z.enum(["DRAFT", "NEW", "OFFERED", "FIXED", "COMPLETED", "REJECTED", "LOST", "EXPIRED", "WITHDRAWN"]).optional(),
  vesselId: z.string().optional().describe("Filter by specific vessel"),
  limit: z.number().optional().describe("Max results (default: 10)"),
});

// ═══════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════

export const analyticsTools = {
  getFleetAnalytics: tool({
    description:
      "Get fleet-wide performance analytics including KPIs (average TCE, total P&L, " +
      "fleet utilization), monthly trends, vessel rankings, and auto-generated insights.",
    inputSchema: fleetAnalyticsSchema,
    execute: async (input: z.infer<typeof fleetAnalyticsSchema>) => {
      const voyages = await prisma.voyage.findMany({
        where: { orgId: input.orgId },
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
        },
        orderBy: { createdAt: "desc" },
      });

      const rows: VoyageDataRow[] = voyages.map((v) => ({
        id: v.id,
        vesselId: v.vessel?.id || "",
        vesselName: v.vessel?.name || "Unknown",
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
      }));

      const analytics = computeFleetAnalytics(rows, input.periodMonths ?? 6);

      return {
        kpis: {
          avgTce: Math.round(analytics.kpis.avgTce),
          totalPnl: Math.round(analytics.kpis.totalPnl),
          fleetUtilization: Math.round(analytics.kpis.fleetUtilization * 10) / 10,
          avgBunkerCostPerMt: Math.round(analytics.kpis.avgBunkerCostPerMt),
          totalVoyages: analytics.kpis.totalVoyages,
          completedVoyages: analytics.kpis.completedVoyages,
          estimateAccuracy: analytics.kpis.avgEstimateAccuracy
            ? Math.round(analytics.kpis.avgEstimateAccuracy)
            : null,
        },
        monthlyTrend: analytics.monthlyTrend.map((m) => ({
          month: m.label,
          voyages: m.voyageCount,
          avgTce: Math.round(m.avgTce),
          totalPnl: Math.round(m.totalPnl),
        })),
        vesselRanking: analytics.vesselPerformance.map((v) => ({
          vessel: v.vesselName,
          voyages: v.voyageCount,
          avgTce: Math.round(v.avgTce),
          totalPnl: Math.round(v.totalPnl),
          utilization: Math.round(v.utilizationPercent),
        })),
        insights: analytics.insights,
      };
    },
  }),

  getVoyageHistory: tool({
    description:
      "Get recent voyages for the organization. Can filter by status or vessel.",
    inputSchema: voyageHistorySchema,
    execute: async (input: z.infer<typeof voyageHistorySchema>) => {
      const where: any = { orgId: input.orgId };
      if (input.status) where.status = input.status;
      if (input.vesselId) where.vesselId = input.vesselId;

      const voyages = await prisma.voyage.findMany({
        where,
        include: {
          vessel: { select: { name: true } },
          calculations: {
            select: {
              tce: true,
              voyagePnl: true,
              totalVoyageCost: true,
              totalVoyageDays: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit ?? 10,
      });

      return {
        count: voyages.length,
        voyages: voyages.map((v) => ({
          id: v.id,
          vessel: v.vessel?.name || "Unknown",
          status: v.status,
          loadPort: v.loadPort,
          dischargePort: v.dischargePort,
          cargoType: v.cargoType,
          cargoQuantity: v.cargoQuantityMt,
          tce: v.calculations?.tce,
          pnl: v.calculations?.voyagePnl,
          totalCost: v.calculations?.totalVoyageCost,
          voyageDays: v.calculations?.totalVoyageDays,
          createdAt: v.createdAt.toISOString().split("T")[0],
        })),
      };
    },
  }),
};
