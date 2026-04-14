/**
 * Route Planner PDF Report — Professional Print-Optimized
 *
 * Generates a structured, white-background PDF report for route
 * planner calculations. Matches the voyage report styling.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types (same interface as before) ────────────────────────────

export interface RoutePlannerPdfData {
  result: {
    summary: {
      totalDistanceNm: number;
      totalECADistanceNm: number;
      totalHRADistanceNm: number;
      estimatedDays: number | null;
      openSeaDistanceNm: number;
    };
    legs: Array<{
      legNumber: number;
      from: { name: string; locode?: string };
      to: { name: string; locode?: string };
      distanceNm: number;
      ecaDistanceNm: number;
      hraDistanceNm: number;
      isFullECA: boolean;
      ecaZones: string[];
      hraZones: string[];
      sailingHours?: number;
      eta?: string;
      etd?: string;
      portStayHours?: number;
      speedKnots?: number;
      condition?: "laden" | "ballast";
    }>;
    zones: { eca: string[]; hra: string[] };
    warnings: string[];
  };
  waypoints: Array<{
    type: string;
    port?: { displayName?: string; portCode?: string } | null;
    passage?: { displayName?: string } | null;
    manualName?: string;
    legConfig?: {
      condition: string;
      speed: number;
      dailyConsumption: number;
      maxDraft: string;
    };
    portTimes?: {
      waitingHours: number;
      loadingHours: number;
      idleHours: number;
    };
  }>;
  speed: number;
  vessel?: {
    name: string;
    dwt: number;
    vesselType: string;
  } | null;
  mapElementId?: string;
  /** Pre-captured map screenshot as base64 data URI */
  mapImageBase64?: string;
  orgName?: string;
  orgLogoUrl?: string;
  weather?: {
    waypoints: Array<{
      latitude: number;
      longitude: number;
      current: {
        waveHeight: number;
        waveDirection: number;
        wavePeriod: number;
        windWaveHeight: number;
        swellWaveHeight: number;
        swellWaveDirection: number;
        swellWavePeriod: number;
        seaSurfaceTemperature: number;
        oceanCurrentVelocity: number;
        oceanCurrentDirection: number;
        severity: string;
      };
    }>;
    worstConditions: {
      maxWaveHeight: number;
      maxSwellHeight: number;
      severity: string;
    };
    averageConditions: {
      avgWaveHeight: number;
      avgSwellHeight: number;
      avgSeaTemp: number;
      overallSeverity: string;
    };
    advisories: Array<{ severity: string; message: string }>;
  };
}

// ─── Constants ───────────────────────────────────────────────────

const COLORS = {
  primary: [15, 23, 42] as [number, number, number],
  accent: [59, 130, 246] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
};

// ─── Helpers ─────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

function safeFilename(name: string): string {
  return name
    .replace(/→/g, "-")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-")
    .trim();
}

/** Convert degrees to compass direction */
function degreesToCompass(deg: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                       "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}

/** Format vessel type label */
function formatVesselType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Main Generator ─────────────────────────────────────────────

export async function generateRoutePlannerPdf(data: RoutePlannerPdfData): Promise<void> {
  const { result, waypoints, speed, vessel } = data;

  // Build route name
  const portNames = waypoints
    .filter(w => w.type === "port")
    .map(w => w.port?.displayName || w.manualName || "Unknown");
  const routeLabel = portNames.length >= 2
    ? `${portNames[0]} - ${portNames[portNames.length - 1]}`
    : "Route Plan";

  // Load logo
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

  // Create PDF
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ─── Header ────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 32, pageW, 1.2, "F");

  let textX = margin;
  if (logoBase64) {
    try { doc.addImage(logoBase64, "PNG", margin, 6, 20, 20); textX = margin + 24; } catch {}
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(routeLabel, textX, 14);

  // Vessel Name & DWT subtitle — e.g. "MV Enterprise Test (HANDYSIZE, 32,000 DWT)"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  const subtitle = vessel
    ? `${vessel.name} (${formatVesselType(vessel.vesselType)}, ${fmt(vessel.dwt, 0)} DWT)`
    : `Speed: ${fmt(speed, 1)} knots`;
  doc.text(subtitle, textX, 21);

  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), textX, 27);

  if (data.orgName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(data.orgName, pageW - margin, 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Route Planner Report", pageW - margin, 20, { align: "right" });
  }

  y = 38;

  // ─── Section Title Helper ──────────────────────────────────────
  function sectionTitle(title: string) {
    if (y > pageH - 40) { doc.addPage(); y = 14; }
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

  function kvRow(label: string, value: string, opts?: { bold?: boolean; color?: [number, number, number] }) {
    if (y > pageH - 16) { doc.addPage(); y = 14; }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, margin, y);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color || COLORS.text));
    doc.text(value, margin + contentW * 0.45, y);
    y += 5;
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. VOYAGE SUMMARY
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Route Summary");

  kvRow("Route", portNames.join(" - "), { bold: true });
  if (portNames.length > 2) {
    kvRow("Waypoints", portNames.slice(1, -1).join(", "));
  }
  if (vessel) {
    kvRow("Vessel", `${vessel.name} (${formatVesselType(vessel.vesselType)}, ${fmt(vessel.dwt, 0)} DWT)`);
  }
  kvRow("Total Distance", `${fmt(result.summary.totalDistanceNm, 0)} NM`, { bold: true, color: COLORS.accent });
  kvRow("Open Sea Distance", `${fmt(result.summary.openSeaDistanceNm, 0)} NM`);

  const ecaPct = result.summary.totalDistanceNm > 0
    ? ((result.summary.totalECADistanceNm / result.summary.totalDistanceNm) * 100).toFixed(1)
    : "0.0";
  kvRow("ECA Distance", `${fmt(result.summary.totalECADistanceNm, 0)} NM (${ecaPct}%)`, { color: COLORS.red });

  if (result.summary.totalHRADistanceNm > 0) {
    kvRow("HRA Distance", `${fmt(result.summary.totalHRADistanceNm, 0)} NM — War Risk Insurance may apply`, { color: COLORS.amber });
  }
  kvRow("Estimated Duration", result.summary.estimatedDays ? `${fmt(result.summary.estimatedDays)} days` : "N/A");
  kvRow("Average Speed", `${fmt(speed)} knots`);

  if (result.zones.eca.length > 0) kvRow("ECA Zones", result.zones.eca.join(", "));
  if (result.zones.hra.length > 0) kvRow("HRA Zones", result.zones.hra.join(", "));
  y += 3;

  // ═══════════════════════════════════════════════════════════════
  // 1b. ROUTE MAP IMAGE
  // ═══════════════════════════════════════════════════════════════

  if (data.mapImageBase64) {
    // Determine available space on current page
    const mapMaxHeight = 75; // mm — roughly 1/3 of A4 page
    const mapWidth = contentW;
    const mapAspectRatio = 0.5; // approximate 2:1 width:height
    const mapHeight = Math.min(mapMaxHeight, mapWidth * mapAspectRatio);

    if (y + mapHeight + 10 > pageH - 20) { doc.addPage(); y = 14; }

    // Subtle label
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text("Route Visualization", margin, y + 3);
    y += 5;

    // Border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, mapWidth, mapHeight);

    try {
      doc.addImage(data.mapImageBase64, "PNG", margin, y, mapWidth, mapHeight);
    } catch {
      // If image embedding fails, show placeholder
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, mapWidth, mapHeight, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      doc.text("Map image could not be embedded", margin + mapWidth / 2, y + mapHeight / 2, { align: "center" });
    }
    y += mapHeight + 5;
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. WARNINGS
  // ═══════════════════════════════════════════════════════════════

  if (result.warnings.length > 0) {
    sectionTitle("Warnings & Advisories");
    result.warnings.forEach((w) => {
      if (y > pageH - 16) { doc.addPage(); y = 14; }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.amber);
      doc.text(`⚠ ${w}`, margin + 3, y);
      y += 4.5;
    });
    y += 3;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. LEG BREAKDOWN TABLE
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Leg Breakdown");

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Leg", "From", "To", "Distance", "ECA NM", "ECA %", "HRA NM", "Speed", "Condition"]],
    body: result.legs.map((leg, i) => [
      `${leg.legNumber}`,
      leg.from.name,
      leg.to.name,
      `${fmt(leg.distanceNm, 0)} NM`,
      leg.ecaDistanceNm > 0 ? fmt(leg.ecaDistanceNm, 0) : "—",
      leg.distanceNm > 0 ? `${Math.round((leg.ecaDistanceNm / leg.distanceNm) * 100)}%` : "—",
      leg.hraDistanceNm > 0 ? fmt(leg.hraDistanceNm, 0) : "—",
      leg.speedKnots ? `${fmt(leg.speedKnots)} kn` : `${fmt(speed)} kn`,
      leg.condition || waypoints[i]?.legConfig?.condition || "—",
    ]),
    foot: [[
      "", "", "Total",
      `${fmt(result.summary.totalDistanceNm, 0)} NM`,
      `${fmt(result.summary.totalECADistanceNm, 0)}`,
      `${ecaPct}%`,
      result.summary.totalHRADistanceNm > 0 ? fmt(result.summary.totalHRADistanceNm, 0) : "—",
      "", "",
    ]],
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
    bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
    footStyles: { fillColor: COLORS.lightGray, textColor: COLORS.text, fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { cellPadding: 2, lineWidth: 0.1 },
    columnStyles: { 0: { cellWidth: 10, halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ═══════════════════════════════════════════════════════════════
  // 4. ETA SCHEDULE
  // ═══════════════════════════════════════════════════════════════

  const hasEtas = result.legs.some(l => l.eta);
  if (hasEtas) {
    sectionTitle("ETA Schedule");

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Leg", "From - To", "Sailing Hours", "ETA", "Port Stay", "ETD"]],
      body: result.legs.map((leg) => [
        `${leg.legNumber}`,
        `${leg.from.name} - ${leg.to.name}`,
        leg.sailingHours ? `${fmt(leg.sailingHours)} hrs` : "—",
        leg.eta ? new Date(leg.eta).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—",
        leg.portStayHours ? `${fmt(leg.portStayHours)} hrs` : "—",
        leg.etd ? new Date(leg.etd).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2, lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: 10, halign: "center" } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. PER-LEG CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  const configs = waypoints.filter(w => w.legConfig);
  if (configs.length > 0) {
    sectionTitle("Per-Leg Configuration");

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Waypoint", "Condition", "Speed (kn)", "Consumption (MT/day)", "Max Draft (m)", "Port Wait (hrs)", "Port Work (hrs)"]],
      body: configs.map((w, i) => [
        w.port?.displayName || w.passage?.displayName || w.manualName || `Waypoint ${i + 1}`,
        w.legConfig!.condition,
        fmt(w.legConfig!.speed),
        fmt(w.legConfig!.dailyConsumption),
        w.legConfig!.maxDraft || "—",
        `${w.portTimes?.waitingHours || 0}`,
        `${w.portTimes?.loadingHours || 0}`,
      ]),
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2, lineWidth: 0.1 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. COMPLIANCE INSIGHTS  (includes Financial + Sensitivity)
  // ═══════════════════════════════════════════════════════════════

  if (y > pageH - 30) { doc.addPage(); y = 14; }

  sectionTitle("Compliance Insights");

  // Fetch market data for compliance calculations
  let marketData: any = null;
  try {
    const res = await fetch("/api/market-data");
    marketData = await res.json();
  } catch {}

  const ecaDist = result.summary.totalECADistanceNm;
  const openSeaDist = result.summary.totalDistanceNm - ecaDist;
  const ecaDays = speed > 0 ? ecaDist / (speed * 24) : 0;
  const seaDays = speed > 0 ? openSeaDist / (speed * 24) : 0;

  // Compute effective consumption from per-leg configs (weighted avg)
  const legConfigs = waypoints.filter(w => w.legConfig).map(w => w.legConfig!);
  let consumption = 25; // Default MT/day
  if (legConfigs.length > 0 && result.legs.length > 0) {
    let totalFuelMt = 0;
    let totalSailingDays = 0;
    result.legs.forEach((leg, i) => {
      const wpConfig = waypoints[i]?.legConfig;
      const legSpeed = wpConfig?.speed || speed;
      const legConsumption = wpConfig?.dailyConsumption || 25;
      const sailingDays = legSpeed > 0 ? leg.distanceNm / (legSpeed * 24) : 0;
      totalFuelMt += sailingDays * legConsumption;
      totalSailingDays += sailingDays;
    });
    if (totalSailingDays > 0) consumption = totalFuelMt / totalSailingDays;
  }

  const complianceRows: string[][] = [];

  // ECA Zone Info
  if (ecaDist > 0) {
    complianceRows.push(["ECA Zones", result.zones.eca.join(", ") || "SECA", `${fmt(ecaDist, 0)} NM (${((ecaDist / result.summary.totalDistanceNm) * 100).toFixed(1)}% of route)`]);
    complianceRows.push(["Fuel Switch Required", "Yes", "Switch to LSMGO/MGO in ECA waters"]);
  } else {
    complianceRows.push(["ECA Zones", "None", "Route does not cross Emission Control Areas"]);
  }

  // HRA Info
  if (result.summary.totalHRADistanceNm > 0) {
    complianceRows.push(["High Risk Areas", result.zones.hra.join(", "), `${fmt(result.summary.totalHRADistanceNm, 0)} NM — War Risk Insurance may apply`]);
  }

  // Financial Estimate
  if (marketData) {
    const vlsfoPrice = marketData.globalVLSFOAverage || 550;
    const lsmgoPrice = marketData.globalLSMGOAverage || 800;
    const seaCost = seaDays * consumption * vlsfoPrice;
    const ecaCost = ecaDays * consumption * lsmgoPrice;
    const bunkerTotal = seaCost + ecaCost;

    complianceRows.push(["Open Sea Fuel Cost", `VLSFO @ $${vlsfoPrice.toFixed(0)}/MT`, `$${fmt(seaCost, 0)} (${fmt(seaDays, 1)} days × ${consumption.toFixed(0)} MT/d)`]);
    if (ecaDist > 0) {
      complianceRows.push(["ECA Fuel Cost", `LSMGO @ $${lsmgoPrice.toFixed(0)}/MT`, `$${fmt(ecaCost, 0)} (${fmt(ecaDays, 1)} days × ${consumption.toFixed(0)} MT/d)`]);
    }
    complianceRows.push(["Total Bunker Estimate", "", `$${fmt(bunkerTotal, 0)}`]);

    // CO2 & CII
    const co2 = (seaDays * consumption * 3.114) + (ecaDays * consumption * 3.206);
    complianceRows.push(["Est. CO₂ Emissions", "", `${fmt(co2, 1)} MT`]);

    if (vessel?.dwt) {
      const cii = (co2 * 1_000_000) / (vessel.dwt * result.summary.totalDistanceNm);
      const rating = cii < 5 ? "A" : cii < 7 ? "B" : cii < 9 ? "C" : cii < 12 ? "D" : "E";
      complianceRows.push(["CII Score (AER)", `${fmt(cii, 2)} gCO₂/dwt·nm`, `Rating: ${rating}`]);
    }

    // EU ETS
    const euaPrice = marketData.globalEUAPrice || 75;
    complianceRows.push(["EU ETS Carbon Price", `$${euaPrice.toFixed(2)}/MT CO₂`, "Applied if EU port involved"]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Parameter", "Value", "Details"]],
    body: complianceRows,
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
    bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { cellPadding: 2, lineWidth: 0.1 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 }, 1: { cellWidth: 45 } },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ───────────────────────────────────────────────────────────────
  // 6b. SPEED & CII SENSITIVITY — THREE ZONE TABLES
  //     Total Voyage | SECA | Open Sea  (matching UI tabs)
  //     Uses cubic-law speed/consumption adjustment
  // ───────────────────────────────────────────────────────────────

  if (vessel?.dwt && marketData) {
    const vlsfoPriceSens = marketData.globalVLSFOAverage || 550;
    const lsmgoPriceSens = marketData.globalLSMGOAverage || 800;
    const totalDist = result.summary.totalDistanceNm;

    const speeds = [
      { label: "Eco", kts: Math.max(8, speed - 2), emoji: "🌱" },
      { label: "Current", kts: speed, emoji: "📍" },
      { label: "Fast", kts: speed + 2, emoji: "⚡" },
    ];

    // Carbon factors (IMO MEPC.308 defaults)
    const vlsfoCarbonFactor = 3.114;
    const lsmgoCarbonFactor = 3.206;

    // Energy factors relative to VLSFO baseline
    const vlsfoEnergyFactor = 1.0;
    const lsmgoEnergyFactor = 1.0;

    // ──────────── Helper: render a sensitivity sub-table ────────────
    function renderSensitivityTable(
      title: string,
      titleColor: [number, number, number],
      bgColor: [number, number, number],
      headerBg: [number, number, number],
      altRowBg: [number, number, number],
      fuelInfoText: string | null,
      columns: string[],
      rows: string[][],
      footerNote: string,
    ) {
      if (y > pageH - 50) { doc.addPage(); y = 14; }

      // Sub-heading bar
      doc.setFillColor(...bgColor);
      doc.rect(margin, y, contentW, 7, "F");
      doc.setFillColor(...titleColor);
      doc.rect(margin, y, 1.5, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...titleColor);
      doc.text(title, margin + 5, y + 5);
      y += 10;

      // Fuel parameter info bar (for SECA / Open Sea)
      if (fuelInfoText) {
        doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        doc.roundedRect(margin, y - 1, contentW, 6, 1, 1, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...titleColor);
        doc.text(`⚡ ${fuelInfoText}`, margin + 3, y + 3);
        y += 8;
      }

      // Table
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [columns],
        body: rows,
        theme: "grid",
        headStyles: { fillColor: headerBg as any, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
        alternateRowStyles: { fillColor: altRowBg },
        styles: { cellPadding: 2, lineWidth: 0.1 },
        columnStyles: { 0: { fontStyle: "bold" } },
      });
      y = (doc as any).lastAutoTable.finalY + 3;

      // Footer note
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...COLORS.muted);
      doc.text(footerNote, margin + 3, y);
      y += 7;
    }

    // ──────────── TABLE 1: TOTAL VOYAGE ────────────
    const totalRows = speeds.map(s => {
      const speedRatio = s.kts / speed;
      const adjustedConsumption = consumption * Math.pow(speedRatio, 3);

      const totalDays = totalDist / (s.kts * 24);
      const openDays = openSeaDist / (s.kts * 24);
      const ecaDaysScen = ecaDist / (s.kts * 24);

      const openFuelMt = openDays * adjustedConsumption * vlsfoEnergyFactor;
      const ecaFuelMt = ecaDaysScen * adjustedConsumption * lsmgoEnergyFactor;
      const totalFuelMt = openFuelMt + ecaFuelMt;

      const co2Mt = (openFuelMt * vlsfoCarbonFactor) + (ecaFuelMt * lsmgoCarbonFactor);
      const ciiVal = (co2Mt * 1_000_000) / (vessel!.dwt * totalDist);
      const rating = ciiVal < 5 ? "A" : ciiVal < 7 ? "B" : ciiVal < 9 ? "C" : ciiVal < 12 ? "D" : "E";

      const cost = (openFuelMt * vlsfoPriceSens) + (ecaFuelMt * lsmgoPriceSens);

      return [
        `${s.emoji} ${s.label}`,
        `${fmt(s.kts, 1)} kn`,
        fmt(totalDays, 1),
        fmt(totalFuelMt, 0),
        fmt(co2Mt, 0),
        `${fmt(ciiVal, 2)} (${rating})`,
        `$${fmt(cost, 0)}`,
      ];
    });

    renderSensitivityTable(
      `🌍 Total Voyage — Speed & CII Sensitivity (${fmt(totalDist, 0)} NM)`,
      [107, 33, 168],   // purple
      [248, 240, 252],   // purple-50
      [107, 33, 168],    // purple header
      [248, 240, 252],   // purple alt row
      null,              // no fuel info bar for Total
      ["Profile", "Speed", "Days", "Fuel (MT)", "CO₂ (MT)", "CII Score", "Est. Cost"],
      totalRows,
      "Lower CII = Better Rating. Slowing down improves your environmental score. Fuel consumption scaled with cubic-law speed adjustment.",
    );

    // ──────────── TABLE 2: SECA (only if ECA distance > 0) ────────────
    if (ecaDist > 0) {
      const secaRows = speeds.map(s => {
        const speedRatio = s.kts / speed;
        const adjustedConsumption = consumption * Math.pow(speedRatio, 3);
        const secaDays = ecaDist / (s.kts * 24);
        const secaFuelMt = secaDays * adjustedConsumption * lsmgoEnergyFactor;
        const secaCO2 = secaFuelMt * lsmgoCarbonFactor;
        const secaCost = secaFuelMt * lsmgoPriceSens;

        return [
          `${s.emoji} ${s.label}`,
          `${fmt(s.kts, 1)} kn`,
          fmt(secaDays, 1),
          fmt(secaFuelMt, 0),
          fmt(secaCO2, 0),
          `$${fmt(secaCost, 0)}`,
        ];
      });

      renderSensitivityTable(
        `🌿 SECA (${fmt(ecaDist, 0)} NM)`,
        [22, 163, 74],     // green-600
        [240, 253, 244],   // green-50
        [22, 163, 74],     // green header
        [240, 253, 244],   // green alt row
        `Fuel: LSMGO • Energy Factor: ×${lsmgoEnergyFactor.toFixed(1)} • CO₂ Factor: ${lsmgoCarbonFactor.toFixed(3)}`,
        ["Profile", "Speed", "Days", "LSMGO (MT)", "CO₂ (MT)", "Est. Cost"],
        secaRows,
        `LSMGO requires ${lsmgoEnergyFactor.toFixed(1)}× fuel mass. Low-sulphur fuel required for SECA compliance (IMO MARPOL Annex VI).`,
      );

      // ──────────── TABLE 3: OPEN SEA ────────────
      const openSeaRows = speeds.map(s => {
        const speedRatio = s.kts / speed;
        const adjustedConsumption = consumption * Math.pow(speedRatio, 3);
        const osDays = openSeaDist / (s.kts * 24);
        const osFuelMt = osDays * adjustedConsumption * vlsfoEnergyFactor;
        const osCO2 = osFuelMt * vlsfoCarbonFactor;
        const osCost = osFuelMt * vlsfoPriceSens;

        return [
          `${s.emoji} ${s.label}`,
          `${fmt(s.kts, 1)} kn`,
          fmt(osDays, 1),
          fmt(osFuelMt, 0),
          fmt(osCO2, 0),
          `$${fmt(osCost, 0)}`,
        ];
      });

      renderSensitivityTable(
        `🌊 Open Sea (${fmt(openSeaDist, 0)} NM)`,
        [37, 99, 235],     // blue-600
        [239, 246, 255],   // blue-50
        [37, 99, 235],     // blue header
        [239, 246, 255],   // blue alt row
        `Fuel: VLSFO • Energy Factor: ×${vlsfoEnergyFactor.toFixed(1)} • CO₂ Factor: ${vlsfoCarbonFactor.toFixed(3)}`,
        ["Profile", "Speed", "Days", "VLSFO (MT)", "CO₂ (MT)", "Est. Cost"],
        openSeaRows,
        "VLSFO is the standard fuel with high energy density but higher emissions.",
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. WEATHER FORECAST & ALERTS
  // ═══════════════════════════════════════════════════════════════

  if (data.weather && data.weather.waypoints && data.weather.waypoints.length > 0) {
    if (y > pageH - 40) { doc.addPage(); y = 14; }

    sectionTitle("Weather Forecast & Alerts");

    // ── 7a. Weather Advisories ──────────────────────────────────
    if (data.weather.advisories && data.weather.advisories.length > 0) {
      data.weather.advisories.forEach(adv => {
        if (y > pageH - 14) { doc.addPage(); y = 14; }
        const isWarn = adv.severity === "rough" || adv.severity === "severe";
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...(isWarn ? COLORS.amber : COLORS.text));
        doc.text(`⚠ ${adv.message}`, margin + 3, y);
        y += 4;
      });
      y += 3;
    }

    // ── 7b. Summary Overview Table ──────────────────────────────
    const worst = data.weather.worstConditions;
    const avg = data.weather.averageConditions;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Metric", "Worst Along Route", "Average Along Route"]],
      body: [
        ["Worst Seas (Wave Height)", `${worst.maxWaveHeight.toFixed(1)}m (${worst.severity})`, `${avg.avgWaveHeight.toFixed(1)}m (${avg.overallSeverity})`],
        ["Max Swell", `${worst.maxSwellHeight.toFixed(1)}m`, `${avg.avgSwellHeight.toFixed(1)}m`],
        ["Sea Temperature", "—", `${avg.avgSeaTemp.toFixed(1)}°C`],
      ],
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] as any, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2, lineWidth: 0.1 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    });
    y = (doc as any).lastAutoTable.finalY + 5;

    // ── 7c. Waypoint Breakdown Table (full detail) ──────────────
    if (y > pageH - 30) { doc.addPage(); y = 14; }

    // Sub-heading
    doc.setFillColor(239, 246, 255);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, y, 1.5, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(59, 130, 246);
    doc.text("Waypoint Breakdown", margin + 5, y + 5);
    y += 10;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Pt", "Position", "Wave (m)", "Period (s)", "Direction", "Swell (m)", "Wind Waves (m)", "Sea Temp (°C)", "Severity"]],
      body: data.weather.waypoints.map((wp, i) => [
        `${i + 1}`,
        `${wp.latitude.toFixed(2)}°, ${wp.longitude.toFixed(2)}°`,
        wp.current.waveHeight.toFixed(1),
        wp.current.wavePeriod.toFixed(1),
        `${degreesToCompass(wp.current.waveDirection)} (${wp.current.waveDirection.toFixed(0)}°)`,
        wp.current.swellWaveHeight.toFixed(1),
        (wp.current.windWaveHeight ?? 0).toFixed(1),
        wp.current.seaSurfaceTemperature.toFixed(1),
        wp.current.severity.charAt(0).toUpperCase() + wp.current.severity.slice(1),
      ]),
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] as any, textColor: [255, 255, 255], fontSize: 6.5, fontStyle: "bold" },
      bodyStyles: { fontSize: 6.5, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 1.5, lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: 28 } },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. DISCLAIMER
  // ═══════════════════════════════════════════════════════════════

  if (y > pageH - 30) { doc.addPage(); y = 14; }

  sectionTitle("Assumptions & Notes");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  const notes = [
    "• Distances are calculated via sea-lane routing and may differ from great-circle distance.",
    "• ECA zones are based on current IMO MARPOL Annex VI designations.",
    "• HRA zones indicate areas where War Risk Insurance may be required.",
    "• ETAs are estimates based on constant speed and do not account for weather or port congestion.",
    "• Fuel consumption uses cubic-law speed adjustment for sensitivity projections.",
    `• Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
  ];
  notes.forEach((note) => {
    if (y > pageH - 14) { doc.addPage(); y = 14; }
    doc.text(note, margin + 3, y);
    y += 3.5;
  });

  // ═══════════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES
  // ═══════════════════════════════════════════════════════════════

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(`${data.orgName || "Solid Vision"}  •  Confidential`, margin, pageH - 6);
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 6, { align: "right" });
  }

  // Save
  const filename = safeFilename(routeLabel);
  doc.save(`${filename}_Route_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
