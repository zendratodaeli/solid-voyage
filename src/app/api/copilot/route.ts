/**
 * AI Copilot Streaming API Route
 *
 * Handles chat messages from the copilot UI, streams AI responses
 * with tool calling support via the Vercel AI SDK v6.
 */

import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { copilotTools } from "@/lib/ai/tool-registry";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { auth } from "@clerk/nextjs/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("Messages array required", { status: 400 });
    }

    // Enrich system prompt with org context
    const enrichedSystemPrompt = `${SYSTEM_PROMPT}

## Current Context
- Organization ID: ${orgId}
- User ID: ${userId}
- When calling tools that require an orgId parameter, use: "${orgId}"
- Current date: ${new Date().toISOString().split("T")[0]}
`;

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: enrichedSystemPrompt,
      messages,
      tools: copilotTools,

      onStepFinish: (step) => {
        if (step.toolCalls?.length) {
          console.log(
            `[Copilot] Tool calls:`,
            step.toolCalls.map((tc: any) => tc.toolName)
          );
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Copilot API] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
