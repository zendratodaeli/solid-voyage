/**
 * Application constants
 */

// ═══════════════════════════════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════════

export const DEFAULT_BROKERAGE_PERCENT = 1.25;
export const DEFAULT_COMMISSION_PERCENT = 3.75;
export const DEFAULT_WEATHER_MULTIPLIER = 1.0;
export const DEFAULT_TARGET_MARGIN_PERCENT = 15;
export const DEFAULT_BUNKER_HISTORICAL_AVG = 550; // USD/MT (VLSFO average)

// ═══════════════════════════════════════════════════════════════════
// VESSEL TYPE DEFAULTS
// ═══════════════════════════════════════════════════════════════════

export const VESSEL_TYPE_DEFAULTS: Record<string, {
  dwt: number;
  ladenSpeed: number;
  ballastSpeed: number;
  ladenConsumption: number;
  ballastConsumption: number;
  portConsumption: number;
  dailyOpex: number;
}> = {
  VLCC: {
    dwt: 300000,
    ladenSpeed: 13.5,
    ballastSpeed: 14.5,
    ladenConsumption: 85,
    ballastConsumption: 75,
    portConsumption: 8,
    dailyOpex: 12500,
  },
  SUEZMAX: {
    dwt: 160000,
    ladenSpeed: 14,
    ballastSpeed: 15,
    ladenConsumption: 55,
    ballastConsumption: 48,
    portConsumption: 6,
    dailyOpex: 10500,
  },
  AFRAMAX: {
    dwt: 115000,
    ladenSpeed: 14,
    ballastSpeed: 15,
    ladenConsumption: 45,
    ballastConsumption: 38,
    portConsumption: 5,
    dailyOpex: 9500,
  },
  PANAMAX: {
    dwt: 75000,
    ladenSpeed: 14,
    ballastSpeed: 14.5,
    ladenConsumption: 32,
    ballastConsumption: 28,
    portConsumption: 4,
    dailyOpex: 8000,
  },
  CAPESIZE: {
    dwt: 180000,
    ladenSpeed: 13,
    ballastSpeed: 14,
    ladenConsumption: 45,
    ballastConsumption: 40,
    portConsumption: 5,
    dailyOpex: 9000,
  },
  SUPRAMAX: {
    dwt: 58000,
    ladenSpeed: 13.5,
    ballastSpeed: 14,
    ladenConsumption: 28,
    ballastConsumption: 24,
    portConsumption: 3.5,
    dailyOpex: 7000,
  },
  HANDYSIZE: {
    dwt: 35000,
    ladenSpeed: 13,
    ballastSpeed: 13.5,
    ladenConsumption: 22,
    ballastConsumption: 19,
    portConsumption: 3,
    dailyOpex: 6500,
  },
  MR_TANKER: {
    dwt: 50000,
    ladenSpeed: 14,
    ballastSpeed: 14.5,
    ladenConsumption: 30,
    ballastConsumption: 26,
    portConsumption: 4,
    dailyOpex: 7500,
  },
};

// ═══════════════════════════════════════════════════════════════════
// SEASONAL WEATHER RISK DEFAULTS
// ═══════════════════════════════════════════════════════════════════

export const SEASONAL_WEATHER_PROFILES: Record<string, Record<number, number>> = {
  "AG-FEAST": { // Arabian Gulf to Far East
    1: 1.05, 2: 1.03, 3: 1.02, 4: 1.0, 5: 1.0, 6: 1.08,
    7: 1.12, 8: 1.10, 9: 1.08, 10: 1.05, 11: 1.03, 12: 1.05,
  },
  "USGC-NWE": { // US Gulf to NW Europe
    1: 1.15, 2: 1.12, 3: 1.08, 4: 1.05, 5: 1.02, 6: 1.0,
    7: 1.0, 8: 1.02, 9: 1.05, 10: 1.10, 11: 1.12, 12: 1.15,
  },
  "WAF-EAST": { // West Africa to East
    1: 1.03, 2: 1.02, 3: 1.0, 4: 1.0, 5: 1.02, 6: 1.05,
    7: 1.08, 8: 1.08, 9: 1.05, 10: 1.03, 11: 1.02, 12: 1.03,
  },
  "AUSTRALIA-CHINA": {
    1: 1.02, 2: 1.03, 3: 1.05, 4: 1.03, 5: 1.02, 6: 1.0,
    7: 1.0, 8: 1.0, 9: 1.02, 10: 1.03, 11: 1.02, 12: 1.02,
  },
};

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════

export const MAIN_NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Voyages", href: "/voyages", icon: "Ship" },
  { label: "Vessels", href: "/vessels", icon: "Anchor" },
  { label: "Scenarios", href: "/scenarios", icon: "GitCompare" },
] as const;

// ═══════════════════════════════════════════════════════════════════
// RISK THRESHOLDS
// ═══════════════════════════════════════════════════════════════════

export const RISK_THRESHOLDS = {
  bunkerVolatility: {
    low: 0.10,    // Within 10%
    medium: 0.20, // 10-20%
  },
  weatherMultiplier: {
    low: 1.05,
    medium: 1.15,
  },
  marketDeviation: {
    low: 0.0,     // Within market range
    medium: 0.10, // Up to 10% outside
  },
};

// ═══════════════════════════════════════════════════════════════════
// CHART COLORS
// ═══════════════════════════════════════════════════════════════════

export const CHART_COLORS = {
  bunker: "hsl(var(--chart-1))",
  opex: "hsl(var(--chart-2))",
  canal: "hsl(var(--chart-3))",
  commission: "hsl(var(--chart-4))",
  additional: "hsl(var(--chart-5))",
  profit: "hsl(142, 76%, 36%)",   // green
  loss: "hsl(0, 84%, 60%)",       // red
  neutral: "hsl(220, 14%, 46%)",  // gray
};
