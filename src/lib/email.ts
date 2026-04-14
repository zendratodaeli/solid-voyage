/**
 * Email Configuration — Centralized email settings
 * 
 * Controls sender address, reply-to, and deliverability settings.
 * All email sending code should import from here to ensure consistency.
 * 
 * ─── DELIVERABILITY CHECKLIST ───
 * 
 * To ensure emails land in inbox (not spam), you MUST:
 * 
 * 1. Add your domain to Resend: https://resend.com/domains
 *    - Add DNS records: SPF, DKIM, DMARC
 *    - Verify the domain
 * 
 * 2. Set FROM_EMAIL in .env to your verified domain:
 *    FROM_EMAIL=Solid Voyage <noreply@solidvoyage.com>
 *    REPLY_TO_EMAIL=support@solidvoyage.com
 * 
 * 3. The onboarding@resend.dev address is for TESTING ONLY.
 *    It will almost always hit spam for non-account-owner recipients.
 */

import { Resend } from "resend";

// ─── Singleton Resend client ─────────────────────────────
let _resend: Resend | null = null;

export function getResendClient(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// ─── Email addresses ─────────────────────────────────────

/**
 * The "From" address for all platform emails.
 * 
 * Set FROM_EMAIL in .env to use your verified domain.
 * Falls back to Resend's test address (spam-prone).
 */
export function getFromEmail(): string {
  return process.env.FROM_EMAIL || "Solid Voyage <onboarding@resend.dev>";
}

/**
 * Reply-To address — should point to a real monitored inbox.
 */
export function getReplyToEmail(): string {
  return process.env.REPLY_TO_EMAIL || "";
}

// ─── Email sending helper ────────────────────────────────

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Plain text fallback — improves deliverability */
  text?: string;
  /** Additional headers (e.g., List-Unsubscribe) */
  headers?: Record<string, string>;
}

interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  hint?: string;
}

/**
 * Send an email via Resend with all deliverability best practices.
 * 
 * - Uses configured FROM_EMAIL (env-driven)
 * - Adds Reply-To if configured
 * - Logs clearly with success/failure indicators
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[Email] Skipped — no RESEND_API_KEY configured");
    return { success: false, error: "Email service not configured", hint: "Set RESEND_API_KEY in .env" };
  }

  const resend = getResendClient();
  const from = getFromEmail();
  const replyTo = getReplyToEmail();

  try {
    const response = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: replyTo || undefined,
      headers: params.headers,
    });

    if (response.error) {
      console.error(`[Email] ❌ Resend API error → ${params.to}:`, response.error);
      return {
        success: false,
        error: response.error.message || "Resend API error",
        hint: from.includes("resend.dev")
          ? "You're using onboarding@resend.dev (test domain). Add a custom verified domain at resend.com/domains to fix deliverability."
          : "Check your Resend dashboard for delivery status.",
      };
    }

    console.log(`[Email] ✅ Sent to ${params.to} (ID: ${response.data?.id})`);
    return { success: true, id: response.data?.id };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Email] ❌ Failed to send to ${params.to}:`, errMsg);
    return {
      success: false,
      error: errMsg,
      hint: "Check your RESEND_API_KEY and sender domain configuration.",
    };
  }
}

/**
 * Check if we're using the test domain (for UI warnings).
 */
export function isUsingTestDomain(): boolean {
  return getFromEmail().includes("resend.dev");
}
