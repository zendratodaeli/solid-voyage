import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  getVoyagePermission,
  canModifyVoyage,
  canDeleteVoyage,
  logAudit,
  computeChanges,
  type AuthUser,
} from "@/lib/permissions";

const updateVoyageSchema = z.object({
  vesselId: z.string().min(1).optional(),
  openPort: z.string().optional(),
  loadPort: z.string().min(1).optional(),
  dischargePort: z.string().min(1).optional(),
  cargoQuantityMt: z.number().min(0).optional(),
  ballastDistanceNm: z.number().min(0).optional(),
  ladenDistanceNm: z.number().min(0).optional(),
  loadPortDays: z.number().min(0).optional(),
  dischargePortDays: z.number().min(0).optional(),
  waitingDays: z.number().min(0).optional(),
  idleDays: z.number().min(0).optional(),
  bunkerPriceUsd: z.number().positive().optional(),
  freightRateUsd: z.number().positive().optional().nullable(),
  brokeragePercent: z.number().min(0).max(100).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  additionalCosts: z.number().min(0).optional(),
  pdaCosts: z.number().min(0).optional(),
  lubOilCosts: z.number().min(0).optional(),
  useEcoSpeed: z.boolean().optional(),
  useCrane: z.boolean().optional(),
  canalTolls: z.number().min(0).optional(),
  weatherRiskMultiplier: z.number().min(0).optional(),
  // Rich voyage data (JSON fields)
  voyageLegs: z.any().optional(),
  fuelPrices: z.record(z.string(), z.number()).optional(),
  // Fuel type overrides
  ballastFuelType: z.string().optional(),
  ladenFuelType: z.string().optional(),
  portFuelType: z.string().optional(),
  // Laycan (loading window)
  laycanStart: z.string().optional().nullable(),
  laycanEnd: z.string().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    
    // Check voyage access permission
    const permission = await getVoyagePermission(user, id);
    if (!permission) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }
    
    const voyage = await prisma.voyage.findUnique({
      where: { id },
      include: {
        vessel: true,
        calculations: true,
        recommendations: true,
      },
    });
    
    return NextResponse.json({ success: true, data: voyage, permission });
  } catch (error) {
    console.error("Error fetching voyage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch voyage" },
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
    
    // Check permission (need owner, admin, or update)
    const permission = await getVoyagePermission(user, id);
    if (!permission || !canModifyVoyage(permission)) {
      return NextResponse.json(
        { success: false, error: permission ? "Insufficient permissions" : "Voyage not found" },
        { status: permission ? 403 : 404 }
      );
    }
    
    // Validate input
    const validatedData = updateVoyageSchema.parse(body);
    
    // If changing vessel, verify vessel access
    if (validatedData.vesselId) {
      const vesselFilter = user.activeOrgId
        ? { id: validatedData.vesselId, orgId: user.activeOrgId }
        : { id: validatedData.vesselId, userId: user.id };
      const vessel = await prisma.vessel.findFirst({ where: vesselFilter });
      if (!vessel) {
        return NextResponse.json(
          { success: false, error: "Vessel not found" },
          { status: 404 }
        );
      }
    }
    
    // Fetch old voyage state for audit diff
    const oldVoyage = await prisma.voyage.findUnique({
      where: { id },
      include: { vessel: true },
    });
    
    // Prepare update data — convert laycan strings to Date objects
    const { laycanStart, laycanEnd, ...restData } = validatedData;
    const updatePayload: Record<string, unknown> = {
      ...restData,
      status: "DRAFT",
      updatedAt: new Date(),
    };
    if (laycanStart !== undefined) {
      updatePayload.laycanStart = laycanStart ? new Date(laycanStart) : null;
    }
    if (laycanEnd !== undefined) {
      updatePayload.laycanEnd = laycanEnd ? new Date(laycanEnd) : null;
    }

    // Update voyage and reset status to DRAFT for recalculation
    const voyage = await prisma.voyage.update({
      where: { id },
      data: updatePayload,
      include: {
        vessel: true,
      },
    });
    
    // Audit log: compute changes and record
    if (oldVoyage && user.activeOrgId) {
      const fieldsToTrack = [
        "vesselId", "loadPort", "dischargePort", "cargoQuantityMt",
        "ballastDistanceNm", "ladenDistanceNm", "loadPortDays", "dischargePortDays",
        "waitingDays", "idleDays", "bunkerPriceUsd", "freightRateUsd",
        "brokeragePercent", "commissionPercent", "additionalCosts", "pdaCosts",
        "lubOilCosts", "canalTolls", "useCrane", "ballastFuelType", "ladenFuelType",
        "portFuelType",
      ];
      const changes = computeChanges(
        oldVoyage as unknown as Record<string, unknown>,
        validatedData as Record<string, unknown>,
        fieldsToTrack
      );
      const routeName = `${voyage.loadPort} → ${voyage.dischargePort}`;
      await logAudit({
        orgId: user.activeOrgId,
        entityType: "voyage",
        entityId: id,
        entityName: routeName,
        action: "updated",
        userId: user.id,
        userName: user.name || user.email,
        changes: changes ?? undefined,
      });
    }
    
    return NextResponse.json({ success: true, data: voyage });
  } catch (error: unknown) {
    console.error("Error updating voyage:", error);
    
    if (error && typeof error === 'object' && 'name' in error && error.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: "Failed to update voyage" },
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
    
    // Only the voyage owner can delete
    const permission = await getVoyagePermission(user, id);
    if (!permission || !canDeleteVoyage(permission)) {
      return NextResponse.json(
        { success: false, error: permission ? "Only the voyage owner can delete" : "Voyage not found" },
        { status: permission ? 403 : 404 }
      );
    }
    
    // Delete voyage (cascades to calculations and recommendations)
    await prisma.voyage.delete({ where: { id } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting voyage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete voyage" },
      { status: 500 }
    );
  }
}
