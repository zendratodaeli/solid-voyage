/**
 * Custom Weather Locations API
 * 
 * GET    — List all custom locations for the authenticated user
 * POST   — Add a new custom location
 * DELETE — Remove a custom location by ID (via ?id=...)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// ─── GET /api/weather-locations ──────────────────────────────────

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const locations = await prisma.weatherLocation.findMany({
      where: { clerkId: userId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        lat: loc.latitude,
        lon: loc.longitude,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch weather locations:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// ─── POST /api/weather-locations ─────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, lat, lon } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }
    if (typeof lat !== "number" || typeof lon !== "number" || isNaN(lat) || isNaN(lon)) {
      return NextResponse.json({ success: false, error: "Valid lat/lon required" }, { status: 400 });
    }

    const location = await prisma.weatherLocation.create({
      data: {
        clerkId: userId,
        name: name.trim(),
        latitude: lat,
        longitude: lon,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: location.id,
        name: location.name,
        lat: location.latitude,
        lon: location.longitude,
      },
    });
  } catch (error) {
    console.error("Failed to create weather location:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// ─── DELETE /api/weather-locations?id=... ─────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Location ID required" }, { status: 400 });
    }

    // Only allow deleting own locations
    const location = await prisma.weatherLocation.findFirst({
      where: { id, clerkId: userId },
    });

    if (!location) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 });
    }

    await prisma.weatherLocation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete weather location:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
