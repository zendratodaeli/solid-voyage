/**
 * Organization Logo Sync API
 *
 * POST — After a frontend logo upload via Clerk SDK, immediately sync
 *        the new imageUrl from Clerk to our local DB so the UI updates
 *        without waiting for the async webhook.
 */

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export async function POST() {
  try {
    const { orgId, orgRole } = await auth();

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "No active organization" },
        { status: 400 }
      );
    }

    if (orgRole !== "org:admin") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    // Fetch latest org data from Clerk
    const client = await clerkClient();
    const clerkOrg = await client.organizations.getOrganization({
      organizationId: orgId,
    });

    const imageUrl = clerkOrg.imageUrl ?? null;

    // Update local DB immediately
    await prisma.organization.upsert({
      where: { id: orgId },
      update: { imageUrl },
      create: {
        id: orgId,
        name: clerkOrg.name,
        slug: clerkOrg.slug ?? null,
        imageUrl,
        profileComplete: false,
      },
    });

    return NextResponse.json({ success: true, data: { imageUrl } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to sync org logo:", message);
    return NextResponse.json(
      { success: false, error: `Internal error: ${message}` },
      { status: 500 }
    );
  }
}
