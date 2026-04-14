/**
 * Platform Access Check API
 * 
 * GET: Returns whether the current user is a platform super admin,
 *      plus their RBAC permissions and root status.
 * Used by the client-side layout to conditionally show admin nav items.
 */

import { NextResponse } from "next/server";
import { getCurrentAdminContext } from "@/lib/super-admin";

export async function GET() {
  try {
    const ctx = await getCurrentAdminContext();

    if (!ctx) {
      return NextResponse.json({
        isSuperAdmin: false,
        isRoot: false,
        permissions: null,
      });
    }

    return NextResponse.json({
      isSuperAdmin: true,
      isRoot: ctx.isRoot,
      email: ctx.email,
      permissions: ctx.permissions,
    });
  } catch {
    return NextResponse.json({
      isSuperAdmin: false,
      isRoot: false,
      permissions: null,
    });
  }
}
