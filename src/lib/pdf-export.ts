/**
 * Shared PDF Export Utility
 *
 * Provides a reusable, branded PDF generation framework using jsPDF.
 * All PDF generators across the platform use these helpers for
 * consistent branding, layout, and styling.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


// ─── Brand Colors ────────────────────────────────────────────────
const COLORS = {
  primary: [59, 130, 246] as [number, number, number],     // Blue-500
  secondary: [100, 116, 139] as [number, number, number],  // Slate-500
  success: [34, 197, 94] as [number, number, number],      // Green-500
  danger: [239, 68, 68] as [number, number, number],       // Red-500
  warning: [245, 158, 11] as [number, number, number],     // Amber-500
  muted: [148, 163, 184] as [number, number, number],      // Slate-400
  dark: [15, 23, 42] as [number, number, number],          // Slate-900
  white: [255, 255, 255] as [number, number, number],
  headerBg: [30, 41, 59] as [number, number, number],      // Slate-800
  rowAlt: [241, 245, 249] as [number, number, number],     // Slate-100
};

// ─── Types ───────────────────────────────────────────────────────
export interface PdfOptions {
  title: string;
  subtitle?: string;
  orgName?: string;
  orgLogoUrl?: string;
  filename?: string;
  orientation?: "portrait" | "landscape";
}

export interface KeyValueRow {
  label: string;
  value: string;
  color?: "default" | "success" | "danger" | "warning" | "primary";
  bold?: boolean;
}

export interface TableColumn {
  header: string;
  dataKey: string;
  width?: number;
}

// ─── Create Branded PDF Document ─────────────────────────────────
export async function createPdfDocument(options: PdfOptions): Promise<{
  doc: jsPDF;
  y: number;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  contentWidth: number;
  addHeader: () => Promise<number>;
  addFooter: () => void;
  addSection: (title: string, rows: KeyValueRow[], startY?: number) => number;
  addTable: (title: string, columns: TableColumn[], data: Record<string, any>[], startY?: number) => number;
  addText: (text: string, startY?: number, options?: { fontSize?: number; color?: [number, number, number]; bold?: boolean; align?: "left" | "center" | "right" }) => number;
  addSpacer: (height?: number, startY?: number) => number;
  addPageBreakIfNeeded: (requiredHeight: number, currentY: number) => number;
  addImage: (imageData: string, startY?: number, height?: number) => number;
  save: () => void;
}> {
  const orientation = options.orientation || "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let currentY = margin;

  // ── Load org logo as base64 ──
  let logoBase64: string | null = null;
  if (options.orgLogoUrl) {
    try {
      const response = await fetch(options.orgLogoUrl);
      const blob = await response.blob();
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      // If logo fetch fails, continue without it
    }
  }

  // ── Add Header ──
  const addHeader = async (): Promise<number> => {
    let y = margin;

    // Header background
    doc.setFillColor(...COLORS.headerBg);
    doc.rect(0, 0, pageWidth, 32, "F");

    // Logo
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", margin, 5, 22, 22);
      } catch {
        // Fallback if image format unsupported
      }
    }

    const textStartX = logoBase64 ? margin + 26 : margin;

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...COLORS.white);
    doc.text(options.title, textStartX, 14);

    // Subtitle / Org name
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.muted);
    const subtitleParts: string[] = [];
    if (options.orgName) subtitleParts.push(options.orgName);
    if (options.subtitle) subtitleParts.push(options.subtitle);
    if (subtitleParts.length > 0) {
      doc.text(subtitleParts.join("  •  "), textStartX, 20);
    }

    // Date
    doc.setFontSize(8);
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      textStartX,
      26
    );

    y = 38;
    return y;
  };

  // ── Add Footer ──
  const addFooter = () => {
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.muted);
      doc.text(
        `Page ${i} of ${totalPages}`,
        pageWidth - margin,
        pageHeight - 8,
        { align: "right" }
      );
      doc.text(
        options.orgName || "Solid Vision",
        margin,
        pageHeight - 8
      );
      // Thin line above footer
      doc.setDrawColor(...COLORS.muted);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    }
  };

  // ── Add Section with Key-Value Rows ──
  const addSection = (title: string, rows: KeyValueRow[], startY?: number): number => {
    let y = startY ?? currentY;
    y = addPageBreakIfNeeded(rows.length * 7 + 12, y);

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.dark);
    doc.text(title, margin, y);
    y += 2;

    // Underline
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentWidth, y);
    y += 5;

    // Rows
    doc.setFontSize(9);
    for (const row of rows) {
      y = addPageBreakIfNeeded(7, y);

      // Label
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.secondary);
      doc.text(row.label, margin + 2, y);

      // Value
      const colorMap: Record<string, [number, number, number]> = {
        default: COLORS.dark,
        success: COLORS.success,
        danger: COLORS.danger,
        warning: COLORS.warning,
        primary: COLORS.primary,
      };
      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setTextColor(...(colorMap[row.color || "default"] || COLORS.dark));
      doc.text(row.value, pageWidth - margin - 2, y, { align: "right" });

      y += 6;
    }

    currentY = y + 2;
    return currentY;
  };

  // ── Add Table ──
  const addTable = (title: string, columns: TableColumn[], data: Record<string, any>[], startY?: number): number => {
    let y = startY ?? currentY;
    y = addPageBreakIfNeeded(30, y);

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.dark);
    doc.text(title, margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [columns.map((c) => c.header)],
      body: data.map((row) => columns.map((c) => row[c.dataKey] ?? "")),
      theme: "grid",
      headStyles: {
        fillColor: COLORS.headerBg,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2.5,
        textColor: COLORS.dark,
      },
      alternateRowStyles: {
        fillColor: COLORS.rowAlt,
      },
      margin: { left: margin, right: margin },
      columnStyles: columns.reduce((acc, col, i) => {
        if (col.width) acc[i] = { cellWidth: col.width };
        return acc;
      }, {} as Record<number, any>),
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
    return currentY;
  };

  // ── Add Text Block ──
  const addText = (
    text: string,
    startY?: number,
    opts?: { fontSize?: number; color?: [number, number, number]; bold?: boolean; align?: "left" | "center" | "right" }
  ): number => {
    let y = startY ?? currentY;
    const fontSize = opts?.fontSize || 9;
    
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...(opts?.color || COLORS.dark));

    const lines = doc.splitTextToSize(text, contentWidth - 4);
    const lineHeight = fontSize * 0.5;
    
    for (const line of lines) {
      y = addPageBreakIfNeeded(lineHeight + 2, y);
      const x = opts?.align === "center" ? pageWidth / 2 : opts?.align === "right" ? pageWidth - margin : margin + 2;
      doc.text(line, x, y, { align: opts?.align || "left" });
      y += lineHeight;
    }

    currentY = y + 2;
    return currentY;
  };

  // ── Add Spacer ──
  const addSpacer = (height = 6, startY?: number): number => {
    currentY = (startY ?? currentY) + height;
    return currentY;
  };

  // ── Add Page Break If Needed ──
  const addPageBreakIfNeeded = (requiredHeight: number, y: number): number => {
    if (y + requiredHeight > pageHeight - 20) {
      doc.addPage();
      currentY = margin + 5;
      return currentY;
    }
    return y;
  };

  // ── Add Image ──
  const addImage = (imageData: string, startY?: number, height?: number): number => {
    let y = startY ?? currentY;
    const imgHeight = height || 80;
    y = addPageBreakIfNeeded(imgHeight + 5, y);

    try {
      doc.addImage(imageData, "PNG", margin, y, contentWidth, imgHeight);
      y += imgHeight + 4;
    } catch {
      // If image fails, add placeholder text
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.text("[Image could not be rendered]", margin, y + 5);
      y += 10;
    }

    currentY = y;
    return currentY;
  };

  // ── Save ──
  const save = () => {
    addFooter();
    const filename = options.filename || `${options.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    doc.save(filename);
  };

  // Initialize with header
  currentY = await addHeader();

  return {
    doc,
    y: currentY,
    pageWidth,
    pageHeight,
    margin,
    contentWidth,
    addHeader,
    addFooter,
    addSection,
    addTable,
    addText,
    addSpacer,
    addPageBreakIfNeeded,
    addImage,
    save,
  };
}



// ─── Helpers ─────────────────────────────────────────────────────
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNum(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
