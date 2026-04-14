/**
 * Admin Dashboard Stats API
 *
 * Returns platform-level statistics only.
 * Org-scoped data (vessels, voyages) is excluded by design.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [
      totalUsers,
      totalOrgs,
      recentUsers,
      newsletterAll,
      sitePages,
      platformAdmins,
      recentSubscribers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.newsletterSubscriber.findMany({
        select: { isActive: true, confirmedAt: true },
      }),
      prisma.sitePage.count(),
      prisma.platformAdmin.count(),
      prisma.newsletterSubscriber.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, email: true, isActive: true, confirmedAt: true, source: true, createdAt: true },
      }),
    ]);

    const newsletterStats = {
      active: newsletterAll.filter((s) => s.isActive && s.confirmedAt).length,
      pending: newsletterAll.filter((s) => !s.confirmedAt && !s.isActive).length,
      inactive: newsletterAll.filter((s) => s.confirmedAt && !s.isActive).length,
      total: newsletterAll.length,
    };

    const fromEmail = process.env.FROM_EMAIL || "";
    const isUsingTestDomain = !fromEmail || fromEmail.includes("resend.dev");
    const hasResendKey = !!process.env.RESEND_API_KEY;

    return NextResponse.json({
      stats: {
        users: { total: totalUsers, recentWeek: recentUsers },
        organizations: { total: totalOrgs },
        newsletter: newsletterStats,
        content: { pages: sitePages },
        admins: { total: platformAdmins },
      },
      recentActivity: {
        subscribers: recentSubscribers,
      },
      systemStatus: {
        emailConfigured: hasResendKey,
        usingTestDomain: isUsingTestDomain,
        fromEmail: fromEmail || "Not configured",
      },
    });
  } catch (error) {
    console.error("[Dashboard Stats] Error:", error);
    return NextResponse.json({ error: "Failed to load dashboard stats" }, { status: 500 });
  }
}
