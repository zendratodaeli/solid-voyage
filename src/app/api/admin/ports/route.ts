/**
 * Port Database API
 *
 * GET  /api/admin/ports         — List all ports with search/filter
 *
 * The `all=true` query param returns all active ports (for context menu,
 * deviation engine). This endpoint does NOT require admin auth — it's
 * a read-only port catalog. The sync endpoint requires admin auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── GET: List ports with search/filter ──
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const harborSize = searchParams.get("harborSize") || "";
    const country = searchParams.get("country") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const all = searchParams.get("all") === "true";

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { locode: { contains: search, mode: "insensitive" } },
        { alternateName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (harborSize) {
      where.harborSize = harborSize;
    }

    if (country) {
      where.country = { contains: country, mode: "insensitive" };
    }

    if (all) {
      // Return all active ports (for context menu / deviation engine cache)
      const ports = await prisma.port.findMany({
        where: { ...where, isActive: true },
        select: {
          id: true,
          name: true,
          locode: true,
          latitude: true,
          longitude: true,
          harborSize: true,
          country: true,
          region: true,
        },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ ports, total: ports.length });
    }

    // Paginated results (admin view — includes inactive)
    const [ports, total] = await Promise.all([
      prisma.port.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.port.count({ where }),
    ]);

    return NextResponse.json({ ports, total, page, limit });
  } catch (err: any) {
    console.error("[Ports API] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch ports", ports: [], total: 0 },
      { status: 500 }
    );
  }
}
