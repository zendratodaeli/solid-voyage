/**
 * Clerk utilities for user synchronization
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "./prisma";
import { syncOrganization } from "./organization";

/**
 * Get or create a user in our database based on Clerk auth.
 * Also syncs name/email if they changed in Clerk.
 */
export async function getOrCreateUser() {
  const { userId } = await auth();
  
  if (!userId) {
    return null;
  }
  
  // Try to find existing user
  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { roles: true },
  });
  
  // Always fetch current Clerk profile to detect changes
  const clerkUser = await currentUser();
  
  if (!clerkUser) {
    return user; // Clerk session valid but can't fetch profile — return cached
  }
  
  const currentName = clerkUser.firstName
    ? `${clerkUser.firstName} ${clerkUser.lastName ?? ""}`.trim()
    : null;
  const currentEmail = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  
  if (!user) {
    // Create or find user — handles race conditions with webhook:
    // 1. Webhook may have already created the user (same clerkId) → upsert handles it
    // 2. Webhook created with same email but lookup by clerkId misses → catch + find by email
    try {
      user = await prisma.user.upsert({
        where: { clerkId: userId },
        update: { email: currentEmail, name: currentName },
        create: {
          clerkId: userId,
          email: currentEmail,
          name: currentName,
        },
        include: { roles: true },
      });
    } catch (error: unknown) {
      // Unique constraint on email — webhook already inserted this user
      // Find by email and update clerkId to match current Clerk session
      user = await prisma.user.findUnique({
        where: { email: currentEmail },
        include: { roles: true },
      });
      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { clerkId: userId, name: currentName },
          include: { roles: true },
        });
      } else {
        throw error; // Truly unexpected — rethrow
      }
    }
  } else if (user.name !== currentName || user.email !== currentEmail) {
    // Sync stale data
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: currentName,
        email: currentEmail,
      },
      include: { roles: true },
    });
  }
  
  return user;
}

/**
 * Get authenticated user or throw.
 * Returns user data plus active org context from Clerk.
 * Also syncs org name to local DB.
 */
export async function requireUser() {
  const user = await getOrCreateUser();
  
  if (!user) {
    throw new Error("Unauthorized");
  }
  
  const { orgId, orgRole } = await auth();
  
  // Sync organization name to local DB if user has an active org
  if (orgId) {
    // Fire-and-forget — don't block the request
    syncOrganization(orgId).catch((err) =>
      console.error("Failed to sync org:", err)
    );
  }
  
  return {
    ...user,
    activeOrgId: orgId ?? null,
    orgRole: (orgRole as "org:admin" | "org:member" | "org:viewer") ?? null,
  };
}

/**
 * Update user roles
 */
export async function updateUserRoles(
  userId: string,
  roles: Array<{ role: string; customName?: string }>
) {
  // Delete existing roles
  await prisma.userRole.deleteMany({
    where: { userId },
  });
  
  // Create new roles
  await prisma.userRole.createMany({
    data: roles.map((r) => ({
      userId,
      role: r.role as "VESSEL_MANAGER" | "SHIPBROKER" | "VESSEL_OPERATOR" | "OWNER_MANAGEMENT" | "OTHER",
      isCustom: r.role === "OTHER",
      customName: r.customName,
    })),
  });
  
  return prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true },
  });
}

/**
 * Sync user from Clerk webhook
 */
export async function syncUserFromWebhook(clerkData: {
  id: string;
  email_addresses: Array<{ email_address: string }>;
  first_name: string | null;
  last_name: string | null;
}) {
  const email = clerkData.email_addresses[0]?.email_address ?? "";
  const name = clerkData.first_name 
    ? `${clerkData.first_name} ${clerkData.last_name ?? ""}`.trim()
    : null;
  
  return prisma.user.upsert({
    where: { clerkId: clerkData.id },
    update: { email, name },
    create: {
      clerkId: clerkData.id,
      email,
      name,
    },
  });
}

/**
 * Delete user from webhook
 */
export async function deleteUserFromWebhook(clerkId: string) {
  return prisma.user.delete({
    where: { clerkId },
  });
}
