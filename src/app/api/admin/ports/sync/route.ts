/**
 * Sync Ports from NGA World Port Index
 *
 * POST /api/admin/ports/sync
 *
 * Fetches 3,700+ ports from NGA and upserts them into our database.
 * Only accessible by super admins with canManagePorts permission.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";

const WPI_URL = "https://msi.nga.mil/api/publications/world-port-index?output=json";

/** Map NGA region names to our Region enum */
function mapRegion(regionName: string | null, country: string): string | null {
  if (!regionName && !country) return null;
  const r = (regionName || "").toLowerCase();
  const c = country.toLowerCase();

  if (r.includes("europe") || ["germany", "netherlands", "france", "united kingdom", "norway", "sweden", "denmark", "finland", "belgium", "poland", "spain", "portugal", "italy", "greece", "ireland", "iceland"].some(x => c.includes(x))) return "EUROPE";
  if (r.includes("mediterranean") || ["turkey", "croatia", "albania", "montenegro", "cyprus", "malta", "tunisia", "algeria", "libya"].some(x => c.includes(x))) return "MEDITERRANEAN";
  if (r.includes("middle east") || ["saudi arabia", "united arab emirates", "kuwait", "qatar", "bahrain", "oman", "iraq", "iran", "jordan", "israel"].some(x => c.includes(x))) return "MIDDLE_EAST";
  if (r.includes("east africa") || ["kenya", "tanzania", "mozambique", "madagascar", "somalia", "djibouti", "eritrea"].some(x => c.includes(x))) return "EAST_AFRICA";
  if (r.includes("west africa") || ["nigeria", "ghana", "cameroon", "senegal", "ivory coast", "guinea", "sierra leone", "liberia", "togo", "benin"].some(x => c.includes(x))) return "WEST_AFRICA";
  if (r.includes("south africa") || c.includes("south africa") || c.includes("namibia") || c.includes("angola")) return "SOUTH_AFRICA";
  if (r.includes("indian") || ["india", "pakistan", "bangladesh", "sri lanka", "myanmar"].some(x => c.includes(x))) return "INDIAN_SUBCONTINENT";
  if (r.includes("southeast asia") || ["singapore", "malaysia", "indonesia", "thailand", "vietnam", "philippines", "cambodia", "brunei"].some(x => c.includes(x))) return "SOUTHEAST_ASIA";
  if (r.includes("east asia") || ["china", "japan", "korea", "taiwan", "hong kong"].some(x => c.includes(x))) return "EAST_ASIA";
  if (r.includes("australia") || c.includes("australia") || c.includes("new zealand")) return "AUSTRALIA";
  if (r.includes("pacific") || c.includes("fiji") || c.includes("papua")) return "PACIFIC";
  if (r.includes("north america") || ["united states", "canada", "mexico"].some(x => c.includes(x))) return "NORTH_AMERICA";
  if (r.includes("south america") || r.includes("central america") || ["brazil", "argentina", "chile", "colombia", "peru", "venezuela", "ecuador", "uruguay", "panama", "costa rica", "honduras", "guatemala"].some(x => c.includes(x))) return "SOUTH_AMERICA";

  return null;
}

export async function POST() {
  try {
    await requireSuperAdmin();
    console.log("[PORT SYNC] Fetching NGA World Port Index...");
    const res = await fetch(WPI_URL);
    if (!res.ok) {
      return NextResponse.json(
        { error: `NGA API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawPorts: any[] = data?.ports ?? [];

    const validPorts = rawPorts.filter(
      (p: any) =>
        typeof p.ycoord === "number" &&
        typeof p.xcoord === "number" &&
        p.portName &&
        p.portNumber
    );

    const seenLocodes = new Set<string>();
    let upserted = 0;
    let skipped = 0;

    for (const p of validPorts) {
      try {
        let locode = p.unloCode?.trim();
        if (!locode || locode.length < 2) {
          const countryCode = (p.countryCode || p.countryName || "XX").substring(0, 2).toUpperCase();
          locode = `${countryCode}_${p.portNumber}`;
        }
        locode = locode.replace(/\s+/g, "").toUpperCase();

        if (seenLocodes.has(locode)) {
          locode = `${locode}_${p.portNumber}`;
        }
        seenLocodes.add(locode);

        const region = mapRegion(p.regionName, p.countryName || "");

        await prisma.port.upsert({
          where: { locode },
          create: {
            name: p.portName,
            locode,
            country: p.countryName || "Unknown",
            region: region as any,
            latitude: p.ycoord,
            longitude: p.xcoord,
            portNumber: p.portNumber,
            harborSize: p.harborSize || "V",
            waterBody: p.dodWaterBody || null,
            alternateName: p.alternateName || null,
            isActive: true,
            lastSyncedAt: new Date(),
          },
          update: {
            name: p.portName,
            country: p.countryName || "Unknown",
            region: region as any,
            latitude: p.ycoord,
            longitude: p.xcoord,
            portNumber: p.portNumber,
            harborSize: p.harborSize || "V",
            waterBody: p.dodWaterBody || null,
            alternateName: p.alternateName || null,
            lastSyncedAt: new Date(),
          },
        });
        upserted++;
      } catch {
        skipped++;
      }
    }

    console.log(`[PORT SYNC] Done: ${upserted} upserted, ${skipped} skipped`);

    const total = await prisma.port.count();

    return NextResponse.json({
      success: true,
      upserted,
      skipped,
      total,
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    console.error("[PORT SYNC] Failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
