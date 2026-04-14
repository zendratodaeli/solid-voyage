"use client";

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  FileSpreadsheet,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface ParsedVesselData {
  // Identity
  name?: string;
  imoNumber?: string;
  mmsiNumber?: string;
  vesselType?: string;
  customVesselType?: string;
  dwt?: number;
  // Dimensions
  loa?: number;
  beam?: number;
  summerDraft?: number;
  grossTonnage?: number;
  netTonnage?: number;
  // Identification
  yearBuilt?: number;
  flagState?: string;
  classificationSociety?: string;
  iceClass?: string;
  vesselConstant?: number;
  // Speed
  ladenSpeed?: number;
  ballastSpeed?: number;
  ecoLadenSpeed?: number;
  ecoBallastSpeed?: number;
  ecoLadenConsumption?: number;
  ecoBallastConsumption?: number;
  // Port
  portConsumptionWithCrane?: number;
  portConsumptionWithoutCrane?: number;
  hasScrubber?: boolean;
  // Bulk Carrier
  grainCapacity?: number;
  baleCapacity?: number;
  numberOfHolds?: number;
  numberOfHatches?: number;
  grabFitted?: boolean;
  craneCount?: number;
  craneSWL?: number;
  hasTweenDecks?: boolean;
  // Tanker
  tankCapacity?: number;
  numberOfTanks?: number;
  coatedTanks?: boolean;
  heatingCoils?: boolean;
  pumpingRate?: number;
  hasIGS?: boolean;
  hasCOW?: boolean;
  hasSBT?: boolean;
  // Container
  teuCapacity?: number;
  feuCapacity?: number;
  reeferPlugs?: number;
  // Gas Carrier
  cargoTankCapacityCbm?: number;
  containmentType?: string;
  boilOffRate?: number;
  dualFuelEngine?: string;
  heelQuantity?: number;
  // Fuel
  fuelConsumptions?: Array<{
    fuelType: string;
    ladenConsumption: number;
    ballastConsumption: number;
  }>;
  [key: string]: unknown;
}

export interface VesselProfileUploaderRef {
  /** Programmatically parse pasted text via the AI — called from the form-level paste interceptor */
  parseText: (text: string) => void;
}

interface VesselProfileUploaderProps {
  onFieldsParsed: (data: ParsedVesselData, fieldsCount: number) => void;
}

// ═══════════════════════════════════════════════════════════════════
// ACCEPTED FILE TYPES
// ═══════════════════════════════════════════════════════════════════

const ACCEPTED_TYPES = [
  ".pdf",
  ".csv",
  ".xlsx",
  ".xls",
  ".doc",
  ".docx",
  ".txt",
  ".eml",
  ".msg",
];

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "message/rfc822",
  "application/vnd.ms-outlook",
];

const FILE_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  pdf: { icon: "📄", color: "text-red-400" },
  csv: { icon: "📊", color: "text-green-400" },
  xlsx: { icon: "📊", color: "text-emerald-400" },
  xls: { icon: "📊", color: "text-emerald-400" },
  doc: { icon: "📝", color: "text-blue-400" },
  docx: { icon: "📝", color: "text-blue-400" },
  txt: { icon: "📃", color: "text-gray-400" },
  eml: { icon: "📧", color: "text-amber-400" },
  msg: { icon: "📧", color: "text-amber-400" },
};

type UploadState = "idle" | "dragging" | "uploading" | "parsing" | "success" | "error";

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export const VesselProfileUploader = forwardRef<VesselProfileUploaderRef, VesselProfileUploaderProps>(
  function VesselProfileUploader({ onFieldsParsed }, ref) {
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [fileExt, setFileExt] = useState<string>("");
  const [fieldsFound, setFieldsFound] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [parsedFieldNames, setParsedFieldNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Clipboard / Paste state ──
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus when paste area opens
  useEffect(() => {
    if (showPasteArea && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [showPasteArea]);

  // Validate file
  const isValidFile = (file: File): boolean => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (ACCEPTED_TYPES.includes(ext)) return true;
    if (ACCEPTED_MIME_TYPES.includes(file.type)) return true;
    return false;
  };

  // ═══════════════════════════════════════════════════════════════
  // Handle parsed response (shared between file upload and paste)
  // ═══════════════════════════════════════════════════════════════
  const handleParsedResponse = useCallback(
    (result: { data: ParsedVesselData; fieldsFound?: number }, source: string) => {
      const data = result.data as ParsedVesselData;
      const count = result.fieldsFound || Object.keys(data).length;

      const fieldNames = Object.keys(data).map((k) => FIELD_LABELS[k] || k);
      setParsedFieldNames(fieldNames);
      setFieldsFound(count);
      setState("success");

      toast.success(`Extracted ${count} fields from ${source}`, {
        description: "Review the auto-filled fields below",
      });

      onFieldsParsed(data, count);
    },
    [onFieldsParsed]
  );

  // ═══════════════════════════════════════════════════════════════
  // FILE UPLOAD
  // ═══════════════════════════════════════════════════════════════
  const handleFile = useCallback(
    async (file: File) => {
      if (!isValidFile(file)) {
        setState("error");
        setErrorMessage(
          `Unsupported file type. Please upload: ${ACCEPTED_TYPES.join(", ")}`
        );
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setState("error");
        setErrorMessage("File is too large. Maximum size is 10MB.");
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      setFileName(file.name);
      setFileExt(ext);
      setState("uploading");
      setErrorMessage("");
      setShowPasteArea(false);

      try {
        const formData = new FormData();
        formData.append("file", file);

        setState("parsing");

        const response = await fetch("/api/vessels/parse-profile", {
          method: "POST",
          body: formData,
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Server returned an invalid response");
        }

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to parse vessel profile");
        }

        handleParsedResponse(result, file.name);
      } catch (err) {
        console.error("[VesselProfileUploader] Error:", err);
        setState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to parse file"
        );
        toast.error("Failed to parse vessel profile");
      }
    },
    [handleParsedResponse]
  );

  // ═══════════════════════════════════════════════════════════════
  // CLIPBOARD PASTE PARSE
  // ═══════════════════════════════════════════════════════════════
  const handleParseText = useCallback(
    async (text: string) => {
      if (!text || text.trim().length < 10) {
        toast.error("Please paste more text — AI needs enough content to extract vessel details.");
        return;
      }

      setIsParsing(true);
      setState("parsing");
      setFileName("Pasted text");
      setFileExt("txt");
      setErrorMessage("");

      try {
        const response = await fetch("/api/vessels/parse-profile", {
          method: "POST",
          body: (() => {
            // Create a text blob and send as FormData (reuses the same API)
            const blob = new Blob([text], { type: "text/plain" });
            const fd = new FormData();
            fd.append("file", blob, "pasted-vessel-data.txt");
            return fd;
          })(),
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Server returned an invalid response");
        }

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to parse vessel data");
        }

        handleParsedResponse(result, "pasted text");
        setPasteText("");
        setShowPasteArea(false);
      } catch (err) {
        console.error("[VesselProfileUploader] Paste parse error:", err);
        setState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to parse pasted text"
        );
        toast.error("Failed to parse pasted vessel data");
      } finally {
        setIsParsing(false);
      }
    },
    [handleParsedResponse]
  );

  // ═══════════════════════════════════════════════════════════════
  // EXPOSE parseText TO PARENT VIA REF
  // ═══════════════════════════════════════════════════════════════
  useImperativeHandle(ref, () => ({
    parseText: (text: string) => handleParseText(text),
  }), [handleParseText]);

  // ═══════════════════════════════════════════════════════════════
  // DRAG & DROP
  // ═══════════════════════════════════════════════════════════════
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => (prev === "success" || prev === "parsing" || prev === "uploading" ? prev : "dragging"));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => (prev === "dragging" ? "idle" : prev));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so same file can be re-uploaded
      e.target.value = "";
    },
    [handleFile]
  );

  const reset = () => {
    setState("idle");
    setFileName("");
    setFileExt("");
    setFieldsFound(0);
    setErrorMessage("");
    setParsedFieldNames([]);
    setPasteText("");
    setShowPasteArea(false);
  };

  const fileInfo = FILE_TYPE_ICONS[fileExt] || { icon: "📎", color: "text-muted-foreground" };

  return (
    <div className="relative space-y-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleInputChange}
        className="hidden"
        id="vessel-profile-upload"
      />

      {/* ── IDLE / DRAGGING STATE ── */}
      {(state === "idle" || state === "dragging") && (
        <>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative cursor-pointer group
              rounded-xl border-2 border-dashed transition-all duration-300 ease-out
              ${
                state === "dragging"
                  ? "border-primary bg-primary/5 scale-[1.01] shadow-lg shadow-primary/10"
                  : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
              }
            `}
          >
            <div className="flex items-center gap-4 px-5 py-4">
              {/* Icon */}
              <div
                className={`
                  flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300
                  ${
                    state === "dragging"
                      ? "bg-primary/15 text-primary scale-110"
                      : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                  }
                `}
              >
                {state === "dragging" ? (
                  <Sparkles className="h-5 w-5 animate-pulse" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {state === "dragging" ? (
                    <span className="text-primary">Drop your vessel profile here</span>
                  ) : (
                    <>
                      <span className="text-primary">Upload vessel profile</span>
                      <span className="text-muted-foreground"> — drag & drop or click to browse</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  PDF, CSV, Excel, Word, or Email • AI will auto-fill the form fields below
                </p>
              </div>

              {/* File type badges */}
              <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                {["PDF", "XLSX", "DOCX", "CSV", "EML"].map((type) => (
                  <span
                    key={type}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── PASTE / CLIPBOARD toggle ── */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPasteArea(!showPasteArea);
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs group transition-all duration-200 hover:bg-muted/40"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">
              Or paste vessel specifications directly
            </span>
            <span className="text-[10px] text-muted-foreground/60 ml-1">
              emails, spec sheets, Q88 data
            </span>
            {showPasteArea ? (
              <ChevronUp className="h-3 w-3 ml-auto text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
            )}
          </button>

          {/* ── PASTE AREA (expanded) ── */}
          {showPasteArea && (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden animate-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary/70" />
                  <p className="text-xs font-medium">Paste Vessel Data</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium ml-auto">
                    AI-Powered
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Paste email content, vessel spec sheets, Q88 questionnaire data, or any text containing vessel details
                </p>
              </div>
              <div className="p-3">
                <textarea
                  id="vessel-paste-textarea"
                  ref={textAreaRef}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  onPaste={(e) => {
                    // Allow default paste behavior — React handles it via onChange
                    // But detect large paste and auto-parse after brief delay
                    const pasted = e.clipboardData.getData("text");
                    if (pasted && pasted.trim().length >= 30) {
                      setTimeout(() => {
                        handleParseText(pasted);
                      }, 100);
                    }
                  }}
                  placeholder={`Paste vessel data here...\n\nExamples:\n• Copy/paste an email with vessel specs\n• Q88 vessel questionnaire response\n• Vessel specification sheet content\n• Any text with vessel name, DWT, speed, consumption, dimensions etc.`}
                  className="w-full h-36 resize-none rounded-lg border border-border/50 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  disabled={isParsing}
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[10px] text-muted-foreground">
                    {pasteText.length > 0 ? (
                      <>{pasteText.length.toLocaleString()} characters</>
                    ) : (
                      <>Tip: Paste content and the AI will auto-detect and extract vessel details</>
                    )}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleParseText(pasteText)}
                    disabled={isParsing || pasteText.trim().length < 10}
                    className="h-8 text-xs gap-1.5"
                  >
                    {isParsing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {isParsing ? "Parsing..." : "Parse with AI"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── UPLOADING / PARSING STATE ── */}
      {(state === "uploading" || state === "parsing") && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
          <div className="flex items-center gap-4">
            {/* Animated icon */}
            <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
              <div className="relative">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-3 w-3 text-primary/60 animate-pulse" />
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{fileInfo.icon}</span>
                <p className="text-sm font-medium truncate">{fileName}</p>
              </div>
              <p className="text-xs text-primary mt-1 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {state === "uploading"
                  ? "Uploading document..."
                  : "AI is analyzing vessel specifications..."}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1 rounded-full bg-primary/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-1000 ease-out"
              style={{
                width: state === "uploading" ? "30%" : "75%",
                animation: "pulse 2s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      )}

      {/* ── SUCCESS STATE ── */}
      {state === "success" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
          <div className="flex items-center gap-4">
            {/* Success icon */}
            <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{fileInfo.icon}</span>
                <p className="text-sm font-medium truncate">{fileName}</p>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                  {fieldsFound} fields extracted
                </span>
              </div>
              {parsedFieldNames.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {parsedFieldNames.slice(0, 8).join(", ")}
                  {parsedFieldNames.length > 8 && ` +${parsedFieldNames.length - 8} more`}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                Re-upload
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={reset}
                className="h-8 w-8 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR STATE ── */}
      {state === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
          <div className="flex items-center gap-4">
            {/* Error icon */}
            <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">
                Failed to parse vessel profile
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{errorMessage}</p>
            </div>

            {/* Retry */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                Try Again
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={reset}
                className="h-8 w-8 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════
// FIELD LABEL MAP (for display in success state)
// ═══════════════════════════════════════════════════════════════════

const FIELD_LABELS: Record<string, string> = {
  name: "Vessel Name",
  imoNumber: "IMO Number",
  mmsiNumber: "MMSI Number",
  vesselType: "Vessel Type",
  customVesselType: "Custom Type",
  dwt: "DWT",
  loa: "LOA",
  beam: "Beam",
  summerDraft: "Draft",
  grossTonnage: "GT",
  netTonnage: "NT",
  yearBuilt: "Year Built",
  flagState: "Flag State",
  classificationSociety: "Class Society",
  iceClass: "Ice Class",
  vesselConstant: "Vessel Constant",
  ladenSpeed: "Laden Speed",
  ballastSpeed: "Ballast Speed",
  ecoLadenSpeed: "Eco Laden Speed",
  ecoBallastSpeed: "Eco Ballast Speed",
  ecoLadenConsumption: "Eco Laden Consumption",
  ecoBallastConsumption: "Eco Ballast Consumption",
  portConsumptionWithCrane: "Port w/ Crane",
  portConsumptionWithoutCrane: "Port w/o Crane",
  hasScrubber: "Scrubber",
  grainCapacity: "Grain Capacity",
  baleCapacity: "Bale Capacity",
  numberOfHolds: "No. of Holds",
  numberOfHatches: "No. of Hatches",
  grabFitted: "Grab Fitted",
  craneCount: "Cranes",
  craneSWL: "Crane SWL",
  hasTweenDecks: "Tween Decks",
  tankCapacity: "Tank Capacity",
  numberOfTanks: "No. of Tanks",
  coatedTanks: "Coated Tanks",
  heatingCoils: "Heating Coils",
  pumpingRate: "Pumping Rate",
  hasIGS: "IGS",
  hasCOW: "COW",
  hasSBT: "SBT",
  teuCapacity: "TEU Capacity",
  feuCapacity: "FEU Capacity",
  reeferPlugs: "Reefer Plugs",
  cargoTankCapacityCbm: "Cargo Tank CBM",
  containmentType: "Containment Type",
  boilOffRate: "Boil-Off Rate",
  dualFuelEngine: "Dual Fuel Engine",
  heelQuantity: "Heel Quantity",
  fuelConsumptions: "Fuel Profiles",
};
