/**
 * POST /api/admin/ports/parse
 *
 * Accepts a file upload (PDF, CSV, Excel, Word, Email) and uses OpenAI GPT-4o
 * to parse port data into structured records for bulk import.
 *
 * Extracts MULTIPLE ports from a single document — designed for:
 * - Port schedules / berth calendars
 * - Excel port lists / databases
 * - NGA Pub 150 custom extracts
 * - Broker port circulars
 * - Any text listing multiple ports with coordinates
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { inflateRaw } from "zlib";
import { promisify } from "util";

const inflate = promisify(inflateRaw);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ── OpenAI Callers ──

async function callOpenAIWithText(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

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
    console.error("[parse-ports] OpenAI text error:", err);
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
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

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
              text: `Extract all port data from this document "${fileName}". Return ONLY valid JSON.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[parse-ports] OpenAI file error:", err);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "{}";
}

// ── Text Extractors ──

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
    const filename = buffer.toString("utf8", offset + 30, offset + 30 + filenameLen);
    const dataStart = offset + 30 + filenameLen + extraLen;
    if (compressedSize > 0) {
      entries.push({ filename, compressedData: buffer.subarray(dataStart, dataStart + compressedSize), compressionMethod, uncompressedSize });
    }
    offset = dataStart + compressedSize;
  }
  return entries;
}

async function readZipEntry(entry: ZipEntry): Promise<string> {
  if (entry.compressionMethod === 0) return entry.compressedData.toString("utf8");
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
        while ((tMatch = tRegex.exec(match[0])) !== null) parts.push(tMatch[1]);
        sharedStrings.push(parts.join(""));
      }
    }
    const textParts: string[] = [];
    const sheetEntries = entries.filter((e) => e.filename.startsWith("xl/worksheets/sheet")).sort((a, b) => a.filename.localeCompare(b.filename));
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
  } catch { return ""; }
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
      while ((tMatch = tRegex.exec(pMatch[0])) !== null) parts.push(tMatch[1]);
      if (parts.length > 0) textParts.push(parts.join(""));
    }
    return textParts.join("\n");
  } catch { return ""; }
}

function extractBinaryText(buffer: Buffer): string {
  const text: string[] = [];
  let current = "";
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte >= 32 && byte < 127) { current += String.fromCharCode(byte); }
    else if (current.length > 3) { text.push(current); current = ""; }
    else { current = ""; }
  }
  if (current.length > 3) text.push(current);
  return text.join(" ");
}

// ── MIME Helpers ──

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

function isPdf(fn: string, mt: string) { return mt === "application/pdf" || fn.toLowerCase().endsWith(".pdf"); }
function isTextBased(fn: string, mt: string) { return ["text/csv","text/plain","message/rfc822"].includes(mt) || /\.(csv|txt|eml)$/i.test(fn); }
function isMsg(fn: string, mt: string) { return mt === "application/vnd.ms-outlook" || fn.toLowerCase().endsWith(".msg"); }
function isXlsx(fn: string, mt: string) { return mt === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || fn.toLowerCase().endsWith(".xlsx"); }
function isDocx(fn: string, mt: string) { return mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fn.toLowerCase().endsWith(".docx"); }
function isLegacyOffice(fn: string, mt: string) { return ["application/vnd.ms-excel","application/msword"].includes(mt) || /\.(xls|doc)$/i.test(fn); }

// ── System Prompt for Port Data Extraction ──

const SYSTEM_PROMPT = `You are a maritime port data extraction expert. You are given content from a document that may contain one or more port entries — this could be a port list spreadsheet, NGA publication extract, broker circular, port schedule, or any text containing port information.

Your job is to extract ALL ports you can find and return them as a JSON object with a "ports" array. Each port object should have the following fields. Only include fields where you found actual data — do NOT guess or fabricate values.

FIELD NAMES AND TYPES:
{
  "ports": [
    {
      "name": "string — Port name (e.g., 'Rotterdam', 'Singapore')",
      "locode": "string — UN/LOCODE if available (e.g., 'NLRTM', 'SGSIN'). 5 chars: 2-letter country + 3-letter port code.",
      "country": "string — Full country name (e.g., 'Netherlands', 'Singapore')",
      "latitude": "number — Latitude in decimal degrees (positive = North, negative = South)",
      "longitude": "number — Longitude in decimal degrees (positive = East, negative = West)",
      "harborSize": "string — Must be one of: L (Large), M (Medium), S (Small), V (Very Small). Default to M if unclear.",
      "waterBody": "string — Body of water (e.g., 'North Sea', 'Persian Gulf', 'South China Sea')",
      "alternateName": "string — Any alternate names or abbreviations for this port",
      "region": "string — Must be one of: EUROPE, MEDITERRANEAN, MIDDLE_EAST, EAST_AFRICA, WEST_AFRICA, SOUTH_AFRICA, INDIAN_SUBCONTINENT, SOUTHEAST_ASIA, EAST_ASIA, AUSTRALIA, PACIFIC, NORTH_AMERICA, SOUTH_AMERICA, CARIBBEAN"
    }
  ]
}

IMPORTANT RULES:
1. Return ONLY valid JSON with a "ports" array. No markdown, no explanation.
2. Extract EVERY port mentioned in the document, even if some fields are missing.
3. For coordinates, convert ALL formats:
   - DMS: 51°55'N 4°30'E → latitude: 51.9167, longitude: 4.5
   - Degrees decimal minutes: 51°55.0'N → 51.9167
   - Already decimal: pass through as numbers
4. If coordinates are not provided, look for context clues (country, region) but DO NOT fabricate coordinates — omit latitude/longitude.
5. For UN/LOCODE, use standard 5-char format: 2-letter country code + 3-letter port code. If not given, omit.
6. Normalize port names: "Rott" → "Rotterdam", "S'pore" → "Singapore", "AMS" → "Amsterdam"
7. Harbor size mapping: "Large" or "L" → "L", "Medium" or "M" → "M", "Small" or "S" → "S", "Very Small" or "V" → "V"
8. Numbers should be raw numbers, not strings.
9. If only one port is found, still return it in the "ports" array.
10. Remove any duplicate ports (same name + same country).`;

// ── Route Handler ──

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name;
    const mimeType = getEffectiveMimeType(fileName, file.type);

    console.log(`[parse-ports] Processing: ${fileName} (${mimeType}, ${buffer.length} bytes)`);

    let aiResponse: string;

    if (isPdf(fileName, mimeType)) {
      const base64 = buffer.toString("base64");
      aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, "application/pdf", fileName);
    } else if (isTextBased(fileName, mimeType)) {
      const text = buffer.toString("utf8");
      if (!text || text.trim().length < 10) {
        return NextResponse.json({ error: "File appears to be empty." }, { status: 422 });
      }
      const truncated = text.length > 15000 ? text.substring(0, 15000) + "\n\n[... truncated ...]" : text;
      aiResponse = await callOpenAIWithText(SYSTEM_PROMPT, `Here is the content from a port document "${fileName}":\n\n${truncated}`);
    } else if (isMsg(fileName, mimeType)) {
      const extractedText = extractBinaryText(buffer);
      if (extractedText && extractedText.trim().length >= 20) {
        const truncated = extractedText.length > 15000 ? extractedText.substring(0, 15000) + "\n\n[... truncated ...]" : extractedText;
        aiResponse = await callOpenAIWithText(SYSTEM_PROMPT, `Here is text from an email "${fileName}":\n\n${truncated}`);
      } else {
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
      }
    } else if (isXlsx(fileName, mimeType)) {
      const extractedText = await extractXlsxText(buffer);
      if (extractedText && extractedText.trim().length >= 10) {
        const truncated = extractedText.length > 15000 ? extractedText.substring(0, 15000) + "\n\n[... truncated ...]" : extractedText;
        aiResponse = await callOpenAIWithText(SYSTEM_PROMPT, `Here is text from a port spreadsheet "${fileName}":\n\n${truncated}`);
      } else {
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
      }
    } else if (isDocx(fileName, mimeType)) {
      const extractedText = await extractDocxText(buffer);
      if (extractedText && extractedText.trim().length >= 10) {
        const truncated = extractedText.length > 15000 ? extractedText.substring(0, 15000) + "\n\n[... truncated ...]" : extractedText;
        aiResponse = await callOpenAIWithText(SYSTEM_PROMPT, `Here is text from a port document "${fileName}":\n\n${truncated}`);
      } else {
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
      }
    } else if (isLegacyOffice(fileName, mimeType)) {
      const extractedText = extractBinaryText(buffer);
      if (extractedText && extractedText.trim().length >= 20) {
        const truncated = extractedText.length > 15000 ? extractedText.substring(0, 15000) + "\n\n[... truncated ...]" : extractedText;
        aiResponse = await callOpenAIWithText(SYSTEM_PROMPT, `Here is text from a legacy document "${fileName}":\n\n${truncated}`);
      } else {
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
      }
    } else {
      const base64 = buffer.toString("base64");
      aiResponse = await callOpenAIWithFile(SYSTEM_PROMPT, base64, mimeType, fileName);
    }

    // Parse AI response
    let parsedData: any;
    try {
      parsedData = JSON.parse(aiResponse);
    } catch {
      console.error("[parse-ports] Failed to parse AI response:", aiResponse.substring(0, 500));
      return NextResponse.json({ error: "AI returned invalid data. Please try again." }, { status: 500 });
    }

    const ports = parsedData?.ports || (Array.isArray(parsedData) ? parsedData : [parsedData]);
    const validPorts = ports.filter((p: any) => p.name);

    console.log(`[parse-ports] Extracted ${validPorts.length} ports from ${fileName}`);

    return NextResponse.json({
      success: true,
      ports: validPorts,
      portsFound: validPorts.length,
      sourceFile: file.name,
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Failed to parse port document";
    const status = message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500;
    console.error("[parse-ports] Error:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
