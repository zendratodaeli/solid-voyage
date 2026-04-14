/**
 * Zod Schemas for Prisma Json Fields
 *
 * Provides runtime validation for all Json/Json? columns in the database.
 * Use these when reading from OR writing to Json fields outside of API routes
 * (seed scripts, server components, direct Prisma calls).
 *
 * API routes already validate via their own Zod schemas — these are the
 * "defense-in-depth" layer that protects the database from malformed data
 * regardless of the code path.
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════
// VESSEL Json Fields
// ═══════════════════════════════════════════════════════════════════

/**
 * Vessel.fuelTypes — array of fuel type strings this vessel can burn.
 * Example: ["VLSFO", "LSMGO", "LNG"]
 */
export const fuelTypesSchema = z.array(z.string()).nullable().optional();

/**
 * Vessel.fuelConsumption — per-fuel consumption profiles.
 * Example: { "VLSFO": { "laden": 14, "ballast": 11 }, "MGO": { "laden": 12, "ballast": 10 } }
 */
export const fuelConsumptionSchema = z
  .record(
    z.string(),
    z.object({
      laden: z.number(),
      ballast: z.number(),
    })
  )
  .nullable()
  .optional();

// ═══════════════════════════════════════════════════════════════════
// VOYAGE Json Fields
// ═══════════════════════════════════════════════════════════════════

/** Port detail entry for load/discharge */
const portDetailSchema = z.object({
  port: z.string(),
  days: z.number(),
  waitingDays: z.number(),
  idleDays: z.number(),
  pdaCost: z.number(),
  useCrane: z.boolean(),
});

/** Cargo parcel entry */
const cargoParcelSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  loadPort: z.string(),
  dischargePort: z.string(),
  freightRate: z.number().optional(),
});

/** Additional cost entry */
const additionalCostSchema = z.object({
  name: z.string(),
  amount: z.number(),
});

/**
 * Voyage.voyageLegs — multi-port voyage leg structure.
 */
export const voyageLegsSchema = z
  .object({
    loadPorts: z.array(z.string()),
    dischargePorts: z.array(z.string()),
    legs: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.string(),
        cargoMt: z.number().optional(),
        distanceNm: z.number().optional(),
      })
    ),
    portDetails: z
      .object({
        load: z.array(portDetailSchema),
        discharge: z.array(portDetailSchema),
      })
      .optional(),
    additionalCosts: z.array(additionalCostSchema).optional(),
    cargoParcels: z.array(cargoParcelSchema).optional(),
  })
  .nullable()
  .optional();

/**
 * Voyage.fuelPrices — dynamic fuel prices by type.
 * Example: { "VLSFO": 555, "LSMGO": 785 }
 */
export const fuelPricesSchema = z
  .record(z.string(), z.number())
  .nullable()
  .optional();

// ═══════════════════════════════════════════════════════════════════
// FREIGHT RECOMMENDATION Json Fields
// ═══════════════════════════════════════════════════════════════════

/**
 * FreightRecommendation.assumptions — key assumptions used in recommendation.
 */
export const assumptionsSchema = z.record(z.string(), z.unknown());

// ═══════════════════════════════════════════════════════════════════
// SCENARIO Json Fields
// ═══════════════════════════════════════════════════════════════════

/**
 * Scenario.overrides — parameter overrides from base voyage.
 * Example: { ladenSpeed: 12, bunkerPriceUsd: 550 }
 */
export const scenarioOverridesSchema = z.record(z.string(), z.unknown());

/**
 * Scenario.results — full calculation results snapshot.
 */
export const scenarioResultsSchema = z.record(z.string(), z.unknown());

// ═══════════════════════════════════════════════════════════════════
// LAYTIME Json Fields
// ═══════════════════════════════════════════════════════════════════

/**
 * LaytimeCalculation.events — time sheet event array.
 */
export const laytimeEventsSchema = z.array(
  z.object({
    id: z.string().optional(),
    from: z.string(), // ISO datetime
    to: z.string(),   // ISO datetime
    description: z.string().optional(),
    excluded: z.boolean().optional(),
    reason: z.string().optional(),
  })
);

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOG Json Fields
// ═══════════════════════════════════════════════════════════════════

/**
 * AuditLog.changes — field-level diffs.
 * Example: { "speed": { "from": 12, "to": 14 } }
 */
export const auditChangesSchema = z
  .record(
    z.string(),
    z.object({
      from: z.unknown(),
      to: z.unknown(),
    })
  )
  .nullable()
  .optional();

// ═══════════════════════════════════════════════════════════════════
// HELPER: Safe parse with fallback
// ═══════════════════════════════════════════════════════════════════

/**
 * Safely parse a Json field value against a Zod schema.
 * Returns the parsed value if valid, or the fallback if invalid.
 * Logs a warning on validation failure for debugging.
 */
export function safeParseJson<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fieldName: string,
  fallback: T
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  console.warn(
    `[Json Validation] Invalid data in "${fieldName}":`,
    result.error.issues.map((i) => i.message).join(", ")
  );
  return fallback;
}

/**
 * Validate a Json field value before writing to the database.
 * Throws a descriptive error if validation fails.
 */
export function validateJsonField<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fieldName: string
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  throw new Error(
    `Invalid data for "${fieldName}": ${result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")}`
  );
}
