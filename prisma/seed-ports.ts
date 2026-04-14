/**
 * Port Database Seed Script
 * 
 * Seeds the database with major maritime ports.
 * Run with: npx tsx prisma/seed-ports.ts
 */

// Load environment variables FIRST
import * as dotenv from "dotenv";
dotenv.config();

// Now import Prisma after env is loaded
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { majorPorts } from "../src/data/ports";

async function seedPorts() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set. Please check your .env file.");
  }
  
  console.log("🌍 Starting port database seeding...");
  console.log("📍 Connecting to:", connectionString.split("@")[1]?.split("/")[0] || "database");

  // Create Prisma client with Neon adapter
  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  let created = 0;
  let errors = 0;
  
  try {
    for (const port of majorPorts) {
      try {
        // Upsert each port (update if exists, create if not)
        await prisma.port.upsert({
          where: { locode: port.locode },
          update: {
            name: port.name,
            country: port.country,
            latitude: port.latitude,
            longitude: port.longitude,
            region: port.region as "NORTH_AMERICA" | "SOUTH_AMERICA" | "EUROPE" | "MEDITERRANEAN" | "MIDDLE_EAST" | "WEST_AFRICA" | "EAST_AFRICA" | "SOUTH_AFRICA" | "INDIAN_SUBCONTINENT" | "SOUTHEAST_ASIA" | "EAST_ASIA" | "AUSTRALIA" | "PACIFIC" | undefined,
          },
          create: {
            name: port.name,
            locode: port.locode,
            country: port.country,
            latitude: port.latitude,
            longitude: port.longitude,
            region: port.region as "NORTH_AMERICA" | "SOUTH_AMERICA" | "EUROPE" | "MEDITERRANEAN" | "MIDDLE_EAST" | "WEST_AFRICA" | "EAST_AFRICA" | "SOUTH_AFRICA" | "INDIAN_SUBCONTINENT" | "SOUTHEAST_ASIA" | "EAST_ASIA" | "AUSTRALIA" | "PACIFIC" | undefined,
          },
        });
        
        created++;
        process.stdout.write(`\r✅ Processed ${created} ports...`);
      } catch (error) {
        errors++;
        console.error(`\n❌ Error seeding port ${port.name} (${port.locode}):`, error);
      }
    }
    
    console.log(`\n\n📊 Seeding complete:`);
    console.log(`   ✅ ${created} ports processed`);
    if (errors > 0) {
      console.log(`   ❌ ${errors} errors`);
    }
    
    // Verify count
    const totalPorts = await prisma.port.count();
    console.log(`\n🌐 Total ports in database: ${totalPorts}`);
  } finally {
    await prisma.$disconnect();
  }
}

seedPorts()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  });
