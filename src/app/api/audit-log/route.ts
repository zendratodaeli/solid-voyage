import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { type AuthUser } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser() as AuthUser;
    const { searchParams } = new URL(request.url);
    
    if (!user.activeOrgId) {
      return NextResponse.json({ success: true, data: [] });
    }
    
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const limit = parseInt(searchParams.get("limit") || "20");
    
    const where: Record<string, unknown> = {
      orgId: user.activeOrgId,
    };
    
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });
    
    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}
