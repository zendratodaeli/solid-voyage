/**
 * Admin Invitation Emails
 * 
 * Sends invitation emails via Resend when a root admin adds a new platform admin.
 * Uses centralized email config for deliverability.
 */

import { sendEmail, isUsingTestDomain } from "@/lib/email";

interface AdminInviteParams {
  toEmail: string;
  toName?: string;
  invitedBy: string;
  permissions: {
    canManagePages: boolean;
    canManageMarketData: boolean;
    canManageSettings: boolean;
    canManageAdmins: boolean;
    canManageNewsletter: boolean;
  };
}

export async function sendAdminInvitation(params: AdminInviteParams) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const adminPanelUrl = `${baseUrl}/admin/pages`;
  const signUpUrl = `${baseUrl}/sign-up`;

  const recipientName = params.toName || params.toEmail.split("@")[0];
  // No emoji in subject line — spam filters flag them
  const subject = `You've been invited as a Platform Administrator - Solid Voyage`;

  // Permission labels
  const permissionLabels: { key: keyof typeof params.permissions; label: string }[] = [
    { key: "canManagePages", label: "Site Pages (CMS)" },
    { key: "canManageMarketData", label: "Global Market Data" },
    { key: "canManageSettings", label: "Platform Settings" },
    { key: "canManageAdmins", label: "Admin Management" },
    { key: "canManageNewsletter", label: "Newsletter" },
  ];

  const grantedPermissions = permissionLabels
    .filter((p) => params.permissions[p.key])
    .map((p) => p.label);

  const permissionsHtml = grantedPermissions.length > 0
    ? grantedPermissions.map((p) => `<li style="padding: 4px 0; font-size: 14px; color: #374151;">${p}</li>`).join("")
    : `<li style="padding: 4px 0; font-size: 14px; color: #9ca3af; font-style: italic;">No specific permissions assigned yet. Contact the admin who invited you.</li>`;

  const permissionsText = grantedPermissions.length > 0
    ? grantedPermissions.map((p) => `  - ${p}`).join("\n")
    : "  - No specific permissions assigned yet.";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #d97706 0%, #b45309 50%, #92400e 100%); border-radius: 12px; padding: 32px; color: white; margin-bottom: 24px; text-align: center;">
        <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700;">You're Invited!</h1>
        <p style="margin: 0; opacity: 0.9; font-size: 15px;">Platform Administrator Access - Solid Voyage</p>
      </div>

      <!-- Body -->
      <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb; margin-bottom: 24px;">
        <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">
          Hi <strong>${recipientName}</strong>,
        </p>

        <p style="font-size: 14px; color: #374151; line-height: 1.6; margin: 0 0 20px;">
          <strong>${params.invitedBy}</strong> has added you as a <strong>Platform Administrator</strong> on Solid Voyage.
          You now have access to the admin panel to help manage the platform.
        </p>

        <!-- Permissions Card -->
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">
            Your Permissions
          </p>
          <ul style="margin: 0; padding: 0 0 0 8px; list-style: none;">
            ${permissionsHtml}
          </ul>
        </div>

        <!-- How to Get Started -->
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px;">
            Getting Started
          </p>
          <ol style="margin: 0; padding: 0 0 0 20px; color: #374151; font-size: 14px; line-height: 1.8;">
            <li>Sign up or sign in at Solid Voyage with this email address (<strong>${params.toEmail}</strong>)</li>
            <li>Once logged in, navigate to the <strong>Admin Panel</strong></li>
            <li>You'll see only the sections you have permission to access</li>
          </ol>
        </div>

        <!-- CTA Buttons -->
        <div style="text-align: center; margin-bottom: 8px;">
          <a href="${adminPanelUrl}" style="display: inline-block; background: linear-gradient(135deg, #d97706, #b45309); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Go to Admin Panel
          </a>
        </div>
        <div style="text-align: center;">
          <a href="${signUpUrl}" style="display: inline-block; color: #6b7280; text-decoration: underline; font-size: 13px; margin-top: 8px;">
            Don't have an account? Sign up here
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding: 16px;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #9ca3af;">
          This invitation was sent by ${params.invitedBy} via Solid Voyage.
        </p>
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          If you believe this was sent in error, please contact the person who invited you.
        </p>
      </div>
    </div>
  `;

  // Plain text fallback (critical for deliverability!)
  const text = `You've been invited as a Platform Administrator - Solid Voyage

Hi ${recipientName},

${params.invitedBy} has added you as a Platform Administrator on Solid Voyage. You now have access to the admin panel to help manage the platform.

YOUR PERMISSIONS:
${permissionsText}

GETTING STARTED:
1. Sign up or sign in at Solid Voyage with this email (${params.toEmail})
2. Once logged in, navigate to the Admin Panel
3. You'll see only the sections you have permission to access

Admin Panel: ${adminPanelUrl}
Sign Up: ${signUpUrl}

---
This invitation was sent by ${params.invitedBy} via Solid Voyage.
If you believe this was sent in error, please contact the person who invited you.
  `;

  const result = await sendEmail({
    to: params.toEmail,
    subject,
    html,
    text,
  });

  // Add test domain hint if relevant
  if (!result.success && isUsingTestDomain()) {
    result.hint = "You're using Resend's test domain (onboarding@resend.dev). Emails from this domain often land in spam or only deliver to the Resend account owner. Add and verify your own domain at https://resend.com/domains";
  }

  return result;
}
