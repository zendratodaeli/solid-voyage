/**
 * POST /api/vessels/parse-profile
 *
 * Accepts a file upload (PDF, CSV, Excel, Word, Email) and uses OpenAI GPT-4o
 * to parse vessel specifications into structured form fields.
 *
 * Strategy:
 * - PDFs → Sent directly as base64 to GPT-4o (native PDF understanding)
 * - CSV/TXT/EML → Text extracted and sent to GPT-4o
 * - XLSX/DOCX → Text extracted from ZIP, sent to GPT-4o
 * - MSG → Binary text extraction, fallback to base64
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

/**
 * Call OpenAI with text-only content (for CSV, TXT, extracted XLSX/DOCX)
 */
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
    console.error("[parse-profile] OpenAI text error:", err);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "{}";
}

/**
 * Call OpenAI with a file (base64) — uses GPT-4o native file input.
 * Works for PDFs, images, and any document GPT-4o can read.
 */
async function callOpenAIWithFile(
  systemPrompt: string,
  fileBase64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  // GPT-4o supports file inputs via the "file" content type
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
              text: `Extract all vessel specification data from this document "${fileName}". Return ONLY valid JSON.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[parse-profile] OpenAI file error:", err);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "{}";
}

// ═══════════════════════════════════════════════════════════════════
// MINIMAL ZIP READER (Node.js built-in zlib only)
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

// ═══════════════════════════════════════════════════════════════════
// TEXT EXTRACTORS (for non-PDF formats)
// ═══════════════════════════════════════════════════════════════════

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
      const sheetName = sheetEntry.filename
        .replace("xl/worksheets/", "")
        .replace(".xml", "");
      textParts.push(`--- ${sheetName} ---`);

      const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
      let rowMatch;
      while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
        const cellRegex =
          /<c[^>]*?(t="([^"]*)")?[^>]*>[\s\S]*?<v>([\s\S]*?)<\/v>[\s\S]*?<\/c>/g;
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
        if (rowValues.length > 0) {
          textParts.push(rowValues.join("\t"));
        }
      }
    }

    return textParts.join("\n");
  } catch (err) {
    console.error("[parse-profile] XLSX extraction error:", err);
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
      if (parts.length > 0) {
        textParts.push(parts.join(""));
      }
    }

    return textParts.join("\n");
  } catch (err) {
    console.error("[parse-profile] DOCX extraction error:", err);
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
// OPENAI PROMPT FOR VESSEL DATA EXTRACTION
// ═══════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a maritime vessel data extraction expert. You are given content from a vessel profile document (could be a PDF vessel certificate, specification sheet, CSV data export, Excel spreadsheet, or Word document).

Your job is to extract ALL vessel information you can find and return it as a JSON object with the following field names. Only include fields where you found actual data — do NOT guess or fabricate values. If a field is not found in the document, omit it entirely.

FIELD NAMES AND TYPES:
{
  "name": "string — Vessel name",
  "imoNumber": "string — IMO number (7 digits)",
  "mmsiNumber": "string — MMSI number (9 digits)",
  "vesselType": "string — Must be one of: CAPESIZE, PANAMAX, POST_PANAMAX, SUPRAMAX, HANDYMAX, HANDYSIZE, BULK_CARRIER, VLCC, SUEZMAX, AFRAMAX, MR_TANKER, LR1_TANKER, LR2_TANKER, CHEMICAL_TANKER, PRODUCT_TANKER, CONTAINER_FEEDER, CONTAINER_PANAMAX, CONTAINER_POST_PANAMAX, CONTAINER_ULCV, LNG_CARRIER, LPG_CARRIER, GENERAL_CARGO, MULTI_PURPOSE, HEAVY_LIFT, CAR_CARRIER, RO_RO, OTHER",
  "customVesselType": "string — Only if vesselType is OTHER",
  "dwt": "number — Deadweight tonnage",
  "loa": "number — Length overall in meters",
  "beam": "number — Beam/breadth in meters",
  "summerDraft": "number — Summer draft in meters",
  "grossTonnage": "number — Gross tonnage",
  "netTonnage": "number — Net tonnage",
  "yearBuilt": "number — Year built (4-digit)",
  "flagState": "string — Flag state/registry",
  "classificationSociety": "string — e.g., DNV, Lloyd's Register, Bureau Veritas",
  "iceClass": "string — Ice class notation",
  "vesselConstant": "number — Vessel constant in MT",
  "ladenSpeed": "number — Laden speed in knots",
  "ballastSpeed": "number — Ballast speed in knots",
  "ecoLadenSpeed": "number — Eco laden speed in knots",
  "ecoBallastSpeed": "number — Eco ballast speed in knots",
  "ecoLadenConsumption": "number — Eco laden consumption in MT/day",
  "ecoBallastConsumption": "number — Eco ballast consumption in MT/day",
  "portConsumptionWithCrane": "number — Port consumption with crane operation, MT/day",
  "portConsumptionWithoutCrane": "number — Port consumption idle/without crane, MT/day",
  "hasScrubber": "boolean — Whether vessel has exhaust gas cleaning system (scrubber/EGCS)",
  "grainCapacity": "number — Grain capacity in CBM (bulk carriers)",
  "baleCapacity": "number — Bale capacity in CBM (bulk carriers)",
  "numberOfHolds": "number — Number of cargo holds",
  "numberOfHatches": "number — Number of cargo hatches",
  "grabFitted": "boolean — Whether grab fitted",
  "craneCount": "number — Number of cranes",
  "craneSWL": "number — Crane SWL in MT",
  "hasTweenDecks": "boolean — Whether has tween decks",
  "tankCapacity": "number — Tank capacity in CBM (tankers)",
  "numberOfTanks": "number — Number of cargo tanks",
  "coatedTanks": "boolean — Whether tanks are coated",
  "heatingCoils": "boolean — Whether has heating coils",
  "pumpingRate": "number — Pumping rate in CBM/hr",
  "hasIGS": "boolean — Whether has Inert Gas System",
  "hasCOW": "boolean — Whether has Crude Oil Washing",
  "hasSBT": "boolean — Whether has Segregated Ballast Tanks",
  "teuCapacity": "number — TEU capacity (containers)",
  "feuCapacity": "number — FEU capacity (containers)",
  "reeferPlugs": "number — Number of reefer plugs",
  "cargoTankCapacityCbm": "number — Cargo tank capacity in CBM (gas carriers)",
  "containmentType": "string — Must be one of: MEMBRANE, MOSS, TYPE_C",
  "boilOffRate": "number — Boil-off rate in %/day",
  "dualFuelEngine": "string — Must be one of: DFDE, ME_GI, X_DF, STEAM",
  "heelQuantity": "number — Heel quantity in CBM",
  "fuelConsumptions": [
    {
      "fuelType": "string — e.g., VLSFO, LSMGO, HFO, HSFO, MGO, LNG",
      "ladenConsumption": "number — Laden consumption MT/day for this fuel",
      "ballastConsumption": "number — Ballast consumption MT/day for this fuel"
    }
  ]
}

IMPORTANT RULES:
1. Return ONLY valid JSON. No markdown, no explanation.
2. For vesselType, map the vessel description to the closest enum value. For example: "Bulk Carrier 82,000 DWT" → "PANAMAX", "VLCC 300,000 DWT" → "VLCC", "Project Carrier" → "MULTI_PURPOSE", "Tweendecker" → "MULTI_PURPOSE".
3. If the document contains fuel consumption data for multiple fuel types, include them all in the fuelConsumptions array.
4. If fuel consumption is given as a single value (e.g. "14.5 mt fuel per day") without distinguishing laden/ballast, use it for BOTH laden and ballast consumption. Default fuelType to "VLSFO" if not specified, or use the actual fuel grade mentioned.
5. Numbers should be raw numbers, not strings. Do not include commas or units.
6. Convert all units to the expected units (meters for dimensions, knots for speed, MT/day for consumption, CBM for capacities).
7. If the document contains multiple vessels of the same class, extract the specifications that are COMMON to all of them (shared specs). For vessel name, use the first vessel listed.
8. For boolean fields, only include them if explicitly stated (e.g., "scrubber fitted" → true, "no scrubber" → false).
9. Look for data in tables, specifications lists, technical drawings — extract from ANY format.
10. SPEED MAPPING: "Service speed" or "Eco speed" → ladenSpeed. "Max speed" or "Maximum speed" → ballastSpeed. If ONLY one speed is given, use it for BOTH ladenSpeed and ballastSpeed. Always provide BOTH ladenSpeed AND ballastSpeed — never omit one.
11. "Consumption at sea" typically means laden consumption. If only one consumption figure is given, use it for both laden and ballast.`;

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
  return (
    mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")
  );
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
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileName.toLowerCase().endsWith(".xlsx")
  );
}

function isDocx(fileName: string, mimeType: string): boolean {
  return (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
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
      `[parse-profile] Processing: ${fileName} (${mimeType}, ${buffer.length} bytes)`
    );

    let aiResponse: string;

    // ─── STRATEGY 1: PDFs → Send directly to GPT-4o ─────────────
    // GPT-4o has native PDF understanding — no text extraction needed.
    // This handles text PDFs, scanned PDFs, image-heavy PDFs, and
    // complex layouts that text extractors struggle with.
    if (isPdf(fileName, mimeType)) {
      console.log("[parse-profile] Using GPT-4o native PDF input");
      const base64 = buffer.toString("base64");
      aiResponse = await callOpenAIWithFile(
        SYSTEM_PROMPT,
        base64,
        "application/pdf",
        fileName
      );
    }

    // ─── STRATEGY 2: Plain text files → Extract and send text ────
    else if (isTextBased(fileName, mimeType)) {
      const text = buffer.toString("utf8");
      if (!text || text.trim().length < 10) {
        return NextResponse.json(
          {
            error:
              "File appears to be empty. Please ensure it contains vessel specification data.",
          },
          { status: 422 }
        );
      }
      const truncated =
        text.length > 15000
          ? text.substring(0, 15000) + "\n\n[... content truncated ...]"
          : text;
      const label = mimeType === "message/rfc822" || fileName.toLowerCase().endsWith(".eml")
        ? "vessel specification email" : "vessel profile document";
      aiResponse = await callOpenAIWithText(
        SYSTEM_PROMPT,
        `Here is the text from a ${label} "${fileName}":\n\n${truncated}`
      );
    }

    // ─── STRATEGY 3: XLSX → Extract text, fallback to base64 ─────
    else if (isXlsx(fileName, mimeType)) {
      const extractedText = await extractXlsxText(buffer);
      if (extractedText && extractedText.trim().length >= 10) {
        const truncated =
          extractedText.length > 15000
            ? extractedText.substring(0, 15000) +
              "\n\n[... content truncated ...]"
            : extractedText;
        aiResponse = await callOpenAIWithText(
          SYSTEM_PROMPT,
          `Here is the text from a vessel profile spreadsheet "${fileName}":\n\n${truncated}`
        );
      } else {
        // Fallback: send raw file to GPT-4o
        console.log(
          "[parse-profile] XLSX text extraction failed, using GPT-4o file input"
        );
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(
          SYSTEM_PROMPT,
          base64,
          mimeType,
          fileName
        );
      }
    }

    // ─── STRATEGY 4: DOCX → Extract text, fallback to base64 ─────
    else if (isDocx(fileName, mimeType)) {
      const extractedText = await extractDocxText(buffer);
      if (extractedText && extractedText.trim().length >= 10) {
        const truncated =
          extractedText.length > 15000
            ? extractedText.substring(0, 15000) +
              "\n\n[... content truncated ...]"
            : extractedText;
        aiResponse = await callOpenAIWithText(
          SYSTEM_PROMPT,
          `Here is the text from a vessel profile document "${fileName}":\n\n${truncated}`
        );
      } else {
        console.log(
          "[parse-profile] DOCX text extraction failed, using GPT-4o file input"
        );
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(
          SYSTEM_PROMPT,
          base64,
          mimeType,
          fileName
        );
      }
    }

    // ─── STRATEGY 4b: MSG (Outlook binary email) → Extract text, fallback to base64 ────
    else if (isMsg(fileName, mimeType)) {
      const extractedText = extractBinaryText(buffer);
      if (extractedText && extractedText.trim().length >= 20) {
        const truncated =
          extractedText.length > 15000
            ? extractedText.substring(0, 15000) +
              "\n\n[... content truncated ...]"
            : extractedText;
        aiResponse = await callOpenAIWithText(
          SYSTEM_PROMPT,
          `Here is the text extracted from an Outlook email containing vessel specifications "${fileName}" (some formatting may be lost):\n\n${truncated}`
        );
      } else {
        console.log(
          "[parse-profile] MSG text extraction insufficient, using GPT-4o file input"
        );
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(
          SYSTEM_PROMPT,
          base64,
          mimeType,
          fileName
        );
      }
    }

    // ─── STRATEGY 5: Legacy Office (.doc, .xls) → best-effort ────
    else if (isLegacyOffice(fileName, mimeType)) {
      const extractedText = extractBinaryText(buffer);
      if (extractedText && extractedText.trim().length >= 20) {
        const truncated =
          extractedText.length > 15000
            ? extractedText.substring(0, 15000) +
              "\n\n[... content truncated ...]"
            : extractedText;
        aiResponse = await callOpenAIWithText(
          SYSTEM_PROMPT,
          `Here is the text extracted from a legacy vessel profile document "${fileName}" (some formatting may be lost):\n\n${truncated}`
        );
      } else {
        // Fallback: send raw file to GPT-4o
        console.log(
          "[parse-profile] Legacy Office text extraction failed, using GPT-4o file input"
        );
        const base64 = buffer.toString("base64");
        aiResponse = await callOpenAIWithFile(
          SYSTEM_PROMPT,
          base64,
          mimeType,
          fileName
        );
      }
    }

    // ─── UNKNOWN FORMAT → Send raw to GPT-4o ─────────────────────
    else {
      console.log(
        `[parse-profile] Unknown format ${mimeType}, sending raw to GPT-4o`
      );
      const base64 = buffer.toString("base64");
      aiResponse = await callOpenAIWithFile(
        SYSTEM_PROMPT,
        base64,
        mimeType,
        fileName
      );
    }

    // Parse AI response
    let parsedData: Record<string, unknown>;
    try {
      parsedData = JSON.parse(aiResponse);
    } catch {
      console.error(
        "[parse-profile] Failed to parse AI response:",
        aiResponse.substring(0, 500)
      );
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
      `[parse-profile] Successfully extracted ${Object.keys(cleanedData).length} fields from ${fileName}`
    );

    return NextResponse.json({
      success: true,
      data: cleanedData,
      fieldsFound: Object.keys(cleanedData).length,
      sourceFile: file.name,
    });
  } catch (err) {
    console.error("[parse-profile] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to parse vessel profile",
      },
      { status: 500 }
    );
  }
}
