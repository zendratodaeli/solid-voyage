/**
 * Newsletter Subscribe API (Public)
 * 
 * POST: Subscribe an email to the newsletter (double opt-in)
 * 
 * Flow:
 * 1. Save subscriber as isActive=false with confirmToken
 * 2. Send confirmation email
 * 3. User clicks confirm link → confirmed + activated
 * 4. Unconfirmed records auto-deleted after 4 hours
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const SubscribeSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().optional(),
});

// 5 minutes — unconfirmed subscribers auto-deleted after this window
const CONFIRM_EXPIRY_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = SubscribeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { email, name } = result.data;
    const normalizedEmail = email.toLowerCase();

    // ── Lazy cleanup: delete unconfirmed records older than 4 hours ──
    await prisma.newsletterSubscriber.deleteMany({
      where: {
        confirmedAt: null,
        isActive: false,
        createdAt: { lt: new Date(Date.now() - CONFIRM_EXPIRY_MS) },
      },
    }).catch(() => {}); // Don't fail if cleanup errors

    // ── Check existing subscriber ──
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      // Already confirmed and active
      if (existing.isActive && existing.confirmedAt) {
        return NextResponse.json(
          { message: "You're already subscribed!" },
          { status: 200 }
        );
      }

      // Pending confirmation — resend confirmation email
      if (!existing.confirmedAt && !existing.isActive) {
        await sendConfirmationEmail(normalizedEmail, existing.confirmToken || "", name);
        return NextResponse.json(
          { message: "Check your inbox! We've sent a confirmation email.", needsConfirmation: true },
          { status: 200 }
        );
      }

      // Previously unsubscribed — re-subscribe with confirmation
      if (existing.confirmedAt && !existing.isActive) {
        // Re-activate directly since they confirmed before
        await prisma.newsletterSubscriber.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            unsubscribedAt: null,
            name: name || existing.name,
          },
        });
        return NextResponse.json(
          { message: "Welcome back! You've been re-subscribed." },
          { status: 200 }
        );
      }
    }

    // ── Create new subscriber (pending confirmation) ──
    const subscriber = await prisma.newsletterSubscriber.create({
      data: {
        email: normalizedEmail,
        name: name || null,
        isActive: false, // Not active until confirmed
        source: "website",
      },
    });

    // Send confirmation email
    await sendConfirmationEmail(normalizedEmail, subscriber.confirmToken || "", name);

    return NextResponse.json(
      { message: "Check your inbox! We've sent a confirmation email to verify your address.", needsConfirmation: true },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Newsletter Subscribe] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

async function sendConfirmationEmail(email: string, confirmToken: string, name?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const confirmUrl = `${baseUrl}/confirm-subscription?token=${confirmToken}`;
  const recipientName = name || email.split("@")[0];

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); border-radius: 12px; padding: 32px; color: white; margin-bottom: 24px; text-align: center;">
        <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700;">Confirm Your Subscription</h1>
        <p style="margin: 0; opacity: 0.8; font-size: 14px;">Solid Voyage - Maritime Intelligence Newsletter</p>
      </div>

      <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb; margin-bottom: 24px;">
        <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">
          Hi <strong>${recipientName}</strong>,
        </p>
        <p style="font-size: 14px; color: #374151; line-height: 1.6; margin: 0 0 24px;">
          Thanks for signing up for the Solid Voyage newsletter! Please confirm your email address by clicking the button below.
        </p>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${confirmUrl}" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Confirm Subscription
          </a>
        </div>

        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
          This link expires in 4 hours. If you didn't sign up, you can safely ignore this email.
        </p>
      </div>

      <div style="text-align: center; padding: 8px;">
        <p style="margin: 0; font-size: 11px; color: #9ca3af;">
          Solid Voyage - Premium Maritime Freight Intelligence
        </p>
      </div>
    </div>
  `;

  const text = `Confirm Your Subscription - Solid Voyage Newsletter

Hi ${recipientName},

Thanks for signing up for the Solid Voyage newsletter! Please confirm your email address by visiting this link:

${confirmUrl}

This link expires in 4 hours. If you didn't sign up, you can safely ignore this email.

---
Solid Voyage - Premium Maritime Freight Intelligence`;

  await sendEmail({
    to: email,
    subject: "Confirm your Solid Voyage newsletter subscription",
    html,
    text,
  });
}
