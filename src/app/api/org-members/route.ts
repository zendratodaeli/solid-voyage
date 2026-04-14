/**
 * API: List organization members from Clerk
 * GET /api/org-members
 */

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!orgId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const client = await clerkClient();
    const memberships = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    });

    const members = memberships.data.map((m) => ({
      userId: m.publicUserData?.userId || "",
      name:
        [m.publicUserData?.firstName, m.publicUserData?.lastName]
          .filter(Boolean)
          .join(" ") || null,
      email: m.publicUserData?.identifier || "",
      imageUrl: m.publicUserData?.imageUrl || null,
      role: m.role,
    }));

    // Exclude current user from the list (you don't share with yourself)
    const filtered = members.filter((m) => m.userId !== userId);

    return NextResponse.json({ success: true, data: filtered });
  } catch (error) {
    console.error("Error fetching org members:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch organization members" },
      { status: 500 }
    );
  }
}
