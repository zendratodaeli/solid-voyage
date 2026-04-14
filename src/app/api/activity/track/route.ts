/**
 * Activity Tracking API — Receives authenticated user behavior events.
 *
 * POST: Logs an activity event for the current authenticated user.
 * Body: { event, path, orgId?, action?, metadata?, duration? }
 *
 * Must be authenticated (Clerk) — userId is extracted server-side for security.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { trackActivity } from "@/lib/track-activity";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      event?: string;
      path?: string;
      orgId?: string;
      action?: string;
      metadata?: Record<string, unknown>;
      duration?: number;
    };

    // Support both JSON and sendBeacon (which sends as text)
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const text = await req.text();
      body = JSON.parse(text);
    }

    const event = body.event as "page_view" | "action" | "login" | "session_start";
    if (!event) {
      return NextResponse.json({ error: "Missing event" }, { status: 400 });
    }

    // Non-blocking fire
    trackActivity({
      userId,
      orgId: body.orgId || null,
      event,
      path: body.path,
      action: body.action,
      metadata: body.metadata,
      duration: body.duration,
    });

    return NextResponse.json({ tracked: true });
  } catch (error) {
    console.error("[Activity Track API] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
