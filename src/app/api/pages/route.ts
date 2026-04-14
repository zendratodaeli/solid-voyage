/**
 * Public — Published Site Pages API
 * 
 * GET: List all published site pages (for footer, navigation)
 * No auth required — public content.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/pages
 * Returns only published pages, sorted by sortOrder.
 */
export async function GET() {
  try {
    const pages = await prisma.sitePage.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        slug: true,
        title: true,
        metaDesc: true,
        sortOrder: true,
        icon: true,
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });

    return NextResponse.json(pages);
  } catch (error) {
    console.error("Error fetching published pages:", error);
    return NextResponse.json([]);
  }
}
