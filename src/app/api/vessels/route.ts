import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { createVesselSchema } from "@/lib/validators/vessel";
import {
  buildOwnerFilter,
  buildCreateData,
  logAudit,
  type AuthUser,
} from "@/lib/permissions";
import { apiRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

// ─── Pagination defaults ─────────────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser() as AuthUser;
    const { searchParams } = new URL(request.url);
    
    // ─── Pagination ───────────────────────────────────────────
    const page = Math.max(1, parseInt(searchParams.get("page") || String(DEFAULT_PAGE)));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE))));
    const skip = (page - 1) * pageSize;
    
    const where = buildOwnerFilter(user);
    
    const [vessels, total] = await Promise.all([
      prisma.vessel.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { voyages: true } },
        },
        skip,
        take: pageSize,
      }),
      prisma.vessel.count({ where }),
    ]);
    
    return NextResponse.json({
      success: true,
      data: vessels,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching vessels:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch vessels" },
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
    const validatedData = createVesselSchema.parse(body);
    
    const userName = user.name || user.email;
    
    // Create vessel with org context
    const vessel = await prisma.vessel.create({
      data: {
        ...buildCreateData(user),
        // ─── Identity ─────────────────────────────────────────
        name: validatedData.name,
        imoNumber: validatedData.imoNumber,
        mmsiNumber: validatedData.mmsiNumber,
        vesselType: validatedData.vesselType,
        customVesselType: validatedData.customVesselType,
        dwt: validatedData.dwt,
        // ─── Dimensions ───────────────────────────────────────
        loa: validatedData.loa,
        beam: validatedData.beam,
        summerDraft: validatedData.summerDraft,
        grossTonnage: validatedData.grossTonnage,
        netTonnage: validatedData.netTonnage,
        // ─── Identification ───────────────────────────────────
        yearBuilt: validatedData.yearBuilt,
        flagState: validatedData.flagState,
        classificationSociety: validatedData.classificationSociety,
        iceClass: validatedData.iceClass,
        vesselConstant: validatedData.vesselConstant,
        // ─── Bulk Carrier / General Cargo ─────────────────────
        grainCapacity: validatedData.grainCapacity,
        baleCapacity: validatedData.baleCapacity,
        numberOfHolds: validatedData.numberOfHolds,
        numberOfHatches: validatedData.numberOfHatches,
        grabFitted: validatedData.grabFitted,
        // ─── Crane / Cargo Handling ───────────────────────────
        craneCount: validatedData.craneCount,
        craneSWL: validatedData.craneSWL,
        hasTweenDecks: validatedData.hasTweenDecks,
        // ─── Container Ship ───────────────────────────────────
        teuCapacity: validatedData.teuCapacity,
        feuCapacity: validatedData.feuCapacity,
        reeferPlugs: validatedData.reeferPlugs,
        // ─── Tanker ───────────────────────────────────────────
        tankCapacity: validatedData.tankCapacity,
        numberOfTanks: validatedData.numberOfTanks,
        coatedTanks: validatedData.coatedTanks,
        heatingCoils: validatedData.heatingCoils,
        pumpingRate: validatedData.pumpingRate,
        hasIGS: validatedData.hasIGS,
        hasCOW: validatedData.hasCOW,
        hasSBT: validatedData.hasSBT,
        // ─── LNG / LPG ───────────────────────────────────────
        cargoTankCapacityCbm: validatedData.cargoTankCapacityCbm,
        containmentType: validatedData.containmentType,
        boilOffRate: validatedData.boilOffRate,
        dualFuelEngine: validatedData.dualFuelEngine,
        heelQuantity: validatedData.heelQuantity,
        // ─── Speed & Consumption ──────────────────────────────
        ladenSpeed: validatedData.ladenSpeed,
        ballastSpeed: validatedData.ballastSpeed,
        ecoLadenSpeed: validatedData.ecoLadenSpeed,
        ecoBallastSpeed: validatedData.ecoBallastSpeed,
        ladenConsumption: validatedData.ladenConsumption ?? null,
        ballastConsumption: validatedData.ballastConsumption ?? null,
        ecoLadenConsumption: validatedData.ecoLadenConsumption,
        ecoBallastConsumption: validatedData.ecoBallastConsumption,
        portConsumptionWithCrane: validatedData.portConsumptionWithCrane,
        portConsumptionWithoutCrane: validatedData.portConsumptionWithoutCrane,
        ballastFuelType: validatedData.ballastFuelType,
        ladenFuelType: validatedData.ladenFuelType,
        portFuelType: validatedData.portFuelType,
        fuelTypes: validatedData.fuelTypes,
        fuelConsumption: validatedData.fuelConsumption,
        // ─── Commercial & Equipment ───────────────────────────
        dailyOpex: validatedData.dailyOpex ?? null,
        commercialControl: validatedData.commercialControl ?? "OWNED_BAREBOAT",
        dailyTcHireRate: validatedData.dailyTcHireRate ?? null,
        tcHireStartDate: validatedData.tcHireStartDate ? new Date(validatedData.tcHireStartDate) : null,
        tcHireEndDate: validatedData.tcHireEndDate ? new Date(validatedData.tcHireEndDate) : null,
        hasScrubber: validatedData.hasScrubber ?? false,
        createdByName: userName,
        updatedByName: userName,
      },
    });
    
    // Log audit
    if (user.activeOrgId) {
      await logAudit({
        orgId: user.activeOrgId,
        entityType: "vessel",
        entityId: vessel.id,
        entityName: vessel.name,
        action: "created",
        userId: user.id,
        userName,
      });
    }
    
    return NextResponse.json({ success: true, data: vessel }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating vessel:", error);
    
    if (error && typeof error === 'object' && 'name' in error && error.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error },
        { status: 400 }
      );
    }
    
    // Handle Prisma unique constraint violations (e.g., duplicate IMO number)
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      const meta = (error as { meta?: { target?: string[] } }).meta;
      const fields = meta?.target || [];
      if (fields.includes("imoNumber")) {
        return NextResponse.json(
          { success: false, error: "A vessel with this IMO number already exists. Please use a different IMO number or edit the existing vessel." },
          { status: 409 }
        );
      }
      if (fields.includes("mmsiNumber")) {
        return NextResponse.json(
          { success: false, error: "A vessel with this MMSI number already exists." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: "A vessel with these details already exists." },
        { status: 409 }
      );
    }
    
    // Log the actual error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Vessel creation error details:", errorMessage);
    
    return NextResponse.json(
      { success: false, error: `Failed to create vessel: ${errorMessage}` },
      { status: 500 }
    );
  }
}
