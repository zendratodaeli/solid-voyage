/**
 * Super Admin Utilities
 * 
 * Platform-level admin access for managing CMS pages, platform settings, etc.
 * 
 * Two-source pattern:
 * 1. SUPER_ADMIN_EMAILS env var — "bootstrap" admins, always have FULL access (root)
 * 2. PlatformAdmin DB table — runtime-managed admins with RBAC permissions
 */

import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// ─── Permission Shape ───────────────────────────────────────────
export interface AdminPermissions {
  canManagePages: boolean;
  canManageMarketData: boolean;
  canManageMaritimeIntel: boolean;
  canManageSettings: boolean;
  canManageAdmins: boolean;
  canManageNewsletter: boolean;
}

const FULL_PERMISSIONS: AdminPermissions = {
  canManagePages: true,
  canManageMarketData: true,
  canManageMaritimeIntel: true,
  canManageSettings: true,
  canManageAdmins: true,
  canManageNewsletter: true,
};

const NO_PERMISSIONS: AdminPermissions = {
  canManagePages: false,
  canManageMarketData: false,
  canManageMaritimeIntel: false,
  canManageSettings: false,
  canManageAdmins: false,
  canManageNewsletter: false,
};

// ─── Bootstrap (Root) Admin Helpers ─────────────────────────────

/**
 * Get the list of bootstrap super admin emails from env.
 * These are the "root" admins that can never be removed via UI.
 */
function getBootstrapAdminEmails(): string[] {
  const raw = process.env.SUPER_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Check if an email is a bootstrap (root) admin from env var.
 * Bootstrap admins cannot be removed via UI and always have full permissions.
 */
export function isBootstrapAdmin(email: string): boolean {
  return getBootstrapAdminEmails().includes(email.toLowerCase());
}

// ─── Email-Based Checks ────────────────────────────────────────

/**
 * Check if an email is a super admin (env OR database).
 */
async function isEmailSuperAdmin(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();

  // 1. Check bootstrap admins (env var — always valid)
  if (isBootstrapAdmin(normalizedEmail)) {
    return true;
  }

  // 2. Check database admins (runtime-managed)
  try {
    const dbAdmin = await prisma.platformAdmin.findUnique({
      where: { email: normalizedEmail },
    });
    return !!dbAdmin;
  } catch {
    return false;
  }
}

/**
 * Get RBAC permissions for an email address.
 * Root admins always get FULL permissions.
 * DB admins get their configured permissions.
 * Non-admins get NO permissions.
 */
export async function getPermissionsForEmail(email: string): Promise<AdminPermissions & { isRoot: boolean }> {
  const normalizedEmail = email.toLowerCase();

  // Root admins = full access always
  if (isBootstrapAdmin(normalizedEmail)) {
    return { ...FULL_PERMISSIONS, isRoot: true };
  }

  // DB-managed admin = check individual permissions
  try {
    const dbAdmin = await prisma.platformAdmin.findUnique({
      where: { email: normalizedEmail },
    });
    if (dbAdmin) {
      return {
        canManagePages: dbAdmin.canManagePages,
        canManageMarketData: dbAdmin.canManageMarketData,
        canManageMaritimeIntel: dbAdmin.canManageMaritimeIntel,
        canManageSettings: dbAdmin.canManageSettings,
        canManageAdmins: dbAdmin.canManageAdmins,
        canManageNewsletter: dbAdmin.canManageNewsletter,
        isRoot: false,
      };
    }
  } catch {
    // Table might not exist
  }

  return { ...NO_PERMISSIONS, isRoot: false };
}

// ─── Current User Checks ───────────────────────────────────────

/**
 * Check if the current authenticated user is a platform super admin.
 */
export async function isSuperAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const email = user.emailAddresses[0]?.emailAddress?.toLowerCase();
  if (!email) return false;

  return isEmailSuperAdmin(email);
}

/**
 * Check if the current authenticated user is a ROOT (bootstrap) admin.
 */
export async function isCurrentUserRoot(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const email = user.emailAddresses[0]?.emailAddress?.toLowerCase();
  if (!email) return false;

  return isBootstrapAdmin(email);
}

/**
 * Require super admin access — throws if not authorized.
 * Returns the user's email for audit trailing.
 */
export async function requireSuperAdmin(): Promise<string> {
  const user = await currentUser();
  if (!user) {
    throw new Error("Unauthorized: Not authenticated");
  }

  const email = user.emailAddresses[0]?.emailAddress?.toLowerCase();
  if (!email) {
    throw new Error("Unauthorized: No email found");
  }

  const isAdmin = await isEmailSuperAdmin(email);
  if (!isAdmin) {
    throw new Error("Forbidden: Super admin access required");
  }

  return email;
}

/**
 * Get current user's admin permissions + metadata.
 * Returns null if user is not authenticated or not an admin.
 */
export async function getCurrentAdminContext(): Promise<{
  email: string;
  isRoot: boolean;
  permissions: AdminPermissions;
} | null> {
  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses[0]?.emailAddress?.toLowerCase();
  if (!email) return null;

  const perms = await getPermissionsForEmail(email);

  // Check if they're an admin at all
  const hasAnyAccess =
    perms.isRoot ||
    perms.canManagePages ||
    perms.canManageMarketData ||
    perms.canManageMaritimeIntel ||
    perms.canManageSettings ||
    perms.canManageAdmins ||
    perms.canManageNewsletter;

  if (!hasAnyAccess) return null;

  return {
    email,
    isRoot: perms.isRoot,
    permissions: {
      canManagePages: perms.canManagePages,
      canManageMarketData: perms.canManageMarketData,
      canManageMaritimeIntel: perms.canManageMaritimeIntel,
      canManageSettings: perms.canManageSettings,
      canManageAdmins: perms.canManageAdmins,
      canManageNewsletter: perms.canManageNewsletter,
    },
  };
}

/**
 * Client-side API to check if current user is super admin.
 * Calls a lightweight API route.
 */
export async function checkSuperAdminClient(): Promise<boolean> {
  try {
    const res = await fetch("/api/platform/check-access");
    if (!res.ok) return false;
    const data = await res.json();
    return data.isSuperAdmin === true;
  } catch {
    return false;
  }
}
