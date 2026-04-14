/**
 * Seed Maritime Intelligence with real-world data (April 2026)
 *
 * Run: node --loader tsx scripts/seed-maritime-intelligence.ts
 * Or:  npx tsx scripts/seed-maritime-intelligence.ts
 */

const { PrismaNeon } = require("@prisma/adapter-neon");
const { neonConfig } = require("@neondatabase/serverless");
const { PrismaClient } = require("@prisma/client/index");
const ws = require("ws");
const dotenv = require("dotenv");

dotenv.config();
neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SINGLETON_ID = "maritime_intelligence";

const data = {
  // ═══════════════ CANAL TARIFF RATES (April 2026) ═══════════════

  suezTier1Rate: 7.88,
  suezTier2Rate: 6.30,
  suezTier3Rate: 5.04,
  suezTier4Rate: 4.41,
  suezTier5Rate: 3.78,
  suezBallastDiscount: 50,
  suezTankerSurcharge: 10,
  panamaTier1Rate: 5.25,
  panamaTier2Rate: 4.19,
  panamaTier3Rate: 3.65,
  panamaContainerPanamax: 103,
  panamaContainerNeopanamax: 120,
  kielRatePer1000GT: 22.50,

  // ═══════════════ WAR RISK & PIRACY (IMB 2025/Q1 2026) ═══════════════

  gulfAdenRiskScore: 7,
  gulfAdenRiskLevel: "HIGH",
  gulfAdenIncidents12m: 5,
  gulfAdenWarRiskRate: 1.5,
  gulfAdenArmedGuards: "RECOMMENDED",

  westAfricaRiskScore: 6,
  westAfricaRiskLevel: "HIGH",
  westAfricaIncidents12m: 21,
  westAfricaWarRiskRate: 0.025,
  westAfricaArmedGuards: "RECOMMENDED",

  malaccaRiskScore: 5,
  malaccaRiskLevel: "MODERATE",
  malaccaIncidents12m: 40,
  malaccaWarRiskRate: 0.015,
  malaccaArmedGuards: "NONE",

  // ═══════════════ HULL VALUES — 5yr benchmark Q1 2026 ═══════════════

  hullValueCapesize: 65000000,
  hullValuePanamax: 42000000,
  hullValueSupramax: 32000000,
  hullValueHandysize: 26000000,
  hullValueVLCC: 135000000,
  hullValueSuezmax: 80000000,
  hullValueAframax: 62000000,
  hullValueMRTanker: 45000000,
  hullValueLNGCarrier: 220000000,
  hullValueContainerFeeder: 28000000,
  hullValueContainerPanamax: 48000000,
  hullValueGeneralCargo: 20000000,
  hullValueAgeDepreciation: 3.5,
  hullValueMinAgeFactor: 0.45,

  // ═══════════════ COMMODITY VALUES April 2026 ($/MT) ═══════════════

  commodityIronOre: 107,
  commodityCoalThermal: 136,
  commodityCoalCoking: 310,
  commodityGrainWheat: 210,
  commodityGrainCorn: 195,
  commoditySoybeans: 473,
  commodityCrudeOil: 700,
  commodityCleanProducts: 800,
  commodityLNG: 787,
  commodityLPG: 600,
  commoditySteel: 700,
  commodityFertilizer: 750,
  commodityCement: 95,
  commodityContainerAvg: 38000,
  commodityDefault: 300,

  // ═══════════════ PORT CONGESTION — avg wait days April 2026 ═══════════════

  congestionChinaQingdao: 1.5,
  congestionChinaTianjin: 2.0,
  congestionChinaQinhuangdao: 2.5,
  congestionAustNewcastle: 1.5,
  congestionAustPortHedland: 1.0,
  congestionBrazilSantos: 3.5,
  congestionBrazilTubarao: 2.0,
  congestionIndiaMundra: 1.5,
  congestionIndiaKandla: 2.5,
  congestionUSGulfHouston: 1.5,
  congestionRotterdam: 1.6,
  congestionSingapore: 1.3,

  // ═══════════════ CURRENCY RATES — April 10, 2026 ═══════════════

  eurUsdRate: 1.171,
  gbpUsdRate: 1.348,
  nokUsdRate: 0.105,

  updatedBy: "system-seed-april-2026",
};

async function main() {
  console.log("Seeding Maritime Intelligence with April 2026 data...\n");

  const result = await prisma.maritimeIntelligence.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });

  console.log("Maritime Intelligence seeded successfully!");
  console.log("  ID:", result.id);
  console.log("  Last Updated:", result.lastUpdatedAt);
  console.log("  Updated By:", result.updatedBy);
  console.log("");
  console.log("  Canal: Suez Tier1 = $" + result.suezTier1Rate + "/SCNT");
  console.log("  Risk:  Gulf of Aden = " + result.gulfAdenWarRiskRate + "% hull");
  console.log("  Hull:  VLCC = $" + (result.hullValueVLCC / 1e6).toFixed(0) + "M");
  console.log("  Commodity: Iron Ore = $" + result.commodityIronOre + "/MT");
  console.log("  Congestion: Singapore = " + result.congestionSingapore + " days");
  console.log("  Currency: EUR/USD = " + result.eurUsdRate);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
