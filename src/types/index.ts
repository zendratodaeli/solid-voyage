/**
 * Type definitions for the Maritime Freight Intelligence Platform
 */

// ═══════════════════════════════════════════════════════════════════
// ENUMS (mirror Prisma enums for client-side use)
// ═══════════════════════════════════════════════════════════════════

export type RoleType = 
  | "VESSEL_MANAGER" 
  | "SHIPBROKER" 
  | "VESSEL_OPERATOR" 
  | "OWNER_MANAGEMENT" 
  | "OTHER";

export type VesselType =
  // Bulk Carriers
  | "CAPESIZE"
  | "PANAMAX"
  | "POST_PANAMAX"
  | "SUPRAMAX"
  | "HANDYMAX"
  | "HANDYSIZE"
  | "BULK_CARRIER"
  // Tankers
  | "VLCC"
  | "SUEZMAX"
  | "AFRAMAX"
  | "MR_TANKER"
  | "LR1_TANKER"
  | "LR2_TANKER"
  | "CHEMICAL_TANKER"
  | "PRODUCT_TANKER"
  // Container Ships
  | "CONTAINER_FEEDER"
  | "CONTAINER_PANAMAX"
  | "CONTAINER_POST_PANAMAX"
  | "CONTAINER_ULCV"
  // Gas Carriers
  | "LNG_CARRIER"
  | "LPG_CARRIER"
  // General Cargo / Specialized
  | "GENERAL_CARGO"
  | "MULTI_PURPOSE"
  | "HEAVY_LIFT"
  | "CAR_CARRIER"
  | "RO_RO"
  | "OTHER";

export type CommercialControl =
  | "OWNED_BAREBOAT"
  | "TIME_CHARTER"
  | "VOYAGE_CHARTER";

export type Region =
  | "NORTH_AMERICA"
  | "SOUTH_AMERICA"
  | "EUROPE"
  | "MEDITERRANEAN"
  | "MIDDLE_EAST"
  | "WEST_AFRICA"
  | "EAST_AFRICA"
  | "SOUTH_AFRICA"
  | "INDIAN_SUBCONTINENT"
  | "SOUTHEAST_ASIA"
  | "EAST_ASIA"
  | "AUSTRALIA"
  | "PACIFIC";

export type FuelType = "VLSFO" | "HSFO" | "HFO" | "MGO" | "LSMGO" | "LNG";

export type FreightRateUnit = "PER_MT" | "PER_TEU" | "PER_CBM" | "LUMP_SUM" | "WORLDSCALE";

export type CanalType = "SUEZ" | "PANAMA" | "NONE";

export type VoyageStatus =
  | "DRAFT"
  | "NEW"
  | "OFFERED"
  | "FIXED"
  | "COMPLETED"
  | "REJECTED"
  | "LOST"
  | "EXPIRED"
  | "WITHDRAWN";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RecommendationAction =
  | "STRONG_ACCEPT"
  | "ACCEPT"
  | "NEGOTIATE"
  | "REJECT"
  | "STRONG_REJECT";

// ═══════════════════════════════════════════════════════════════════
// VIEW LENS TYPES
// ═══════════════════════════════════════════════════════════════════

export type ViewLens = "shipbroker" | "operator" | "management" | "show_all";

export interface ViewLensConfig {
  id: ViewLens;
  label: string;
  description: string;
  highlightedMetrics: string[];
  secondaryMetrics: string[];
  adminOnly?: boolean;
}

export const VIEW_LENS_CONFIGS: Record<ViewLens, ViewLensConfig> = {
  shipbroker: {
    id: "shipbroker",
    label: "Shipbroker / Chartering",
    description: "Focus on fixing decisions & negotiation",
    highlightedMetrics: [
      "offeredFreight",
      "recommendedFreight",
      "breakEvenFreight",
      "marginImpact",
      "recommendation",
    ],
    secondaryMetrics: ["voyageDuration", "bunkerSensitivity", "riskSummary"],
  },
  operator: {
    id: "operator",
    label: "Vessel Operator",
    description: "Focus on operational realism & execution risk",
    highlightedMetrics: [
      "speedConsumption",
      "seaDaysVsPortDays",
      "costSensitivity",
      "weatherRisk",
      "operationalWarnings",
    ],
    secondaryMetrics: ["freightLevel", "marginBuffer", "delayImpact"],
  },
  management: {
    id: "management",
    label: "Owner / Management",
    description: "Focus on profit, risk, and approval confidence",
    highlightedMetrics: [
      "voyagePnl",
      "totalExposure",
      "riskProfile",
      "confidenceIndicator",
      "scenarioComparison",
    ],
    secondaryMetrics: ["freightRationale", "assumptions", "downsideProtection"],
    adminOnly: true,
  },
  show_all: {
    id: "show_all",
    label: "Show All",
    description: "Complete overview across all perspectives",
    highlightedMetrics: [
      "offeredFreight",
      "recommendedFreight",
      "breakEvenFreight",
      "voyagePnl",
      "totalExposure",
      "speedConsumption",
      "riskProfile",
    ],
    secondaryMetrics: ["all"],
    adminOnly: true,
  },
};

// ═══════════════════════════════════════════════════════════════════
// DISPLAY HELPERS
// ═══════════════════════════════════════════════════════════════════

export const VESSEL_TYPE_LABELS: Record<VesselType, string> = {
  // Bulk Carriers
  CAPESIZE: "Capesize",
  PANAMAX: "Panamax",
  POST_PANAMAX: "Post-Panamax",
  SUPRAMAX: "Supramax",
  HANDYMAX: "Handymax",
  HANDYSIZE: "Handysize",
  BULK_CARRIER: "Bulk Carrier (Generic)",
  // Tankers
  VLCC: "VLCC (Very Large Crude Carrier)",
  SUEZMAX: "Suezmax",
  AFRAMAX: "Aframax",
  MR_TANKER: "MR Tanker",
  LR1_TANKER: "LR1 Tanker",
  LR2_TANKER: "LR2 Tanker",
  CHEMICAL_TANKER: "Chemical Tanker",
  PRODUCT_TANKER: "Product Tanker",
  // Container Ships
  CONTAINER_FEEDER: "Container Feeder (< 3k TEU)",
  CONTAINER_PANAMAX: "Container Panamax (3–5k TEU)",
  CONTAINER_POST_PANAMAX: "Container Post-Panamax (5–10k TEU)",
  CONTAINER_ULCV: "ULCV (> 10k TEU)",
  // Gas Carriers
  LNG_CARRIER: "LNG Carrier",
  LPG_CARRIER: "LPG Carrier",
  // General Cargo / Specialized
  GENERAL_CARGO: "General Cargo",
  MULTI_PURPOSE: "Multi Purpose Vessel",
  HEAVY_LIFT: "Heavy Lift",
  CAR_CARRIER: "Car Carrier (PCC/PCTC)",
  RO_RO: "Ro-Ro",
  OTHER: "Other",
};

export const COMMERCIAL_CONTROL_LABELS: Record<CommercialControl, string> = {
  OWNED_BAREBOAT: "Owned / Bareboat",
  TIME_CHARTER: "Time Charter",
  VOYAGE_CHARTER: "Voyage Charter",
};

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  VLSFO: "VLSFO (Very Low Sulphur Fuel Oil)",
  HSFO: "HSFO (High Sulphur Fuel Oil)",
  HFO: "HFO (Heavy Fuel Oil)",
  MGO: "MGO (Marine Gas Oil)",
  LSMGO: "LSMGO (Low Sulphur MGO)",
  LNG: "LNG (Liquefied Natural Gas)",
};

export const FREIGHT_RATE_UNIT_LABELS: Record<FreightRateUnit, string> = {
  PER_MT: "$/MT",
  PER_TEU: "$/TEU",
  PER_CBM: "$/CBM",
  LUMP_SUM: "Lump Sum ($)",
  WORLDSCALE: "Worldscale (WS)",
};

export const REGION_LABELS: Record<Region, string> = {
  NORTH_AMERICA: "North America",
  SOUTH_AMERICA: "South America",
  EUROPE: "Europe",
  MEDITERRANEAN: "Mediterranean",
  MIDDLE_EAST: "Middle East",
  WEST_AFRICA: "West Africa",
  EAST_AFRICA: "East Africa",
  SOUTH_AFRICA: "South Africa",
  INDIAN_SUBCONTINENT: "Indian Subcontinent",
  SOUTHEAST_ASIA: "Southeast Asia",
  EAST_ASIA: "East Asia",
  AUSTRALIA: "Australia",
  PACIFIC: "Pacific",
};

export const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  VESSEL_MANAGER: "Vessel Manager",
  SHIPBROKER: "Shipbroker / Chartering",
  VESSEL_OPERATOR: "Vessel Operator",
  OWNER_MANAGEMENT: "Owner / Management",
  OTHER: "Other",
};

export const VOYAGE_STATUS_LABELS: Record<VoyageStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "gray" },
  NEW: { label: "New-Evaluating", color: "blue" },
  OFFERED: { label: "Offered-Negotiating", color: "purple" },
  FIXED: { label: "Fixed", color: "emerald" },
  COMPLETED: { label: "Completed", color: "teal" },
  REJECTED: { label: "Rejected", color: "red" },
  LOST: { label: "Lost", color: "red" },
  EXPIRED: { label: "Expired", color: "gray" },
  WITHDRAWN: { label: "Withdrawn", color: "slate" },
};

// ═══════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// FORM TYPES
// ═══════════════════════════════════════════════════════════════════

export interface VesselFormData {
  name: string;
  imoNumber?: string;
  vesselType: VesselType;
  dwt: number;
  // Dimensions
  loa?: number;
  beam?: number;
  summerDraft?: number;
  grossTonnage?: number;
  netTonnage?: number;
  // Identification
  yearBuilt?: number;
  flagState?: string;
  iceClass?: string;
  vesselConstant?: number;
  // Speed
  ladenSpeed: number;
  ballastSpeed: number;
  ecoLadenSpeed?: number;
  ecoBallastSpeed?: number;
  // Consumption
  ladenConsumption: number;
  ballastConsumption: number;
  ecoLadenConsumption?: number;
  ecoBallastConsumption?: number;
  portConsumption: number;
  dailyOpex: number;
}

export interface VoyageFormData {
  vesselId: string;
  loadPortId: string;
  dischargePortId: string;
  cargoQuantityMt: number;
  cargoType?: string;
  ballastDistanceNm: number;
  ladenDistanceNm: number;
  loadPortDays: number;
  dischargePortDays: number;
  waitingDays: number;
  idleDays: number;
  useEcoSpeed: boolean;
  canalType: CanalType;
  canalTolls: number;
  bunkerPriceUsd: number;
  bunkerFuelType: FuelType;
  brokeragePercent: number;
  commissionPercent: number;
  additionalCosts: number;
  weatherRiskMultiplier: number;
  freightRateUsd?: number;
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD TYPES
// ═══════════════════════════════════════════════════════════════════

export interface DashboardSummary {
  activeVoyages: number;
  pendingRecommendations: number;
  totalVessels: number;
  recentActivity: Array<{
    id: string;
    type: "voyage_created" | "voyage_updated" | "recommendation_generated";
    description: string;
    timestamp: Date;
  }>;
}

export interface VoyageSummaryCard {
  id: string;
  vesselName: string;
  route: string;
  status: VoyageStatus;
  recommendation: RecommendationAction | null;
  tce: number;
  voyagePnl: number | null;
  breakEvenFreight: number;
  offeredFreight: number | null;
}
