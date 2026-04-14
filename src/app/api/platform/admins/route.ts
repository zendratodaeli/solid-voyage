/**
 * Platform — Admin Management API
 * 
 * GET:    List all platform admins (bootstrap + DB) with permissions
 * POST:   Add a new platform admin (root admins: full RBAC, managed admins with canManageAdmins: no canManageAdmins grant)
 * PATCH:  Update a managed admin's permissions (root only)
 * DELETE: Remove a platform admin (root only, OR managed admin with canManageAdmins)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, isBootstrapAdmin, getCurrentAdminContext } from "@/lib/super-admin";
import { sendAdminInvitation } from "@/lib/admin-invitations";
import { z } from "zod";

const AddAdminSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  name: z.string().max(100).optional(),
  canManagePages: z.boolean().optional().default(false),
  canManageMarketData: z.boolean().optional().default(false),
  canManageMaritimeIntel: z.boolean().optional().default(false),
  canManageSettings: z.boolean().optional().default(false),
  canManageAdmins: z.boolean().optional().default(false),
  canManageNewsletter: z.boolean().optional().default(false),
});

const UpdateAdminSchema = z.object({
  id: z.string(),
  canManagePages: z.boolean().optional(),
  canManageMarketData: z.boolean().optional(),
  canManageMaritimeIntel: z.boolean().optional(),
  canManageSettings: z.boolean().optional(),
  canManageAdmins: z.boolean().optional(),
  canManageNewsletter: z.boolean().optional(),
  name: z.string().max(100).optional(),
});

/**
 * GET /api/platform/admins
 * Returns all super admins: bootstrap (from env) + database-managed with permissions
 */
export async function GET() {
  try {
    await requireSuperAdmin();

    // Get bootstrap admins from env
    const bootstrapEmails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    // Get DB-managed admins
    let dbAdmins: {
      id: string;
      email: string;
      name: string | null;
      addedBy: string;
      canManagePages: boolean;
      canManageMarketData: boolean;
      canManageMaritimeIntel: boolean;
      canManageSettings: boolean;
      canManageAdmins: boolean;
      canManageNewsletter: boolean;
      createdAt: Date;
    }[] = [];
    try {
      dbAdmins = await prisma.platformAdmin.findMany({
        orderBy: { createdAt: "asc" },
      });
    } catch {
      // Table might not exist yet
    }

    // Build unified list
    const admins = [
      // Bootstrap admins first (from env) — always full permissions
      ...bootstrapEmails.map((email) => ({
        id: `bootstrap_${email}`,
        email,
        name: null as string | null,
        addedBy: "system",
        createdAt: null as string | null,
        isBootstrap: true,
        permissions: {
          canManagePages: true,
          canManageMarketData: true,
          canManageMaritimeIntel: true,
          canManageSettings: true,
          canManageAdmins: true,
          canManageNewsletter: true,
        },
      })),
      // DB admins (skip if already in bootstrap)
      ...dbAdmins
        .filter((a) => !bootstrapEmails.includes(a.email.toLowerCase()))
        .map((a) => ({
          id: a.id,
          email: a.email,
          name: a.name,
          addedBy: a.addedBy,
          createdAt: a.createdAt.toISOString(),
          isBootstrap: false,
          permissions: {
            canManagePages: a.canManagePages,
            canManageMarketData: a.canManageMarketData,
            canManageMaritimeIntel: a.canManageMaritimeIntel,
            canManageSettings: a.canManageSettings,
            canManageAdmins: a.canManageAdmins,
            canManageNewsletter: a.canManageNewsletter,
          },
        })),
    ];

    return NextResponse.json(admins);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/platform/admins
 * Add a new platform admin with RBAC permissions.
 * - Root admins can set any permission including canManageAdmins
 * - Managed admins with canManageAdmins can add users but CANNOT grant canManageAdmins
 */
export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAdminContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Must be root OR have canManageAdmins permission
    if (!ctx.isRoot && !ctx.permissions.canManageAdmins) {
      return NextResponse.json(
        { error: "You do not have permission to add administrators" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = AddAdminSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const email = result.data.email.toLowerCase();

    // Check if already a bootstrap admin
    if (isBootstrapAdmin(email)) {
      return NextResponse.json(
        { error: "This email is already a root administrator" },
        { status: 409 }
      );
    }

    // Check if already in DB
    const existing = await prisma.platformAdmin.findUnique({
      where: { email },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This email is already a platform administrator" },
        { status: 409 }
      );
    }

    // Non-root admins CANNOT grant canManageAdmins
    const canManageAdmins = ctx.isRoot ? (result.data.canManageAdmins ?? false) : false;

    const admin = await prisma.platformAdmin.create({
      data: {
        email,
        name: result.data.name || null,
        addedBy: ctx.email,
        canManagePages: result.data.canManagePages ?? false,
        canManageMarketData: result.data.canManageMarketData ?? false,
        canManageMaritimeIntel: result.data.canManageMaritimeIntel ?? false,
        canManageSettings: result.data.canManageSettings ?? false,
        canManageAdmins,
        canManageNewsletter: result.data.canManageNewsletter ?? false,
      },
    });

    // Send invitation email (non-blocking — don't fail if email fails)
    const emailResult = await sendAdminInvitation({
      toEmail: admin.email,
      toName: admin.name || undefined,
      invitedBy: ctx.email,
      permissions: {
        canManagePages: admin.canManagePages,
        canManageMarketData: admin.canManageMarketData,
        canManageMaritimeIntel: admin.canManageMaritimeIntel,
        canManageSettings: admin.canManageSettings,
        canManageAdmins: admin.canManageAdmins,
        canManageNewsletter: admin.canManageNewsletter,
      },
    });

    return NextResponse.json({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      addedBy: admin.addedBy,
      createdAt: admin.createdAt.toISOString(),
      isBootstrap: false,
      invitationSent: emailResult?.success ?? false,
      emailError: emailResult?.success === false ? emailResult.error : undefined,
      emailHint: emailResult?.success === false ? emailResult.hint : undefined,
      permissions: {
        canManagePages: admin.canManagePages,
        canManageMarketData: admin.canManageMarketData,
        canManageMaritimeIntel: admin.canManageMaritimeIntel,
        canManageSettings: admin.canManageSettings,
        canManageAdmins: admin.canManageAdmins,
        canManageNewsletter: admin.canManageNewsletter,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add admin";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/platform/admins
 * Update a managed admin's permissions.
 * - Root admins can update any permission including canManageAdmins
 * - Non-root admins CANNOT update permissions
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await getCurrentAdminContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Only root admins can update permissions
    if (!ctx.isRoot) {
      return NextResponse.json(
        { error: "Only root administrators can update permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = UpdateAdminSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    // Prevent modifying bootstrap admins
    if (result.data.id.startsWith("bootstrap_")) {
      return NextResponse.json(
        { error: "Root administrator permissions cannot be modified" },
        { status: 403 }
      );
    }

    // Build update data (only include fields that were provided)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (result.data.canManagePages !== undefined) updateData.canManagePages = result.data.canManagePages;
    if (result.data.canManageMarketData !== undefined) updateData.canManageMarketData = result.data.canManageMarketData;
    if (result.data.canManageMaritimeIntel !== undefined) updateData.canManageMaritimeIntel = result.data.canManageMaritimeIntel;
    if (result.data.canManageSettings !== undefined) updateData.canManageSettings = result.data.canManageSettings;
    if (result.data.canManageAdmins !== undefined) updateData.canManageAdmins = result.data.canManageAdmins;
    if (result.data.canManageNewsletter !== undefined) updateData.canManageNewsletter = result.data.canManageNewsletter;
    if (result.data.name !== undefined) updateData.name = result.data.name;

    const updated = await prisma.platformAdmin.update({
      where: { id: result.data.id },
      data: updateData,
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      permissions: {
        canManagePages: updated.canManagePages,
        canManageMarketData: updated.canManageMarketData,
        canManageMaritimeIntel: updated.canManageMaritimeIntel,
        canManageSettings: updated.canManageSettings,
        canManageAdmins: updated.canManageAdmins,
        canManageNewsletter: updated.canManageNewsletter,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update admin";
    if (message.includes("Record to update not found")) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/platform/admins
 * Remove a platform admin by ID.
 * - Root admins can delete any managed admin
 * - Managed admins with canManageAdmins can delete other managed admins (but NOT admins who also have canManageAdmins)
 * - Bootstrap admins CANNOT be removed
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await getCurrentAdminContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Must be root OR have canManageAdmins permission
    if (!ctx.isRoot && !ctx.permissions.canManageAdmins) {
      return NextResponse.json(
        { error: "You do not have permission to remove administrators" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Admin ID is required" }, { status: 400 });
    }

    // Prevent removing bootstrap admins
    if (id.startsWith("bootstrap_")) {
      return NextResponse.json(
        { error: "Root administrators cannot be removed. They are defined in the server configuration." },
        { status: 403 }
      );
    }

    // If the requester is NOT root, they cannot delete admins who have canManageAdmins
    if (!ctx.isRoot) {
      const targetAdmin = await prisma.platformAdmin.findUnique({
        where: { id },
      });
      if (targetAdmin?.canManageAdmins) {
        return NextResponse.json(
          { error: "Only root administrators can remove admins who have admin management permissions" },
          { status: 403 }
        );
      }
    }

    await prisma.platformAdmin.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove admin";
    if (message.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
