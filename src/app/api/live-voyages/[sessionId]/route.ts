import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════
// Live Voyage Session Detail
// GET: Fetch session with track points + nearby objects
// PATCH: Update session status (pause, complete, cancel)
// POST: Add track points / nearby objects in bulk
// ═══════════════════════════════════════════════════════════════════

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { sessionId } = await params;

    const session = await prisma.liveVoyageSession.findFirst({
      where: { id: sessionId, organizationId: orgId },
      include: {
        trackPoints: {
          orderBy: { timestamp: "asc" },
        },
        nearbyObjects: {
          orderBy: { timestamp: "desc" },
          take: 200, // Last 200 nearby objects
        },
        _count: {
          select: { trackPoints: true, nearbyObjects: true },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error("[LIVE_VOYAGE_SESSION] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { sessionId } = await params;
    const body = await req.json();
    const { status } = body;

    const updateData: Record<string, unknown> = {};
    if (status === "completed") {
      updateData.status = "completed";
      updateData.completedAt = new Date();
    } else if (status === "paused") {
      updateData.status = "paused";
      updateData.pausedAt = new Date();
    } else if (status === "active") {
      updateData.status = "active";
      updateData.pausedAt = null;
    } else if (status === "cancelled") {
      updateData.status = "cancelled";
      updateData.completedAt = new Date();
    }

    const session = await prisma.liveVoyageSession.update({
      where: { id: sessionId, organizationId: orgId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error("[LIVE_VOYAGE_SESSION] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}

// POST: Add track points and nearby objects in bulk
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { sessionId } = await params;
    const body = await req.json();
    const { trackPoints, nearbyObjects } = body;

    // Verify session belongs to org
    const session = await prisma.liveVoyageSession.findFirst({
      where: { id: sessionId, organizationId: orgId },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const results: { trackPointsAdded: number; nearbyObjectsAdded: number } = {
      trackPointsAdded: 0,
      nearbyObjectsAdded: 0,
    };

    // Insert track points
    if (trackPoints && Array.isArray(trackPoints) && trackPoints.length > 0) {
      await prisma.voyageTrackPoint.createMany({
        data: trackPoints.map((tp: Record<string, unknown>) => ({
          sessionId,
          lat: tp.lat as number,
          lon: tp.lon as number,
          speed: tp.speed as number | undefined,
          heading: tp.heading as number | undefined,
          deviationNm: (tp.deviationNm as number) || 0,
          deviationStatus: (tp.deviationStatus as string) || "on-route",
          waveHeightM: tp.waveHeightM as number | undefined,
          windSpeedKn: tp.windSpeedKn as number | undefined,
          beaufort: tp.beaufort as number | undefined,
          advisoryType: tp.advisoryType as string | undefined,
          advisoryMessage: tp.advisoryMessage as string | undefined,
        })),
      });
      results.trackPointsAdded = trackPoints.length;

      // Update session stats
      const lastPoint = trackPoints[trackPoints.length - 1];
      await prisma.liveVoyageSession.update({
        where: { id: sessionId },
        data: {
          totalTrackPoints: { increment: trackPoints.length },
          maxDeviationNm: Math.max(
            session.maxDeviationNm,
            ...trackPoints.map((tp: Record<string, unknown>) => (tp.deviationNm as number) || 0)
          ),
        },
      });
    }

    // Insert nearby objects
    if (nearbyObjects && Array.isArray(nearbyObjects) && nearbyObjects.length > 0) {
      await prisma.nearbyObject.createMany({
        data: nearbyObjects.map((obj: Record<string, unknown>) => ({
          sessionId,
          objectType: (obj.objectType as string) || "vessel",
          name: obj.name as string | undefined,
          mmsi: obj.mmsi as string | undefined,
          imo: obj.imo as string | undefined,
          callSign: obj.callSign as string | undefined,
          flag: obj.flag as string | undefined,
          lat: obj.lat as number,
          lon: obj.lon as number,
          speed: obj.speed as number | undefined,
          heading: obj.heading as number | undefined,
          course: obj.course as number | undefined,
          distanceNm: obj.distanceNm as number,
          bearing: obj.bearing as number | undefined,
          shipType: obj.shipType as string | undefined,
          destination: obj.destination as string | undefined,
          draught: obj.draught as number | undefined,
          length: obj.length as number | undefined,
        })),
      });
      results.nearbyObjectsAdded = nearbyObjects.length;
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("[LIVE_VOYAGE_SESSION] POST error:", error);
    return NextResponse.json(
      { error: "Failed to add tracking data" },
      { status: 500 }
    );
  }
}
