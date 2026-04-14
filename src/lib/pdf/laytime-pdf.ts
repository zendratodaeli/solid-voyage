/**
 * Laytime Calculation PDF Generator
 *
 * Generates a comprehensive PDF report for a laytime & demurrage calculation.
 */

import { createPdfDocument, formatMoney, formatNum, type KeyValueRow } from "@/lib/pdf-export";

// ─── Types (matching LaytimeCalculator component) ────────────────
interface CharterTerms {
  vesselName: string;
  voyageRef: string;
  portName: string;
  operationType: string;
  laytimeMode: string;
  allowedHours: string;
  cargoQuantity: string;
  loadingRate: string;
  terms: string;
  demurrageRate: string;
  despatchRate: string;
  norTendered: string;
  laytimeCommenced: string;
  reversible: boolean;
}

interface TimeSheetEvent {
  id: string;
  from: string;
  to: string;
  eventType: string;
  remarks: string;
}

interface EventResult extends TimeSheetEvent {
  duration: number;
  counts: boolean;
}

interface Results {
  eventResults: EventResult[];
  countedHours: number;
  excludedHours: number;
  excludedByType: Record<string, number>;
  excessHours: number;
  isDemurrage: boolean;
  demurrageAmount: number;
  despatchAmount: number;
  progressPercent: number;
}

const EVENT_LABELS: Record<string, string> = {
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

const TERMS_DESCRIPTIONS: Record<string, string> = {
  SHINC: "Sundays & Holidays Included — laytime counts 24/7",
  SHEX: "Sundays & Holidays Excepted — Sundays/holidays don't count",
  SSHEX: "Saturdays, Sundays & Holidays Excepted",
  SHEXUU: "Sundays & Holidays Excepted Unless Used",
};

function formatDuration(hours: number): string {
  if (hours < 0) hours = 0;
  const days = Math.floor(hours / 24);
  const hrs = Math.floor(hours % 24);
  const mins = Math.round((hours % 1) * 60);
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export interface LaytimePdfData {
  terms: CharterTerms;
  events: TimeSheetEvent[];
  results: Results;
  allowedLaytimeHours: number;
  orgName?: string;
  orgLogoUrl?: string;
}

export async function generateLaytimePdf(data: LaytimePdfData): Promise<void> {
  const { terms, results, allowedLaytimeHours } = data;

  const pdf = await createPdfDocument({
    title: "Laytime & Demurrage Calculation",
    subtitle: `${terms.vesselName || "Vessel"} — ${terms.portName || "Port"} (${terms.operationType})`,
    orgName: data.orgName,
    orgLogoUrl: data.orgLogoUrl,
    filename: `Laytime_${(terms.vesselName || "Vessel").replace(/[^a-zA-Z0-9]/g, "_")}_${(terms.portName || "Port").replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`,
  });

  // ═══════════════════════════════════════════════════════════════
  // 1. CHARTER PARTY TERMS
  // ═══════════════════════════════════════════════════════════════
  const termsRows: KeyValueRow[] = [
    { label: "Vessel Name", value: terms.vesselName || "—", bold: true },
    { label: "Voyage Reference", value: terms.voyageRef || "—" },
    { label: "Port", value: terms.portName || "—", bold: true },
    { label: "Operation Type", value: terms.operationType === "loading" ? "Loading" : "Discharging" },
    { label: "Laytime Terms", value: `${terms.terms} — ${TERMS_DESCRIPTIONS[terms.terms] || ""}` },
    { label: "Laytime Basis", value: terms.laytimeMode === "fixed" ? "Fixed Hours" : "Rate-Based (MT/day)" },
  ];

  if (terms.laytimeMode === "fixed") {
    termsRows.push({ label: "Allowed Laytime", value: `${terms.allowedHours} hours (${formatDuration(allowedLaytimeHours)})` });
  } else {
    termsRows.push(
      { label: "Cargo Quantity", value: `${terms.cargoQuantity} MT` },
      { label: `${terms.operationType === "loading" ? "Loading" : "Discharging"} Rate`, value: `${terms.loadingRate} MT/day` },
      { label: "Calculated Laytime", value: formatDuration(allowedLaytimeHours) },
    );
  }

  termsRows.push(
    { label: "Demurrage Rate", value: `$${parseFloat(terms.demurrageRate).toLocaleString()}/day` },
    { label: "Despatch Rate", value: `$${parseFloat(terms.despatchRate).toLocaleString()}/day` },
    { label: "NOR Tendered", value: terms.norTendered ? new Date(terms.norTendered).toLocaleString() : "—" },
    { label: "Laytime Commenced", value: terms.laytimeCommenced ? new Date(terms.laytimeCommenced).toLocaleString() : "—" },
    { label: "Reversible", value: terms.reversible ? "Yes" : "No" },
  );

  pdf.addSection("Charter Party Terms", termsRows);

  // ═══════════════════════════════════════════════════════════════
  // 2. CALCULATION RESULT
  // ═══════════════════════════════════════════════════════════════
  const resultRows: KeyValueRow[] = [
    {
      label: results.isDemurrage ? "DEMURRAGE PAYABLE" : "DESPATCH EARNED",
      value: `$${(results.isDemurrage ? results.demurrageAmount : results.despatchAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      bold: true,
      color: results.isDemurrage ? "danger" : "success",
    },
    { label: "Laytime Allowed", value: formatDuration(allowedLaytimeHours) },
    { label: "Time Counted", value: formatDuration(results.countedHours), color: "success" },
    { label: "Time Excluded", value: formatDuration(results.excludedHours), color: "warning" },
    {
      label: results.isDemurrage ? "Time Over Allowed" : "Time Saved",
      value: formatDuration(Math.abs(results.excessHours)),
      color: results.isDemurrage ? "danger" : "success",
    },
    { label: "Laytime Used %", value: `${results.progressPercent.toFixed(1)}%` },
  ];

  if (results.isDemurrage) {
    resultRows.push({ label: "Calculation", value: `${formatDuration(results.excessHours)} over × $${parseFloat(terms.demurrageRate).toLocaleString()}/day` });
  } else {
    resultRows.push({ label: "Calculation", value: `${formatDuration(Math.abs(results.excessHours))} saved × $${parseFloat(terms.despatchRate).toLocaleString()}/day` });
  }

  pdf.addSection("Calculation Result", resultRows);

  // ═══════════════════════════════════════════════════════════════
  // 3. TIME SHEET (Full Event Table)
  // ═══════════════════════════════════════════════════════════════
  if (results.eventResults.length > 0) {
    pdf.addTable(
      "Time Sheet",
      [
        { header: "From", dataKey: "from", width: 35 },
        { header: "To", dataKey: "to", width: 35 },
        { header: "Duration", dataKey: "duration", width: 20 },
        { header: "Event Type", dataKey: "type", width: 30 },
        { header: "Counts?", dataKey: "counts", width: 15 },
        { header: "Remarks", dataKey: "remarks" },
      ],
      results.eventResults.map((e) => ({
        from: e.from ? new Date(e.from).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—",
        to: e.to ? new Date(e.to).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—",
        duration: formatDuration(e.duration),
        type: EVENT_LABELS[e.eventType] || e.eventType,
        counts: e.counts ? "YES" : "NO",
        remarks: e.remarks || "—",
      }))
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. EXCLUDED TIME BREAKDOWN
  // ═══════════════════════════════════════════════════════════════
  if (Object.keys(results.excludedByType).length > 0) {
    const excludedRows: KeyValueRow[] = Object.entries(results.excludedByType).map(([type, hours]) => ({
      label: type,
      value: formatDuration(hours),
      color: "warning" as const,
    }));
    pdf.addSection("Excluded Time Breakdown", excludedRows);
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. NOTES
  // ═══════════════════════════════════════════════════════════════
  pdf.addText(
    'Note: "Once on demurrage, always on demurrage" — most exceptions cease to apply once laytime is exceeded, except owner\'s fault.',
    undefined,
    { fontSize: 7, color: [100, 116, 139] }
  );

  pdf.save();
}
