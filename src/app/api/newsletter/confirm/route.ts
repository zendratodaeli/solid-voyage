/**
 * Newsletter Confirm API (Public)
 * 
 * GET: Confirm a newsletter subscription via token
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 5 minutes — unconfirmed subscribers auto-deleted after this window
const CONFIRM_EXPIRY_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing confirmation token" },
        { status: 400 }
      );
    }

    // ── Lazy cleanup: delete ALL unconfirmed records older than expiry ──
    await prisma.newsletterSubscriber.deleteMany({
      where: {
        confirmedAt: null,
        isActive: false,
        createdAt: { lt: new Date(Date.now() - CONFIRM_EXPIRY_MS) },
      },
    }).catch(() => {}); // Don't fail if cleanup errors

    const subscriber = await prisma.newsletterSubscriber.findUnique({
      where: { confirmToken: token },
    });

    if (!subscriber) {
      return NextResponse.json(
        { error: "Invalid or expired confirmation link. Please subscribe again." },
        { status: 404 }
      );
    }

    // Already confirmed
    if (subscriber.confirmedAt) {
      return NextResponse.json({
        message: "Your subscription is already confirmed!",
        email: subscriber.email,
        alreadyConfirmed: true,
      });
    }

    // Check if expired
    const createdAt = new Date(subscriber.createdAt).getTime();
    if (Date.now() - createdAt > CONFIRM_EXPIRY_MS) {
      // Delete expired record
      await prisma.newsletterSubscriber.delete({ where: { id: subscriber.id } });
      return NextResponse.json(
        { error: "This confirmation link has expired. Please subscribe again." },
        { status: 410 }
      );
    }

    // Confirm and activate
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        confirmedAt: new Date(),
        isActive: true,
        confirmToken: null, // Clear token after use
      },
    });

    return NextResponse.json({
      message: "Your subscription is confirmed! You'll receive our next newsletter.",
      email: subscriber.email,
      confirmed: true,
    });
  } catch (error) {
    console.error("[Newsletter Confirm] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
