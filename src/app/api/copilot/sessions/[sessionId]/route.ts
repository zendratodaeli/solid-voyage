/**
 * Individual Chat Session API
 *
 * Get/Update/Delete a specific session.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/copilot/sessions/[sessionId] — Get session with all messages
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { sessionId } = await params;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, orgId, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            toolCalls: true,
            toolResults: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: session.id,
      title: session.title || "Untitled Conversation",
      createdAt: session.createdAt.toISOString(),
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        toolResults: m.toolResults,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[Session API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}

// PATCH /api/copilot/sessions/[sessionId] — Update title or add messages
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { sessionId } = await params;
    const body = await req.json();

    // Verify ownership
    const existing = await prisma.chatSession.findFirst({
      where: { id: sessionId, orgId, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Update title if provided
    if (body.title !== undefined) {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title: body.title },
      });
    }

    // Append new messages if provided
    if (body.messages?.length) {
      await prisma.chatMessage.createMany({
        data: body.messages.map((msg: any) => ({
          sessionId,
          role: msg.role,
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.parts || msg.content || ""),
          toolCalls: msg.toolCalls || undefined,
          toolResults: msg.toolResults || undefined,
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Session API] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}

// DELETE /api/copilot/sessions/[sessionId] — Delete a session
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { sessionId } = await params;

    // Verify ownership
    const existing = await prisma.chatSession.findFirst({
      where: { id: sessionId, orgId, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Cascade delete (messages are auto-deleted via onDelete: Cascade)
    await prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Session API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
