/**
 * Platform — Site Pages CRUD API
 * 
 * GET:  List all site pages (super admin only)
 * POST: Create a new site page (super admin only)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { z } from "zod";

const CreatePageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  metaDesc: z.string().max(320).optional(),
  isPublished: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  icon: z.string().max(50).optional(),
});

/**
 * GET /api/platform/pages
 * List all site pages (both published and drafts)
 */
export async function GET() {
  try {
    await requireSuperAdmin();

    const pages = await prisma.sitePage.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });

    return NextResponse.json(pages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/platform/pages
 * Create a new site page
 */
export async function POST(request: Request) {
  try {
    const email = await requireSuperAdmin();
    const body = await request.json();

    const result = CreatePageSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    // Check slug uniqueness
    const existing = await prisma.sitePage.findUnique({
      where: { slug: result.data.slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A page with slug "${result.data.slug}" already exists` },
        { status: 409 }
      );
    }

    const page = await prisma.sitePage.create({
      data: {
        ...result.data,
        updatedBy: email,
      },
    });

    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create page";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
