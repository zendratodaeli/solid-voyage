/**
 * Laytime & Demurrage Tools for AI Copilot
 *
 * Wraps the extracted laytime calculation engine as AI-callable tools.
 * Compatible with AI SDK v6.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  calculateLaytime,
  calculateAllowedHoursFromRate,
  formatLaytimeDuration,
  type LaytimeTerms,
  type EventType,
} from "@/lib/calculations/laytime";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════

const calculateLaytimeSchema = z.object({
  allowedHours: z.number().optional().describe("Fixed allowed laytime in hours"),
  cargoQuantity: z.number().optional().describe("Cargo quantity in MT (for rate-based laytime)"),
  loadingRate: z.number().optional().describe("Loading/discharging rate in MT/day (for rate-based)"),
  terms: z.enum(["SHINC", "SHEX", "SSHEX", "SHEXUU"]).describe(
    "Laytime counting terms: SHINC, SHEX, SSHEX, or SHEXUU"
  ),
  demurrageRatePerDay: z.number().describe("Demurrage rate in USD/day"),
  despatchRatePerDay: z.number().optional().describe("Despatch rate in USD/day (usually half demurrage)"),
  events: z.array(z.object({
    from: z.string().describe("Event start time (ISO 8601)"),
    to: z.string().describe("Event end time"),
    eventType: z.enum([
      "working", "weather_delay", "sunday", "holiday",
      "breakdown_owner", "breakdown_charterer", "shifting",
      "strike", "waiting_berth", "custom_exception",
    ]).describe("Type of event"),
    remarks: z.string().optional().describe("Optional notes"),
  })).describe("Time sheet events in chronological order"),
});

const getLaytimeHistorySchema = z.object({
  orgId: z.string().describe("Organization ID"),
  vesselName: z.string().optional().describe("Filter by vessel name"),
  limit: z.number().optional().describe("Max results (default: 10)"),
});

// ═══════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════

export const laytimeTools = {
  calculateLaytimeDemurrage: tool({
    description:
      "Calculate laytime usage, demurrage, or despatch based on charter party terms " +
      "and time sheet events. Returns whether demurrage or despatch applies and the exact amount.",
    inputSchema: calculateLaytimeSchema,
    execute: async (input: z.infer<typeof calculateLaytimeSchema>) => {
      let allowedHours = input.allowedHours || 0;
      if (!allowedHours && input.cargoQuantity && input.loadingRate) {
        allowedHours = calculateAllowedHoursFromRate(input.cargoQuantity, input.loadingRate);
      }

      const despatchRate = input.despatchRatePerDay ?? input.demurrageRatePerDay / 2;

      const result = calculateLaytime({
        allowedHours,
        terms: input.terms as LaytimeTerms,
        demurrageRate: input.demurrageRatePerDay,
        despatchRate,
        events: input.events.map((e, i) => ({
          id: `event-${i}`,
          from: e.from,
          to: e.to,
          eventType: e.eventType as EventType,
          remarks: e.remarks || "",
        })),
      });

      return {
        allowedLaytime: formatLaytimeDuration(allowedHours),
        allowedHours,
        timeUsed: formatLaytimeDuration(result.countedHours),
        countedHours: result.countedHours,
        timeExcluded: formatLaytimeDuration(result.excludedHours),
        excludedHours: result.excludedHours,
        excludedBreakdown: result.excludedByType,
        result: result.isDemurrage ? "DEMURRAGE" : "DESPATCH",
        excessHours: result.excessHours,
        demurrageAmount: result.isDemurrage ? result.demurrageAmount : null,
        despatchAmount: !result.isDemurrage ? result.despatchAmount : null,
        progressPercent: result.progressPercent,
        eventSummary: result.eventResults.map((e) => ({
          from: e.from,
          to: e.to,
          type: e.eventType,
          duration: formatLaytimeDuration(e.duration),
          countsTowardsLaytime: e.counts,
        })),
      };
    },
  }),

  getLaytimeHistory: tool({
    description:
      "Get saved laytime calculations for the organization. " +
      "Can filter by vessel name.",
    inputSchema: getLaytimeHistorySchema,
    execute: async (input: z.infer<typeof getLaytimeHistorySchema>) => {
      const where: any = { orgId: input.orgId };
      if (input.vesselName) {
        where.vesselName = { contains: input.vesselName, mode: "insensitive" };
      }

      const calculations = await prisma.laytimeCalculation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit ?? 10,
        select: {
          id: true,
          vesselName: true,
          portName: true,
          operationType: true,
          terms: true,
          resultType: true,
          resultAmount: true,
          allowedHours: true,
          countedHours: true,
          createdAt: true,
        },
      });

      return {
        count: calculations.length,
        calculations: calculations.map((c) => ({
          id: c.id,
          vessel: c.vesselName,
          port: c.portName,
          operation: c.operationType,
          terms: c.terms,
          result: c.resultType?.toUpperCase() || "N/A",
          amount: c.resultAmount,
          allowedHours: c.allowedHours,
          usedHours: c.countedHours,
          date: c.createdAt.toISOString().split("T")[0],
        })),
      };
    },
  }),
};
