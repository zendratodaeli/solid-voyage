/**
 * Organization Profile API
 * 
 * GET  — Fetch the current org's profile fields + profileComplete status
 * PUT  — Submit the onboarding form (admin only). Sets profileComplete = true.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// ─── GET /api/org-profile ────────────────────────────────────────

export async function GET() {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "No active organization" },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        logoSize: true,
        logoBorderRadius: true,
        profileComplete: true,
        companyLegalName: true,
        companyAddress: true,
        companyCity: true,
        companyCountry: true,
        companyPostalCode: true,
        contactFullName: true,
        contactNickname: true,
        contactPhone: true,
        contactDepartment: true,
      },
    });

    if (!org) {
      // Org not yet synced to local DB — treat as incomplete
      return NextResponse.json({
        success: true,
        data: { profileComplete: false },
      });
    }

    return NextResponse.json({ success: true, data: org });
  } catch (error) {
    console.error("Failed to fetch org profile:", error);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/org-profile ────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const { orgId, orgRole } = await auth();

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "No active organization" },
        { status: 400 }
      );
    }

    // Only org admins can submit the profile
    if (orgRole !== "org:admin") {
      return NextResponse.json(
        { success: false, error: "Only organization admins can complete the profile" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      companyLegalName,
      companyAddress,
      companyCity,
      companyCountry,
      companyPostalCode,
      contactFullName,
      contactNickname,
      contactPhone,
      contactDepartment,
      logoSize,
      logoBorderRadius,
    } = body;

    // ── Validate required fields ──────────────────────────────
    const requiredFields = {
      companyLegalName,
      companyAddress,
      companyCity,
      companyCountry,
      contactFullName,
      contactNickname,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([, value]) => !value || (typeof value === "string" && !value.trim()))
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing required fields: ${missingFields.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // ── Ensure org exists in DB ───────────────────────────────
    const existingOrg = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!existingOrg) {
      // Auto-create if Clerk webhook hasn't fired yet
      await prisma.organization.create({
        data: { id: orgId, name: "Organization", profileComplete: false },
      });
    }

    // ── Update profile + set profileComplete ──────────────────
    // ── Build update payload ──────────────────────────────
    const updateData: Record<string, unknown> = {
      profileComplete: true,
      companyLegalName: companyLegalName.trim(),
      companyAddress: companyAddress.trim(),
      companyCity: companyCity.trim(),
      companyCountry: companyCountry.trim(),
      companyPostalCode: companyPostalCode?.trim() || null,
      contactFullName: contactFullName.trim(),
      contactNickname: contactNickname.trim(),
      contactPhone: contactPhone?.trim() || null,
      contactDepartment: contactDepartment?.trim() || null,
    };

    // Logo display preferences (optional)
    if (typeof logoSize === "number") {
      updateData.logoSize = Math.max(32, Math.min(128, logoSize));
    }
    const VALID_BORDER_RADII = ["none", "sm", "md", "lg", "full"];
    if (typeof logoBorderRadius === "string" && VALID_BORDER_RADII.includes(logoBorderRadius)) {
      updateData.logoBorderRadius = logoBorderRadius;
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to update org profile:", message);
    return NextResponse.json(
      { success: false, error: `Internal error: ${message}` },
      { status: 500 }
    );
  }
}
