/**
 * Database seed script for Prisma 7
 * Run with: npm run db:seed
 */

// Load environment variables FIRST
import * as dotenv from "dotenv";
dotenv.config();

// Now import Prisma after env is loaded
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set. Please check your .env file.");
  }
  
  console.log("🌱 Seeding database...");
  console.log("📍 Connecting to:", connectionString.split("@")[1]?.split("/")[0] || "database");

  // Create Prisma client with Neon adapter
  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    // Create sample ports
    const ports = await Promise.all([
      prisma.port.upsert({
        where: { id: "ras-tanura" },
        update: {},
        create: {
          id: "ras-tanura",
          name: "Ras Tanura",
          country: "Saudi Arabia",
          region: "MIDDLE_EAST",
          latitude: 26.6436,
          longitude: 50.0333,
          defaultPortDays: 2,
          locode: "RAS",
        },
      }),
      prisma.port.upsert({
        where: { id: "fujairah" },
        update: {},
        create: {
          id: "fujairah",
          name: "Fujairah",
          country: "UAE",
          region: "MIDDLE_EAST",
          latitude: 25.1288,
          longitude: 56.3264,
          defaultPortDays: 1.5,
          locode: "FUJ",
        },
      }),
      prisma.port.upsert({
        where: { id: "singapore", },
        update: {},
        create: {
          id: "singapore",
          name: "Singapore",
          country: "Singapore",
          region: "SOUTHEAST_ASIA",
          latitude: 1.2644,
          longitude: 103.8228,
          defaultPortDays: 2,
          locode: "SGSIN",
        },
      }),
      prisma.port.upsert({
        where: { id: "ulsan" },
        update: {},
        create: {
          id: "ulsan",
          name: "Ulsan",
          country: "South Korea",
          region: "EAST_ASIA",
          latitude: 35.5071,
          longitude: 129.3828,
          defaultPortDays: 2,
          locode: "USN",
        },
      }),
      prisma.port.upsert({
        where: { id: "ningbo" },
        update: {},
        create: {
          id: "ningbo",
          name: "Ningbo",
          country: "China",
          region: "EAST_ASIA",
          latitude: 29.8683,
          longitude: 121.5440,
          defaultPortDays: 2.5,
          locode: "NGB",
        },
      }),
      prisma.port.upsert({
        where: { id: "rotterdam" },
        update: {},
        create: {
          id: "rotterdam",
          name: "Rotterdam",
          country: "Netherlands",
          region: "EUROPE",
          latitude: 51.9225,
          longitude: 4.47917,
          defaultPortDays: 2,
          locode: "RTM",
        },
      }),
      prisma.port.upsert({
        where: { id: "houston" },
        update: {},
        create: {
          id: "houston",
          name: "Houston",
          country: "United States",
          region: "NORTH_AMERICA",
          latitude: 29.7604,
          longitude: -95.3698,
          defaultPortDays: 2.5,
          locode: "USGC",
        },
      }),
      prisma.port.upsert({
        where: { id: "bonny" },
        update: {},
        create: {
          id: "bonny",
          name: "Bonny",
          country: "Nigeria",
          region: "WEST_AFRICA",
          latitude: 4.4325,
          longitude: 7.1636,
          defaultPortDays: 3,
          locode: "WAF",
        },
      }),
      prisma.port.upsert({
        where: { id: "basrah" },
        update: {},
        create: {
          id: "basrah",
          name: "Basrah",
          country: "Iraq",
          region: "MIDDLE_EAST",
          latitude: 30.5085,
          longitude: 47.7804,
          defaultPortDays: 2,
          locode: "IRQ",
        },
      }),
      prisma.port.upsert({
        where: { id: "qingdao" },
        update: {},
        create: {
          id: "qingdao",
          name: "Qingdao",
          country: "China",
          region: "EAST_ASIA",
          latitude: 36.0671,
          longitude: 120.3826,
          defaultPortDays: 2,
          locode: "CHN",
        },
      }),
    ]);

    console.log(`✅ Created ${ports.length} ports`);

    // Delete existing bunker prices to avoid duplicates
    await prisma.bunkerPrice.deleteMany({});
    
    // Create sample bunker prices
    const bunkerPrices = await Promise.all([
      prisma.bunkerPrice.create({
        data: {
          portId: "singapore",
          fuelType: "VLSFO",
          price: 565,
        },
      }),
      prisma.bunkerPrice.create({
        data: {
          portId: "fujairah",
          fuelType: "VLSFO",
          price: 550,
        },
      }),
      prisma.bunkerPrice.create({
        data: {
          portId: "rotterdam",
          fuelType: "VLSFO",
          price: 575,
        },
      }),
      prisma.bunkerPrice.create({
        data: {
          portId: "houston",
          fuelType: "VLSFO",
          price: 540,
        },
      }),
    ]);

    console.log(`✅ Created ${bunkerPrices.length} bunker prices`);

    // Create seasonal weather profiles
    const routes = [
      { route: "AG-FEAST", multipliers: [1.05, 1.03, 1.02, 1.0, 1.0, 1.08, 1.12, 1.10, 1.08, 1.05, 1.03, 1.05] },
      { route: "USGC-NWE", multipliers: [1.15, 1.12, 1.08, 1.05, 1.02, 1.0, 1.0, 1.02, 1.05, 1.10, 1.12, 1.15] },
      { route: "WAF-EAST", multipliers: [1.03, 1.02, 1.0, 1.0, 1.02, 1.05, 1.08, 1.08, 1.05, 1.03, 1.02, 1.03] },
    ];

    let weatherCount = 0;
    for (const { route, multipliers } of routes) {
      for (let month = 1; month <= 12; month++) {
        await prisma.seasonalWeatherProfile.upsert({
          where: { tradeRoute_month: { tradeRoute: route, month } },
          update: { averageRiskMultiplier: multipliers[month - 1] },
          create: {
            tradeRoute: route,
            month,
            averageRiskMultiplier: multipliers[month - 1],
            additionalSeaDays: (multipliers[month - 1] - 1) * 10,
            description: `${route} weather profile for month ${month}`,
          },
        });
        weatherCount++;
      }
    }

    console.log(`✅ Created ${weatherCount} weather profiles`);

    // Delete existing benchmarks to avoid duplicates
    await prisma.marketBenchmark.deleteMany({});
    
    // Create sample market benchmarks
    const benchmarks = await Promise.all([
      prisma.marketBenchmark.create({
        data: {
          tradeRoute: "AG-FEAST",
          vesselType: "VLCC",
          freightRate: 22.5,
          tcRate: 45000,
          source: "Manual",
        },
      }),
      prisma.marketBenchmark.create({
        data: {
          tradeRoute: "WAF-EAST",
          vesselType: "SUEZMAX",
          freightRate: 18.0,
          tcRate: 35000,
          source: "Manual",
        },
      }),
      prisma.marketBenchmark.create({
        data: {
          tradeRoute: "USGC-NWE",
          vesselType: "AFRAMAX",
          freightRate: 24.0,
          tcRate: 32000,
          source: "Manual",
        },
      }),
    ]);

    console.log(`✅ Created ${benchmarks.length} market benchmarks`);

    // Seed Strategic Passages (Canals & Straits)
    const passages = [
      // European Passages
      {
        name: "Kiel Canal",
        displayName: "Kiel Canal (Germany)",
        type: "canal",
        region: "Europe",
        entryLat: 53.89,
        entryLng: 9.14,
        entryName: "Brunsbüttel",
        exitLat: 54.37,
        exitLng: 10.14,
        exitName: "Holtenau",
        maxDraft: 9.5, // Kiel Canal max draft
        restriction: "Max draft 9.5m, max length 235m, max beam 32.5m",
        hasToll: true,
      },
      {
        name: "Dover Strait",
        displayName: "Dover Strait (UK/France)",
        type: "strait",
        region: "Europe",
        entryLat: 51.02,
        entryLng: 1.48,
        entryName: "Dover TSS",
        exitLat: 50.97,
        exitLng: 1.85,
        exitName: "Calais TSS",
        maxDraft: 25.0, // Deep water strait
        restriction: null,
        hasToll: false,
      },
      {
        name: "Bosphorus",
        displayName: "Bosphorus Strait (Turkey)",
        type: "strait",
        region: "Europe",
        entryLat: 41.20,
        entryLng: 29.13,
        entryName: "Black Sea Entrance",
        exitLat: 41.01,
        exitLng: 28.98,
        exitName: "Marmara Exit",
        maxDraft: 15.0, // Limited by shallow sections
        restriction: "Daylight transit only for large vessels. Max draft 15m.",
        hasToll: false,
      },
      // Global Canals
      {
        name: "Suez Canal",
        displayName: "Suez Canal (Egypt)",
        type: "canal",
        region: "Global",
        entryLat: 31.25,
        entryLng: 32.30,
        entryName: "Port Said",
        exitLat: 29.93,
        exitLng: 32.55,
        exitName: "Suez",
        maxDraft: 20.1, // Suezmax
        restriction: "Max draft 20.1m (Suezmax)",
        hasToll: true,
      },
      {
        name: "Panama Canal",
        displayName: "Panama Canal (Panama)",
        type: "canal",
        region: "Global",
        entryLat: 9.30,
        entryLng: -79.90,
        entryName: "Colón",
        exitLat: 8.95,
        exitLng: -79.53,
        exitName: "Balboa",
        maxDraft: 15.2, // Neopanamax
        restriction: "Max draft 15.2m (Neopanamax)",
        hasToll: true,
      },
      // Indonesian Straits
      {
        name: "Malacca Strait",
        displayName: "Malacca Strait (Indonesia/Malaysia)",
        type: "strait",
        region: "Asia",
        entryLat: 5.40,
        entryLng: 99.50,
        entryName: "One Fathom Bank",
        exitLat: 1.20,
        exitLng: 103.50,
        exitName: "Singapore Strait",
        maxDraft: 20.5, // Malaccamax
        restriction: "Max draft 20.5m (Malaccamax)",
        hasToll: false,
      },
      {
        name: "Sunda Strait",
        displayName: "Sunda Strait (Indonesia)",
        type: "strait",
        region: "Asia",
        entryLat: -5.55,
        entryLng: 105.90,
        entryName: "Java Sea",
        exitLat: -6.65,
        exitLng: 105.25,
        exitName: "Indian Ocean",
        maxDraft: 18.0,
        restriction: "Max draft 18.0m (Shallow/Strong Currents)",
        hasToll: false,
      },
      {
        name: "Lombok Strait",
        displayName: "Lombok Strait (Indonesia)",
        type: "strait",
        region: "Asia",
        entryLat: -8.25,
        entryLng: 115.75,
        entryName: "Bali Sea",
        exitLat: -9.10,
        exitLng: 115.55,
        exitName: "Indian Ocean",
        maxDraft: null, // Deep water, safe for VLCCs
        restriction: "Deep water (>150m). Safe for VLCCs.",
        hasToll: false,
      },
    ];

    let passageCount = 0;
    for (const passage of passages) {
      await prisma.strategicPassage.upsert({
        where: { name: passage.name },
        update: passage,
        create: passage,
      });
      passageCount++;
    }

    console.log(`✅ Created ${passageCount} strategic passages`);

    console.log("🎉 Database seeding completed!");
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  });
