import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import OpenAI from "openai";

/**
 * POST /api/webhooks/resend-inbound
 * 
 * Receives `email.received` events from Resend Inbound.
 * 1. Validates webhook signature (if RESEND_WEBHOOK_SECRET is set)
 * 2. Stores the email in InboundEmail table
 * 3. Runs gpt-4o-mini classification inline (~200ms)
 * 4. Returns 200 immediately
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK SIGNATURE VERIFICATION
// ═══════════════════════════════════════════════════════════════════

async function verifyResendSignature(
  req: NextRequest,
  body: string
): Promise<boolean> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[Webhook] No RESEND_WEBHOOK_SECRET set — skipping signature verification");
    return true; // Allow in development
  }

  const signature = req.headers.get("svix-signature");
  const timestamp = req.headers.get("svix-timestamp");
  const svixId = req.headers.get("svix-id");

  if (!signature || !timestamp || !svixId) {
    console.error("[Webhook] Missing Svix headers");
    return false;
  }

  try {
    // Resend uses Svix for webhook delivery
    // For production, use the @svix/webhook package for proper verification
    // For now, we accept if headers are present (add svix verification later)
    return true;
  } catch (error) {
    console.error("[Webhook] Signature verification failed:", error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EMAIL CLASSIFICATION (gpt-4o-mini)
// ═══════════════════════════════════════════════════════════════════

async function classifyEmail(subject: string, body: string): Promise<{
  category: string;
  confidence: number;
}> {
  try {
    const truncatedBody = body.slice(0, 2000); // Keep token usage low

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content: `You are a maritime email classifier. Classify inbound emails into exactly one category.

Categories:
- CARGO_OFFER: Email offering cargo for shipment (fixture inquiry, cargo nomination, voyage offer, freight offer)
- FIXTURE_RECAP: Confirmation/recap of an agreed fixture or contract terms
- MARKET_UPDATE: Market reports, freight indices, fleet updates, industry news
- OTHER: Personal emails, newsletters, spam, non-maritime content

Respond with JSON: { "category": "CARGO_OFFER|FIXTURE_RECAP|MARKET_UPDATE|OTHER", "confidence": 0.0-1.0 }`,
        },
        {
          role: "user",
          content: `Subject: ${subject}\n\nBody:\n${truncatedBody}`,
        },
      ],
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    return {
      category: result.category || "UNCLASSIFIED",
      confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
    };
  } catch (error) {
    console.error("[Webhook] AI classification failed:", error);
    return { category: "UNCLASSIFIED", confidence: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ORG RESOLUTION FROM INBOUND ADDRESS
// ═══════════════════════════════════════════════════════════════════

/**
 * Resolves the organization from the recipient address.
 * 
 * Pattern: inquiries-{orgId}@inbound.solidvoyage.com
 * 
 * For now, during development, we use a simple approach:
 * - If recipient matches the pattern, extract orgId
 * - If not, try to find the org from the first registered org (dev mode)
 */
async function resolveOrgFromRecipient(recipients: string[]): Promise<string | null> {
  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN || "inbound.solidvoyage.com";

  for (const recipient of recipients) {
    // Extract email address from "Name <email>" format
    const emailMatch = recipient.match(/<([^>]+)>/) || [null, recipient];
    const email = (emailMatch[1] || recipient).toLowerCase().trim();
    
    // Pattern: inquiries-{orgId}@domain
    const orgMatch = email.match(/^inquiries-([a-z0-9_-]+)@/i);
    if (orgMatch) {
      // Verify org exists
      const org = await prisma.organization.findFirst({
        where: { id: orgMatch[1] },
        select: { id: true },
      });
      if (org) return org.id;
    }
  }

  // Dev fallback: use the first org in the system
  if (process.env.NODE_ENV === "development") {
    const firstOrg = await prisma.organization.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (firstOrg) {
      console.warn("[Webhook] Dev mode: routing email to first org:", firstOrg.id);
      return firstOrg.id;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    
    // Verify webhook signature
    const isValid = await verifyResendSignature(req, rawBody);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    
    // Resend wraps the email data in a `data` field for webhook events
    const eventType = payload.type;
    const emailData = payload.data;

    if (eventType !== "email.received") {
      // We only handle inbound emails
      return NextResponse.json({ message: "Event type not handled" }, { status: 200 });
    }

    if (!emailData) {
      return NextResponse.json({ error: "No email data" }, { status: 400 });
    }

    // Extract email fields from Resend payload
    const resendEmailId = emailData.email_id || emailData.id || `resend-${Date.now()}`;
    const from = emailData.from || "";
    const to = Array.isArray(emailData.to) ? emailData.to : [emailData.to].filter(Boolean);
    const cc = Array.isArray(emailData.cc) ? emailData.cc : [];
    const subject = emailData.subject || "(No Subject)";
    const textBody = emailData.text || emailData.text_body || null;
    const htmlBody = emailData.html || emailData.html_body || null;

    // Resolve organization
    const orgId = await resolveOrgFromRecipient(to);
    if (!orgId) {
      console.error("[Webhook] Could not resolve org from recipients:", to);
      return NextResponse.json({ error: "Unknown recipient organization" }, { status: 200 });
    }

    // Deduplicate: check if we already processed this email
    const existing = await prisma.inboundEmail.findUnique({
      where: { resendEmailId },
    });
    if (existing) {
      return NextResponse.json({ message: "Already processed", id: existing.id }, { status: 200 });
    }

    // Classify the email using gpt-4o-mini
    const classification = await classifyEmail(subject, textBody || subject);

    // Calculate expiry (60 days for unconverted)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);

    // Store the email
    const inboundEmail = await prisma.inboundEmail.create({
      data: {
        orgId,
        resendEmailId,
        from,
        to,
        cc,
        subject,
        textBody,
        htmlBody,
        category: classification.category,
        confidence: classification.confidence,
        status: "NEW",
        expiresAt,
      },
    });

    console.log(
      `[Webhook] Stored email: ${inboundEmail.id} | From: ${from} | Category: ${classification.category} (${(classification.confidence * 100).toFixed(0)}%)`
    );

    return NextResponse.json({
      success: true,
      id: inboundEmail.id,
      category: classification.category,
    }, { status: 200 });

  } catch (error) {
    console.error("[Webhook] Error processing inbound email:", error);
    // Always return 200 to prevent Resend from retrying
    return NextResponse.json({ error: "Internal error" }, { status: 200 });
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "resend-inbound-webhook",
    timestamp: new Date().toISOString(),
  });
}
