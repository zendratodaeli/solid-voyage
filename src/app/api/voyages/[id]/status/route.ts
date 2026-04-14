import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getVoyagePermission, canModifyVoyage, type AuthUser } from "@/lib/permissions";
import { triggerVoyageUpdated, triggerCargoUpdated } from "@/lib/pusher-server";

// ═══════════════════════════════════════════════════════════════════
// UNIFIED STATUS LIFECYCLE
// Both Voyage and Cargo Inquiry share the same vocabulary.
// Any status change on the voyage auto-syncs to the linked cargo inquiry.
// ═══════════════════════════════════════════════════════════════════

const UNIFIED_STATUSES = ["DRAFT", "NEW", "OFFERED", "FIXED", "COMPLETED", "REJECTED", "LOST", "EXPIRED", "WITHDRAWN"] as const;

const updateStatusSchema = z.object({
  status: z.enum(UNIFIED_STATUSES),
});

// Valid transitions — what each status can move to
const validTransitions: Record<string, string[]> = {
  DRAFT: ["NEW", "REJECTED"],
  NEW: ["OFFERED", "REJECTED", "DRAFT"],
  OFFERED: ["FIXED", "REJECTED", "LOST", "EXPIRED", "WITHDRAWN", "DRAFT"],
  FIXED: ["OFFERED", "COMPLETED", "DRAFT"],
  COMPLETED: ["FIXED"],
  REJECTED: ["DRAFT", "NEW"],
  LOST: ["DRAFT", "NEW"],
  EXPIRED: ["DRAFT", "NEW"],
  WITHDRAWN: ["DRAFT", "NEW"],
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser() as AuthUser;
    const { id } = await params;
    const body = await request.json();
    
    // Validate input
    const { status } = updateStatusSchema.parse(body);
    
    // Check permission (need modify access)
    const permission = await getVoyagePermission(user, id);
    if (!permission || !canModifyVoyage(permission)) {
      return NextResponse.json(
        { success: false, error: permission ? "Insufficient permissions" : "Voyage not found" },
        { status: permission ? 403 : 404 }
      );
    }
    
    // Get current voyage for status transition validation
    const existing = await prisma.voyage.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Voyage not found" },
        { status: 404 }
      );
    }
    
    // Validate status transitions
    if (!validTransitions[existing.status]?.includes(status)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot transition from ${existing.status} to ${status}` 
        },
        { status: 400 }
      );
    }
    
    // Update voyage status
    const voyage = await prisma.voyage.update({
      where: { id },
      data: { status },
    });

    // ── Unified Bidirectional Sync: Voyage → Cargo ──────────────
    // Any voyage status change syncs the SAME status to the linked cargo inquiry
    const linkedInquiry = await prisma.cargoInquiry.findFirst({
      where: { voyageId: id },
    });

    if (linkedInquiry && linkedInquiry.status !== status) {
      await prisma.cargoInquiry.update({
        where: { id: linkedInquiry.id },
        data: { status },
      });

      // Real-time: notify cargo pipeline
      if (existing.orgId) {
        triggerCargoUpdated(existing.orgId, {
          inquiryId: linkedInquiry.id,
          status,
          previousStatus: linkedInquiry.status,
          voyageId: id,
        });
      }
    }

    // ── Real-time: notify all clients ──────────────────────────
    if (existing.orgId) {
      triggerVoyageUpdated(existing.orgId, {
        voyageId: id,
        status,
        previousStatus: existing.status,
      });
    }
    
    return NextResponse.json({ success: true, data: voyage });
  } catch (error: unknown) {
    console.error("Error updating voyage status:", error);
    
    if (error && typeof error === 'object' && 'name' in error && error.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: "Invalid status value" },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: "Failed to update status" },
      { status: 500 }
    );
  }
}
