import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { buildOwnerFilter, buildCreateData, logAudit, type AuthUser } from "@/lib/permissions";
import { apiRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

// ─── Pagination defaults ─────────────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// GET — list all calculations for the org/user (paginated)
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser() as AuthUser;
    const { searchParams } = new URL(request.url);

    // ─── Pagination ───────────────────────────────────────────
    const page = Math.max(1, parseInt(searchParams.get("page") || String(DEFAULT_PAGE)));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE))));
    const skip = (page - 1) * pageSize;

    const where = buildOwnerFilter(user);

    const [calculations, total] = await Promise.all([
      prisma.laytimeCalculation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.laytimeCalculation.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: calculations,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching laytime calculations:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch calculations" },
      { status: 500 }
    );
  }
}

// POST — create a new calculation
export async function POST(request: Request) {
  try {
    const user = await requireUser() as AuthUser;

    // ─── Rate Limiting ────────────────────────────────────────
    const blocked = apiRateLimit(request, user.clerkId, WRITE_RATE_LIMIT);
    if (blocked) return blocked;

    const body = await request.json();

    const calc = await prisma.laytimeCalculation.create({
      data: {
        ...buildCreateData(user),
        vesselName: body.vesselName || "",
        voyageRef: body.voyageRef || "",
        portName: body.portName || "",
        operationType: body.operationType || "loading",
        laytimeMode: body.laytimeMode || "fixed",
        allowedHours: body.allowedHours || 72,
        cargoQuantity: body.cargoQuantity || null,
        loadingRate: body.loadingRate || null,
        terms: body.terms || "SHINC",
        demurrageRate: body.demurrageRate || 25000,
        despatchRate: body.despatchRate || 12500,
        norTendered: body.norTendered ? new Date(body.norTendered) : null,
        laytimeCommenced: body.laytimeCommenced ? new Date(body.laytimeCommenced) : null,
        reversible: body.reversible || false,
        events: body.events || [],
        resultType: body.resultType || null,
        resultAmount: body.resultAmount || null,
        countedHours: body.countedHours || null,
        excludedHours: body.excludedHours || null,
      },
    });

    // Audit log
    if (user.activeOrgId) {
      const label = `${body.vesselName || "Unnamed"} — ${body.portName || "No Port"}`;
      await logAudit({
        orgId: user.activeOrgId,
        entityType: "voyage",
        entityId: calc.id,
        entityName: `Laytime: ${label}`,
        action: "created",
        userId: user.id,
        userName: user.name || user.email,
      });
    }

    return NextResponse.json({ success: true, data: calc }, { status: 201 });
  } catch (error) {
    console.error("Error creating laytime calculation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create calculation" },
      { status: 500 }
    );
  }
}
