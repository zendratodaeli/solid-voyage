/**
 * POST /api/voyages/parse-fixture
 *
 * Accepts a file upload (PDF, CSV, Excel, Word, Email) and uses OpenAI GPT-4o
 * to parse voyage/fixture details into structured form fields.
 *
 * Reuses the same extraction strategies as /api/vessels/parse-profile:
 * - PDFs → Sent directly as base64 to GPT-4o (native PDF understanding)
 * - CSV/TXT/EML → Text extracted and sent to GPT-4o
 * - XLSX/DOCX → Text extracted from ZIP, sent to GPT-4o
 * - MSG → Binary text extracted, sent to GPT-4o
 * - Fallback → Any file that fails text extraction is sent as base64
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { inflateRaw } from "zlib";
import { promisify } from "util";

const inflate = promisify(inflateRaw);

// ═══════════════════════════════════════════════════════════════════
// OPENAI CLIENT
// ═══════════════════════════════════════════════════════════════════

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function callOpenAIWithText(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[parse-fixture] OpenAI text error:", err);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "{}";
}

async function callOpenAIWithFile(
  systemPrompt: string,
  fileBase64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: fileName,
                file_data: `data:${mimeType};base64,${fileBase64}`,
              },
            },
            {
              type: "text",
              text: `Extract all voyage/fixture data from this document "${fileName}". Return ONLY valid JSON.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[parse-fixture] OpenAI file error:", err);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "{}";
}

// ═══════════════════════════════════════════════════════════════════
// TEXT EXTRACTORS (copied from vessel parse-profile for consistency)
// ═══════════════════════════════════════════════════════════════════

interface ZipEntry {
  filename: string;
  compressedData: Buffer;
  compressionMethod: number;
  uncompressedSize: number;
}

function parseZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const filenameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const filename = buffer.toString(
      "utf8",
      offset + 30,
      offset + 30 + filenameLen
    );
    const dataStart = offset + 30 + filenameLen + extraLen;

    if (compressedSize > 0) {
      entries.push({
        filename,
        compressedData: buffer.subarray(dataStart, dataStart + compressedSize),
        compressionMethod,
        uncompressedSize,
      });
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}

async function readZipEntry(entry: ZipEntry): Promise<string> {
  if (entry.compressionMethod === 0) {
    return entry.compressedData.toString("utf8");
  }
  if (entry.compressionMethod === 8) {
    const decompressed = await inflate(entry.compressedData);
    return decompressed.toString("utf8");
  }
  return "";
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  try {
    const entries = parseZipEntries(buffer);
    const ssEntry = entries.find((e) => e.filename === "xl/sharedStrings.xml");
    const sharedStrings: string[] = [];
    if (ssEntry) {
      const ssXml = await readZipEntry(ssEntry);
      const siRegex = /<si>[\s\S]*?<\/si>/g;
      let match;
      while ((match = siRegex.exec(ssXml)) !== null) {
        const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let tMatch;
        const parts: string[] = [];
        while ((tMatch = tRegex.exec(match[0])) !== null) {
          parts.push(tMatch[1]);
        }
        sharedStrings.push(parts.join(""));
      }
    }
    const textParts: string[] = [];
    const sheetEntries = entries
      .filter((e) => e.filename.startsWith("xl/worksheets/sheet"))
      .sort((a, b) => a.filename.localeCompare(b.filename));
    for (const sheetEntry of sheetEntries) {
      const sheetXml = await readZipEntry(sheetEntry);
      const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
      let rowMatch;
      while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
        const cellRegex = /<c[^>]*?(t="([^"]*)")?[^>]*>[\s\S]*?<v>([\s\S]*?)<\/v>[\s\S]*?<\/c>/g;
        let cellMatch;
        const rowValues: string[] = [];
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
          const cellType = cellMatch[2];
          const cellValue = cellMatch[3];
          if (cellType === "s") {
            const idx = parseInt(cellValue, 10);
            rowValues.push(sharedStrings[idx] || cellValue);
          } else {
            rowValues.push(cellValue);
          }
        }
        if (rowValues.length > 0) textParts.push(rowValues.join("\t"));
      }
    }
    return textParts.join("\n");
  } catch (err) {
    console.error("[parse-fixture] XLSX extraction error:", err);
    return "";
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const entries = parseZipEntries(buffer);
    const docEntry = entries.find((e) => e.filename === "word/document.xml");
    if (!docEntry) return "";
    const docXml = await readZipEntry(docEntry);
    const textParts: string[] = [];
    const paragraphRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
    let pMatch;
    while ((pMatch = paragraphRegex.exec(docXml)) !== null) {
      const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let tMatch;
      const parts: string[] = [];
      while ((tMatch = tRegex.exec(pMatch[0])) !== null) {
        parts.push(tMatch[1]);
      }
      if (parts.length > 0) textParts.push(parts.join(""));
    }
    return textParts.join("\n");
  } catch (err) {
    console.error("[parse-fixture] DOCX extraction error:", err);
    return "";
  }
}

function extractBinaryText(buffer: Buffer): string {
  const text: string[] = [];
  let current = "";
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte >= 32 && byte < 127) {
      current += String.fromCharCode(byte);
    } else if (current.length > 3) {
      text.push(current);
      current = "";
    } else {
      current = "";
    }
  }
  if (current.length > 3) text.push(current);
  return text.join(" ");
}

// ═══════════════════════════════════════════════════════════════════
// OPENAI PROMPT FOR VOYAGE/FIXTURE EXTRACTION
// ═══════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a maritime freight and chartering data extraction expert. You are given content from a voyage fixture document — this could be a fixture recap email, broker confirmation, charter party summary, freight offer, cargo inquiry, PDF voyage instructions, CSV export, or Excel spreadsheet.

Your job is to extract ALL voyage and cargo information you can find and return it as a JSON object with the following field names. Only include fields where you found actual data — do NOT guess or fabricate values. If a field is not found in the document, omit it entirely.

FIELD NAMES AND TYPES:
{
  "vesselName": "string — Vessel name (e.g., 'BBC Bergen', 'MV Everest'). Strip prefixes like MV, MT, MS.",
  "openPort": "string — Vessel open position / starting port",
  "loadPorts": ["string — Array of loading port names"],
  "loadPortCountries": ["string — Array of 2-letter ISO country codes for load ports (e.g., 'NL', 'DE')"],
  "dischargePorts": ["string — Array of discharge port names"],
  "dischargePortCountries": ["string — Array of 2-letter ISO country codes for discharge ports"],
  "cargoType": "string — Type of cargo (e.g., 'Steel Coils', 'Iron Ore', 'Coal')",
  "cargoQuantityMt": "number — Total cargo quantity in metric tons",
  "stowageFactor": "number — Stowage factor in cbm/MT",
  "freightRateUsd": "number — Freight rate in USD (per MT or lumpsum)",
  "freightRateUnit": "string — Must be one of: PER_MT, PER_CBM, LUMPSUM, PER_TEU, PER_FEU, WORLDSCALE",
  "laycanStart": "string — Laycan start date in YYYY-MM-DD format",
  "laycanEnd": "string — Laycan end date in YYYY-MM-DD format",
  "brokeragePercent": "number — Brokerage commission percentage",
  "commissionPercent": "number — Address commission percentage",
  "loadPortDays": "number — Days in load port (port days / laytime)",
  "dischargePortDays": "number — Days in discharge port",
  "waitingDays": "number — Expected waiting days",
  "cargoParcels": [
    {
      "name": "string — Cargo name/type for this parcel",
      "quantity": "number — Quantity in MT for this parcel",
      "loadPort": "string — Load port for this parcel",
      "dischargePort": "string — Discharge port for this parcel",
      "freightRate": "number — Freight rate for this parcel"
    }
  ]
}

IMPORTANT RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no wrapping.
2. If there are MULTIPLE cargo parcels (e.g., "25,000 MT Steel + 5,000 MT Pipes"), list them in the cargoParcels array. Also set cargoQuantityMt to the TOTAL.
3. If there's only ONE cargo type, you can use cargoType + cargoQuantityMt instead of cargoParcels.
4. For dates, convert ALL formats (e.g., "15-20 May 2026", "May 15/20", "15th May - 20th May 2026") to YYYY-MM-DD.
5. For country codes, use 2-letter ISO codes (e.g., "NL" for Netherlands, "SG" for Singapore, "DE" for Germany).
6. If the document mentions a single load port like "Rotterdam" or "ROTT", normalize it to the full port name.
7. Freight rates: if given as "USD 28.50 PMT", freightRateUsd = 28.50 and freightRateUnit = "PER_MT".
8. Strip vessel name prefixes: "MV BBC Bergen" → "BBC Bergen", "MT Pacific" → "Pacific".
9. Brokerage/Commission: "2.5% ADDCOMM" → commissionPercent = 2.5. "1.25% brokerage" → brokeragePercent = 1.25.
10. Look for data in email headers, body text, tables, signature lines — extract from ANY format.
11. For laycan, if only one date is given, use it for both start and end.
12. Numbers should be raw numbers, not strings. Do not include commas or units.
13. If commission/brokerage is described as a combined "total commission" (e.g., "5% total commission"), split it: commissionPercent = 3.75, brokeragePercent = 1.25 (standard split).`;

// ═══════════════════════════════════════════════════════════════════
// MIME TYPE HELPERS
// ═══════════════════════════════════════════════════════════════════

function getEffectiveMimeType(fileName: string, declaredMime: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    csv: "text/csv",
    txt: "text/plain",
    eml: "message/rfc822",
    msg: "application/vnd.ms-outlook",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
  };
  return mimeMap[ext] || declaredMime || "application/octet-stream";
}

function isPdf(fileName: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

function isTextBased(fileName: string, mimeType: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    mimeType === "text/csv" ||
    mimeType === "text/plain" ||
    mimeType === "message/rfc822" ||
    lower.endsWith(".csv") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".eml")
  );
}

function isMsg(fileName: string, mimeType: string): boolean {
  return mimeType === "application/vnd.ms-outlook" || fileName.toLowerCase().endsWith(".msg");
}

function isXlsx(fileName: string, mimeType: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileName.toLowerCase().endsWith(".xlsx")
  );
}

function isDocx(fileName: string, mimeType: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  );
}

function isLegacyOffice(fileName: string, mimeType: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/msword" ||
    lower.endsWith(".xls") ||
    lower.endsWith(".doc")
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name;
    const mimeType = getEffectiveMimeType(fileName, file.type);

    console.log(
      `[parse-fixture] Processing: ${fileName} (${mimeType}, ${buffer.length} bytes)`
    );

    let aiResponse: string;

    // ─── PDFs → Send directly to GPT-4o ─────────────
    if (isPdf(fileName, mimeType)) {
      console.log("[parse-fixture] Using GPT-4o native PDF input");
      const base64 = buffer.toString("base64");
      aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, "application/pdf", fileName);
    }

    // ─── Text files (CSV, TXT, EML) → Extract and send text ────
    else if (isTextBased(fileName, mimeType)) {
      const text = buffer.toString("utf8");
      if (!text || text.trim().length < 10) {
        return NextResponse.json(
          { error: "File appears to be empty. Please ensure it contains voyage data." },
          { status: 422 }
        );
      }
      const truncated = text.length > 15000
        ? text.substring(0, 15000) + "\n\n[... content truncated ...]"
        : text;
      aiResponse = await callOpenAIWithText(
        SYSTEM_PROMPT,
        `Here is the content from a voyage/fixture document "${fileName}":\n\n${truncated}`
      );
    }

    // ─── MSG (Outlook binary email) → Extract text, fallback to base64 ────
    else if (isMsg(fileName, mimeType)) {
      const extractedText = extractBinaryText(buffer);
      if (extractedText && extractedText.trim().length >= 20) {
        const truncated = extractedText.length > 15000
          ? extractedText.substring(0, 15000) + "\n\n[... content truncated ...]"
          : extractedText;
        aiResponse = await callOpenAIWithText(
          SYSTEM_PROMPT,
          `Here is the text extracted from an Outlook email file "${fileName}" (some formatting may be lost):\n\n${truncated}`
        );
      } else {
        console.log("[parse-fixture] MSG text extraction insufficient, using GPT-4o file input");
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
      }
    }

    // ─── XLSX → Extract text, fallback to base64 ─────
    else if (isXlsx(fileName, mimeType)) {
      const extractedText = await extractXlsxText(buffer);
      if (extractedText && extractedText.trim().length >= 10) {
        const truncated = extractedText.length > 15000
          ? extractedText.substring(0, 15000) + "\n\n[... content truncated ...]"
          : extractedText;
        aiResponse = await callOpenAIWithText(
          SYSTEM_PROMPT,
          `Here is the text from a voyage/fixture spreadsheet "${fileName}":\n\n${truncated}`
        );
      } else {
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
      }
    }

    // ─── DOCX → Extract text, fallback to base64 ─────
    else if (isDocx(fileName, mimeType)) {
      const extractedText = await extractDocxText(buffer);
      if (extractedText && extractedText.trim().length >= 10) {
        const truncated = extractedText.length > 15000
          ? extractedText.substring(0, 15000) + "\n\n[... content truncated ...]"
          : extractedText;
        aiResponse = await callOpenAIWithText(
          SYSTEM_PROMPT,
          `Here is the text from a voyage/fixture document "${fileName}":\n\n${truncated}`
        );
      } else {
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
      }
    }

    // ─── Legacy Office (.doc, .xls) → best-effort ────
    else if (isLegacyOffice(fileName, mimeType)) {
      const extractedText = extractBinaryText(buffer);
      if (extractedText && extractedText.trim().length >= 20) {
        const truncated = extractedText.length > 15000
          ? extractedText.substring(0, 15000) + "\n\n[... content truncated ...]"
          : extractedText;
        aiResponse = await callOpenAIWithText(
          SYSTEM_PROMPT,
          `Here is the text extracted from a legacy voyage document "${fileName}" (some formatting may be lost):\n\n${truncated}`
        );
      } else {
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
      }
    }

    // ─── UNKNOWN FORMAT → Send raw to GPT-4o ─────────────────────
    else {
      console.log(`[parse-fixture] Unknown format ${mimeType}, sending raw to GPT-4o`);
      const base64 = buffer.toString("base64");
      aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
    }

    // Parse AI response
    let parsedData: Record<string, unknown>;
    try {
      parsedData = JSON.parse(aiResponse);
    } catch {
      console.error("[parse-fixture] Failed to parse AI response:", aiResponse.substring(0, 500));
      return NextResponse.json(
        { error: "AI returned invalid data. Please try again." },
        { status: 500 }
      );
    }

    // Filter out empty/null values
    const cleanedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsedData)) {
      if (value !== null && value !== undefined && value !== "") {
        cleanedData[key] = value;
      }
    }

    console.log(
      `[parse-fixture] Successfully extracted ${Object.keys(cleanedData).length} fields from ${fileName}`
    );

    return NextResponse.json({
      success: true,
      data: cleanedData,
      fieldsFound: Object.keys(cleanedData).length,
      sourceFile: file.name,
    });
  } catch (err) {
    console.error("[parse-fixture] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to parse fixture document",
      },
      { status: 500 }
    );
  }
}
