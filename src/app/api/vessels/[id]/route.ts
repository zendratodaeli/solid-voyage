import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { updateVesselSchema } from "@/lib/validators/vessel";
import {
  buildOwnerFilter,
  canDeleteVessel,
  logAudit,
  computeChanges,
  type AuthUser,
} from "@/lib/permissions";

const VESSEL_AUDIT_FIELDS = [
  "name", "imoNumber", "mmsiNumber", "vesselType", "dwt",
  // Dimensions
  "loa", "beam", "summerDraft", "grossTonnage", "netTonnage",
  // Identification
  "yearBuilt", "flagState", "classificationSociety", "iceClass", "vesselConstant",
  // Speed & Consumption
  "ladenSpeed", "ballastSpeed", "ecoLadenSpeed", "ecoBallastSpeed",
  "ladenConsumption", "ballastConsumption", "ecoLadenConsumption", "ecoBallastConsumption",
  "portConsumptionWithCrane", "portConsumptionWithoutCrane",
  "ballastFuelType", "ladenFuelType", "portFuelType",
  "dailyOpex", "commercialControl", "hasScrubber", "dailyTcHireRate", "tcHireStartDate", "tcHireEndDate",
  // Type-specific
  "grainCapacity", "baleCapacity", "numberOfHolds", "craneCount", "craneSWL",
  "teuCapacity", "reeferPlugs", "tankCapacity", "numberOfTanks", "pumpingRate",
  "cargoTankCapacityCbm", "containmentType", "boilOffRate",
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    
    const vessel = await prisma.vessel.findFirst({
      where: { id, ...buildOwnerFilter(user) },
      include: {
        voyages: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
    
    if (!vessel) {
      return NextResponse.json(
        { success: false, error: "Vessel not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: vessel });
  } catch (error) {
    console.error("Error fetching vessel:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch vessel" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const body = await request.json();
    
    // Check access (all org members can edit)
    const existing = await prisma.vessel.findFirst({
      where: { id, ...buildOwnerFilter(user) },
    });
    
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Vessel not found" },
        { status: 404 }
      );
    }
    
    // Validate input
    const validatedData = updateVesselSchema.parse(body);
    const userName = user.name || user.email;
    
    // Update vessel
    const vessel = await prisma.vessel.update({
      where: { id },
      data: {
        ...validatedData,
        updatedByName: userName,
      },
    });
    
    // Log audit with field diffs
    if (user.activeOrgId) {
      const changes = computeChanges(
        existing as unknown as Record<string, unknown>,
        validatedData as unknown as Record<string, unknown>,
        VESSEL_AUDIT_FIELDS
      );
      await logAudit({
        orgId: user.activeOrgId,
        entityType: "vessel",
        entityId: vessel.id,
        entityName: vessel.name,
        action: "updated",
        userId: user.id,
        userName,
        changes: changes ?? undefined,
      });
    }
    
    return NextResponse.json({ success: true, data: vessel });
  } catch (error: unknown) {
    console.error("Error updating vessel:", error);
    
    if (error && typeof error === 'object' && 'name' in error && error.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: `Failed to update vessel: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    
    // Admin-only delete check
    if (user.activeOrgId && !canDeleteVessel(user.orgRole)) {
      return NextResponse.json(
        { success: false, error: "Only organization admins can delete vessels" },
        { status: 403 }
      );
    }
    
    // Check access
    const existing = await prisma.vessel.findFirst({
      where: { id, ...buildOwnerFilter(user) },
    });
    
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Vessel not found" },
        { status: 404 }
      );
    }
    
    // Log audit before deletion
    if (user.activeOrgId) {
      await logAudit({
        orgId: user.activeOrgId,
        entityType: "vessel",
        entityId: existing.id,
        entityName: existing.name,
        action: "deleted",
        userId: user.id,
        userName: user.name || user.email,
      });
    }
    
    // Delete vessel (cascades to voyages)
    await prisma.vessel.delete({ where: { id } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting vessel:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete vessel" },
      { status: 500 }
    );
  }
}
