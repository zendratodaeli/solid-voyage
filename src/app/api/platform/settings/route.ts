/**
 * Platform — Platform Settings API
 * 
 * GET: Fetch current platform settings (name, logo, footer text)
 * PUT: Update platform settings (super admin only)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { z } from "zod";

const SETTINGS_ID = "platform_settings";

const DEFAULT_SETTINGS = {
  platformName: "Solid Voyage",
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  footerText: "Premium Maritime Freight Intelligence.",
};

const UpdateSettingsSchema = z.object({
  platformName: z.string().min(1).max(100).optional(),
  logoUrl: z.string().max(500000).nullable().optional(), // Large to support base64
  faviconUrl: z.string().max(500000).nullable().optional(),
  footerText: z.string().max(300).nullable().optional(),
});

/**
 * GET /api/platform/settings
 * Fetch current platform settings. Public — used by the landing page.
 */
export async function GET() {
  try {
    const settings = await prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: {
        id: SETTINGS_ID,
        ...DEFAULT_SETTINGS,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching platform settings:", error);
    return NextResponse.json({
      id: SETTINGS_ID,
      ...DEFAULT_SETTINGS,
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    });
  }
}

/**
 * PUT /api/platform/settings
 * Update platform settings (super admin only)
 */
export async function PUT(request: Request) {
  try {
    const email = await requireSuperAdmin();
    const body = await request.json();

    const result = UpdateSettingsSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const settings = await prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {
        ...result.data,
        updatedBy: email,
      },
      create: {
        id: SETTINGS_ID,
        ...DEFAULT_SETTINGS,
        ...result.data,
        updatedBy: email,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
