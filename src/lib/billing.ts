/**
 * Billing & Usage Tracking Utilities
 * 
 * Combines Clerk B2B plan checks with Prisma-based usage tracking
 * for freemium rate limiting on the route planner.
 * 
 * Free orgs: 3 route calculations/day
 * Paid orgs (Solid Starter): Unlimited
 */

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// ─── Constants ───────────────────────────────────────────────────

export const PLAN_SLUG = "solid_voyage_starter";
export const FREE_DAILY_LIMIT = 3;

export type CalculationType = "route_planner";

// ─── Plan Checks ─────────────────────────────────────────────────

/**
 * Check if the current user's org has the Solid Starter plan.
 * Clerk treats active trials as 'active', so trialing orgs pass.
 */
export async function isPaidOrg(): Promise<boolean> {
  const { has, orgId } = await auth();
  if (!orgId) return false;
  return has({ plan: PLAN_SLUG });
}

/**
 * Get the current org ID from Clerk auth.
 */
export async function getOrgId(): Promise<string | null> {
  const { orgId } = await auth();
  return orgId ?? null;
}

// ─── Usage Tracking ──────────────────────────────────────────────

function getUTCToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Check if the org is allowed to perform a calculation.
 * Returns usage info for display in the frontend counter.
 */
export async function checkUsageLimit(
  orgId: string,
  type: CalculationType
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const today = getUTCToday();

  const usage = await prisma.organizationUsage.findUnique({
    where: {
      orgId_date_calculationType: {
        orgId,
        date: today,
        calculationType: type,
      },
    },
  });

  const used = usage?.calculationCount ?? 0;

  return {
    allowed: used < FREE_DAILY_LIMIT,
    used,
    limit: FREE_DAILY_LIMIT,
  };
}

/**
 * Increment the calculation counter for an org.
 * Uses upsert for atomicity — creates the record if it doesn't exist.
 */
export async function incrementUsage(
  orgId: string,
  type: CalculationType
): Promise<void> {
  const today = getUTCToday();

  await prisma.organizationUsage.upsert({
    where: {
      orgId_date_calculationType: {
        orgId,
        date: today,
        calculationType: type,
      },
    },
    update: {
      calculationCount: { increment: 1 },
    },
    create: {
      orgId,
      date: today,
      calculationType: type,
      calculationCount: 1,
    },
  });
}

/**
 * Get current usage count for display purposes.
 */
export async function getUsageCount(
  orgId: string,
  type: CalculationType
): Promise<{ used: number; limit: number; isPaid: boolean }> {
  const paid = await isPaidOrg();

  if (paid) {
    return { used: 0, limit: Infinity, isPaid: true };
  }

  const today = getUTCToday();

  const usage = await prisma.organizationUsage.findUnique({
    where: {
      orgId_date_calculationType: {
        orgId,
        date: today,
        calculationType: type,
      },
    },
  });

  return {
    used: usage?.calculationCount ?? 0,
    limit: FREE_DAILY_LIMIT,
    isPaid: false,
  };
}
