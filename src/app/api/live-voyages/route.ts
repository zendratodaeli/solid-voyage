import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════
// Live Voyage Sessions CRUD
// POST: Create a new live voyage session
// GET: List active/completed sessions for org
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      vesselId,
      vesselName,
      vesselType,
      vesselDwt,
      vesselSpeed,
      vesselMmsi,
      vesselImo,
      originPort,
      destinationPort,
      routeDistanceNm,
      etd,
      plannedRouteJson,
      weatherDataJson,
      complianceJson,
      routeIntelJson,
      aiRecommendation,
      waypointsJson,
    } = body;

    if (!vesselName || !originPort || !destinationPort) {
      return NextResponse.json(
        { error: "vesselName, originPort, and destinationPort are required" },
        { status: 400 }
      );
    }

    const session = await prisma.liveVoyageSession.create({
      data: {
        organizationId: orgId,
        createdBy: userId,
        vesselId,
        vesselName,
        vesselType: vesselType || "BULK_CARRIER",
        vesselDwt: vesselDwt || 50000,
        vesselSpeed: vesselSpeed || 12.5,
        vesselMmsi,
        vesselImo,
        originPort,
        destinationPort,
        routeDistanceNm: routeDistanceNm || 0,
        etd: etd ? new Date(etd) : null,
        plannedRouteJson,
        weatherDataJson,
        complianceJson,
        routeIntelJson,
        aiRecommendation,
        waypointsJson,
        status: "active",
      },
    });

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error("[LIVE_VOYAGES] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create live voyage session" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // active, completed, all
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, unknown> = { organizationId: orgId };
    if (status && status !== "all") {
      where.status = status;
    }

    const sessions = await prisma.liveVoyageSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        _count: {
          select: { trackPoints: true, nearbyObjects: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    console.error("[LIVE_VOYAGES] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch live voyage sessions" },
      { status: 500 }
    );
  }
}
