/**
 * POST /api/admin/ports/import
 *
 * Bulk import ports from AI-parsed data.
 * Accepts an array of port objects and upserts them into the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const body = await request.json();
    const ports: any[] = body.ports || [];

    if (!ports.length) {
      return NextResponse.json({ error: "No ports to import" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;

    for (const p of ports) {
      try {
        if (!p.name) { skipped++; continue; }

        // Generate locode if not provided
        let locode = p.locode?.trim()?.toUpperCase();
        if (!locode || locode.length < 2) {
          const countryCode = (p.country || "XX").substring(0, 2).toUpperCase();
          const nameCode = p.name.replace(/[^A-Za-z]/g, "").substring(0, 5).toUpperCase();
          locode = `${countryCode}${nameCode}`;
        }

        await prisma.port.upsert({
          where: { locode },
          create: {
            name: p.name,
            locode,
            country: p.country || "Unknown",
            region: p.region || null,
            latitude: typeof p.latitude === "number" ? p.latitude : 0,
            longitude: typeof p.longitude === "number" ? p.longitude : 0,
            harborSize: p.harborSize || "M",
            waterBody: p.waterBody || null,
            alternateName: p.alternateName || null,
            isActive: true,
            lastSyncedAt: new Date(),
          },
          update: {
            name: p.name,
            country: p.country || "Unknown",
            region: p.region || null,
            latitude: typeof p.latitude === "number" ? p.latitude : undefined,
            longitude: typeof p.longitude === "number" ? p.longitude : undefined,
            harborSize: p.harborSize || undefined,
            waterBody: p.waterBody || undefined,
            alternateName: p.alternateName || undefined,
            lastSyncedAt: new Date(),
          },
        });
        imported++;
      } catch {
        skipped++;
      }
    }

    const total = await prisma.port.count();

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total,
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Import failed";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
