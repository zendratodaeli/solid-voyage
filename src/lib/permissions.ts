/**
 * Permission & Multi-Tenancy Helpers
 * 
 * Vessels: all org members can see/create/edit, admin-only delete
 * Voyages: private to creator, admin sees all, creator can share per-voyage
 */

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// ─── Types ───────────────────────────────────────────────────────

export type OrgRole = "org:admin" | "org:member" | "org:viewer" | null;

export interface AuthUser {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  activeOrgId: string | null;
  orgRole: OrgRole;
}

export type VoyagePermission = "owner" | "admin" | "update" | "view" | null;

// ─── Query Filters ───────────────────────────────────────────────

/**
 * Build the correct Prisma where filter for org-scoped entities.
 * If user has an active org → filter by orgId (all members see all).
 * If no org → filter by personal userId.
 */
export function buildOwnerFilter(user: AuthUser) {
  return user.activeOrgId
    ? { orgId: user.activeOrgId }
    : { userId: user.id };
}

/**
 * Build the data payload for creating org-scoped entities.
 */
export function buildCreateData(user: AuthUser) {
  return {
    userId: user.id,
    orgId: user.activeOrgId,
  };
}

// ─── Vessel Permissions ──────────────────────────────────────────

/**
 * All org members can create vessels.
 */
export function canCreateVessel(_orgRole: OrgRole): boolean {
  return true; // All authenticated users can create
}

/**
 * All org members can edit vessels.
 */
export function canEditVessel(_orgRole: OrgRole): boolean {
  return true; // All authenticated users can edit
}

/**
 * Only admin can delete vessels.
 */
export function canDeleteVessel(orgRole: OrgRole): boolean {
  return orgRole === "org:admin";
}

// ─── Voyage Permissions ──────────────────────────────────────────

/**
 * Determine a user's permission level for a specific voyage.
 * Returns: "owner" | "admin" | "update" | "view" | null
 */
export async function getVoyagePermission(
  user: AuthUser,
  voyageId: string
): Promise<VoyagePermission> {
  const voyage = await prisma.voyage.findUnique({
    where: { id: voyageId },
    select: { userId: true, orgId: true },
  });

  if (!voyage) return null;

  // Owner always has full access
  if (voyage.userId === user.id) return "owner";

  // Admin within the same org sees all
  if (user.activeOrgId && voyage.orgId === user.activeOrgId && user.orgRole === "org:admin") {
    return "admin";
  }

  // Check explicit share
  if (user.activeOrgId && voyage.orgId === user.activeOrgId) {
    const share = await prisma.voyageShare.findUnique({
      where: {
        voyageId_sharedWith: {
          voyageId,
          sharedWith: user.clerkId,
        },
      },
    });
    if (share) {
      return share.permission as VoyagePermission;
    }
  }

  return null;
}

/**
 * Build a Prisma where clause for listing voyages.
 * Admin: all org voyages. Members: own + explicitly shared.
 */
export async function buildVoyageListFilter(user: AuthUser) {
  if (!user.activeOrgId) {
    // Personal mode — only own voyages
    return { userId: user.id };
  }

  if (user.orgRole === "org:admin") {
    // Admin sees all org voyages
    return { orgId: user.activeOrgId };
  }

  // Member/Viewer: own voyages in this org + shared voyages
  const sharedVoyageIds = await prisma.voyageShare.findMany({
    where: { sharedWith: user.clerkId },
    select: { voyageId: true },
  });

  return {
    OR: [
      { userId: user.id, orgId: user.activeOrgId },
      { id: { in: sharedVoyageIds.map((s) => s.voyageId) } },
    ],
  };
}

/**
 * Check if user can modify (edit/update) a voyage.
 */
export function canModifyVoyage(permission: VoyagePermission): boolean {
  return permission === "owner" || permission === "admin" || permission === "update";
}

/**
 * Check if user can delete a voyage. Owner or org admin can delete.
 */
export function canDeleteVoyage(permission: VoyagePermission): boolean {
  return permission === "owner" || permission === "admin";
}

// ─── Audit Logging ───────────────────────────────────────────────

/**
 * Log an activity to the audit trail.
 */
export async function logAudit(params: {
  orgId: string;
  entityType: "vessel" | "voyage";
  entityId: string;
  entityName: string;
  action: "created" | "updated" | "deleted" | "shared";
  userId: string;
  userName: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: params.orgId,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        action: params.action,
        userId: params.userId,
        userName: params.userName,
        changes: (params.changes ?? undefined) as any,
      },
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error("Failed to write audit log:", error);
  }
}

/**
 * Compute field-level diffs between old and new data for audit logging.
 */
export function computeChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  fieldsToTrack: string[]
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const field of fieldsToTrack) {
    const oldVal = oldData[field];
    const newVal = newData[field];
    if (newVal !== undefined && JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { from: oldVal, to: newVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
