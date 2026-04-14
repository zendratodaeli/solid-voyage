/**
 * Seed Ports from NGA World Port Index (Pub 150)
 *
 * Fetches 3,700+ ports from the NGA API and upserts them into the
 * Prisma Port table. Uses portNumber as the dedup key and locode
 * as the unique constraint (generating synthetic locodes for ports
 * that lack an official UN/LOCODE).
 *
 * Usage: npx tsx prisma/seed-wpi-ports.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function main() {
  console.log("🌍 Fetching NGA World Port Index...");

  const res = await fetch(WPI_URL);
  if (!res.ok) throw new Error(`NGA API error: ${res.status}`);

  const data = await res.json();
  const rawPorts: any[] = data?.ports ?? [];

  console.log(`📦 Received ${rawPorts.length} ports from NGA`);

  // Filter valid ports
  const validPorts = rawPorts.filter(
    (p: any) =>
      typeof p.ycoord === "number" &&
      typeof p.xcoord === "number" &&
      p.portName &&
      p.portNumber
  );
  console.log(`✅ ${validPorts.length} valid ports (with coordinates + name)`);

  // Track unique locodes to handle duplicates
  const seenLocodes = new Set<string>();
  let upserted = 0;
  let skipped = 0;

  for (const p of validPorts) {
    try {
      // Generate locode: use NGA's unloCode, or synthesize one
      let locode = p.unloCode?.trim();
      if (!locode || locode.length < 2) {
        // Synthesize: first 2 chars of country + port number
        const countryCode = (p.countryCode || p.countryName || "XX").substring(0, 2).toUpperCase();
        locode = `${countryCode}${p.portNumber}`;
      }

      // Normalize locode (remove spaces, uppercase)
      locode = locode.replace(/\s+/g, "").toUpperCase();

      // Skip duplicates
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

      if (upserted % 500 === 0) {
        console.log(`  ⏳ ${upserted}/${validPorts.length} ports upserted...`);
      }
    } catch (err: any) {
      skipped++;
      if (skipped <= 5) {
        console.warn(`  ⚠️ Skipped ${p.portName}: ${err.message?.substring(0, 100)}`);
      }
    }
  }

  console.log(`\n🎉 Done! ${upserted} ports upserted, ${skipped} skipped.`);

  // Print summary by harbor size
  const stats = await prisma.port.groupBy({
    by: ["harborSize"],
    _count: true,
  });
  console.log("\n📊 Port distribution by harbor size:");
  for (const s of stats) {
    const label = { L: "Large", M: "Medium", S: "Small", V: "Very Small" }[s.harborSize] || s.harborSize;
    console.log(`   ${label}: ${s._count}`);
  }

  const total = await prisma.port.count();
  console.log(`\n   Total ports in database: ${total}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
