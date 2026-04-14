-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('VESSEL_MANAGER', 'SHIPBROKER', 'VESSEL_OPERATOR', 'OWNER_MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "VesselType" AS ENUM ('VLCC', 'SUEZMAX', 'AFRAMAX', 'PANAMAX', 'HANDYMAX', 'HANDYSIZE', 'SUPRAMAX', 'CAPESIZE', 'POST_PANAMAX', 'MR_TANKER', 'LR1_TANKER', 'LR2_TANKER', 'MULTI_PURPOSE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommercialControl" AS ENUM ('OWNED_BAREBOAT', 'TIME_CHARTER', 'VOYAGE_CHARTER');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('NORTH_AMERICA', 'SOUTH_AMERICA', 'EUROPE', 'MEDITERRANEAN', 'MIDDLE_EAST', 'WEST_AFRICA', 'EAST_AFRICA', 'SOUTH_AFRICA', 'INDIAN_SUBCONTINENT', 'SOUTHEAST_ASIA', 'EAST_ASIA', 'AUSTRALIA', 'PACIFIC');

-- CreateEnum
CREATE TYPE "CanalType" AS ENUM ('SUEZ', 'PANAMA', 'NONE');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('VLSFO', 'HSFO', 'HFO', 'MGO', 'LSMGO', 'LNG');

-- CreateEnum
CREATE TYPE "VoyageStatus" AS ENUM ('DRAFT', 'ANALYZING', 'RECOMMENDED', 'APPROVED', 'REJECTED', 'FIXED', 'IN_EXECUTION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecommendationAction" AS ENUM ('STRONG_ACCEPT', 'ACCEPT', 'NEGOTIATE', 'REJECT', 'STRONG_REJECT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoleType" NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "customName" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgTheme" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accentColor" TEXT,
    "sidebarLabel" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vessel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "imoNumber" TEXT,
    "mmsiNumber" TEXT,
    "vesselType" "VesselType" NOT NULL,
    "customVesselType" TEXT,
    "dwt" DOUBLE PRECISION NOT NULL,
    "ladenSpeed" DOUBLE PRECISION NOT NULL,
    "ballastSpeed" DOUBLE PRECISION NOT NULL,
    "ecoLadenSpeed" DOUBLE PRECISION,
    "ecoBallastSpeed" DOUBLE PRECISION,
    "ladenConsumption" DOUBLE PRECISION NOT NULL,
    "ballastConsumption" DOUBLE PRECISION NOT NULL,
    "ecoLadenConsumption" DOUBLE PRECISION,
    "ecoBallastConsumption" DOUBLE PRECISION,
    "portConsumptionWithCrane" DOUBLE PRECISION,
    "portConsumptionWithoutCrane" DOUBLE PRECISION,
    "ballastFuelType" TEXT NOT NULL DEFAULT 'VLSFO',
    "ladenFuelType" TEXT NOT NULL DEFAULT 'VLSFO',
    "portFuelType" TEXT NOT NULL DEFAULT 'LSMGO',
    "fuelTypes" JSONB,
    "fuelConsumption" JSONB,
    "commercialControl" "CommercialControl" NOT NULL DEFAULT 'OWNED_BAREBOAT',
    "dailyOpex" DOUBLE PRECISION DEFAULT 0,
    "hasScrubber" BOOLEAN NOT NULL DEFAULT false,
    "createdByName" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Port" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" "Region",
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "defaultPortDays" DOUBLE PRECISION NOT NULL DEFAULT 2,

    CONSTRAINT "Port_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortDistance" (
    "id" TEXT NOT NULL,
    "originPortId" TEXT NOT NULL,
    "destinationPortId" TEXT NOT NULL,
    "distanceNm" DOUBLE PRECISION NOT NULL,
    "viaCanal" "CanalType",

    CONSTRAINT "PortDistance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BunkerPrice" (
    "id" TEXT NOT NULL,
    "portId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BunkerPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voyage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "vesselId" TEXT NOT NULL,
    "openPort" TEXT,
    "loadPort" TEXT NOT NULL,
    "dischargePort" TEXT NOT NULL,
    "voyageLegs" JSONB,
    "cargoQuantityMt" DOUBLE PRECISION NOT NULL,
    "cargoType" TEXT,
    "ballastDistanceNm" DOUBLE PRECISION NOT NULL,
    "ladenDistanceNm" DOUBLE PRECISION NOT NULL,
    "loadPortDays" DOUBLE PRECISION NOT NULL,
    "dischargePortDays" DOUBLE PRECISION NOT NULL,
    "waitingDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "idleDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "useEcoSpeed" BOOLEAN NOT NULL DEFAULT false,
    "useCrane" BOOLEAN NOT NULL DEFAULT false,
    "canalType" "CanalType" NOT NULL DEFAULT 'NONE',
    "canalTolls" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bunkerPriceUsd" DOUBLE PRECISION NOT NULL,
    "bunkerFuelType" "FuelType" NOT NULL DEFAULT 'VLSFO',
    "fuelPrices" JSONB,
    "ladenFuelType" TEXT,
    "ballastFuelType" TEXT,
    "portFuelType" TEXT,
    "brokeragePercent" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 3.75,
    "additionalCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pdaCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lubOilCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weatherRiskMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "freightRateUsd" DOUBLE PRECISION,
    "status" "VoyageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voyage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoyageCalculation" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "ballastSeaDays" DOUBLE PRECISION NOT NULL,
    "ladenSeaDays" DOUBLE PRECISION NOT NULL,
    "totalSeaDays" DOUBLE PRECISION NOT NULL,
    "totalPortDays" DOUBLE PRECISION NOT NULL,
    "totalVoyageDays" DOUBLE PRECISION NOT NULL,
    "ballastBunkerMt" DOUBLE PRECISION NOT NULL,
    "ladenBunkerMt" DOUBLE PRECISION NOT NULL,
    "portBunkerMt" DOUBLE PRECISION NOT NULL,
    "totalBunkerMt" DOUBLE PRECISION NOT NULL,
    "totalBunkerCost" DOUBLE PRECISION NOT NULL,
    "opexCost" DOUBLE PRECISION NOT NULL,
    "canalCost" DOUBLE PRECISION NOT NULL,
    "brokerageCost" DOUBLE PRECISION NOT NULL,
    "commissionCost" DOUBLE PRECISION NOT NULL,
    "additionalCost" DOUBLE PRECISION NOT NULL,
    "totalVoyageCost" DOUBLE PRECISION NOT NULL,
    "grossRevenue" DOUBLE PRECISION,
    "netRevenue" DOUBLE PRECISION,
    "voyagePnl" DOUBLE PRECISION,
    "tce" DOUBLE PRECISION NOT NULL,
    "breakEvenFreight" DOUBLE PRECISION NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoyageCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoyageActual" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "ballastSeaDays" DOUBLE PRECISION NOT NULL,
    "ladenSeaDays" DOUBLE PRECISION NOT NULL,
    "totalSeaDays" DOUBLE PRECISION NOT NULL,
    "totalPortDays" DOUBLE PRECISION NOT NULL,
    "totalVoyageDays" DOUBLE PRECISION NOT NULL,
    "totalBunkerMt" DOUBLE PRECISION NOT NULL,
    "totalBunkerCost" DOUBLE PRECISION NOT NULL,
    "totalVoyageCost" DOUBLE PRECISION NOT NULL,
    "grossRevenue" DOUBLE PRECISION,
    "voyagePnl" DOUBLE PRECISION,
    "tce" DOUBLE PRECISION,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoyageActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightRecommendation" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "breakEvenFreight" DOUBLE PRECISION NOT NULL,
    "targetFreight" DOUBLE PRECISION NOT NULL,
    "minMarketFreight" DOUBLE PRECISION NOT NULL,
    "maxMarketFreight" DOUBLE PRECISION NOT NULL,
    "recommendedFreight" DOUBLE PRECISION NOT NULL,
    "targetMarginPercent" DOUBLE PRECISION NOT NULL,
    "targetMarginUsd" DOUBLE PRECISION NOT NULL,
    "overallRisk" "RiskLevel" NOT NULL,
    "bunkerVolatilityRisk" "RiskLevel" NOT NULL,
    "weatherRisk" "RiskLevel" NOT NULL,
    "marketAlignmentRisk" "RiskLevel" NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "recommendation" "RecommendationAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreightRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "voyageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "overrides" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonalWeatherProfile" (
    "id" TEXT NOT NULL,
    "tradeRoute" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "averageRiskMultiplier" DOUBLE PRECISION NOT NULL,
    "additionalSeaDays" DOUBLE PRECISION NOT NULL,
    "description" TEXT,

    CONSTRAINT "SeasonalWeatherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketBenchmark" (
    "id" TEXT NOT NULL,
    "tradeRoute" TEXT NOT NULL,
    "vesselType" "VesselType" NOT NULL,
    "freightRate" DOUBLE PRECISION NOT NULL,
    "tcRate" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,

    CONSTRAINT "MarketBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemPricing" (
    "id" TEXT NOT NULL DEFAULT 'system_pricing',
    "globalLSMGOAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "globalVLSFOAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "globalIFO380Average" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "globalIFO180Average" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "globalLNGAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "globalEUAPrice" DOUBLE PRECISION NOT NULL DEFAULT 75.00,
    "carbonFactorVLSFO" DOUBLE PRECISION NOT NULL DEFAULT 3.114,
    "carbonFactorLSMGO" DOUBLE PRECISION NOT NULL DEFAULT 3.206,
    "carbonFactorIFO380" DOUBLE PRECISION NOT NULL DEFAULT 3.114,
    "carbonFactorIFO180" DOUBLE PRECISION NOT NULL DEFAULT 3.114,
    "carbonFactorLNG" DOUBLE PRECISION NOT NULL DEFAULT 3.160,
    "carbonFactorMETHANOL" DOUBLE PRECISION NOT NULL DEFAULT 1.375,
    "carbonFactorAMMONIA" DOUBLE PRECISION NOT NULL DEFAULT 0.050,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SystemPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategicPassage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "entryLat" DOUBLE PRECISION NOT NULL,
    "entryLng" DOUBLE PRECISION NOT NULL,
    "entryName" TEXT NOT NULL,
    "exitLat" DOUBLE PRECISION NOT NULL,
    "exitLng" DOUBLE PRECISION NOT NULL,
    "exitName" TEXT NOT NULL,
    "maxDraft" DOUBLE PRECISION,
    "restriction" TEXT,
    "hasToll" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategicPassage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationUsage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "calculationType" TEXT NOT NULL,
    "calculationCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrganizationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoyageShare" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "sharedWith" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoyageShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherLocation" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaytimeCalculation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "vesselName" TEXT NOT NULL DEFAULT '',
    "voyageRef" TEXT NOT NULL DEFAULT '',
    "portName" TEXT NOT NULL DEFAULT '',
    "operationType" TEXT NOT NULL DEFAULT 'loading',
    "laytimeMode" TEXT NOT NULL DEFAULT 'fixed',
    "allowedHours" DOUBLE PRECISION NOT NULL DEFAULT 72,
    "cargoQuantity" DOUBLE PRECISION,
    "loadingRate" DOUBLE PRECISION,
    "terms" TEXT NOT NULL DEFAULT 'SHINC',
    "demurrageRate" DOUBLE PRECISION NOT NULL DEFAULT 25000,
    "despatchRate" DOUBLE PRECISION NOT NULL DEFAULT 12500,
    "norTendered" TIMESTAMP(3),
    "laytimeCommenced" TIMESTAMP(3),
    "reversible" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL DEFAULT '[]',
    "resultType" TEXT,
    "resultAmount" DOUBLE PRECISION,
    "countedHours" DOUBLE PRECISION,
    "excludedHours" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaytimeCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "OrgTheme_orgId_key" ON "OrgTheme"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_imoNumber_key" ON "Vessel"("imoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_mmsiNumber_key" ON "Vessel"("mmsiNumber");

-- CreateIndex
CREATE INDEX "Vessel_orgId_idx" ON "Vessel"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Port_locode_key" ON "Port"("locode");

-- CreateIndex
CREATE INDEX "Port_name_idx" ON "Port"("name");

-- CreateIndex
CREATE INDEX "Port_country_idx" ON "Port"("country");

-- CreateIndex
CREATE UNIQUE INDEX "PortDistance_originPortId_destinationPortId_viaCanal_key" ON "PortDistance"("originPortId", "destinationPortId", "viaCanal");

-- CreateIndex
CREATE INDEX "BunkerPrice_portId_fuelType_date_idx" ON "BunkerPrice"("portId", "fuelType", "date");

-- CreateIndex
CREATE INDEX "Voyage_orgId_idx" ON "Voyage"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "VoyageCalculation_voyageId_key" ON "VoyageCalculation"("voyageId");

-- CreateIndex
CREATE UNIQUE INDEX "VoyageActual_voyageId_key" ON "VoyageActual"("voyageId");

-- CreateIndex
CREATE UNIQUE INDEX "FreightRecommendation_voyageId_key" ON "FreightRecommendation"("voyageId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonalWeatherProfile_tradeRoute_month_key" ON "SeasonalWeatherProfile"("tradeRoute", "month");

-- CreateIndex
CREATE INDEX "MarketBenchmark_tradeRoute_vesselType_date_idx" ON "MarketBenchmark"("tradeRoute", "vesselType", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StrategicPassage_name_key" ON "StrategicPassage"("name");

-- CreateIndex
CREATE INDEX "OrganizationUsage_orgId_date_idx" ON "OrganizationUsage"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationUsage_orgId_date_calculationType_key" ON "OrganizationUsage"("orgId", "date", "calculationType");

-- CreateIndex
CREATE INDEX "VoyageShare_sharedWith_idx" ON "VoyageShare"("sharedWith");

-- CreateIndex
CREATE UNIQUE INDEX "VoyageShare_voyageId_sharedWith_key" ON "VoyageShare"("voyageId", "sharedWith");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_entityType_entityId_idx" ON "AuditLog"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "WeatherLocation_clerkId_idx" ON "WeatherLocation"("clerkId");

-- CreateIndex
CREATE INDEX "LaytimeCalculation_orgId_idx" ON "LaytimeCalculation"("orgId");

-- CreateIndex
CREATE INDEX "LaytimeCalculation_userId_idx" ON "LaytimeCalculation"("userId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTheme" ADD CONSTRAINT "OrgTheme_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vessel" ADD CONSTRAINT "Vessel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BunkerPrice" ADD CONSTRAINT "BunkerPrice_portId_fkey" FOREIGN KEY ("portId") REFERENCES "Port"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voyage" ADD CONSTRAINT "Voyage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voyage" ADD CONSTRAINT "Voyage_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageCalculation" ADD CONSTRAINT "VoyageCalculation_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageActual" ADD CONSTRAINT "VoyageActual_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRecommendation" ADD CONSTRAINT "FreightRecommendation_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageShare" ADD CONSTRAINT "VoyageShare_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
