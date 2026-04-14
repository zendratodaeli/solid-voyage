import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { buildOwnerFilter, logAudit, computeChanges, type AuthUser } from "@/lib/permissions";

// GET — fetch a single calculation
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const filter = buildOwnerFilter(user);

    const calc = await prisma.laytimeCalculation.findFirst({
      where: { id, ...filter },
    });

    if (!calc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: calc });
  } catch (error) {
    console.error("Error fetching laytime calculation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch calculation" },
      { status: 500 }
    );
  }
}

// PUT — update a calculation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const body = await request.json();
    const filter = buildOwnerFilter(user);

    // Check exists & access
    const existing = await prisma.laytimeCalculation.findFirst({
      where: { id, ...filter },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const calc = await prisma.laytimeCalculation.update({
      where: { id },
      data: {
        vesselName: body.vesselName,
        voyageRef: body.voyageRef,
        portName: body.portName,
        operationType: body.operationType,
        laytimeMode: body.laytimeMode,
        allowedHours: body.allowedHours,
        cargoQuantity: body.cargoQuantity || null,
        loadingRate: body.loadingRate || null,
        terms: body.terms,
        demurrageRate: body.demurrageRate,
        despatchRate: body.despatchRate,
        norTendered: body.norTendered ? new Date(body.norTendered) : null,
        laytimeCommenced: body.laytimeCommenced ? new Date(body.laytimeCommenced) : null,
        reversible: body.reversible || false,
        events: body.events || [],
        resultType: body.resultType || null,
        resultAmount: body.resultAmount || null,
        countedHours: body.countedHours || null,
        excludedHours: body.excludedHours || null,
        updatedAt: new Date(),
      },
    });

    // Audit log
    if (user.activeOrgId) {
      const fieldsToTrack = [
        "vesselName", "portName", "terms", "allowedHours",
        "demurrageRate", "despatchRate", "resultType", "resultAmount",
      ];
      const changes = computeChanges(
        existing as unknown as Record<string, unknown>,
        body as Record<string, unknown>,
        fieldsToTrack
      );
      const label = `${calc.vesselName || "Unnamed"} — ${calc.portName || "No Port"}`;
      await logAudit({
        orgId: user.activeOrgId,
        entityType: "voyage",
        entityId: id,
        entityName: `Laytime: ${label}`,
        action: "updated",
        userId: user.id,
        userName: user.name || user.email,
        changes: changes ?? undefined,
      });
    }

    return NextResponse.json({ success: true, data: calc });
  } catch (error) {
    console.error("Error updating laytime calculation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update calculation" },
      { status: 500 }
    );
  }
}

// DELETE
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const filter = buildOwnerFilter(user);

    const existing = await prisma.laytimeCalculation.findFirst({
      where: { id, ...filter },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await prisma.laytimeCalculation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting laytime calculation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete calculation" },
      { status: 500 }
    );
  }
}
