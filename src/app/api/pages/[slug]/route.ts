/**
 * Public — Single Site Page by Slug
 * 
 * GET: Fetch a single published page by its slug
 * No auth required — public content.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * GET /api/pages/[slug]
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;

    const page = await prisma.sitePage.findUnique({
      where: { slug },
    });

    if (!page || !page.isPublished) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return NextResponse.json(page);
  } catch (error) {
    console.error("Error fetching page:", error);
    return NextResponse.json({ error: "Failed to load page" }, { status: 500 });
  }
}
