import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { buildOwnerFilter, type AuthUser } from "@/lib/permissions";

/**
 * GET /api/vessels/[id]/pdf
 *
 * Returns all vessel data needed for client-side PDF generation:
 * - Vessel specifications (dimensions, capacities, fuel, etc.)
 * - Associated voyages summary
 * - Organization branding
 */
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
          select: {
            id: true,
            loadPort: true,
            dischargePort: true,
            openPort: true,
            voyageLegs: true,
            status: true,
            createdAt: true,
            calculations: {
              select: {
                tce: true,
                voyagePnl: true,
                totalVoyageDays: true,
                totalBunkerMt: true,
                totalCO2Mt: true,
                ciiRating: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!vessel) {
      return NextResponse.json(
        { success: false, error: "Vessel not found" },
        { status: 404 }
      );
    }

    // Fetch org branding
    let orgName: string | undefined;
    let orgLogoUrl: string | undefined;
    if (user.activeOrgId) {
      const org = await prisma.organization.findUnique({
        where: { id: user.activeOrgId },
      });
      if (org) {
        orgName = org.name;
        orgLogoUrl = org.imageUrl || undefined;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        vessel,
        voyages: vessel.voyages,
        orgName,
        orgLogoUrl,
      },
    });
  } catch (error) {
    console.error("Error fetching vessel PDF data:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
