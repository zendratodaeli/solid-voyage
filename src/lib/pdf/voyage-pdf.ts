/**
 * Voyage PDF Report Generator — Professional Print-Optimized
 *
 * Generates a structured, white-background PDF report designed for
 * professional use: board presentations, charterer communications,
 * and audit filing. Uses jsPDF + jspdf-autotable.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ───────────────────────────────────────────────────────

interface SensitivityPoint {
  value: number;
  pnl: number;
  tce: number;
  breakEven: number;
}

interface SensitivityResult {
  variable: string;
  unit: string;
  baseValue: number;
  points: SensitivityPoint[];
  impactPerUnit: number;
  description: string;
}

interface ScenarioComparison {
  name: string;
  description?: string;
  result: {
    totalVoyageDays: number;
    totalBunkerCost: number;
    totalVoyageCost: number;
    tce: number;
    voyagePnl: number | null;
    breakEvenFreight: number;
  };
  difference: {
    voyageDays: number;
    bunkerCost: number;
    totalCost: number;
    tce: number;
    pnl: number | null;
  };
}

interface VoyagePdfData {
  voyage: {
    loadPort: string;
    dischargePort: string;
    openPort?: string | null;
    voyageLegs?: { loadPorts?: string[]; dischargePorts?: string[] } | null;
    cargoQuantityMt: number;
    cargoType?: string | null;
    stowageFactor?: number | null;
    ballastDistanceNm: number;
    ladenDistanceNm: number;
    loadPortDays: number;
    dischargePortDays: number;
    waitingDays: number;
    idleDays: number;
    bunkerPriceUsd: number;
    bunkerFuelType?: string | null;
    fuelPrices?: Record<string, number> | null;
    freightRateUsd?: number | null;
    freightRateUnit?: string | null;
    brokeragePercent: number;
    commissionPercent: number;
    additionalCosts: number;
    pdaCosts?: number;
    lubOilCosts?: number;
    canalType?: string;
    canalTolls: number;
    useEcoSpeed: boolean;
    weatherRiskMultiplier: number;
    euEtsApplicable?: boolean;
    euEtsPercentage?: number;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  vessel: {
    name: string;
    vesselType: string;
    dwt: number;
    imoNumber?: string | null;
    ladenSpeed: number;
    ballastSpeed: number;
    ladenConsumption: number;
    ballastConsumption: number;
    dailyOpex?: number | null;
    hasScrubber?: boolean;
    vesselConstant?: number | null;
    dailyTcHireRate?: number | null;
    commercialControl?: string;
  };
  calculation?: {
    ballastSeaDays: number;
    ladenSeaDays: number;
    totalSeaDays: number;
    totalPortDays: number;
    totalVoyageDays: number;
    ballastBunkerMt: number;
    ladenBunkerMt: number;
    portBunkerMt: number;
    totalBunkerMt: number;
    totalBunkerCost: number;
    opexCost: number;
    canalCost: number;
    brokerageCost: number;
    commissionCost: number;
    additionalCost: number;
    totalVoyageCost: number;
    grossRevenue: number;
    netRevenue: number;
    voyagePnl: number;
    tce: number;
    breakEvenFreight: number;
    tcHireCost?: number | null;
    grossTce?: number | null;
    netTce?: number | null;
    totalCO2Mt?: number | null;
    euEtsCost?: number | null;
    euEtsPercentage?: number | null;
    ciiAttained?: number | null;
    ciiRequired?: number | null;
    ciiRating?: string | null;
  } | null;
  recommendation?: {
    breakEvenFreight: number;
    targetFreight: number;
    minMarketFreight: number;
    maxMarketFreight: number;
    recommendedFreight: number;
    targetMarginPercent: number;
    targetMarginUsd: number;
    overallRisk: string;
    bunkerVolatilityRisk: string;
    weatherRisk: string;
    marketAlignmentRisk: string;
    confidenceScore: number;
    explanation?: string | null;
    recommendation: string;
  } | null;
  sensitivity?: {
    bunkerPrice: SensitivityResult;
    freightRate: SensitivityResult;
    speed: SensitivityResult;
    time: SensitivityResult;
    scenarios: ScenarioComparison[];
  } | null;
  orgName?: string;
  orgLogoUrl?: string;
}

// ─── Constants ───────────────────────────────────────────────────

const COLORS = {
  primary: [15, 23, 42] as [number, number, number],       // slate-900
  accent: [59, 130, 246] as [number, number, number],       // blue-500
  green: [34, 197, 94] as [number, number, number],        // green-500
  red: [239, 68, 68] as [number, number, number],          // red-500
  amber: [245, 158, 11] as [number, number, number],       // amber-500
  gray: [100, 116, 139] as [number, number, number],       // slate-500
  lightGray: [241, 245, 249] as [number, number, number],  // slate-100
  white: [255, 255, 255] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],          // slate-900
  muted: [100, 116, 139] as [number, number, number],      // slate-500
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  NEW: "New-Evaluating",
  OFFERED: "Offered-Negotiating",
  FIXED: "Fixed",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  LOST: "Lost",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
};

const VESSEL_LABELS: Record<string, string> = {
  HANDYSIZE: "Handysize",
  HANDYMAX: "Handymax",
  SUPRAMAX: "Supramax",
  PANAMAX: "Panamax",
  CAPESIZE: "Capesize",
  VLCC: "VLCC",
  AFRAMAX: "Aframax",
  SUEZMAX: "Suezmax",
  MR: "MR Tanker",
  LR1: "LR1 Tanker",
  LR2: "LR2 Tanker",
  CONTAINER_FEEDER: "Container Feeder",
  CONTAINER_PANAMAX: "Container Panamax",
  NEO_PANAMAX: "Neo-Panamax",
  ULCV: "ULCV",
  SMALL_LNG: "Small LNG",
  MID_LNG: "Mid-Size LNG",
  LARGE_LNG: "Large LNG",
  OTHER: "Other",
};

// ─── Helpers ─────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

function fmtUsd(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return `$${fmt(val)}`;
}

function buildRouteName(v: VoyagePdfData["voyage"]): string {
  const legs = v.voyageLegs;
  if (legs) {
    const ports = [
      ...(legs.loadPorts || []),
      ...(legs.dischargePorts || []),
    ];
    if (ports.length > 0) {
      const prefix = v.openPort ? `${v.openPort} - ` : "";
      return prefix + ports.join(" - ");
    }
  }
  return `${v.loadPort} - ${v.dischargePort}`;
}

function safeFilename(name: string): string {
  // Replace arrows, special chars with hyphens; collapse multiples
  return name
    .replace(/→/g, "-")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-")
    .trim();
}

// ─── Main Generator ─────────────────────────────────────────────

export async function generateVoyagePdf(
  _unused: any,
  options?: { routeName?: string; vesselName?: string; voyageId?: string }
): Promise<void> {
  // ── 1. Fetch data from API ──
  const voyageId = options?.voyageId || window.location.pathname.split("/voyages/")[1]?.split("/")[0];
  if (!voyageId) throw new Error("Cannot determine voyage ID from URL");

  const response = await fetch(`/api/voyages/${voyageId}/pdf`);
  const json = await response.json();
  if (!json.success) throw new Error(json.error || "Failed to fetch voyage data");

  const data: VoyagePdfData = json.data;
  const { voyage, vessel, calculation, recommendation, sensitivity } = data;
  const routeName = buildRouteName(voyage);

  // ── 2. Load logo ──
  let logoBase64: string | null = null;
  if (data.orgLogoUrl) {
    try {
      const res = await fetch(data.orgLogoUrl);
      const blob = await res.blob();
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {}
  }

  // ── 3. Create PDF ──
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ─── Header ────────────────────────────────────────────────────
  function drawHeader() {
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageW, 32, "F");

    // Accent line
    doc.setFillColor(...COLORS.accent);
    doc.rect(0, 32, pageW, 1.2, "F");

    let textX = margin;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", margin, 6, 20, 20);
        textX = margin + 24;
      } catch {}
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(routeName, textX, 14);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    const subtitle = [
      vessel.name,
      VESSEL_LABELS[vessel.vesselType] || vessel.vesselType,
      `${fmt(vessel.dwt, 0)} DWT`,
    ].join("  •  ");
    doc.text(subtitle, textX, 21);

    // Status badge + date
    const status = STATUS_LABELS[voyage.status] || voyage.status;
    const dateStr = new Date(voyage.updatedAt).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${status}  •  ${dateStr}`, textX, 27);

    // Org name right-aligned
    if (data.orgName) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(data.orgName, pageW - margin, 14, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text("Voyage Calculation Report", pageW - margin, 20, { align: "right" });
    }

    y = 38;
  }

  // ─── Footer ────────────────────────────────────────────────────
  function drawFooter(pageNum: number, totalPages: number) {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);

    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(
      `${data.orgName || "Solid Vision"}  •  Confidential`,
      margin, pageH - 6
    );
    doc.text(
      `Page ${pageNum} of ${totalPages}`,
      pageW - margin, pageH - 6,
      { align: "right" }
    );
  }

  // ─── Section Title Helper ──────────────────────────────────────
  function sectionTitle(title: string) {
    if (y > pageH - 40) {
      doc.addPage();
      y = 14;
    }
    doc.setFillColor(...COLORS.lightGray);
    doc.rect(margin, y, contentW, 8, "F");
    doc.setFillColor(...COLORS.accent);
    doc.rect(margin, y, 1.5, 8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.text);
    doc.text(title, margin + 5, y + 5.5);
    y += 12;
  }

  // ─── Key-Value Row Helper ──────────────────────────────────────
  function kvRow(label: string, value: string, options?: {
    bold?: boolean; color?: [number, number, number]; indent?: number
  }) {
    if (y > pageH - 16) {
      doc.addPage();
      y = 14;
    }
    const xLabel = margin + (options?.indent || 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, xLabel, y);

    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.setTextColor(...(options?.color || COLORS.text));
    doc.text(value, margin + contentW * 0.45, y);
    y += 5;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE 1: Header + Overview + Duration + Bunkers + Financials
  // ═══════════════════════════════════════════════════════════════

  drawHeader();

  // ── Voyage Overview ──
  sectionTitle("Voyage Overview");

  const routeDisplay = (() => {
    const legs = voyage.voyageLegs;
    if (legs) {
      const ports = [...(legs.loadPorts || []), ...(legs.dischargePorts || [])];
      if (ports.length > 0) {
        const prefix = voyage.openPort ? `${voyage.openPort} - ` : "";
        return prefix + ports.join(" - ");
      }
    }
    return `${voyage.loadPort} - ${voyage.dischargePort}`;
  })();

  kvRow("Route", routeDisplay);
  if (voyage.cargoType) kvRow("Cargo Type", voyage.cargoType);
  kvRow("Cargo Quantity", `${fmt(voyage.cargoQuantityMt)} MT`);
  kvRow("Ballast Distance", `${fmt(voyage.ballastDistanceNm)} NM`);
  kvRow("Laden Distance", `${fmt(voyage.ladenDistanceNm)} NM`);
  kvRow("Total Distance", `${fmt(voyage.ballastDistanceNm + voyage.ladenDistanceNm)} NM`);
  kvRow("Load Port Days", `${voyage.loadPortDays} days`);
  kvRow("Discharge Port Days", `${voyage.dischargePortDays} days`);
  if (voyage.waitingDays > 0) kvRow("Waiting Days", `${voyage.waitingDays} days`);
  if (voyage.idleDays > 0) kvRow("Idle Days", `${voyage.idleDays} days`);
  if (voyage.canalType && voyage.canalType !== "NONE") {
    kvRow("Canal", voyage.canalType.replace(/_/g, " "));
  }
  kvRow("Eco Speed", voyage.useEcoSpeed ? "Yes" : "No");
  if (voyage.weatherRiskMultiplier > 1) {
    kvRow("Weather Factor", `${((voyage.weatherRiskMultiplier - 1) * 100).toFixed(0)}% added`);
  }

  // Timestamps
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  kvRow("Created", fmtDate(voyage.createdAt));
  kvRow("Last Updated", fmtDate(voyage.updatedAt));
  y += 3;

  // ── Vessel Details ──
  sectionTitle("Vessel Details");
  kvRow("Vessel Name", vessel.name);
  kvRow("Type", VESSEL_LABELS[vessel.vesselType] || vessel.vesselType);
  kvRow("DWT", `${fmt(vessel.dwt, 0)} MT`);
  if (vessel.imoNumber) kvRow("IMO Number", vessel.imoNumber);
  kvRow("Laden Speed / Consumption", `${fmt(vessel.ladenSpeed, 1)} kts / ${fmt(vessel.ladenConsumption, 1)} MT/day`);
  kvRow("Ballast Speed / Consumption", `${fmt(vessel.ballastSpeed, 1)} kts / ${fmt(vessel.ballastConsumption, 1)} MT/day`);
  if (vessel.dailyOpex) kvRow("Daily OPEX", fmtUsd(vessel.dailyOpex));
  if (vessel.dailyTcHireRate) kvRow("T/C Hire Rate", `${fmtUsd(vessel.dailyTcHireRate)}/day`);
  kvRow("Scrubber", vessel.hasScrubber ? "Yes" : "No");
  if (vessel.vesselConstant) kvRow("Vessel Constant", `${fmt(vessel.vesselConstant, 0)} MT`);
  y += 3;

  // ── Fuel Prices ──
  sectionTitle("Fuel Prices");
  if (voyage.fuelPrices && Object.keys(voyage.fuelPrices).length > 0) {
    Object.entries(voyage.fuelPrices).forEach(([type, price]) => {
      kvRow(type, `${fmtUsd(price)}/MT`);
    });
  } else {
    kvRow(voyage.bunkerFuelType || "VLSFO", `${fmtUsd(voyage.bunkerPriceUsd)}/MT`);
  }
  y += 3;

  // ══════════════════════════════════════════════════════════════
  // CALCULATION RESULTS
  // ══════════════════════════════════════════════════════════════

  if (calculation) {
    // ── Duration Breakdown ──
    sectionTitle("Duration Breakdown");

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Phase", "Sea Days", "Port Days", "Total Days"]],
      body: [
        ["Ballast Leg", fmt(calculation.ballastSeaDays, 1), "—", fmt(calculation.ballastSeaDays, 1)],
        ["Laden Leg", fmt(calculation.ladenSeaDays, 1), "—", fmt(calculation.ladenSeaDays, 1)],
        ["Port Operations", "—", fmt(calculation.totalPortDays, 1), fmt(calculation.totalPortDays, 1)],
        ["Total Voyage", fmt(calculation.totalSeaDays, 1), fmt(calculation.totalPortDays, 1), fmt(calculation.totalVoyageDays, 1)],
      ],
      theme: "grid",
      headStyles: {
        fillColor: COLORS.primary,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 8, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2.5, lineWidth: 0.1 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: contentW * 0.35 },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ── Bunker Consumption ──
    sectionTitle("Bunker Consumption");

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Phase", "Consumption (MT)", "Cost (USD)"]],
      body: [
        ["Ballast", fmt(calculation.ballastBunkerMt), "—"],
        ["Laden", fmt(calculation.ladenBunkerMt), "—"],
        ["Port", fmt(calculation.portBunkerMt), "—"],
        ["Total Bunker", fmt(calculation.totalBunkerMt), fmtUsd(calculation.totalBunkerCost)],
      ],
      theme: "grid",
      headStyles: {
        fillColor: COLORS.primary,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 8, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2.5, lineWidth: 0.1 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: contentW * 0.35 },
        1: { halign: "right" },
        2: { halign: "right", fontStyle: "bold" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ── Financial Summary ──
    sectionTitle("Financial Summary");

    const isBreakEven = !voyage.freightRateUsd;
    const freightLabel = voyage.freightRateUnit === "LUMP_SUM"
      ? "Lump Sum" : voyage.freightRateUnit === "PER_TEU"
      ? "$/TEU" : voyage.freightRateUnit === "PER_CBM"
      ? "$/CBM" : "$/MT";

    const financialRows: (string | { content: string; styles?: any })[][] = [];

    if (!isBreakEven && voyage.freightRateUsd) {
      financialRows.push([
        "Freight Rate Offered",
        `${fmtUsd(voyage.freightRateUsd)} ${freightLabel}`,
      ]);
    }
    financialRows.push(["Gross Revenue", fmtUsd(calculation.grossRevenue)]);

    // Deductions
    if (calculation.brokerageCost > 0)
      financialRows.push(["  Less: Brokerage", `(${fmtUsd(calculation.brokerageCost)})`]);
    if (calculation.commissionCost > 0)
      financialRows.push(["  Less: Commission", `(${fmtUsd(calculation.commissionCost)})`]);
    financialRows.push(["Net Revenue", fmtUsd(calculation.netRevenue)]);

    // Separator
    financialRows.push([
      { content: "", styles: { fillColor: [220, 220, 220], cellPadding: 0.3 } },
      { content: "", styles: { fillColor: [220, 220, 220], cellPadding: 0.3 } },
    ]);

    // Costs
    financialRows.push(["Bunker Cost", `(${fmtUsd(calculation.totalBunkerCost)})`]);
    financialRows.push(["OPEX Cost", `(${fmtUsd(calculation.opexCost)})`]);
    financialRows.push(["Canal Tolls", `(${fmtUsd(calculation.canalCost)})`]);
    if (voyage.pdaCosts && voyage.pdaCosts > 0)
      financialRows.push(["PDA / Port Costs", `(${fmtUsd(voyage.pdaCosts)})`]);
    if (voyage.lubOilCosts && voyage.lubOilCosts > 0)
      financialRows.push(["Lub Oil", `(${fmtUsd(voyage.lubOilCosts)})`]);
    if (calculation.additionalCost > 0)
      financialRows.push(["Additional Costs", `(${fmtUsd(calculation.additionalCost)})`]);
    if (calculation.tcHireCost && calculation.tcHireCost > 0)
      financialRows.push(["T/C Hire Cost", `(${fmtUsd(calculation.tcHireCost)})`]);
    if (calculation.euEtsCost && calculation.euEtsCost > 0) {
      // Derive the EUA price from stored data when possible; fallback to $75
      let euaPricePerTon = 75;
      if (calculation.totalCO2Mt && calculation.totalCO2Mt > 0 && calculation.euEtsPercentage && calculation.euEtsPercentage > 0) {
        euaPricePerTon = Math.round(calculation.euEtsCost / (calculation.totalCO2Mt * (calculation.euEtsPercentage / 100)));
      }
      financialRows.push([`EU ETS Cost (EUA @ $${euaPricePerTon}/tCO\u2082)`, `(${fmtUsd(calculation.euEtsCost)})`]);
    }

    financialRows.push(["Total Voyage Cost", fmtUsd(calculation.totalVoyageCost)]);

    // Separator
    financialRows.push([
      { content: "", styles: { fillColor: [220, 220, 220], cellPadding: 0.3 } },
      { content: "", styles: { fillColor: [220, 220, 220], cellPadding: 0.3 } },
    ]);

    // P&L
    const pnlColor = calculation.voyagePnl >= 0 ? COLORS.green : COLORS.red;
    financialRows.push([
      { content: "Voyage P&L", styles: { fontStyle: "bold", fontSize: 10 } },
      {
        content: fmtUsd(calculation.voyagePnl),
        styles: { fontStyle: "bold", fontSize: 10, textColor: pnlColor },
      },
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      body: financialRows,
      theme: "plain",
      bodyStyles: { fontSize: 9, textColor: COLORS.text },
      styles: { cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, lineWidth: 0 },
      columnStyles: {
        0: { cellWidth: contentW * 0.55 },
        1: { halign: "right", fontStyle: "bold" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ── Key Performance Indicators ──
    sectionTitle("Key Performance Indicators");

    const tceColor = calculation.tce > 0 ? COLORS.green : COLORS.red;
    kvRow("Time Charter Equivalent (TCE)", `${fmtUsd(calculation.tce)}/day`, { bold: true, color: tceColor });
    kvRow("Break-Even Freight", `${fmtUsd(calculation.breakEvenFreight)}/MT`, { bold: true });
    if (calculation.grossTce) kvRow("Gross TCE", `${fmtUsd(calculation.grossTce)}/day`);
    if (calculation.netTce) kvRow("Net TCE", `${fmtUsd(calculation.netTce)}/day`);
    if (calculation.totalCO2Mt) kvRow("Total CO₂ Emissions", `${fmt(calculation.totalCO2Mt)} MT`);
    if (calculation.ciiRating) {
      kvRow("CII Rating", calculation.ciiRating);
      if (calculation.ciiAttained) kvRow("CII Attained / Required",
        `${fmt(calculation.ciiAttained, 4)} / ${fmt(calculation.ciiRequired, 4)}`);
    }
    y += 3;
  }

  // ══════════════════════════════════════════════════════════════
  // RECOMMENDATION
  // ══════════════════════════════════════════════════════════════

  if (recommendation) {
    sectionTitle("Freight Recommendation");

    kvRow("Recommended Freight", `${fmtUsd(recommendation.recommendedFreight)}/MT`, { bold: true, color: COLORS.accent });
    kvRow("Target Freight", `${fmtUsd(recommendation.targetFreight)}/MT`);
    kvRow("Break-Even Freight", `${fmtUsd(recommendation.breakEvenFreight)}/MT`);
    kvRow("Target Margin", `${fmt(recommendation.targetMarginPercent, 1)}% (${fmtUsd(recommendation.targetMarginUsd)})`);
    kvRow("Overall Risk", recommendation.overallRisk);
    kvRow("Action", recommendation.recommendation.replace(/_/g, " "));

    // ── Expected Margin at Offered Rate ──
    if (voyage.freightRateUsd && calculation) {
      const expectedMarginTotal = (voyage.freightRateUsd * voyage.cargoQuantityMt) - (recommendation.breakEvenFreight * voyage.cargoQuantityMt);
      const expectedMarginPerMt = voyage.freightRateUsd - recommendation.breakEvenFreight;
      const marginColor = expectedMarginTotal >= 0 ? COLORS.green : COLORS.red;
      y += 2;
      kvRow("Expected Margin (Total)", fmtUsd(expectedMarginTotal), { bold: true, color: marginColor });
      kvRow("Expected Margin (Per MT)", `${fmtUsd(expectedMarginPerMt)}/MT`, { bold: true, color: marginColor });
    }

    // ── Detailed Risk Assessment ──
    y += 2;
    kvRow("Bunker Volatility", recommendation.bunkerVolatilityRisk);
    kvRow("Weather Risk", recommendation.weatherRisk);
    kvRow("Market Alignment", recommendation.marketAlignmentRisk);
    kvRow("Confidence Score", `${fmt(recommendation.confidenceScore, 0)}%`);

    if (recommendation.explanation) {
      y += 2;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      const lines = doc.splitTextToSize(recommendation.explanation, contentW - 6);
      doc.text(lines, margin + 3, y);
      y += lines.length * 3.5 + 4;
    }
  }


  // ══════════════════════════════════════════════════════════════
  // SENSITIVITY ANALYSIS
  // ══════════════════════════════════════════════════════════════

  if (sensitivity) {
    const renderSensitivityTable = (result: SensitivityResult) => {
      if (y > pageH - 50) { doc.addPage(); y = 14; }

      // Description + impact badge
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.text(`${result.description}  •  Base: ${fmt(result.baseValue)} ${result.unit}`, margin + 3, y);
      y += 5;

      // Select a representative subset (max 7 rows) to keep the table compact
      const pts = result.points;
      let selectedPoints = pts;
      if (pts.length > 7) {
        const indices = [0, Math.floor(pts.length * 0.2), Math.floor(pts.length * 0.4),
          Math.floor(pts.length * 0.5), Math.floor(pts.length * 0.6),
          Math.floor(pts.length * 0.8), pts.length - 1];
        selectedPoints = Array.from(new Set(indices)).sort((a, b) => a - b).map(i => pts[i]);
      }

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [[result.unit, "P&L (USD)", "TCE (USD/day)", "Break-Even"]],
        body: selectedPoints.map(p => {
          const isBase = Math.abs(p.value - result.baseValue) < 0.01;
          const label = isBase ? `${fmt(p.value)} ★` : fmt(p.value);
          return [label, fmtUsd(p.pnl), fmtUsd(p.tce), fmtUsd(p.breakEven)];
        }),
        theme: "grid",
        headStyles: {
          fillColor: COLORS.primary,
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: "bold",
        },
        bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { cellPadding: 2, lineWidth: 0.1 },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: contentW * 0.2 },
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    };

    sectionTitle("Sensitivity Analysis — Bunker Price");
    renderSensitivityTable(sensitivity.bunkerPrice);

    sectionTitle("Sensitivity Analysis — Freight Rate");
    renderSensitivityTable(sensitivity.freightRate);

    sectionTitle("Sensitivity Analysis — Speed");
    renderSensitivityTable(sensitivity.speed);

    sectionTitle("Sensitivity Analysis — Time");
    renderSensitivityTable(sensitivity.time);

    // ── Scenario Comparison ──
    if (sensitivity.scenarios && sensitivity.scenarios.length > 0) {
      sectionTitle("Scenario Comparison");

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Scenario", "Voyage Days", "Total Cost", "TCE (USD/day)", "P&L (USD)", "vs Base"]],
        body: sensitivity.scenarios.map(s => {
          const pnl = s.result.voyagePnl;
          const diffPnl = s.difference.pnl;
          return [
            s.name,
            fmt(s.result.totalVoyageDays, 1),
            fmtUsd(s.result.totalVoyageCost),
            fmtUsd(s.result.tce),
            pnl !== null ? fmtUsd(pnl) : "—",
            diffPnl !== null && s.name !== "Base Case" ? `${diffPnl >= 0 ? "+" : ""}${fmtUsd(diffPnl)}` : "—",
          ];
        }),
        theme: "grid",
        headStyles: {
          fillColor: COLORS.primary,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
        },
        bodyStyles: { fontSize: 8, textColor: COLORS.text },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { cellPadding: 2.5, lineWidth: 0.1 },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ASSUMPTIONS & DISCLAIMERS
  // ══════════════════════════════════════════════════════════════

  if (y > pageH - 40) {
    doc.addPage();
    y = 14;
  }

  sectionTitle("Assumptions & Notes");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);

  const notes = [
    `• Bunker prices as of voyage creation. Actual fuel costs may vary at time of bunkering.`,
    `• Port days are estimates. Actual demurrage/despatch will depend on laytime terms.`,
    `• TCE calculation uses net revenue less total voyage costs, divided by total voyage days.`,
    `• Weather risk factor: ${((voyage.weatherRiskMultiplier - 1) * 100).toFixed(0)}% added to sea days.`,
    voyage.euEtsApplicable ? `• EU ETS applicable at ${voyage.euEtsPercentage || 0}% of voyage emissions (EUA assumed @ $${(() => {
      if (calculation && calculation.euEtsCost && calculation.euEtsCost > 0 && calculation.totalCO2Mt && calculation.totalCO2Mt > 0 && calculation.euEtsPercentage && calculation.euEtsPercentage > 0) {
        return Math.round(calculation.euEtsCost / (calculation.totalCO2Mt * (calculation.euEtsPercentage / 100)));
      }
      return 75;
    })()}/tCO\u2082).` : "",
    `• Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
  ].filter(Boolean);

  notes.forEach((note) => {
    if (y > pageH - 14) { doc.addPage(); y = 14; }
    doc.text(note, margin + 3, y);
    y += 3.5;
  });

  // ══════════════════════════════════════════════════════════════
  // ADD FOOTERS TO ALL PAGES
  // ══════════════════════════════════════════════════════════════

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  // ── Save ──
  const filename = safeFilename(routeName);
  doc.save(`${filename}_Voyage_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
