/**
 * Clerk Webhook Handler
 * 
 * Receives events from Clerk for user and organization changes.
 * Verifies webhook signature using svix HMAC and syncs data to local DB.
 * 
 * Setup:
 * 1. In Clerk Dashboard → Webhooks → Add Endpoint
 * 2. URL: https://your-domain.com/api/webhooks/clerk
 * 3. Events: user.created, user.updated, user.deleted, 
 *            organization.created, organization.updated, organization.deleted,
 *            organizationMembership.created, organizationMembership.deleted
 * 4. Copy Signing Secret → add to .env as CLERK_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════
// SIGNATURE VERIFICATION (svix-compatible, no dependency needed)
// ═══════════════════════════════════════════════════════════════════

function verifyWebhookSignature(
  payload: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  },
  secret: string
): boolean {
  const { svixId, svixTimestamp, svixSignature } = headers;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Check timestamp to prevent replay attacks (5 minutes tolerance)
  const timestamp = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return false;
  }

  // Decode the secret (base64-encoded after "whsec_" prefix)
  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");

  // Compute signature: HMAC-SHA256 of "msgId.timestamp.body"
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // svix sends multiple signatures separated by spaces, each prefixed with "v1,"
  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const [version, signature] = sig.split(",");
    if (version === "v1" && signature === expectedSignature) {
      return true;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  // If no webhook secret is configured, skip verification (local dev)
  const payload = await request.text();
  
  if (WEBHOOK_SECRET) {
    const isValid = verifyWebhookSignature(
      payload,
      {
        svixId: request.headers.get("svix-id"),
        svixTimestamp: request.headers.get("svix-timestamp"),
        svixSignature: request.headers.get("svix-signature"),
      },
      WEBHOOK_SECRET
    );

    if (!isValid) {
      console.error("Webhook signature verification failed");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;

  try {
    switch (type) {
      // ─── User Events ────────────────────────────────────────────
      case "user.created":
      case "user.updated": {
        const clerkId = data.id as string;
        const emailAddresses = data.email_addresses as Array<{ email_address: string }>;
        const email = emailAddresses?.[0]?.email_address ?? "";
        const firstName = data.first_name as string | null;
        const lastName = data.last_name as string | null;
        const name = firstName
          ? `${firstName} ${lastName ?? ""}`.trim()
          : null;

        await prisma.user.upsert({
          where: { clerkId },
          update: { email, name },
          create: { clerkId, email, name },
        });

        console.log(`[Webhook] ${type}: synced user ${clerkId} (${name ?? email})`);
        break;
      }

      case "user.deleted": {
        const clerkId = data.id as string;

        // Soft approach: try to delete, don't fail if not found
        try {
          await prisma.user.delete({ where: { clerkId } });
          console.log(`[Webhook] user.deleted: removed user ${clerkId}`);
        } catch (err) {
          // User might not exist in our DB
          console.log(`[Webhook] user.deleted: user ${clerkId} not found in DB, skipping`);
        }
        break;
      }

      // ─── Organization Events ────────────────────────────────────
      case "organization.created":
      case "organization.updated": {
        const orgId = data.id as string;
        const name = data.name as string;
        const slug = data.slug as string | null;
        const imageUrl = data.image_url as string | null;

        await prisma.organization.upsert({
          where: { id: orgId },
          update: { name, slug, imageUrl },
          create: { id: orgId, name, slug, imageUrl, profileComplete: false },
        });

        console.log(`[Webhook] ${type}: synced org ${orgId} (${name})`);
        break;
      }

      case "organization.deleted": {
        const orgId = data.id as string;

        try {
          await prisma.organization.delete({ where: { id: orgId } });
          console.log(`[Webhook] organization.deleted: removed org ${orgId}`);
        } catch (err) {
          console.log(`[Webhook] organization.deleted: org ${orgId} not found in DB, skipping`);
        }
        break;
      }

      // ─── Organization Membership Events ──────────────────────────
      case "organizationMembership.created": {
        const membershipData = data.organization as Record<string, unknown> | undefined;
        if (membershipData) {
          const orgId = membershipData.id as string;
          const orgName = membershipData.name as string;
          const orgSlug = membershipData.slug as string | null;
          const orgImageUrl = membershipData.image_url as string | null;

          // Ensure the organization exists in our local DB
          await prisma.organization.upsert({
            where: { id: orgId },
            update: { name: orgName, slug: orgSlug, imageUrl: orgImageUrl },
            create: { id: orgId, name: orgName, slug: orgSlug, imageUrl: orgImageUrl, profileComplete: false },
          });

          console.log(`[Webhook] organizationMembership.created: synced membership for org ${orgId} (${orgName})`);
        }
        break;
      }

      case "organizationMembership.deleted": {
        const membershipOrg = data.organization as Record<string, unknown> | undefined;
        if (membershipOrg) {
          const orgId = membershipOrg.id as string;
          console.log(`[Webhook] organizationMembership.deleted: membership removed from org ${orgId}`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${type}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[Webhook] Error processing ${type}:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
