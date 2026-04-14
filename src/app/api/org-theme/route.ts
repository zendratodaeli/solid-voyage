/**
 * Organization Theme API
 * 
 * GET  — Fetch the current org's theme settings
 * PUT  — Update the org theme (admin + premium only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { isPaidOrg } from "@/lib/billing";

// ─── GET /api/org-theme ──────────────────────────────────────────

export async function GET() {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ success: false, error: "No active organization" }, { status: 400 });
    }

    const theme = await prisma.orgTheme.findUnique({
      where: { orgId },
    });

    // Fetch org name & logo from Clerk for PDF branding
    let orgName: string | undefined;
    let orgLogoUrl: string | undefined;
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const org = await client.organizations.getOrganization({ organizationId: orgId });
      orgName = org.name;
      orgLogoUrl = org.imageUrl;
    } catch {
      // proceed without org info
    }

    return NextResponse.json({
      success: true,
      data: {
        ...(theme ?? { accentColor: null, currency: "USD", aisAutoRefresh: false }),
        orgName,
        orgLogoUrl,
      },
    });
  } catch (error) {
    console.error("Failed to fetch org theme:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// ─── PUT /api/org-theme ──────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const { orgId, orgRole } = await auth();

    if (!orgId) {
      return NextResponse.json({ success: false, error: "No active organization" }, { status: 400 });
    }

    // Only org admins can update theme
    if (orgRole !== "org:admin") {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    // Only paid orgs can use theming
    const paid = await isPaidOrg();
    if (!paid) {
      return NextResponse.json({ success: false, error: "Premium plan required" }, { status: 403 });
    }

    const body = await req.json();
    const { accentColor, currency, aisAutoRefresh } = body;

    // Basic validation
    if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      return NextResponse.json({ success: false, error: "Invalid color format. Use hex like #6366f1" }, { status: 400 });
    }

    // Currency validation
    const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "NOK"];
    if (currency && !SUPPORTED_CURRENCIES.includes(currency)) {
      return NextResponse.json({ success: false, error: `Unsupported currency. Use: ${SUPPORTED_CURRENCIES.join(", ")}` }, { status: 400 });
    }

    // Ensure the org exists in DB
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      // Auto-create if missing (Clerk webhook might not have fired yet)
      await prisma.organization.create({
        data: { id: orgId, name: "Organization" },
      });
    }

    // Build update data explicitly
    const updateData: { accentColor: string | null; currency?: string; aisAutoRefresh?: boolean } = {
      accentColor: accentColor ?? null,
    };
    if (currency !== undefined) {
      updateData.currency = currency;
    }
    if (typeof aisAutoRefresh === "boolean") {
      updateData.aisAutoRefresh = aisAutoRefresh;
    }

    const theme = await prisma.orgTheme.upsert({
      where: { orgId },
      update: updateData,
      create: {
        orgId,
        accentColor: accentColor ?? null,
        currency: currency || "USD",
        aisAutoRefresh: typeof aisAutoRefresh === "boolean" ? aisAutoRefresh : false,
      },
    });

    return NextResponse.json({ success: true, data: theme });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    console.error("Failed to update org theme:", message, stack);
    return NextResponse.json({ success: false, error: `Internal error: ${message}` }, { status: 500 });
  }
}
