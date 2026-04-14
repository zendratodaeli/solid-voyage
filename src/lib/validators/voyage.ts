/**
 * Zod validation schemas for voyages
 */

import { z } from "zod";

export const FuelTypeEnum = z.enum(["VLSFO", "HSFO", "MGO", "LSMGO", "LNG"]);
export const CanalTypeEnum = z.enum(["SUEZ", "PANAMA", "NONE"]);
export const VoyageStatusEnum = z.enum([
  "DRAFT",
  "NEW",
  "OFFERED",
  "FIXED",
  "COMPLETED",
  "REJECTED",
  "LOST",
  "EXPIRED",
  "WITHDRAWN",
]);

export const createVoyageSchema = z.object({
  vesselId: z.string().min(1, "Vessel is required"),
  
  // Route
  loadPortId: z.string().min(1, "Load port is required"),
  dischargePortId: z.string().min(1, "Discharge port is required"),
  
  // Cargo
  cargoQuantityMt: z.number().positive("Cargo quantity must be positive"),
  cargoType: z.string().optional(),
  
  // Distances
  ballastDistanceNm: z.number().nonnegative("Distance cannot be negative"),
  ladenDistanceNm: z.number().positive("Laden distance must be positive"),
  
  // Port operations
  loadPortDays: z.number().min(0.5, "Load port days must be at least 0.5"),
  dischargePortDays: z.number().min(0.5, "Discharge port days must be at least 0.5"),
  waitingDays: z.number().nonnegative().default(0),
  idleDays: z.number().nonnegative().default(0),
  
  // Speed selection
  useEcoSpeed: z.boolean().default(false),
  
  // Crane usage (affects port consumption calculation)
  useCrane: z.boolean().default(false),
  
  // Canal
  canalType: CanalTypeEnum.default("NONE"),
  canalTolls: z.number().nonnegative().default(0),
  
  // Bunker
  bunkerPriceUsd: z.number().positive("Bunker price must be positive").optional(),
  bunkerFuelType: FuelTypeEnum.default("VLSFO"),
  
  // Costs
  brokeragePercent: z.number().min(0).max(10).default(1.25),
  commissionPercent: z.number().min(0).max(10).default(3.75),
  additionalCosts: z.number().nonnegative().default(0),
  
  // Weather adjustment
  weatherRiskMultiplier: z.number().min(1).max(1.5).default(1.0),
  
  // Optional freight rate
  freightRateUsd: z.number().positive().optional(),
});

export const updateVoyageSchema = createVoyageSchema.partial();

export const updateVoyageStatusSchema = z.object({
  status: VoyageStatusEnum,
});

export const calculateVoyageSchema = z.object({
  freightRateUsd: z.number().positive().optional(),
});

export type CreateVoyageInput = z.infer<typeof createVoyageSchema>;
export type UpdateVoyageInput = z.infer<typeof updateVoyageSchema>;
export type UpdateVoyageStatusInput = z.infer<typeof updateVoyageStatusSchema>;
