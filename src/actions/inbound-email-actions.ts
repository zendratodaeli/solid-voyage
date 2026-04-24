"use server";

/**
 * Inbound Email Actions — Server actions for the Inquiry Inbox
 * 
 * Manages the email → classification → inquiry conversion pipeline.
 */

import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/clerk";
import type { AuthUser } from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface InboundEmailItem {
  id: string;
  orgId: string;
  resendEmailId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  category: string;
  confidence: number | null;
  parsedData: Record<string, unknown> | null;
  status: string;
  convertedInquiryId: string | null;
  processedBy: string | null;
  processedAt: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface InboxStats {
  total: number;
  unread: number; // NEW status
  cargoOffers: number;
  converted: number;
  dismissed: number;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function mapEmail(email: any): InboundEmailItem {
  return {
    id: email.id,
    orgId: email.orgId,
    resendEmailId: email.resendEmailId,
    from: email.from,
    to: email.to || [],
    cc: email.cc || [],
    subject: email.subject,
    textBody: email.textBody,
    htmlBody: email.htmlBody,
    category: email.category,
    confidence: email.confidence,
    parsedData: email.parsedData as Record<string, unknown> | null,
    status: email.status,
    convertedInquiryId: email.convertedInquiryId,
    processedBy: email.processedBy,
    processedAt: email.processedAt?.toISOString() || null,
    receivedAt: email.receivedAt.toISOString(),
    createdAt: email.createdAt.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════
// GET INBOUND EMAILS
// ═══════════════════════════════════════════════════════════════════

export async function getInboundEmails(filters?: {
  status?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ success: boolean; data?: InboundEmailItem[]; total?: number; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const where: any = { orgId: user.activeOrgId };
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.search) {
      where.OR = [
        { subject: { contains: filters.search, mode: "insensitive" } },
        { from: { contains: filters.search, mode: "insensitive" } },
        { textBody: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [emails, total] = await Promise.all([
      prisma.inboundEmail.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      }),
      prisma.inboundEmail.count({ where }),
    ]);

    return { success: true, data: emails.map(mapEmail), total };
  } catch (error) {
    console.error("Failed to fetch inbound emails:", error);
    return { success: false, error: "Failed to fetch emails" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// GET INBOX STATS (for sidebar badge)
// ═══════════════════════════════════════════════════════════════════

export async function getInboxStats(): Promise<{ success: boolean; data?: InboxStats; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const orgId = user.activeOrgId;
    const [total, unread, cargoOffers, converted, dismissed] = await Promise.all([
      prisma.inboundEmail.count({ where: { orgId } }),
      prisma.inboundEmail.count({ where: { orgId, status: "NEW" } }),
      prisma.inboundEmail.count({ where: { orgId, category: "CARGO_OFFER" } }),
      prisma.inboundEmail.count({ where: { orgId, status: "CONVERTED" } }),
      prisma.inboundEmail.count({ where: { orgId, status: "DISMISSED" } }),
    ]);

    return { success: true, data: { total, unread, cargoOffers, converted, dismissed } };
  } catch (error) {
    console.error("Failed to fetch inbox stats:", error);
    return { success: false, error: "Failed to fetch stats" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// PARSE INBOUND EMAIL (run full GPT-4o extraction)
// ═══════════════════════════════════════════════════════════════════

export async function parseInboundEmail(
  emailId: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const email = await prisma.inboundEmail.findFirst({
      where: { id: emailId, orgId: user.activeOrgId },
    });
    if (!email) return { success: false, error: "Email not found" };

    // Use the existing parse-fixture logic — make an internal API call
    const content = email.textBody || email.subject || "";
    
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/voyages/parse-fixture`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
      }
    );

    if (!response.ok) {
      return { success: false, error: "AI parsing failed" };
    }

    const parsed = await response.json();

    // Store parsed data on the email
    await prisma.inboundEmail.update({
      where: { id: emailId },
      data: {
        parsedData: parsed as any,
        status: email.status === "NEW" ? "PROCESSING" : email.status,
      },
    });

    return { success: true, data: parsed };
  } catch (error) {
    console.error("Failed to parse inbound email:", error);
    return { success: false, error: "Failed to parse email" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// DISMISS EMAIL
// ═══════════════════════════════════════════════════════════════════

export async function dismissEmail(
  emailId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    await prisma.inboundEmail.update({
      where: { id: emailId, orgId: user.activeOrgId },
      data: {
        status: "DISMISSED",
        processedBy: user.clerkId,
        processedAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to dismiss email:", error);
    return { success: false, error: "Failed to dismiss email" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// MARK EMAIL AS CONVERTED
// ═══════════════════════════════════════════════════════════════════

export async function markEmailConverted(
  emailId: string,
  inquiryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    await prisma.inboundEmail.update({
      where: { id: emailId, orgId: user.activeOrgId },
      data: {
        status: "CONVERTED",
        convertedInquiryId: inquiryId,
        processedBy: user.clerkId,
        processedAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to mark email as converted:", error);
    return { success: false, error: "Failed to update email" };
  }
}
