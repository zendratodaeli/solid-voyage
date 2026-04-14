/**
 * Chat Sessions API
 *
 * CRUD operations for AI copilot conversation history.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/copilot/sessions — List all sessions for the org/user
export async function GET() {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const sessions = await prisma.chatSession.findMany({
      where: { orgId, userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title || "Untitled Conversation",
        messageCount: s._count.messages,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[Sessions API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

// POST /api/copilot/sessions — Create a new session with messages
export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { title, messages } = body;

    const session = await prisma.chatSession.create({
      data: {
        orgId,
        userId,
        title: title || null,
        messages: {
          create: (messages || []).map((msg: any) => ({
            role: msg.role,
            content:
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.parts || msg.content || ""),
            toolCalls: msg.toolCalls || undefined,
            toolResults: msg.toolResults || undefined,
          })),
        },
      },
      include: {
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({
      id: session.id,
      title: session.title,
      messageCount: session._count.messages,
      createdAt: session.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[Sessions API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
