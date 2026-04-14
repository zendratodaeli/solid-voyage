import { NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import { buildOwnerFilter, type AuthUser } from "@/lib/permissions";
import prisma from "@/lib/prisma";

/**
 * GET /api/vessels/names
 * Returns a lightweight list of vessel names for the current org.
 * Used by the Laytime Calculator combobox.
 */
export async function GET() {
  try {
    const user = (await requireUser()) as AuthUser;
    const where = buildOwnerFilter(user);

    const vessels = await prisma.vessel.findMany({
      where,
      select: {
        id: true,
        name: true,
        imoNumber: true,
        vesselType: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: vessels });
  } catch (error) {
    console.error("Error fetching vessel names:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch vessel names" },
      { status: 500 }
    );
  }
}
