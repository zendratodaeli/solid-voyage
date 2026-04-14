/**
 * Organization utility — sync Clerk org data to local DB
 */

import prisma from "./prisma";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Get or create an Organization in the DB from a Clerk org ID.
 * If the org doesn't exist locally, fetches from Clerk and creates it.
 */
export async function syncOrganization(orgId: string): Promise<{ id: string; name: string }> {
  // Try local DB first
  const existing = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  // Fetch latest from Clerk
  try {
    const client = await clerkClient();
    const clerkOrg = await client.organizations.getOrganization({ organizationId: orgId });

    if (existing) {
      // Update if name changed
      if (existing.name !== clerkOrg.name || existing.slug !== clerkOrg.slug) {
        return prisma.organization.update({
          where: { id: orgId },
          data: {
            name: clerkOrg.name,
            slug: clerkOrg.slug ?? null,
            imageUrl: clerkOrg.imageUrl ?? null,
          },
        });
      }
      return existing;
    }

    // Create new
    return prisma.organization.create({
      data: {
        id: orgId,
        name: clerkOrg.name,
        slug: clerkOrg.slug ?? null,
        imageUrl: clerkOrg.imageUrl ?? null,
        profileComplete: false,
      },
    });
  } catch (error) {
    console.error("Failed to sync organization from Clerk:", error);
    // Return existing if Clerk API fails
    if (existing) return existing;
    // Fallback: create with minimal data
    return prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: { id: orgId, name: "Unknown Organization", profileComplete: false },
    });
  }
}

/**
 * Get organization name from local DB (fast, no Clerk API call)
 */
export async function getOrganizationName(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  return org?.name ?? "Unknown";
}
