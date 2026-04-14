/**
 * Platform — Newsletter Admin API
 * 
 * GET:  List all subscribers (with stats)
 * POST: Send a newsletter to all active subscribers
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { sendEmail, isUsingTestDomain } from "@/lib/email";
import { z } from "zod";

const SendNewsletterSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  content: z.string().min(1, "Content is required"),
  previewText: z.string().optional(),
  templateId: z.string().optional(),
});

// GET — List subscribers
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const subscribers = await prisma.newsletterSubscriber.findMany({
      orderBy: { subscribedAt: "desc" },
    });

    const stats = {
      total: subscribers.length,
      active: subscribers.filter((s) => s.isActive && s.confirmedAt).length,
      pending: subscribers.filter((s) => !s.confirmedAt && !s.isActive).length,
      unsubscribed: subscribers.filter((s) => s.confirmedAt && !s.isActive).length,
    };

    return NextResponse.json({ subscribers, stats, usingTestDomain: isUsingTestDomain() });
  } catch (error) {
    console.error("[Newsletter Admin] Failed to fetch subscribers:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscribers" },
      { status: 500 }
    );
  }
}

// POST — Send newsletter OR add subscriber
export async function POST(req: Request) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Route by action
    if (body.action === "add_subscriber") {
      return handleAddSubscriber(body);
    }

    // Default: send newsletter
    const result = SendNewsletterSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured. Set RESEND_API_KEY in .env" },
        { status: 503 }
      );
    }

    const { subject, content, previewText, templateId } = result.data;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Get all active subscribers
    const activeSubscribers = await prisma.newsletterSubscriber.findMany({
      where: { isActive: true, confirmedAt: { not: null } },
    });

    if (activeSubscribers.length === 0) {
      return NextResponse.json(
        { error: "No active subscribers to send to" },
        { status: 400 }
      );
    }

    // Send to each subscriber individually (for unique unsubscribe links)
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const subscriber of activeSubscribers) {
      const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${subscriber.unsubscribeToken}`;

      const html = buildNewsletterHtml({
        content,
        previewText,
        unsubscribeUrl,
        subscriberEmail: subscriber.email,
        templateId,
      });

      // Plain text fallback — critical for deliverability
      const text = buildNewsletterText({
        content,
        unsubscribeUrl,
        subscriberEmail: subscriber.email,
      });

      const result = await sendEmail({
        to: subscriber.email,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`${subscriber.email}: ${result.error}`);
      }
    }

    console.log(`[Newsletter] Sent: ${sent}, Failed: ${failed}, Total: ${activeSubscribers.length}`);

    return NextResponse.json({
      message: `Newsletter sent to ${sent} subscriber${sent !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}.`,
      sent,
      failed,
      total: activeSubscribers.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[Newsletter Admin] Failed to send newsletter:", error);
    return NextResponse.json(
      { error: "Failed to send newsletter" },
      { status: 500 }
    );
  }
}

// ─── Add subscriber from admin panel ─────────────────────────────
const AddSubscriberSchema = z.object({
  action: z.literal("add_subscriber"),
  email: z.string().email("Invalid email address"),
  name: z.string().optional(),
});

async function handleAddSubscriber(body: unknown) {
  const result = AddSubscriberSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { email, name } = result.data;
  const normalizedEmail = email.toLowerCase();

  // Check existing
  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    if (existing.isActive) {
      return NextResponse.json(
        { error: "This email is already subscribed" },
        { status: 409 }
      );
    }
    // Re-activate
    const updated = await prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: { isActive: true, confirmedAt: existing.confirmedAt || new Date(), unsubscribedAt: null, name: name || existing.name, source: "admin", confirmToken: null },
    });
    return NextResponse.json(updated, { status: 200 });
  }

  const subscriber = await prisma.newsletterSubscriber.create({
    data: {
      email: normalizedEmail,
      name: name || null,
      source: "admin",
      isActive: true,        // Admin-added = trusted, skip confirmation
      confirmedAt: new Date(),
      confirmToken: null,     // No confirmation needed
    },
  });

  return NextResponse.json(subscriber, { status: 201 });
}

function buildNewsletterHtml(params: {
  content: string;
  previewText?: string;
  unsubscribeUrl: string;
  subscriberEmail: string;
  templateId?: string;
}) {
  // Template presets (must match frontend)
  const templates: Record<string, { headerGradient: string; headerTextColor: string; bodyBg: string; bodyText: string; footerBg: string; borderColor: string; accentColor: string; brandIcon: string }> = {
    maritime: { headerGradient: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)", headerTextColor: "#ffffff", bodyBg: "#ffffff", bodyText: "#374151", footerBg: "#f9fafb", borderColor: "#e5e7eb", accentColor: "#0ea5e9", brandIcon: "⚓" },
    modern: { headerGradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)", headerTextColor: "#ffffff", bodyBg: "#ffffff", bodyText: "#374151", footerBg: "#faf5ff", borderColor: "#ede9fe", accentColor: "#8b5cf6", brandIcon: "🚢" },
    bold: { headerGradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", headerTextColor: "#f1f5f9", bodyBg: "#1e293b", bodyText: "#e2e8f0", footerBg: "#0f172a", borderColor: "#334155", accentColor: "#38bdf8", brandIcon: "⚓" },
    minimal: { headerGradient: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", headerTextColor: "#0f172a", bodyBg: "#ffffff", bodyText: "#374151", footerBg: "#f8fafc", borderColor: "#e2e8f0", accentColor: "#0284c7", brandIcon: "⚓" },
    ocean: { headerGradient: "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)", headerTextColor: "#ffffff", bodyBg: "#ffffff", bodyText: "#374151", footerBg: "#f0fdfa", borderColor: "#ccfbf1", accentColor: "#14b8a6", brandIcon: "🌊" },
  };

  const t = templates[params.templateId || "maritime"] || templates.maritime;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      ${params.previewText ? `<span style="display:none;font-size:1px;color:#fff;max-height:0;overflow:hidden;">${params.previewText}</span>` : ""}
    </head>
    <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: ${t.headerGradient}; border-radius: 12px 12px 0 0; padding: 24px 32px; text-align: center;">
          <p style="margin: 0; font-size: 28px;">${t.brandIcon}</p>
          <h1 style="margin: 8px 0 0; font-size: 20px; font-weight: 700; color: ${t.headerTextColor};">
            Solid Voyage
          </h1>
          <p style="margin: 4px 0 0; font-size: 13px; color: ${t.headerTextColor}; opacity: 0.7;">
            Maritime Intelligence Newsletter
          </p>
        </div>

        <!-- Content -->
        <div style="background: ${t.bodyBg}; padding: 32px; border: 1px solid ${t.borderColor}; border-top: none; color: ${t.bodyText}; line-height: 1.6; font-size: 15px;">
          ${params.content}
        </div>

        <!-- Footer -->
        <div style="background: ${t.footerBg}; border-radius: 0 0 12px 12px; border: 1px solid ${t.borderColor}; border-top: none; padding: 20px 32px; text-align: center;">
          <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280;">
            You're receiving this because you subscribed to the Solid Voyage newsletter.
          </p>
          <a href="${params.unsubscribeUrl}" style="display: inline-block; font-size: 12px; color: ${t.accentColor}; text-decoration: underline;">
            Unsubscribe
          </a>
          <p style="margin: 12px 0 0; font-size: 11px; color: #d1d5db;">
            Sent to ${params.subscriberEmail}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function buildNewsletterText(params: {
  content: string;
  unsubscribeUrl: string;
  subscriberEmail: string;
}) {
  // Strip HTML tags for plain text version
  const textContent = params.content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "  - ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();

  return `Solid Voyage - Maritime Intelligence Newsletter

${textContent}

---
You're receiving this because you subscribed to the Solid Voyage newsletter.
Sent to: ${params.subscriberEmail}

Unsubscribe: ${params.unsubscribeUrl}
`;
}

// ─── PATCH — Update a subscriber ────────────────────────────────
const UpdateSubscriberSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const result = UpdateSubscriberSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { id, email, name, isActive } = result.data;

    // Check subscriber exists
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // If changing email, check uniqueness
    if (email && email.toLowerCase() !== existing.email) {
      const duplicate = await prisma.newsletterSubscriber.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "Another subscriber already has this email" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.newsletterSubscriber.update({
      where: { id },
      data: {
        ...(email !== undefined && { email: email.toLowerCase() }),
        ...(name !== undefined && { name: name || null }),
        ...(isActive !== undefined && {
          isActive,
          unsubscribedAt: isActive === false ? new Date() : null,
        }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Newsletter Admin] Failed to update subscriber:", error);
    return NextResponse.json({ error: "Failed to update subscriber" }, { status: 500 });
  }
}

// ─── DELETE — Remove a subscriber ───────────────────────────────
export async function DELETE(req: Request) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing subscriber ID" }, { status: 400 });
    }

    const existing = await prisma.newsletterSubscriber.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    await prisma.newsletterSubscriber.delete({ where: { id } });

    return NextResponse.json({ message: `${existing.email} has been removed.` });
  } catch (error) {
    console.error("[Newsletter Admin] Failed to delete subscriber:", error);
    return NextResponse.json({ error: "Failed to delete subscriber" }, { status: 500 });
  }
}
