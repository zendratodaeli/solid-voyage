/**
 * Laytime & Demurrage Calculation Engine (Extracted)
 *
 * Pure-function calculation logic extracted from LaytimeCalculator.tsx
 * so both the React component and AI copilot can use the same math.
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type LaytimeTerms = "SHINC" | "SHEX" | "SSHEX" | "SHEXUU";

export type EventType =
  | "working"
  | "weather_delay"
  | "sunday"
  | "holiday"
  | "breakdown_owner"
  | "breakdown_charterer"
  | "shifting"
  | "strike"
  | "waiting_berth"
  | "custom_exception";

export interface TimeSheetEvent {
  id: string;
  from: string; // ISO datetime-local string
  to: string;
  eventType: EventType;
  remarks: string;
}

export interface EventResult extends TimeSheetEvent {
  duration: number; // hours
  counts: boolean;
}

export interface LaytimeResult {
  eventResults: EventResult[];
  countedHours: number;
  excludedHours: number;
  excludedByType: Record<string, number>;
  excessHours: number;
  isDemurrage: boolean;
  demurrageAmount: number;
  despatchAmount: number;
  progressPercent: number;
  onDemurrage: boolean;
}

export interface LaytimeInput {
  allowedHours: number;
  terms: LaytimeTerms;
  demurrageRate: number;
  despatchRate: number;
  events: TimeSheetEvent[];
}

// ═══════════════════════════════════════════════════════════════════
// EVENT LABELS (for exclusion breakdown)
// ═══════════════════════════════════════════════════════════════════

const EVENT_LABELS: Record<EventType, string> = {
  working: "Working",
  weather_delay: "Weather Delay",
  sunday: "Sunday",
  holiday: "Holiday",
  breakdown_owner: "Breakdown (Owner)",
  breakdown_charterer: "Breakdown (Charterer)",
  shifting: "Shifting",
  strike: "Strike",
  waiting_berth: "Waiting for Berth",
  custom_exception: "Custom Exception",
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function hoursBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, diff / (1000 * 60 * 60));
}

/**
 * Determine if a time sheet event counts towards laytime.
 * Implements maritime laytime counting rules per charter party terms.
 */
function doesEventCount(
  event: TimeSheetEvent,
  terms: LaytimeTerms,
  onDemurrage: boolean
): boolean {
  // "Once on demurrage, always on demurrage" — most exceptions don't apply
  if (onDemurrage && event.eventType !== "breakdown_owner") {
    return true;
  }

  switch (event.eventType) {
    case "working":
      return true;
    case "weather_delay":
      return false;
    case "sunday":
      if (terms === "SHINC") return true;
      if (terms === "SHEX" || terms === "SSHEX") return false;
      if (terms === "SHEXUU") return false;
      return false;
    case "holiday":
      if (terms === "SHINC") return true;
      return false;
    case "breakdown_owner":
      return false;
    case "breakdown_charterer":
      return true;
    case "shifting":
      return false;
    case "strike":
      return false;
    case "waiting_berth":
      return false;
    case "custom_exception":
      return false;
    default:
      return true;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate laytime, demurrage, and despatch from charter party terms
 * and time sheet events.
 *
 * This is the deterministic, pure-function calculation engine.
 * Used by both the LaytimeCalculator UI component and the AI copilot.
 */
export function calculateLaytime(input: LaytimeInput): LaytimeResult {
  const { allowedHours, terms, demurrageRate, despatchRate, events } = input;

  let countedHours = 0;
  let excludedHours = 0;
  const excludedByType: Record<string, number> = {};
  let onDemurrage = false;

  const eventResults: EventResult[] = events.map((event) => {
    const duration = hoursBetween(event.from, event.to);
    const counts = doesEventCount(event, terms, onDemurrage);

    if (counts) {
      countedHours += duration;
      if (countedHours > allowedHours) {
        onDemurrage = true;
      }
    } else {
      excludedHours += duration;
      const typeLabel = EVENT_LABELS[event.eventType] || event.eventType;
      excludedByType[typeLabel] = (excludedByType[typeLabel] || 0) + duration;
    }

    return { ...event, duration, counts };
  });

  const excessHours = countedHours - allowedHours;
  const isDemurrage = excessHours > 0;

  const demurrageAmount = isDemurrage
    ? (excessHours / 24) * demurrageRate
    : 0;
  const despatchAmount = !isDemurrage
    ? (Math.abs(excessHours) / 24) * despatchRate
    : 0;

  const progressPercent =
    allowedHours > 0
      ? Math.min(100, (countedHours / allowedHours) * 100)
      : 0;

  return {
    eventResults,
    countedHours,
    excludedHours,
    excludedByType,
    excessHours,
    isDemurrage,
    demurrageAmount,
    despatchAmount,
    progressPercent,
    onDemurrage,
  };
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

/**
 * Format hours into human-readable duration string
 */
export function formatLaytimeDuration(hours: number): string {
  if (hours < 0) hours = 0;
  const days = Math.floor(hours / 24);
  const hrs = Math.floor(hours % 24);
  const mins = Math.round((hours % 1) * 60);
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Calculate allowed laytime hours from rate-based terms
 */
export function calculateAllowedHoursFromRate(
  cargoQuantity: number,
  loadingRate: number
): number {
  if (loadingRate <= 0) return 0;
  return (cargoQuantity / loadingRate) * 24;
}
