/**
 * Weather Dashboard PDF Report — Professional Print-Optimized
 *
 * Generates a structured, white-background Marine Weather Forecast
 * report. Matches the voyage/route report styling.
 *
 * Includes:
 * - Map visualization capture (location pin + ECA/High-Risk zones)
 * - Hourly forecast chart captures (Waves & Swell, Sea Temperature)
 * - Fahrenheit conversion for sea surface temperature
 * - Operational impact text for wave height
 * - Sea state classification aligned with UI thresholds
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ───────────────────────────────────────────────────────

export interface WeatherPdfData {
  location: {
    name: string;
    lat: number;
    lon: number;
    country?: string;
  };
  current: {
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    windWaveHeight: number;
    swellWaveHeight: number;
    swellWaveDirection: number;
    swellWavePeriod: number;
    seaSurfaceTemperature: number;
    oceanCurrentVelocity: number;
    oceanCurrentDirection: number;
    severity: string;
  };
  daily?: {
    time: string[];
    waveHeightMax: number[];
    swellWaveHeightMax: number[];
    seaSurfaceTemperatureMax: number[];
  };
  /** Hourly forecast data for generating charts natively in the PDF */
  hourly?: {
    time: string[];
    waveHeight: number[];
    swellWaveHeight: number[];
    seaSurfaceTemperature: number[];
  };
  /** Base64-encoded map screenshot (captured before PDF generation) */
  mapImageBase64?: string;
  orgName?: string;
  orgLogoUrl?: string;
}

// ─── Constants ───────────────────────────────────────────────────

const COLORS = {
  primary: [15, 23, 42] as [number, number, number],
  accent: [59, 130, 246] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  orange: [249, 115, 22] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  // Chart series colors (matching UI Recharts colors)
  chartBlue: [59, 130, 246] as [number, number, number],
  chartViolet: [139, 92, 246] as [number, number, number],
  chartCyan: [6, 182, 212] as [number, number, number],
};

// ─── Helpers ─────────────────────────────────────────────────────

function fmt(val: number, decimals = 1): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

function degreesToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

/**
 * Sea state classification — ALIGNED with the UI (types/weather.ts classifySeaState).
 * Uses the same thresholds: <1.0 = Calm, <2.5 = Moderate, <4.0 = Rough, >=4.0 = Severe.
 */
type SeaStateLabel = "Calm" | "Moderate" | "Rough" | "Severe";

function classifySeaState(waveHeight: number): SeaStateLabel {
  if (waveHeight < 1.0) return "Calm";
  if (waveHeight < 2.5) return "Moderate";
  if (waveHeight < 4.0) return "Rough";
  return "Severe";
}

/** Operational impact description — matches SEVERITY_CONFIG in types/weather.ts */
function getOperationalImpact(waveHeight: number): string {
  if (waveHeight < 1.0) return `Seas < 1.0m — Favorable conditions`;
  if (waveHeight < 2.5) return `Seas 1.0–2.5m — Normal operations`;
  if (waveHeight < 4.0) return `Seas 2.5–4.0m — Reduced speed advised`;
  return `Seas > 4.0m — Hazardous conditions`;
}

function getSeaStateColor(waveHeight: number): [number, number, number] {
  if (waveHeight < 1.0) return COLORS.green;
  if (waveHeight < 2.5) return COLORS.amber;
  if (waveHeight < 4.0) return COLORS.orange;
  return COLORS.red;
}

function safeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

// ─── Native Chart Drawing ────────────────────────────────────────

interface ChartSeries {
  data: number[];
  color: [number, number, number];
  label: string;
  fill?: boolean; // area fill under line
  yAxisId?: "left" | "right";
}

/**
 * Draws a line/area chart directly on the jsPDF canvas.
 * Produces crisp vector output — no DOM capture needed.
 */
function drawChart(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    xLabels: string[];
    yLabel: string;
    yLabelRight?: string;
    series: ChartSeries[];
    step: number; // data sampling step
  }
): number {
  const { x, y, w, h, title, xLabels, yLabel, yLabelRight, series, step } = opts;
  const chartPad = { top: 8, bottom: 14, left: 14, right: yLabelRight ? 14 : 6 };
  const plotX = x + chartPad.left;
  const plotY = y + chartPad.top;
  const plotW = w - chartPad.left - chartPad.right;
  const plotH = h - chartPad.top - chartPad.bottom;

  // ── Title ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.text);
  doc.text(title, x, y - 1);

  // ── Chart border + white bg ──
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, "FD");

  // ── Compute Y ranges per axis ──
  const leftSeries = series.filter((s) => (s.yAxisId || "left") === "left");
  const rightSeries = series.filter((s) => s.yAxisId === "right");

  function getRange(seriesList: ChartSeries[]): { min: number; max: number } {
    let min = Infinity, max = -Infinity;
    for (const s of seriesList) {
      for (let i = 0; i < s.data.length; i += step) {
        const v = s.data[i];
        if (v != null && isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (!isFinite(min)) { min = 0; max = 1; }
    const pad = (max - min) * 0.15 || 0.5;
    return { min: Math.max(0, min - pad), max: max + pad };
  }

  const leftRange = leftSeries.length > 0 ? getRange(leftSeries) : { min: 0, max: 1 };
  const rightRange = rightSeries.length > 0 ? getRange(rightSeries) : { min: 0, max: 1 };

  // ── Grid lines ──
  const gridLines = 5;
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.1);
  for (let i = 0; i <= gridLines; i++) {
    const gy = plotY + (plotH * i) / gridLines;
    doc.line(plotX, gy, plotX + plotW, gy);
  }

  // ── Y axis labels (left) ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...COLORS.muted);
  for (let i = 0; i <= gridLines; i++) {
    const gy = plotY + (plotH * i) / gridLines;
    const val = leftRange.max - ((leftRange.max - leftRange.min) * i) / gridLines;
    doc.text(val.toFixed(1), plotX - 1.5, gy + 1, { align: "right" });
  }
  // Y axis title (left)
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.muted);
  const yMid = plotY + plotH / 2;
  doc.text(yLabel, x + 1.5, yMid, { angle: 90 });

  // ── Y axis labels (right, if dual axis) ──
  if (yLabelRight && rightSeries.length > 0) {
    doc.setFontSize(6);
    for (let i = 0; i <= gridLines; i++) {
      const gy = plotY + (plotH * i) / gridLines;
      const val = rightRange.max - ((rightRange.max - rightRange.min) * i) / gridLines;
      doc.text(val.toFixed(1), plotX + plotW + 1.5, gy + 1, { align: "left" });
    }
    doc.setFontSize(6.5);
    doc.text(yLabelRight, x + w - 1.5, yMid, { angle: -90 });
  }

  // ── X axis labels ──
  const totalPoints = Math.ceil(xLabels.length / step);
  const labelInterval = Math.max(1, Math.floor(totalPoints / 7));
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.muted);
  for (let i = 0; i < totalPoints; i += labelInterval) {
    const dataIdx = i * step;
    if (dataIdx >= xLabels.length) break;
    const px = plotX + (plotW * i) / (totalPoints - 1 || 1);
    doc.text(xLabels[dataIdx], px, plotY + plotH + 4, { align: "center" });
  }

  // ── Draw each series ──
  function toPoint(s: ChartSeries, idx: number): { px: number; py: number } | null {
    const dataIdx = idx * step;
    const v = s.data[dataIdx];
    if (v == null || !isFinite(v)) return null;
    const range = (s.yAxisId === "right") ? rightRange : leftRange;
    const px = plotX + (plotW * idx) / (totalPoints - 1 || 1);
    const py = plotY + plotH - ((v - range.min) / (range.max - range.min || 1)) * plotH;
    return { px, py };
  }

  for (const s of series) {
    const points: { px: number; py: number }[] = [];
    for (let i = 0; i < totalPoints; i++) {
      const p = toPoint(s, i);
      if (p) points.push(p);
    }
    if (points.length < 2) continue;

    // Fill area (if requested)
    if (s.fill && points.length > 1) {
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
      const baseline = plotY + plotH;
      // Build polygon path: line points + bottom edge
      const path: number[][] = [];
      path.push([points[0].px - plotX, points[0].py - plotY]); // moveTo (relative)
      for (let i = 1; i < points.length; i++) {
        path.push([points[i].px - points[i - 1].px, points[i].py - points[i - 1].py]);
      }
      // Down to baseline, across to start, close
      path.push([0, baseline - points[points.length - 1].py]);
      path.push([points[0].px - points[points.length - 1].px, 0]);
      path.push([0, points[0].py - baseline]);
      doc.lines(path, points[0].px, points[0].py, [1, 1], "F", true);
      doc.setGState(new (doc as any).GState({ opacity: 1 }));
    }

    // Draw line
    doc.setDrawColor(s.color[0], s.color[1], s.color[2]);
    doc.setLineWidth(0.5);
    for (let i = 1; i < points.length; i++) {
      doc.line(points[i - 1].px, points[i - 1].py, points[i].px, points[i].py);
    }
  }

  // ── Legend ──
  let legendX = plotX;
  const legendY = plotY + plotH + 9;
  doc.setFontSize(6);
  for (const s of series) {
    // Color swatch
    doc.setFillColor(s.color[0], s.color[1], s.color[2]);
    doc.rect(legendX, legendY - 1.5, 3, 1.5, "F");
    legendX += 4;
    // Label
    doc.setTextColor(...COLORS.text);
    doc.text(s.label, legendX, legendY);
    legendX += doc.getTextWidth(s.label) + 4;
  }

  // Return the y position after the chart
  return y + h + 8;
}

// ─── Main Generator ─────────────────────────────────────────────

export async function generateWeatherPdf(data: WeatherPdfData): Promise<void> {
  const { location, current, daily } = data;

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
  doc.text("Marine Weather Forecast", textX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${location.name}${location.country ? ` — ${location.country}` : ""}`,
    textX, 21
  );

  doc.setFontSize(8);
  doc.text(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    textX, 27
  );

  if (data.orgName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(data.orgName, pageW - margin, 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Weather Report", pageW - margin, 20, { align: "right" });
  }

  y = 38;

  // ═══════════════════════════════════════════════════════════════
  // MAP VISUALIZATION (embedded right under header)
  // ═══════════════════════════════════════════════════════════════

  if (data.mapImageBase64) {
    try {
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = data.mapImageBase64!;
      });

      if (img.naturalWidth > 0) {
        const mapWidth = contentW;
        const mapHeight = Math.min(
          (img.naturalHeight / img.naturalWidth) * mapWidth,
          80 // cap at 80mm to leave room for other content
        );

        // Subtle border around the map
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(margin, y, mapWidth, mapHeight);
        doc.addImage(data.mapImageBase64, "PNG", margin, y, mapWidth, mapHeight);
        y += mapHeight + 6;
      }
    } catch {}
  }

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

  function kvRow(label: string, value: string, opts?: { bold?: boolean; color?: [number, number, number]; subtext?: string }) {
    if (y > pageH - 16) { doc.addPage(); y = 14; }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, margin, y);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color || COLORS.text));
    doc.text(value, margin + contentW * 0.45, y);
    // Optional subtext line (e.g., operational impact) — rendered directly below the value, within the same row
    if (opts?.subtext) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.muted);
      doc.text(opts.subtext, margin + contentW * 0.45, y + 3.5);
      y += 9; // value (3.5) + subtext + gap to next row
    } else {
      y += 5;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. LOCATION DETAILS
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Location");

  kvRow("Location", location.name, { bold: true });
  if (location.country) kvRow("Country", location.country);
  kvRow("Coordinates", `${location.lat.toFixed(4)}°N, ${location.lon.toFixed(4)}°E`);
  kvRow("Forecast Date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
  y += 3;

  // ═══════════════════════════════════════════════════════════════
  // 2. CURRENT CONDITIONS
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Current Sea Conditions");

  const seaState = classifySeaState(current.waveHeight);
  const stateColor = getSeaStateColor(current.waveHeight);

  kvRow("Sea State", seaState, { bold: true, color: stateColor });
  kvRow("Significant Wave Height", `${fmt(current.waveHeight)} m`, {
    color: stateColor,
    subtext: getOperationalImpact(current.waveHeight),  // ← #4: Operational impact text
  });
  kvRow("Wave Period", `${fmt(current.wavePeriod)} s`);
  kvRow("Wave Direction", `${degreesToCompass(current.waveDirection)} (${current.waveDirection.toFixed(0)}°)`);
  y += 2;

  kvRow("Wind Wave Height", `${fmt(current.windWaveHeight)} m`);
  kvRow("Swell Height", `${fmt(current.swellWaveHeight)} m`);
  kvRow("Swell Direction", `${degreesToCompass(current.swellWaveDirection)} (${current.swellWaveDirection.toFixed(0)}°)`);
  kvRow("Swell Period", `${fmt(current.swellWavePeriod)} s`);
  y += 2;

  // #3: Fahrenheit conversion — matches UI exactly
  const tempC = current.seaSurfaceTemperature;
  const tempF = celsiusToFahrenheit(tempC);
  kvRow("Sea Surface Temperature", `${fmt(tempC)}°C (${fmt(tempF)}°F)`);
  kvRow("Ocean Current",
    current.oceanCurrentVelocity > 0.1
      ? `${fmt(current.oceanCurrentVelocity, 2)} m/s ${degreesToCompass(current.oceanCurrentDirection)}`
      : "Negligible"
  );
  y += 5;

  // ═══════════════════════════════════════════════════════════════
  // 3. 7-DAY DAILY FORECAST TABLE
  // ═══════════════════════════════════════════════════════════════

  if (daily && daily.time.length > 0) {
    sectionTitle("7-Day Forecast");

    const forecastBody = daily.time.map((date, i) => {
      const dt = new Date(date);
      const maxWave = daily.waveHeightMax[i] ?? 0;
      // #5: Use the UI-aligned classifySeaState (same thresholds)
      const state = classifySeaState(maxWave);
      return [
        dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        i === 0 ? "Today" : dt.toLocaleDateString("en-US", { weekday: "short" }),
        `${fmt(maxWave)} m`,
        state,
        `${fmt(daily.swellWaveHeightMax[i] ?? 0)} m`,
        `${fmt(daily.seaSurfaceTemperatureMax[i] ?? 0)} °C`,
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Date", "Day", "Max Wave", "Sea State", "Max Swell", "Sea Temp"]],
      body: forecastBody,
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2.5, lineWidth: 0.1 },
      didParseCell: (hookData) => {
        // Color sea state cells — using UI-aligned labels
        if (hookData.section === "body" && hookData.column.index === 3) {
          const state = hookData.cell.raw as string;
          if (state === "Calm") {
            hookData.cell.styles.textColor = COLORS.green;
          } else if (state === "Moderate") {
            hookData.cell.styles.textColor = COLORS.amber;
          } else if (state === "Rough") {
            hookData.cell.styles.textColor = COLORS.orange;
          } else {
            hookData.cell.styles.textColor = COLORS.red;
          }
          hookData.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. HOURLY FORECAST CHARTS (drawn natively from data — no DOM capture)
  // ═══════════════════════════════════════════════════════════════

  if (data.hourly && data.hourly.time.length > 0) {
    // Start charts on a new page for clean layout
    doc.addPage();
    y = 14;

    sectionTitle("Hourly Forecast Charts");

    // Prepare X axis labels (sampled every 3 hours, matching the UI)
    const chartStep = 3;
    const xLabels = data.hourly.time.map((t) => {
      const dt = new Date(t);
      return `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, "0")}:00`;
    });

    const chartH = 55; // mm per chart

    // ── Chart 1: Waves & Swell ──
    y = drawChart(doc, {
      x: margin, y, w: contentW, h: chartH,
      title: "Waves & Swell",
      xLabels,
      yLabel: "Height (m)",
      step: chartStep,
      series: [
        { data: data.hourly.waveHeight, color: COLORS.chartBlue, label: "Wave Height (m)", fill: true },
        { data: data.hourly.swellWaveHeight, color: COLORS.chartViolet, label: "Swell Height (m)", fill: true },
      ],
    });

    // ── Chart 2: Sea Temperature ──
    y = drawChart(doc, {
      x: margin, y, w: contentW, h: chartH,
      title: "Sea Temperature",
      xLabels,
      yLabel: "Temp (°C)",
      step: chartStep,
      series: [
        { data: data.hourly.seaSurfaceTemperature, color: COLORS.chartCyan, label: "Sea Surface Temp (°C)", fill: true },
      ],
    });

    // Page break if needed before 3rd chart
    if (y + chartH + 10 > pageH - 14) {
      doc.addPage();
      y = 14;
    }

    // ── Chart 3: Combined ──
    y = drawChart(doc, {
      x: margin, y, w: contentW, h: chartH,
      title: "Combined",
      xLabels,
      yLabel: "Height (m)",
      yLabelRight: "Temp (°C)",
      step: chartStep,
      series: [
        { data: data.hourly.waveHeight, color: COLORS.chartBlue, label: "Wave (m)" },
        { data: data.hourly.swellWaveHeight, color: COLORS.chartViolet, label: "Swell (m)" },
        { data: data.hourly.seaSurfaceTemperature, color: COLORS.chartCyan, label: "Sea Temp (°C)", yAxisId: "right" },
      ],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. SEA STATE REFERENCE (updated to match UI thresholds)
  // ═══════════════════════════════════════════════════════════════

  sectionTitle("Sea State Reference");

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Sea State", "Wave Height", "Operational Impact"]],
    body: [
      ["Calm", "< 1.0 m", "Favorable conditions. No operational impact."],
      ["Moderate", "1.0 – 2.5 m", "Normal operations. Some cargo securing may be required."],
      ["Rough", "2.5 – 4.0 m", "Reduced speed advised. Increased fuel consumption likely."],
      ["Severe", "> 4.0 m", "Hazardous conditions. Seek shelter or alter course."],
    ],
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
    bodyStyles: { fontSize: 7.5, textColor: COLORS.text },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { cellPadding: 2, lineWidth: 0.1 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 25 }, 1: { cellWidth: 30 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ═══════════════════════════════════════════════════════════════
  // 6. DISCLAIMER
  // ═══════════════════════════════════════════════════════════════

  if (y > pageH - 30) { doc.addPage(); y = 14; }

  sectionTitle("Disclaimer");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  const notes = [
    "• Marine weather data is sourced from the Open-Meteo Marine Weather API.",
    "• Forecast accuracy diminishes beyond 3 days. Always cross-reference with official sources.",
    "• This report is for planning purposes only. Consult official marine weather services (e.g., NAVTEX, IMD)",
    "  and port authority advisories before making navigational decisions.",
    "• Sea state classifications are based on operational thresholds aligned with WMO guidance.",
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
  const filename = safeFilename(location.name);
  doc.save(`Weather_${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
