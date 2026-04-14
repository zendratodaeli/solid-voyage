import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  buildCreateData,
  buildVoyageListFilter,
  logAudit,
  type AuthUser,
} from "@/lib/permissions";
import { apiRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

// ─── Pagination defaults ─────────────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// FuelType enum for validation
const FuelTypeEnum = z.enum(["VLSFO", "LSMGO", "HFO", "HSFO", "MGO", "LNG"]);

// Updated validation schema with multi-fuel + extended vessel support
const createVoyageSchema = z.object({
  vesselId: z.string().min(1, "Vessel is required"),
  openPort: z.string().optional(),
  loadPort: z.string().min(1, "Load port is required"),
  dischargePort: z.string().min(1, "Discharge port is required"),
  voyageLegs: z.object({
    loadPorts: z.array(z.string()),
    dischargePorts: z.array(z.string()),
    legs: z.array(z.object({
      from: z.string(),
      to: z.string(),
      type: z.string(),
      cargoMt: z.number().optional(),
      distanceNm: z.number().optional(),
    })),
    portDetails: z.object({
      load: z.array(z.object({
        port: z.string(),
        days: z.number(),
        waitingDays: z.number(),
        idleDays: z.number(),
        pdaCost: z.number(),
        useCrane: z.boolean(),
      })),
      discharge: z.array(z.object({
        port: z.string(),
        days: z.number(),
        waitingDays: z.number(),
        idleDays: z.number(),
        pdaCost: z.number(),
        useCrane: z.boolean(),
      })),
    }).optional(),
    additionalCosts: z.array(z.object({
      name: z.string(),
      amount: z.number(),
    })).optional(),
    cargoParcels: z.array(z.object({
      name: z.string(),
      quantity: z.number(),
      loadPort: z.string(),
      dischargePort: z.string(),
      freightRate: z.number().optional(),
    })).optional(),
    // Route Intelligence data (from inline NavAPI route calculation)
    routeIntelligence: z.object({
      routeData: z.any().optional(),
      calculatedAt: z.string().optional(),
      totalDistanceNm: z.number().optional(),
      totalEcaDistanceNm: z.number().optional(),
      estimatedSeaDays: z.number().optional(),
      detectedCanals: z.array(z.string()).optional(),
      legs: z.array(z.any()).optional(),
    }).optional(),
  }).optional(),
  cargoQuantityMt: z.number().min(0, "Cargo quantity must be non-negative"),
  cargoType: z.string().optional(),
  stowageFactor: z.number().positive().optional(),
  freightRateUnit: z.enum(["PER_MT", "PER_TEU", "PER_CBM", "LUMP_SUM", "WORLDSCALE"]).default("PER_MT"),
  ballastDistanceNm: z.number().positive("Ballast distance must be positive"),
  ladenDistanceNm: z.number().positive("Laden distance must be positive"),
  loadPortDays: z.number().min(0, "Load port days cannot be negative"),
  dischargePortDays: z.number().min(0, "Discharge port days cannot be negative"),
  waitingDays: z.number().nonnegative().default(0),
  idleDays: z.number().nonnegative().default(0),
  useEcoSpeed: z.boolean().default(false),
  overrideLadenSpeed: z.number().min(5).max(30).optional(),
  overrideBallastSpeed: z.number().min(5).max(30).optional(),
  bunkerPriceUsd: z.number().positive("Bunker price must be positive"),
  freightRateUsd: z.number().positive().optional(),
  useCrane: z.boolean().default(false),
  brokeragePercent: z.number().min(0).max(10).default(1.25),
  commissionPercent: z.number().min(0).max(10).default(3.75),
  additionalCosts: z.number().nonnegative().default(0),
  pdaCosts: z.number().nonnegative().default(0),
  lubOilCosts: z.number().nonnegative().default(0),
  canalTolls: z.number().nonnegative().default(0),
  // Multi-fuel support - accepts any string to support custom fuel types
  fuelPrices: z.record(z.string(), z.number()).optional(),
  ladenFuelType: z.string().optional(),
  ballastFuelType: z.string().optional(),
  portFuelType: z.string().optional(),
  // EU ETS country codes
  loadPortCountryCode: z.string().length(2).optional(),
  dischargePortCountryCode: z.string().length(2).optional(),
  euEtsApplicable: z.boolean().default(false),
  euEtsPercentage: z.number().min(0).max(100).default(0),
  // Laycan (loading window)
  laycanStart: z.string().optional(),
  laycanEnd: z.string().optional(),
  // Optional status override (for "Save as Draft")
  status: z.enum(["DRAFT", "NEW"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser() as AuthUser;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    
    // ─── Pagination ───────────────────────────────────────────
    const page = Math.max(1, parseInt(searchParams.get("page") || String(DEFAULT_PAGE)));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE))));
    const skip = (page - 1) * pageSize;
    
    // Build org-aware filter (admin sees all, members see own + shared)
    const baseFilter = await buildVoyageListFilter(user);
    const where: Record<string, unknown> = { ...baseFilter };
    if (status && status !== "all") {
      where.status = status.toUpperCase();
    }
    
    // Fetch paginated data + total count in parallel
    const [voyages, total] = await Promise.all([
      prisma.voyage.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: {
          vessel: true,
          calculations: true,
          recommendations: true,
        },
        skip,
        take: pageSize,
      }),
      prisma.voyage.count({ where }),
    ]);
    
    return NextResponse.json({
      success: true,
      data: voyages,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching voyages:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch voyages" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser() as AuthUser;
    
    // ─── Rate Limiting ────────────────────────────────────────
    const blocked = apiRateLimit(request, user.clerkId, WRITE_RATE_LIMIT);
    if (blocked) return blocked;
    
    const body = await request.json();
    
    // Validate input
    const validatedData = createVoyageSchema.parse(body);
    
    // Verify vessel access (org-aware)
    const vesselFilter = user.activeOrgId
      ? { id: validatedData.vesselId, orgId: user.activeOrgId }
      : { id: validatedData.vesselId, userId: user.id };
    
    const vessel = await prisma.vessel.findFirst({
      where: vesselFilter,
    });
    
    if (!vessel) {
      return NextResponse.json(
        { success: false, error: "Vessel not found" },
        { status: 404 }
      );
    }
    
    // Create voyage with org context (private to creator by default)
    const voyage = await prisma.voyage.create({
      data: {
        vesselId: validatedData.vesselId,
        ...buildCreateData(user),
        openPort: validatedData.openPort,
        loadPort: validatedData.loadPort,
        dischargePort: validatedData.dischargePort,
        voyageLegs: validatedData.voyageLegs ? validatedData.voyageLegs : undefined,
        cargoQuantityMt: validatedData.cargoQuantityMt,
        cargoType: validatedData.cargoType,
        stowageFactor: validatedData.stowageFactor,
        freightRateUnit: validatedData.freightRateUnit,
        ballastDistanceNm: validatedData.ballastDistanceNm,
        ladenDistanceNm: validatedData.ladenDistanceNm,
        loadPortDays: validatedData.loadPortDays,
        dischargePortDays: validatedData.dischargePortDays,
        waitingDays: validatedData.waitingDays,
        idleDays: validatedData.idleDays,
        useEcoSpeed: validatedData.useEcoSpeed,
        overrideLadenSpeed: validatedData.overrideLadenSpeed,
        overrideBallastSpeed: validatedData.overrideBallastSpeed,
        useCrane: validatedData.useCrane,
        brokeragePercent: validatedData.brokeragePercent,
        commissionPercent: validatedData.commissionPercent,
        additionalCosts: validatedData.additionalCosts,
        pdaCosts: validatedData.pdaCosts,
        lubOilCosts: validatedData.lubOilCosts,
        canalTolls: validatedData.canalTolls,
        bunkerPriceUsd: validatedData.bunkerPriceUsd,
        freightRateUsd: validatedData.freightRateUsd,
        // EU ETS country codes
        loadPortCountryCode: validatedData.loadPortCountryCode,
        dischargePortCountryCode: validatedData.dischargePortCountryCode,
        euEtsApplicable: validatedData.euEtsApplicable,
        euEtsPercentage: validatedData.euEtsPercentage,
        // Multi-fuel support
        fuelPrices: validatedData.fuelPrices ? validatedData.fuelPrices : undefined,
        ladenFuelType: validatedData.ladenFuelType,
        ballastFuelType: validatedData.ballastFuelType,
        portFuelType: validatedData.portFuelType,
        // Laycan
        laycanStart: validatedData.laycanStart ? new Date(validatedData.laycanStart) : undefined,
        laycanEnd: validatedData.laycanEnd ? new Date(validatedData.laycanEnd) : undefined,
        // Status override (for draft saves)
        status: validatedData.status || "DRAFT",
      },
      include: {
        vessel: true,
      },
    });
    
    // Audit log: record voyage creation
    if (user.activeOrgId) {
      const routeName = `${voyage.loadPort} → ${voyage.dischargePort}`;
      await logAudit({
        orgId: user.activeOrgId,
        entityType: "voyage",
        entityId: voyage.id,
        entityName: routeName,
        action: "created",
        userId: user.id,
        userName: user.name || user.email,
      });
    }
    
    return NextResponse.json({ success: true, data: voyage }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating voyage:", error);
    
    if (error && typeof error === 'object' && 'name' in error && error.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: "Failed to create voyage" },
      { status: 500 }
    );
  }
}
