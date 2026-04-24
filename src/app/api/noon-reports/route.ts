import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════
// Noon Report CRUD — Vessel performance data collection
// Used for building ML fuel curves (Gap 3: RPM-Specific Fuel Curves)
// ═══════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const vesselId = searchParams.get("vesselId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = { organizationId: orgId };
    if (vesselId) where.vesselId = vesselId;

    const [reports, total] = await Promise.all([
      prisma.noonReport.findMany({
        where,
        orderBy: { reportDate: "desc" },
        take: limit,
        skip: offset,
        include: {
          vessel: { select: { name: true, imoNumber: true, mmsiNumber: true } },
        },
      }),
      prisma.noonReport.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: reports,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    console.error("[NOON_REPORTS] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch noon reports" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await auth();
    if (!orgId || !userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      vesselId,
      reportDate,
      lat,
      lon,
      speedOverGround,
      speedThroughWater,
      rpm,
      engineLoad,
      fuelConsumedMT,
      fuelType,
      avgDraft,
      windForce,
      windDirection,
      seaState,
      swellHeight,
      currentSpeed,
      currentDirection,
      visibility,
      pressure,
      voyageId,
      liveSessionId,
      portOfDeparture,
      nextPort,
      distanceRun,
      distanceToGo,
      eta,
      cargoQuantityMT,
      cargoType,
      engineType,
      engineMaker,
      remarks,
      reportedByName,
    } = body;

    // Basic validation
    if (!reportDate || lat == null || lon == null || !speedOverGround || !fuelConsumedMT) {
      return NextResponse.json(
        { error: "Required: reportDate, lat, lon, speedOverGround, fuelConsumedMT" },
        { status: 400 }
      );
    }

    const report = await prisma.noonReport.create({
      data: {
        organizationId: orgId,
        vesselId: vesselId || null,
        reportDate: new Date(reportDate),
        lat: Number(lat),
        lon: Number(lon),
        speedOverGround: Number(speedOverGround),
        speedThroughWater: speedThroughWater ? Number(speedThroughWater) : null,
        rpm: rpm ? Number(rpm) : null,
        engineLoad: engineLoad ? Number(engineLoad) : null,
        fuelConsumedMT: Number(fuelConsumedMT),
        fuelType: fuelType || "VLSFO",
        avgDraft: avgDraft ? Number(avgDraft) : null,
        windForce: windForce != null ? Number(windForce) : null,
        windDirection: windDirection ? Number(windDirection) : null,
        seaState: seaState != null ? Number(seaState) : null,
        swellHeight: swellHeight ? Number(swellHeight) : null,
        currentSpeed: currentSpeed ? Number(currentSpeed) : null,
        currentDirection: currentDirection ? Number(currentDirection) : null,
        visibility: visibility || null,
        pressure: pressure ? Number(pressure) : null,
        voyageId: voyageId || null,
        liveSessionId: liveSessionId || null,
        portOfDeparture: portOfDeparture || null,
        nextPort: nextPort || null,
        distanceRun: distanceRun ? Number(distanceRun) : null,
        distanceToGo: distanceToGo ? Number(distanceToGo) : null,
        eta: eta ? new Date(eta) : null,
        cargoQuantityMT: cargoQuantityMT ? Number(cargoQuantityMT) : null,
        cargoType: cargoType || null,
        engineType: engineType || null,
        engineMaker: engineMaker || null,
        remarks: remarks || null,
        reportedBy: userId,
        reportedByName: reportedByName || null,
      },
    });

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[NOON_REPORTS] POST error:", errMsg);
    return NextResponse.json(
      { error: `Failed to create noon report: ${errMsg}` },
      { status: 500 }
    );
  }
}
