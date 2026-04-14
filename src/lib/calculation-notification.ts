/**
 * Calculation Email Notification
 *
 * Sends email notifications to org admins when a voyage calculation
 * completes, informing them of the auto-classified status and key metrics.
 */

import { sendEmail } from "@/lib/email";

interface CalculationNotificationParams {
  /** Email addresses of org admins */
  adminEmails: string[];
  /** Voyage route name (e.g., "Rotterdam → Singapore") */
  voyageRoute: string;
  /** Voyage ID for direct link */
  voyageId: string;
  /** Org slug for URL */
  orgSlug: string;
  /** Auto-classified status */
  status: "NEW" | "REJECTED";
  /** Key metrics */
  tce: number;
  voyagePnl: number | null;
  breakEvenFreight: number;
  /** Name of user who triggered calculation */
  calculatedBy: string;
}

export async function sendCalculationNotification(params: CalculationNotificationParams) {
  if (!process.env.RESEND_API_KEY || params.adminEmails.length === 0) {
    console.log("[Calculation Email] Skipped — no API key or no recipients");
    return;
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const voyageUrl = `${baseUrl}/${params.orgSlug}/voyages/${params.voyageId}`;

    const isEvaluated = params.status === "NEW";
    const statusEmoji = isEvaluated ? "📊" : "❌";
    const statusLabel = isEvaluated ? "Evaluated" : "Rejected";
    const statusColor = isEvaluated ? "#1e40af" : "#991b1b";
    const statusBg = isEvaluated
      ? "linear-gradient(135deg, #1e40af 0%, #1e3a5f 100%)"
      : "linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)";

    const fmtUsd = (n: number) =>
      `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const subject = `${statusEmoji} Voyage ${statusLabel}: ${params.voyageRoute}`;

    const body = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${statusBg}; border-radius: 12px; padding: 24px; color: white; margin-bottom: 20px;">
          <h1 style="margin: 0 0 8px; font-size: 20px;">${statusEmoji} Voyage ${statusLabel}</h1>
          <p style="margin: 0; opacity: 0.8; font-size: 14px;">Voyage: <strong>${params.voyageRoute}</strong></p>
        </div>
        
        <p style="font-size: 14px; color: #374151;">
          A voyage calculation was completed by <strong>${params.calculatedBy}</strong>. 
          The system has classified this voyage as <strong style="color: ${statusColor};">${statusLabel}</strong>. 
          Review the recommendation badge to make your commercial decision.
        </p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">TCE (Time Charter Equivalent)</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: ${params.tce >= 0 ? "#166534" : "#991b1b"}; font-size: 14px;">${fmtUsd(params.tce)}/day</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Voyage P&L</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: ${(params.voyagePnl ?? 0) >= 0 ? "#166534" : "#991b1b"}; font-size: 14px;">${params.voyagePnl !== null ? fmtUsd(params.voyagePnl) : "—"}</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Break-even Freight</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; font-size: 14px;">${fmtUsd(params.breakEvenFreight)}/MT</td>
            </tr>
          </table>
        </div>

        <a href="${voyageUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 8px;">
          Review Voyage →
        </a>

        <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
          This is an automated notification from Solid Voyage. You can leave comments on the voyage page to provide your input.
        </p>
      </div>
    `;

    for (const email of params.adminEmails) {
      await sendEmail({
        to: email,
        subject,
        html: body,
        text: `${subject}\n\nTCE: ${fmtUsd(params.tce)}/day\nP&L: ${params.voyagePnl !== null ? fmtUsd(params.voyagePnl) : "—"}\n\nView voyage: ${voyageUrl}`,
      });
    }

    console.log(`[Calculation Email] Sent to ${params.adminEmails.length} admin(s): ${subject}`);
  } catch (error) {
    // Email should never break the calculation flow
    console.error("[Calculation Email] Failed to send:", error);
  }
}
