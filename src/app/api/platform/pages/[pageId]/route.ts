/**
 * Platform — Single Site Page API
 * 
 * GET:    Get page by ID (super admin only)
 * PUT:    Update page (super admin only)
 * DELETE: Delete page (super admin only)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { z } from "zod";

const UpdatePageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only")
    .optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  metaDesc: z.string().max(320).nullable().optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  icon: z.string().max(50).nullable().optional(),
});

type RouteParams = { params: Promise<{ pageId: string }> };

/**
 * GET /api/platform/pages/[pageId]
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireSuperAdmin();
    const { pageId } = await params;

    const page = await prisma.sitePage.findUnique({
      where: { id: pageId },
    });

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return NextResponse.json(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/platform/pages/[pageId]
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const email = await requireSuperAdmin();
    const { pageId } = await params;
    const body = await request.json();

    const result = UpdatePageSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    // Check slug uniqueness if changing slug
    if (result.data.slug) {
      const existing = await prisma.sitePage.findFirst({
        where: { slug: result.data.slug, id: { not: pageId } },
      });
      if (existing) {
        return NextResponse.json(
          { error: `A page with slug "${result.data.slug}" already exists` },
          { status: 409 }
        );
      }
    }

    const page = await prisma.sitePage.update({
      where: { id: pageId },
      data: {
        ...result.data,
        updatedBy: email,
      },
    });

    return NextResponse.json(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update page";
    if (message.includes("Record to update not found")) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/platform/pages/[pageId]
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireSuperAdmin();
    const { pageId } = await params;

    await prisma.sitePage.delete({
      where: { id: pageId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete page";
    if (message.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
