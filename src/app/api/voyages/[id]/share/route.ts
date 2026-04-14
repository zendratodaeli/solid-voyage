import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  getVoyagePermission,
  logAudit,
  type AuthUser,
} from "@/lib/permissions";

const shareSchema = z.object({
  sharedWith: z.string().min(1, "Member ID is required"),
  permission: z.enum(["view", "update"]),
});

const unshareSchema = z.object({
  sharedWith: z.string().min(1, "Member ID is required"),
});

// GET - List shares for a voyage
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    
    // Only owner or admin can view shares
    const permission = await getVoyagePermission(user, id);
    if (permission !== "owner" && permission !== "admin") {
      return NextResponse.json(
        { success: false, error: "Only the voyage owner or admin can view shares" },
        { status: 403 }
      );
    }
    
    const shares = await prisma.voyageShare.findMany({
      where: { voyageId: id },
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json({ success: true, data: shares });
  } catch (error) {
    console.error("Error fetching shares:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch shares" },
      { status: 500 }
    );
  }
}

// POST - Share a voyage with a member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const body = await request.json();
    const { sharedWith, permission: perm } = shareSchema.parse(body);
    
    // Only owner or admin can share
    const permission = await getVoyagePermission(user, id);
    if (permission !== "owner" && permission !== "admin") {
      return NextResponse.json(
        { success: false, error: "Only the voyage owner or admin can share voyages" },
        { status: 403 }
      );
    }
    
    // Upsert share (update permission if already shared)
    const share = await prisma.voyageShare.upsert({
      where: {
        voyageId_sharedWith: { voyageId: id, sharedWith },
      },
      create: {
        voyageId: id,
        sharedWith,
        permission: perm,
      },
      update: {
        permission: perm,
      },
    });
    
    // Log audit
    if (user.activeOrgId) {
      const voyage = await prisma.voyage.findUnique({
        where: { id },
        select: { loadPort: true, dischargePort: true },
      });
      await logAudit({
        orgId: user.activeOrgId,
        entityType: "voyage",
        entityId: id,
        entityName: voyage ? `${voyage.loadPort} → ${voyage.dischargePort}` : id,
        action: "shared",
        userId: user.id,
        userName: user.name || user.email,
        changes: { sharedWith: { from: null, to: `${sharedWith} (${perm})` } },
      });
    }
    
    return NextResponse.json({ success: true, data: share }, { status: 201 });
  } catch (error) {
    console.error("Error sharing voyage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to share voyage" },
      { status: 500 }
    );
  }
}

// DELETE - Unshare a voyage with a member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const body = await request.json();
    const { sharedWith } = unshareSchema.parse(body);
    
    // Only owner or admin can unshare
    const permission = await getVoyagePermission(user, id);
    if (permission !== "owner" && permission !== "admin") {
      return NextResponse.json(
        { success: false, error: "Only the voyage owner or admin can manage shares" },
        { status: 403 }
      );
    }
    
    await prisma.voyageShare.delete({
      where: {
        voyageId_sharedWith: { voyageId: id, sharedWith },
      },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unsharing voyage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to unshare voyage" },
      { status: 500 }
    );
  }
}
