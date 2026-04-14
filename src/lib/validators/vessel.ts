/**
 * Zod validation schemas for vessels
 */

import { z } from "zod";

export const VesselTypeEnum = z.enum([
  // Bulk Carriers
  "CAPESIZE",
  "PANAMAX",
  "POST_PANAMAX",
  "SUPRAMAX",
  "HANDYMAX",
  "HANDYSIZE",
  "BULK_CARRIER",
  // Tankers
  "VLCC",
  "SUEZMAX",
  "AFRAMAX",
  "MR_TANKER",
  "LR1_TANKER",
  "LR2_TANKER",
  "CHEMICAL_TANKER",
  "PRODUCT_TANKER",
  // Container Ships
  "CONTAINER_FEEDER",
  "CONTAINER_PANAMAX",
  "CONTAINER_POST_PANAMAX",
  "CONTAINER_ULCV",
  // Gas Carriers
  "LNG_CARRIER",
  "LPG_CARRIER",
  // General Cargo / Specialized
  "GENERAL_CARGO",
  "MULTI_PURPOSE",
  "HEAVY_LIFT",
  "CAR_CARRIER",
  "RO_RO",
  "OTHER",
]);

export const CommercialControlEnum = z.enum([
  "OWNED_BAREBOAT",
  "TIME_CHARTER",
  "VOYAGE_CHARTER",
]);

export const FuelTypeEnum = z.enum([
  "VLSFO",
  "LSMGO",
  "HFO",
  "HSFO",
  "MGO",
  "LNG",
]);

// Base schema without refinement (for partial/update operations)
const vesselBaseSchema = z.object({
  name: z.string().min(1, "Vessel name is required").max(100),
  imoNumber: z.string().optional(),
  mmsiNumber: z.string().optional(),
  vesselType: VesselTypeEnum,
  customVesselType: z.string().optional(),
  dwt: z.number().positive("DWT must be positive"),

  // ─── Vessel Dimensions ─────────────────────────────────────────
  loa: z.number().positive().optional(),              // Length Overall (meters)
  beam: z.number().positive().optional(),             // Beam / breadth (meters)
  summerDraft: z.number().positive().optional(),       // Summer draft (meters)
  grossTonnage: z.number().positive().optional(),      // GT
  netTonnage: z.number().positive().optional(),        // NT

  // ─── Vessel Identification ─────────────────────────────────────
  yearBuilt: z.number().int().min(1900).max(2100).optional(),
  flagState: z.string().max(100).optional(),
  classificationSociety: z.string().max(100).optional(),
  iceClass: z.string().max(10).optional(),

  // ─── Capacity ──────────────────────────────────────────────────
  vesselConstant: z.number().nonnegative().optional(),  // stores/crew/provisions (MT)

  // ─── Bulk Carrier / General Cargo ──────────────────────────────
  grainCapacity: z.number().positive().optional(),      // cbm
  baleCapacity: z.number().positive().optional(),       // cbm
  numberOfHolds: z.number().int().positive().optional(),
  numberOfHatches: z.number().int().positive().optional(),
  grabFitted: z.boolean().optional(),

  // ─── Crane / Cargo Handling ────────────────────────────────────
  craneCount: z.number().int().nonnegative().optional(),
  craneSWL: z.number().positive().optional(),           // MT per crane
  hasTweenDecks: z.boolean().optional(),

  // ─── Container Ship ────────────────────────────────────────────
  teuCapacity: z.number().int().positive().optional(),
  feuCapacity: z.number().int().positive().optional(),
  reeferPlugs: z.number().int().nonnegative().optional(),

  // ─── Tanker ────────────────────────────────────────────────────
  tankCapacity: z.number().positive().optional(),       // cbm
  numberOfTanks: z.number().int().positive().optional(),
  coatedTanks: z.boolean().optional(),
  heatingCoils: z.boolean().optional(),
  pumpingRate: z.number().positive().optional(),        // cbm/hour
  hasIGS: z.boolean().optional(),
  hasCOW: z.boolean().optional(),
  hasSBT: z.boolean().optional(),

  // ─── LNG / LPG Carrier ────────────────────────────────────────
  cargoTankCapacityCbm: z.number().positive().optional(),
  containmentType: z.string().optional(),               // MEMBRANE, MOSS, TYPE_C
  boilOffRate: z.number().min(0).max(1).optional(),     // % per day (e.g. 0.10)
  dualFuelEngine: z.string().optional(),                // DFDE, ME_GI, X_DF, STEAM
  heelQuantity: z.number().nonnegative().optional(),    // cbm

  // ─── Speed profiles ────────────────────────────────────────────
  ladenSpeed: z.number().min(5).max(30, "Speed must be between 5-30 knots"),
  ballastSpeed: z.number().min(5).max(30, "Speed must be between 5-30 knots"),
  ecoLadenSpeed: z.number().min(5).max(30).optional(),
  ecoBallastSpeed: z.number().min(5).max(30).optional(),

  // ─── Consumption profiles (MT/day) ─────────────────────────────
  ladenConsumption: z.number().positive("Consumption must be positive").optional().nullable(),
  ballastConsumption: z.number().positive("Consumption must be positive").optional().nullable(),
  ecoLadenConsumption: z.number().positive().optional().nullable(),
  ecoBallastConsumption: z.number().positive().optional().nullable(),
  portConsumptionWithCrane: z.number().nonnegative().optional().nullable(),
  portConsumptionWithoutCrane: z.number().nonnegative().optional().nullable(),

  // Default fuel types for consumption states
  ballastFuelType: z.string().default("VLSFO"),
  ladenFuelType: z.string().default("VLSFO"),
  portFuelType: z.string().default("LSMGO"),

  // Fuel capabilities - all fuel types this vessel can burn
  fuelTypes: z.array(z.string()).optional(),

  // Per-fuel consumption profiles
  fuelConsumption: z.record(
    z.string(),
    z.object({
      laden: z.number().positive(),
      ballast: z.number().positive(),
    })
  ).optional(),

  // Commercial control & operating costs
  commercialControl: CommercialControlEnum.default("OWNED_BAREBOAT"),
  dailyOpex: z.number().positive("Daily OPEX must be positive").optional().nullable(),

  // TC-In Hire
  dailyTcHireRate: z.number().positive("Daily hire rate must be positive").optional().nullable(),
  tcHireStartDate: z.string().datetime().optional().nullable(),
  tcHireEndDate: z.string().datetime().optional().nullable(),

  // Equipment
  hasScrubber: z.boolean().default(false),
});

// Create schema - no blocking refinements, optional fields save as null
export const createVesselSchema = vesselBaseSchema;

// Update schema - partial of base (all fields optional for updates)
export const updateVesselSchema = vesselBaseSchema.partial();

export type CreateVesselInput = z.infer<typeof createVesselSchema>;
export type UpdateVesselInput = z.infer<typeof updateVesselSchema>;
