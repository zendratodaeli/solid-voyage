import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  getVoyagePermission,
  canModifyVoyage,
  type AuthUser,
} from "@/lib/permissions";

const voyageActualSchema = z.object({
  // Duration actuals
  ballastSeaDays: z.number().min(0),
  ladenSeaDays: z.number().min(0),
  totalSeaDays: z.number().min(0),
  totalPortDays: z.number().min(0),
  totalVoyageDays: z.number().min(0),

  // Bunker actuals
  totalBunkerMt: z.number().min(0),
  totalBunkerCost: z.number().min(0),

  // Cost actuals
  totalVoyageCost: z.number().min(0),

  // Revenue & Profitability actuals (optional)
  grossRevenue: z.number().min(0).optional().nullable(),
  voyagePnl: z.number().optional().nullable(),
  tce: z.number().optional().nullable(),

  // Notes
  notes: z.string().optional().nullable(),

  // Completion date
  completedAt: z.string().datetime().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = (await requireUser()) as AuthUser;
    const { id } = await params;

    const permission = await getVoyagePermission(user, id);
    if (!permission) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }

    const actuals = await prisma.voyageActual.findUnique({
      where: { voyageId: id },
    });

    return NextResponse.json({ success: true, data: actuals });
  } catch (error) {
    console.error("Error fetching actuals:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch actuals" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = (await requireUser()) as AuthUser;
    const { id } = await params;
    const body = await request.json();

    // Check permission
    const permission = await getVoyagePermission(user, id);
    if (!permission || !canModifyVoyage(permission)) {
      return NextResponse.json(
        {
          success: false,
          error: permission ? "Insufficient permissions" : "Voyage not found",
        },
        { status: permission ? 403 : 404 }
      );
    }

    // Verify voyage is in the right status
    const voyage = await prisma.voyage.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!voyage) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }

    if (
      voyage.status !== "FIXED" &&
      voyage.status !== "COMPLETED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Actuals can only be entered when voyage is Fixed or Completed",
        },
        { status: 400 }
      );
    }

    // Validate input
    const validatedData = voyageActualSchema.parse(body);

    // Upsert actuals (create or update)
    const actuals = await prisma.voyageActual.upsert({
      where: { voyageId: id },
      create: {
        voyageId: id,
        ...validatedData,
        completedAt: validatedData.completedAt
          ? new Date(validatedData.completedAt)
          : null,
      },
      update: {
        ...validatedData,
        completedAt: validatedData.completedAt
          ? new Date(validatedData.completedAt)
          : null,
      },
    });

    return NextResponse.json({ success: true, data: actuals });
  } catch (error: unknown) {
    console.error("Error saving actuals:", error);

    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ZodError"
    ) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to save actuals" },
      { status: 500 }
    );
  }
}
