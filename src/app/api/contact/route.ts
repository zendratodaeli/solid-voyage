/**
 * Contact Form API
 *
 * POST: Sends a contact message to the admin email.
 * Public route — no authentication required.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const ContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(1, "Message is required").max(10000),
});

// Rate limiting — simple in-memory store
const submissions = new Map<string, number>();
const RATE_LIMIT_MS = 60_000; // 1 message per minute per IP

export async function POST(request: NextRequest) {
  try {
    // Simple rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const lastSubmission = submissions.get(ip);
    if (lastSubmission && Date.now() - lastSubmission < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: "Please wait a moment before sending another message." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = ContactSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { name, email, subject, message } = parsed.data;

    // Admin notification email
    const adminEmail = process.env.CONTACT_EMAIL || "solidzendrato@gmail.com";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 24px;">
    <div style="background: linear-gradient(135deg, #1a365d 0%, #0d1b2a 100%); border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">New Contact Message</h1>
      <p style="margin: 8px 0 0; color: #94a3b8; font-size: 13px;">From your Solid Voyage contact form</p>
    </div>
    <div style="background: #111827; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #1e293b; border-top: none;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 80px; vertical-align: top;">From</td>
          <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; font-weight: 500;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 13px; vertical-align: top;">Email</td>
          <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #60a5fa; text-decoration: none; font-size: 14px;">${email}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 13px; vertical-align: top;">Subject</td>
          <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; font-weight: 500;">${subject}</td>
        </tr>
      </table>
      <hr style="border: none; border-top: 1px solid #1e293b; margin: 16px 0;">
      <div style="color: #cbd5e1; font-size: 14px; line-height: 1.7;">
        ${message}
      </div>
      <hr style="border: none; border-top: 1px solid #1e293b; margin: 16px 0;">
      <p style="margin: 0; color: #475569; font-size: 11px; text-align: center;">
        Reply directly to this email to respond to ${name} at ${email}
      </p>
    </div>
  </div>
</body>
</html>`;

    const plainText = `New Contact Message\n\nFrom: ${name} (${email})\nSubject: ${subject}\n\n${message.replace(/<[^>]*>/g, "")}`;

    const result = await sendEmail({
      to: adminEmail,
      subject: `Contact: ${subject}`,
      html,
      text: plainText,
      headers: {
        "Reply-To": email,
      },
    });

    if (!result.success) {
      console.error("[Contact] Failed to send:", result.error);
      return NextResponse.json(
        { error: "Failed to send message. Please try again later." },
        { status: 500 }
      );
    }

    // Record rate limit
    submissions.set(ip, Date.now());

    // Cleanup old entries periodically
    if (submissions.size > 1000) {
      const cutoff = Date.now() - RATE_LIMIT_MS * 10;
      for (const [key, time] of submissions) {
        if (time < cutoff) submissions.delete(key);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Your message has been sent. We'll get back to you soon!",
    });
  } catch (error) {
    console.error("[Contact] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
