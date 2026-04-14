/**
 * Seed Maritime Intelligence with real-world data (April 2026)
 *
 * Sources:
 * - Suez Canal Authority (SCA) Circular 2025/2026
 * - Panama Canal Authority (ACP) Tariff FY2026
 * - German WSV (50% discount effective since July 2023)
 * - IMB Piracy Reporting Centre Annual Report 2025 / Q1 2026
 * - JWC Listed Areas + market intelligence for war risk premiums
 * - Baltic Exchange, Clarksons, Lloyd's List (hull values Q1 2026)
 * - Trading Economics, Platts, CBOT (commodity prices April 2026)
 * - Everstream Analytics, K+N port intelligence (congestion April 2026)
 * - ECB, Federal Reserve (exchange rates April 10, 2026)
 */

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@prisma/client/index";
import ws from "ws";
import dotenv from "dotenv";

dotenv.config();
neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SINGLETON_ID = "maritime_intelligence";

const data = {
  // ═══════════════════════════════════════════════════════════════
  // CANAL TARIFF RATES (April 2026)
  // ═══════════════════════════════════════════════════════════════

  // Suez Canal — SCA tariff circular (15% large containership discount suspended April 2, 2026)
  suezTier1Rate: 7.88,     // $/SCNT for 0–5,000 SCNT
  suezTier2Rate: 6.30,     // $/SCNT for 5,001–10,000
  suezTier3Rate: 5.04,     // $/SCNT for 10,001–20,000
  suezTier4Rate: 4.41,     // $/SCNT for 20,001–30,000
  suezTier5Rate: 3.78,     // $/SCNT for 30,000+
  suezBallastDiscount: 50, // % discount for ballast passage
  suezTankerSurcharge: 10, // % surcharge for tankers

  // Panama Canal — ACP tariff FY2026 (effective Oct 1 2025)
  panamaTier1Rate: 5.25,   // $/NT for 0–10,000 NT
  panamaTier2Rate: 4.19,   // $/NT for 10,001–20,000
  panamaTier3Rate: 3.65,   // $/NT for 20,000+
  panamaContainerPanamax: 103,    // $/TEU (Panamax locks)
  panamaContainerNeopanamax: 120, // $/TEU (Neopanamax locks)

  // Kiel Canal — WSV tariff with 50% government reduction (since July 2023)
  kielRatePer1000GT: 22.50, // EUR/1000 GT (base ~45 EUR, 50% discount applied)

  // ═══════════════════════════════════════════════════════════════
  // WAR RISK & PIRACY (IMB 2025 Annual + Q1 2026)
  // ═══════════════════════════════════════════════════════════════

  // Gulf of Aden — 5 incidents 2025 off Somalia, 2 in Q1 2026
  // War risk premiums surged 1-5% hull value due to Middle East escalation
  gulfAdenRiskScore: 7,
  gulfAdenRiskLevel: "HIGH",
  gulfAdenIncidents12m: 5,
  gulfAdenWarRiskRate: 1.5,       // % of hull value — surged due to Red Sea conflict
  gulfAdenArmedGuards: "RECOMMENDED",

  // West Africa — 21 incidents 2025, 92% of global crew kidnappings
  westAfricaRiskScore: 6,
  westAfricaRiskLevel: "HIGH",
  westAfricaIncidents12m: 21,
  westAfricaWarRiskRate: 0.025,   // % of hull value — lower than Gulf of Aden
  westAfricaArmedGuards: "RECOMMENDED",

  // Strait of Malacca/Singapore — 58% of global incidents in 2025 (mostly opportunistic)
  // Dropped significantly in H2 2025 after Indonesian arrests; 8 in Q1 2026
  malaccaRiskScore: 5,
  malaccaRiskLevel: "MODERATE",
  malaccaIncidents12m: 40,        // Full-year annualized from 2025 data
  malaccaWarRiskRate: 0.015,      // % — low-level, opportunistic
  malaccaArmedGuards: "NONE",

  // ═══════════════════════════════════════════════════════════════
  // HULL VALUES — 5-year-old benchmark, Q1 2026
  // (Capesize at 2008-level highs per Lloyd's List / Baltic Exchange)
  // ═══════════════════════════════════════════════════════════════

  hullValueCapesize: 65000000,          // Capesize at multi-year high
  hullValuePanamax: 42000000,           // Kamsarmax/Panamax strong demand
  hullValueSupramax: 32000000,          // Ultramax/Supramax firm
  hullValueHandysize: 26000000,         // Handysize stable
  hullValueVLCC: 135000000,             // VLCC above $135M per Baltic/Lloyd's
  hullValueSuezmax: 80000000,           // Suezmax tanker
  hullValueAframax: 62000000,           // Aframax tanker
  hullValueMRTanker: 45000000,          // MR product tanker
  hullValueLNGCarrier: 220000000,       // Modern 174K CBM, newbuild ~$255M
  hullValueContainerFeeder: 28000000,   // < 3,000 TEU feeder
  hullValueContainerPanamax: 48000000,  // Panamax container 3,000-5,100 TEU
  hullValueGeneralCargo: 20000000,      // MPP / break-bulk
  hullValueAgeDepreciation: 3.5,        // % per year
  hullValueMinAgeFactor: 0.45,          // Floor: 45% of benchmark

  // ═══════════════════════════════════════════════════════════════
  // COMMODITY VALUES — April 2026 market prices ($/MT)
  // Source: Trading Economics, Platts, CBOT
  // ═══════════════════════════════════════════════════════════════

  commodityIronOre: 107,         // 62% Fe fines, CFR China — ~$106.63/MT
  commodityCoalThermal: 136,     // Newcastle benchmark — ~$135.50/MT
  commodityCoalCoking: 310,      // Premium hard coking — elevated
  commodityGrainWheat: 210,      // ~$572/bushel → ~$210/MT
  commodityGrainCorn: 195,       // CBOT corn converted to $/MT
  commoditySoybeans: 473,        // ~$11.70/bushel → ~$472.50/MT
  commodityCrudeOil: 700,        // Brent ~$97/bbl → ~$700/MT (7.2 bbl/MT)
  commodityCleanProducts: 800,   // Clean petroleum products premium
  commodityLNG: 787,             // Surged from $541 → ~$787/MT (Hormuz impact)
  commodityLPG: 600,             // LPG elevated due to ME tensions
  commoditySteel: 700,           // ~$451/MT China rebar, ~$700 average global
  commodityFertilizer: 750,      // Urea surged >$700/MT (Hormuz blockade)
  commodityCement: 95,           // Relatively stable
  commodityContainerAvg: 38000,  // Avg value per TEU (mixed goods)
  commodityDefault: 300,         // Fallback for unmatched cargo types

  // ═══════════════════════════════════════════════════════════════
  // PORT CONGESTION — Average wait days, April 2026
  // Source: Everstream Analytics, Kuehne+Nagel, Tradlinx
  // Global "Port Flow Score" shows low-risk environment
  // ═══════════════════════════════════════════════════════════════

  congestionChinaQingdao: 1.5,
  congestionChinaTianjin: 2.0,
  congestionChinaQinhuangdao: 2.5,
  congestionAustNewcastle: 1.5,
  congestionAustPortHedland: 1.0,
  congestionBrazilSantos: 3.5,    // Santos variable 2.1-4.9 days
  congestionBrazilTubarao: 2.0,
  congestionIndiaMundra: 1.5,
  congestionIndiaKandla: 2.5,
  congestionUSGulfHouston: 1.5,
  congestionRotterdam: 1.6,       // ~1.5-1.8 days
  congestionSingapore: 1.3,       // ~1.1-1.5 days

  // ═══════════════════════════════════════════════════════════════
  // CURRENCY RATES — ECB/Federal Reserve, April 10, 2026
  // ═══════════════════════════════════════════════════════════════

  eurUsdRate: 1.171,    // ECB reference rate: 1 EUR = 1.1711 USD
  gbpUsdRate: 1.348,    // 1 GBP = 1.3476 USD
  nokUsdRate: 0.105,    // 1 NOK = 0.1053 USD (USD/NOK ~9.50)

  updatedBy: "system-seed-april-2026",
};

async function main() {
  console.log("🌊 Seeding Maritime Intelligence with April 2026 data...\n");

  const result = await prisma.maritimeIntelligence.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });

  console.log("✅ Maritime Intelligence seeded successfully!");
  console.log(`   ID: ${result.id}`);
  console.log(`   Last Updated: ${result.lastUpdatedAt}`);
  console.log(`   Updated By: ${result.updatedBy}`);
  console.log(`\n   Canal Tariffs: Suez Tier 1 = $${result.suezTier1Rate}/SCNT`);
  console.log(`   War Risk: Gulf of Aden = ${result.gulfAdenWarRiskRate}% hull`);
  console.log(`   Hull Value: VLCC = $${(result.hullValueVLCC / 1e6).toFixed(0)}M`);
  console.log(`   Commodity: Iron Ore = $${result.commodityIronOre}/MT`);
  console.log(`   Congestion: Singapore = ${result.congestionSingapore} days`);
  console.log(`   Currency: EUR/USD = ${result.eurUsdRate}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
