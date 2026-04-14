/**
 * Vessel PDF Report Generator — Full Profile, Print-Optimized
 *
 * Generates a comprehensive PDF report covering every field of a vessel's
 * profile: specifications, speed/consumption, fuel profiles, port
 * consumption, commercial details, cargo capacity, and voyage history.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ───────────────────────────────────────────────────────

interface VesselPdfVoyage {
  id: string;
  loadPort: string;
  dischargePort: string;
  openPort?: string | null;
  voyageLegs?: { loadPorts?: string[]; dischargePorts?: string[] } | null;
  status: string;
  createdAt: string;
  calculations?: {
    tce: number;
    voyagePnl: number | null;
    totalVoyageDays: number;
    totalBunkerMt: number;
    totalCO2Mt: number | null;
    ciiRating: string | null;
  } | null;
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

const VESSEL_LABELS: Record<string, string> = {
  HANDYSIZE: "Handysize", HANDYMAX: "Handymax", SUPRAMAX: "Supramax",
  PANAMAX: "Panamax", POST_PANAMAX: "Post-Panamax", CAPESIZE: "Capesize",
  BULK_CARRIER: "Bulk Carrier", VLCC: "VLCC", AFRAMAX: "Aframax",
  SUEZMAX: "Suezmax", MR_TANKER: "MR Tanker", LR1_TANKER: "LR1 Tanker",
  LR2_TANKER: "LR2 Tanker", CHEMICAL_TANKER: "Chemical Tanker",
  PRODUCT_TANKER: "Product Tanker", CONTAINER_FEEDER: "Container Feeder",
  CONTAINER_PANAMAX: "Container Panamax", CONTAINER_POST_PANAMAX: "Post-Panamax Container",
  CONTAINER_ULCV: "ULCV", LNG_CARRIER: "LNG Carrier", LPG_CARRIER: "LPG Carrier",
  GENERAL_CARGO: "General Cargo", MULTI_PURPOSE: "Multi-Purpose",
  HEAVY_LIFT: "Heavy Lift", CAR_CARRIER: "Car Carrier (PCC/PCTC)",
  RO_RO: "Ro-Ro", OTHER: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", NEW: "New-Evaluating", OFFERED: "Offered-Negotiating",
  FIXED: "Fixed", COMPLETED: "Completed", REJECTED: "Rejected",
  LOST: "Lost", EXPIRED: "Expired", WITHDRAWN: "Withdrawn",
};

const CONTROL_LABELS: Record<string, string> = {
  OWNED_BAREBOAT: "Owned / Bareboat",
  TIME_CHARTER: "Time Charter-In",
  VOYAGE_CHARTER: "Voyage Charter",
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
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-")
    .trim();
}

// ─── Main Generator ─────────────────────────────────────────────

export async function generateVesselPdf(vesselId: string): Promise<void> {
  // Fetch data from API
  const response = await fetch(`/api/vessels/${vesselId}/pdf`);
  const json = await response.json();
  if (!json.success) throw new Error(json.error || "Failed to fetch vessel data");

  const { vessel, voyages, orgName, orgLogoUrl } = json.data;

  // Load logo
  let logoBase64: string | null = null;
  if (orgLogoUrl) {
    try {
      const res = await fetch(orgLogoUrl);
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
  const typeLabel = VESSEL_LABELS[vessel.vesselType] || vessel.customVesselType || vessel.vesselType;
  const controlLabel = CONTROL_LABELS[vessel.commercialControl] || vessel.commercialControl;

  // ─── Header ──────────────────────────────────────────────────
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 32, pageW, 1.2, "F");

  let textX = margin;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", margin, 6, 20, 20);
      textX = margin + 24;
    } catch {}
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(vessel.name, textX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  const subtitle = [typeLabel, `${fmt(vessel.dwt, 0)} DWT`, vessel.imoNumber ? `IMO ${vessel.imoNumber}` : null].filter(Boolean).join("  •  ");
  doc.text(subtitle, textX, 21);

  doc.setFontSize(8);
  doc.text(`${controlLabel}  •  ${voyages.length} voyages`, textX, 27);

  if (orgName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(orgName, pageW - margin, 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Vessel Specification Report", pageW - margin, 20, { align: "right" });
  }

  y = 38;

  // ─── Section Title Helper ──────────────────────────────────
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

  // ─── Key-Value Row Helper ──────────────────────────────────
  function kvRow(label: string, value: string) {
    if (y > pageH - 16) { doc.addPage(); y = 14; }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.text);
    doc.text(value, margin + contentW * 0.45, y);
    y += 5;
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. BASE VESSEL SPECIFICATIONS
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Base Vessel Specifications");

  kvRow("Vessel Name", vessel.name || "-");
  kvRow("Vessel Type", typeLabel);
  kvRow("IMO Number", vessel.imoNumber || "-");
  kvRow("MMSI Number", vessel.mmsiNumber || "-");
  kvRow("Deadweight Tonnage (DWT)", vessel.dwt ? `${fmt(vessel.dwt, 0)} MT` : "-");
  kvRow("Vessel Constant (MT)", vessel.vesselConstant ? `${fmt(vessel.vesselConstant, 0)} MT` : "-");
  kvRow("Year Built", vessel.yearBuilt ? `${vessel.yearBuilt}` : "-");
  kvRow("Flag State", vessel.flagState || "-");
  kvRow("Classification Society", vessel.classificationSociety || "-");
  kvRow("Ice Class", vessel.iceClass || "-");
  y += 3;

  // ═══════════════════════════════════════════════════════════════
  // 2. VESSEL DIMENSIONS
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Vessel Dimensions");

  kvRow("LOA (Length Overall)", vessel.loa ? `${fmt(vessel.loa, 1)} m` : "-");
  kvRow("Beam", vessel.beam ? `${fmt(vessel.beam, 1)} m` : "-");
  kvRow("Draft", vessel.summerDraft ? `${fmt(vessel.summerDraft, 1)} m` : "-");
  kvRow("Gross Tonnage (GT)", vessel.grossTonnage ? fmt(vessel.grossTonnage, 0) : "-");
  kvRow("Net Tonnage (NT)", vessel.netTonnage ? fmt(vessel.netTonnage, 0) : "-");
  y += 3;

  // ═══════════════════════════════════════════════════════════════
  // 3. SPEED & CONSUMPTION PROFILE
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Speed & Consumption Profile");

  kvRow("Laden Speed (knots)", vessel.ladenSpeed ? `${fmt(vessel.ladenSpeed, 1)} kn` : "-");
  kvRow("Ballast Speed (knots)", vessel.ballastSpeed ? `${fmt(vessel.ballastSpeed, 1)} kn` : "-");
  kvRow("Eco Laden Speed (knots)", vessel.ecoLadenSpeed ? `${fmt(vessel.ecoLadenSpeed, 1)} kn` : "-");
  kvRow("Eco Ballast Speed (knots)", vessel.ecoBallastSpeed ? `${fmt(vessel.ecoBallastSpeed, 1)} kn` : "-");
  kvRow("Eco Laden Consumption (MT/day)", vessel.ecoLadenConsumption ? `${fmt(vessel.ecoLadenConsumption, 1)} MT/day` : "-");
  kvRow("Eco Ballast Consumption (MT/day)", vessel.ecoBallastConsumption ? `${fmt(vessel.ecoBallastConsumption, 1)} MT/day` : "-");
  y += 3;

  // Fuel Consumption Profiles (array table)
  if (y > pageH - 40) { doc.addPage(); y = 14; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.text);
  doc.text("Fuel Consumption Profiles", margin, y);
  y += 4;

  // Build fuel profile rows from per-fuel JSON
  const fuelConsumption = vessel.fuelConsumption as Record<string, { laden?: number; ballast?: number }> | null;
  const fuelRows: string[][] = [];

  if (fuelConsumption && typeof fuelConsumption === "object" && Object.keys(fuelConsumption).length > 0) {
    Object.entries(fuelConsumption).forEach(([fuelType, data]) => {
      fuelRows.push([
        fuelType,
        data?.laden !== null && data?.laden !== undefined ? `${fmt(data.laden, 1)}` : "-",
        data?.ballast !== null && data?.ballast !== undefined ? `${fmt(data.ballast, 1)}` : "-",
      ]);
    });
  }

  // Always add default service/eco rows if not already covered in per-fuel data
  const defaultFuel = vessel.ladenFuelType || "VLSFO";
  const hasDefaultInProfiles = fuelRows.some(r => r[0] === defaultFuel);
  if (!hasDefaultInProfiles) {
    fuelRows.unshift([
      defaultFuel,
      vessel.ladenConsumption ? `${fmt(vessel.ladenConsumption, 1)}` : "-",
      vessel.ballastConsumption ? `${fmt(vessel.ballastConsumption, 1)}` : "-",
    ]);
  }

  // If no fuel profiles at all, show a single "no data" row
  if (fuelRows.length === 0) {
    fuelRows.push(["-", "-", "-"]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Fuel Type", "Laden (MT/day)", "Ballast (MT/day)"]],
    body: fuelRows,
    theme: "grid",
    headStyles: { fillColor: COLORS.accent, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { cellPadding: 2.5, lineWidth: 0.1 },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // Port Consumption
  kvRow("Port Consumption - With Crane (MT/day)", vessel.portConsumptionWithCrane ? `${fmt(vessel.portConsumptionWithCrane, 1)} MT/day` : "-");
  kvRow("Port Consumption - Without Crane (MT/day)", vessel.portConsumptionWithoutCrane ? `${fmt(vessel.portConsumptionWithoutCrane, 1)} MT/day` : "-");
  kvRow("Port Fuel Grade", vessel.portFuelType || "-");
  y += 3;

  // ═══════════════════════════════════════════════════════════════
  // 4. DYNAMIC / SPECIFIC DETAILS
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Dynamic / Specific Details");

  kvRow("Grain Capacity (cbm)", vessel.grainCapacity ? `${fmt(vessel.grainCapacity, 0)} cbm` : "-");
  kvRow("Bale Capacity (cbm)", vessel.baleCapacity ? `${fmt(vessel.baleCapacity, 0)} cbm` : "-");
  kvRow("No. of Holds", vessel.numberOfHolds ? `${vessel.numberOfHolds}` : "-");
  kvRow("No. of Hatches", vessel.numberOfHatches ? `${vessel.numberOfHatches}` : "-");
  kvRow("Grab Fitted", vessel.grabFitted === true ? "Yes" : vessel.grabFitted === false ? "No" : "-");
  kvRow("Tween Decks", vessel.hasTweenDecks === true ? "Yes" : vessel.hasTweenDecks === false ? "No" : "-");
  kvRow("Number of Cranes", vessel.craneCount ? `${vessel.craneCount}` : "-");
  kvRow("Crane SWL (MT)", vessel.craneSWL ? `${fmt(vessel.craneSWL, 0)} MT` : "-");
  y += 3;

  // ═══════════════════════════════════════════════════════════════
  // 5. COMMERCIAL DETAILS & EQUIPMENT
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Commercial Details & Equipment");

  kvRow("Commercial Control", controlLabel);

  if (vessel.commercialControl === "OWNED_BAREBOAT") {
    kvRow("Daily OPEX (USD/day)", vessel.dailyOpex ? `$${fmt(vessel.dailyOpex, 0)}/day` : "-");
  } else if (vessel.commercialControl === "TIME_CHARTER") {
    kvRow("Daily TC-In Hire Rate (USD/day)", vessel.dailyTcHireRate ? `$${fmt(vessel.dailyTcHireRate, 0)}/day` : "-");
    kvRow("Hire Start", vessel.tcHireStartDate ? new Date(vessel.tcHireStartDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-");
    kvRow("Hire End", vessel.tcHireEndDate ? new Date(vessel.tcHireEndDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-");
  }

  kvRow("Scrubber Fitted (EGCS)?", vessel.hasScrubber === true ? "Yes" : vessel.hasScrubber === false ? "No" : "-");
  y += 3;

  // ═══════════════════════════════════════════════════════════════
  // 8. VOYAGE HISTORY
  // ═══════════════════════════════════════════════════════════════

  const voyagesTyped = voyages as VesselPdfVoyage[];
  if (voyagesTyped.length > 0) {
    sectionTitle("Voyage History");

    const voyageRows = voyagesTyped.map((v) => {
      const route = (() => {
        const legs = v.voyageLegs as { loadPorts?: string[]; dischargePorts?: string[] } | null;
        if (legs) {
          const ports = [...(legs.loadPorts || []), ...(legs.dischargePorts || [])];
          if (ports.length > 0) {
            const prefix = v.openPort ? `${v.openPort} - ` : "";
            return prefix + ports.join(" - ");
          }
        }
        return `${v.loadPort} - ${v.dischargePort}`;
      })();

      const calc = v.calculations;
      return [
        route.length > 30 ? route.substring(0, 28) + "..." : route,
        STATUS_LABELS[v.status] || v.status,
        calc ? `$${fmt(calc.tce, 0)}/d` : "—",
        calc?.voyagePnl !== null && calc?.voyagePnl !== undefined ? `$${fmt(calc.voyagePnl, 0)}` : "—",
        calc ? `${fmt(calc.totalVoyageDays, 1)}d` : "—",
        calc?.ciiRating || "—",
        new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Route", "Status", "TCE", "P&L", "Days", "CII", "Date"]],
      body: voyageRows,
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2, lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 55 },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "center" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // DISCLAIMER
  // ═══════════════════════════════════════════════════════════════

  if (y > pageH - 30) { doc.addPage(); y = 14; }

  sectionTitle("Notes");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  const notes = [
    "• Vessel specifications as recorded in the system. Actual values may change over time.",
    "• Speed and consumption figures are based on good weather conditions, no current/swell.",
    "• Fuel consumption profiles reflect the vessel's configured fuel capabilities.",
    "• Voyage performance metrics use calculated (not actual) values where actuals are not recorded.",
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
    doc.text(`${orgName || "Solid Vision"}  •  Confidential`, margin, pageH - 6);
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 6, { align: "right" });
  }

  // Save
  const filename = safeFilename(vessel.name);
  doc.save(`${filename}_Vessel_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
