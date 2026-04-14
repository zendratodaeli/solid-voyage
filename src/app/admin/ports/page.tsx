"use client";

/**
 * Super Admin — Port Database Manager
 *
 * Manage the NGA World Port Index database:
 * - View/search/filter all 3,700+ ports
 * - Sync from NGA WPI (Pub 150) with one click
 * - AI-powered bulk import from any document (PDF, Excel, CSV, Email, Text)
 * - Paste port data directly for AI extraction
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useSuperAdminGuard } from "@/hooks/useSuperAdminGuard";
import { toast } from "sonner";
import {
  Anchor,
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Globe,
  Filter,
  Upload,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Mail,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface Port {
  id: string;
  name: string;
  locode: string;
  country: string;
  region: string | null;
  latitude: number;
  longitude: number;
  harborSize: string;
  waterBody: string | null;
  alternateName: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  portNumber: number | null;
}

interface ParsedPort {
  name: string;
  locode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  harborSize?: string;
  waterBody?: string;
  alternateName?: string;
  region?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const HARBOR_SIZES = [
  { value: "", label: "All Sizes" },
  { value: "L", label: "Large" },
  { value: "M", label: "Medium" },
  { value: "S", label: "Small" },
  { value: "V", label: "Very Small" },
];

const HARBOR_BADGE: Record<string, string> = {
  L: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  M: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  S: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  V: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const ACCEPTED_TYPES = [".pdf", ".csv", ".xlsx", ".xls", ".doc", ".docx", ".txt", ".eml", ".msg"];

type UploadState = "idle" | "dragging" | "parsing" | "preview" | "importing" | "success" | "error";

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function PortDatabasePage() {
  const { isSuperAdmin, loading: guardLoading } = useSuperAdminGuard();
  const [ports, setPorts] = useState<Port[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [harborSize, setHarborSize] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  // AI Parser State
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsedPorts, setParsedPorts] = useState<ParsedPort[]>([]);
  const [parseFileName, setParseFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // ── Fetch ports ──
  const fetchPorts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (harborSize) params.set("harborSize", harborSize);
      if (country) params.set("country", country);
      params.set("page", page.toString());
      params.set("limit", limit.toString());

      const res = await fetch(`/api/admin/ports?${params}`);
      const data = await res.json();
      setPorts(data.ports || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch ports:", err);
    } finally {
      setLoading(false);
    }
  }, [search, harborSize, country, page]);

  useEffect(() => {
    if (isSuperAdmin) fetchPorts();
  }, [isSuperAdmin, fetchPorts]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Auto-focus paste area
  useEffect(() => {
    if (showPasteArea && textAreaRef.current) textAreaRef.current.focus();
  }, [showPasteArea]);

  // ── NGA Sync ──
  const handleSync = async () => {
    if (!confirm("Sync all ports from NGA World Port Index? This may take 1-2 minutes.")) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/ports/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncResult(`✓ Synced ${data.upserted} ports (${data.skipped} skipped). Total: ${data.total}`);
        fetchPorts();
      } else {
        setSyncResult(`✗ Sync failed: ${data.error}`);
      }
    } catch (err) {
      setSyncResult(`✗ Sync error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setSyncing(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // AI FILE UPLOAD
  // ═══════════════════════════════════════════════════════════════

  const handleFile = useCallback(async (file: File) => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      setUploadState("error");
      setParseError(`Unsupported file type. Please upload: ${ACCEPTED_TYPES.join(", ")}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadState("error");
      setParseError("File too large. Maximum size is 10MB.");
      return;
    }

    setUploadState("parsing");
    setParseFileName(file.name);
    setParseError("");
    setShowPasteArea(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/ports/parse", { method: "POST", body: formData });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Failed to parse port data");

      const ports = result.ports || [];
      if (ports.length === 0) throw new Error("No ports found in the document.");

      setParsedPorts(ports);
      setUploadState("preview");
      toast.success(`Extracted ${ports.length} ports from ${file.name}`);
    } catch (err) {
      setUploadState("error");
      setParseError(err instanceof Error ? err.message : "Failed to parse file");
      toast.error("Failed to parse port document");
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // AI TEXT PASTE
  // ═══════════════════════════════════════════════════════════════

  const handleParseText = useCallback(async (text: string) => {
    if (!text || text.trim().length < 10) {
      toast.error("Please paste more text — AI needs enough content to extract port details.");
      return;
    }

    setUploadState("parsing");
    setParseFileName("Pasted text");
    setParseError("");

    try {
      const blob = new Blob([text], { type: "text/plain" });
      const fd = new FormData();
      fd.append("file", blob, "pasted-port-data.txt");

      const res = await fetch("/api/admin/ports/parse", { method: "POST", body: fd });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Failed to parse port data");

      const ports = result.ports || [];
      if (ports.length === 0) throw new Error("No ports found in the pasted text.");

      setParsedPorts(ports);
      setUploadState("preview");
      setPasteText("");
      setShowPasteArea(false);
      toast.success(`Extracted ${ports.length} ports from pasted text`);
    } catch (err) {
      setUploadState("error");
      setParseError(err instanceof Error ? err.message : "Failed to parse pasted text");
      toast.error("Failed to parse port data");
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // IMPORT PARSED PORTS
  // ═══════════════════════════════════════════════════════════════

  const handleImport = useCallback(async () => {
    if (parsedPorts.length === 0) return;

    setUploadState("importing");
    try {
      const res = await fetch("/api/admin/ports/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ports: parsedPorts }),
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Import failed");

      setUploadState("success");
      toast.success(`Imported ${result.imported} ports (${result.skipped} skipped). Total: ${result.total}`);
      fetchPorts();
    } catch (err) {
      setUploadState("error");
      setParseError(err instanceof Error ? err.message : "Import failed");
      toast.error("Failed to import ports");
    }
  }, [parsedPorts, fetchPorts]);

  // ── Drag & Drop ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState(prev => (prev === "preview" || prev === "parsing" || prev === "importing" ? prev : "dragging"));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState(prev => (prev === "dragging" ? "idle" : prev));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const resetUpload = () => {
    setUploadState("idle");
    setParsedPorts([]);
    setParseFileName("");
    setParseError("");
    setPasteText("");
    setShowPasteArea(false);
  };

  const totalPages = Math.ceil(total / limit);

  if (guardLoading || !isSuperAdmin) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Anchor className="h-8 w-8 text-teal-500" />
            Port Database
          </h1>
          <p className="text-muted-foreground mt-2">
            NGA World Port Index (Pub 150) — {total.toLocaleString()} ports worldwide.
            Sync periodically from the U.S. government database.
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
          variant="outline"
        >
          {syncing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Sync from NGA
            </>
          )}
        </Button>
      </div>

      {/* ── Sync Result ── */}
      {syncResult && (
        <div className={`p-4 rounded-lg border ${
          syncResult.startsWith("✓")
            ? "bg-green-500/10 border-green-500/30 text-green-400"
            : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {syncResult}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* AI PORT PARSER                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Port Import
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium ml-1">
              AI-Powered
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
            className="hidden"
          />

          {/* ── IDLE / DRAGGING ── */}
          {(uploadState === "idle" || uploadState === "dragging") && (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative cursor-pointer group rounded-xl border-2 border-dashed transition-all duration-300 ease-out
                  ${uploadState === "dragging"
                    ? "border-primary bg-primary/5 scale-[1.01] shadow-lg shadow-primary/10"
                    : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
                  }
                `}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ${
                    uploadState === "dragging"
                      ? "bg-primary/15 text-primary scale-110"
                      : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                  }`}>
                    {uploadState === "dragging" ? (
                      <Sparkles className="h-5 w-5 animate-pulse" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {uploadState === "dragging" ? (
                        <span className="text-primary">Drop your port data here</span>
                      ) : (
                        <>
                          <span className="text-primary">Upload port data</span>
                          <span className="text-muted-foreground"> — drag & drop or click to browse</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      PDF, CSV, Excel, Word, or Email • AI will extract and preview ports before importing
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    {["PDF", "XLSX", "CSV", "DOCX", "EML"].map(type => (
                      <span key={type} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Paste toggle */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowPasteArea(!showPasteArea); }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs group transition-all duration-200 hover:bg-muted/40"
              >
                <ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                  Or paste port data directly
                </span>
                <span className="text-[10px] text-muted-foreground/60 ml-1">
                  port lists, coordinates, schedules
                </span>
                {showPasteArea ? (
                  <ChevronUp className="h-3 w-3 ml-auto text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
                )}
              </button>

              {/* Paste area */}
              {showPasteArea && (
                <div className="rounded-xl border border-border/60 bg-card overflow-hidden animate-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary/70" />
                      <p className="text-xs font-medium">Paste Port Data</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium ml-auto">
                        AI-Powered
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Paste port lists, berth schedules, coordinates, or any text containing port information
                    </p>
                  </div>
                  <div className="p-3">
                    <textarea
                      ref={textAreaRef}
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      onPaste={e => {
                        const pasted = e.clipboardData.getData("text");
                        if (pasted && pasted.trim().length >= 30) {
                          setTimeout(() => handleParseText(pasted), 100);
                        }
                      }}
                      placeholder={`Paste port data here...\n\nExamples:\n• Port name, country, and coordinates\n• NGA port list extract\n• Berth schedule with port names\n• Any text with port locations`}
                      className="w-full h-36 resize-none rounded-lg border border-border/50 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-muted-foreground">
                        {pasteText.length > 0 ? (
                          <>{pasteText.length.toLocaleString()} characters</>
                        ) : (
                          <>Tip: Paste content and AI will auto-detect port data</>
                        )}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleParseText(pasteText)}
                        disabled={pasteText.trim().length < 10}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Parse with AI
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── PARSING STATE ── */}
          {uploadState === "parsing" && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                  <div className="relative">
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-primary/60 animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{parseFileName}</p>
                  <p className="text-xs text-primary mt-1 flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    AI is analyzing port data...
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1 rounded-full bg-primary/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: "65%", animation: "pulse 2s ease-in-out infinite" }} />
              </div>
            </div>
          )}

          {/* ── PREVIEW STATE — Show extracted ports before importing ── */}
          {uploadState === "preview" && parsedPorts.length > 0 && (
            <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40 bg-primary/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">
                    {parsedPorts.length} ports extracted from {parseFileName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={handleImport} className="h-8 text-xs gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Import {parsedPorts.length} Ports
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={resetUpload} className="h-8 w-8 text-muted-foreground">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/20">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Port Name</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">LOCODE</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Country</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Region</th>
                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">Size</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Lat / Lon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedPorts.map((p, i) => (
                      <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="py-2 px-3 font-medium">{p.name}</td>
                        <td className="py-2 px-3">
                          {p.locode ? (
                            <code className="px-1 py-0.5 rounded bg-muted/50 font-mono text-[10px]">{p.locode}</code>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{p.country || "—"}</td>
                        <td className="py-2 px-3 text-muted-foreground">{p.region?.replace(/_/g, " ") || "—"}</td>
                        <td className="py-2 px-3 text-center">
                          {p.harborSize && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${HARBOR_BADGE[p.harborSize] || HARBOR_BADGE.M}`}>
                              {p.harborSize}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                          {typeof p.latitude === "number" && typeof p.longitude === "number"
                            ? `${p.latitude.toFixed(4)}°, ${p.longitude.toFixed(4)}°`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── IMPORTING STATE ── */}
          {uploadState === "importing" && (
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-teal-500/10">
                  <Loader2 className="h-5 w-5 text-teal-500 animate-spin" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Importing {parsedPorts.length} ports to database...</p>
                  <p className="text-xs text-teal-500 mt-1">Upserting ports by LOCODE</p>
                </div>
              </div>
            </div>
          )}

          {/* ── SUCCESS STATE ── */}
          {uploadState === "success" && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Ports imported successfully</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {parsedPorts.length} ports processed from {parseFileName}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="text-xs gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Import More
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={resetUpload} className="h-8 w-8 text-muted-foreground">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── ERROR STATE ── */}
          {uploadState === "error" && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Failed to process port data</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{parseError}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="text-xs">
                    Try Again
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={resetUpload} className="h-8 w-8 text-muted-foreground">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Filters ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, locode, or alternate name..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={harborSize}
              onChange={e => { setHarborSize(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-md border border-input bg-background text-sm min-w-[130px]"
            >
              {HARBOR_SIZES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <Input
              placeholder="Country filter..."
              value={country}
              onChange={e => { setCountry(e.target.value); setPage(1); }}
              className="max-w-[180px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Port Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Port Name</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">LOCODE</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Country</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Region</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">Size</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Coordinates</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Water Body</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="py-3 px-4">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : ports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No ports found. {total === 0 && "Click \"Sync from NGA\" to populate the database."}
                    </td>
                  </tr>
                ) : (
                  ports.map(port => (
                    <tr key={port.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium">{port.name}</div>
                        {port.alternateName && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                            {port.alternateName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <code className="text-xs px-1.5 py-0.5 rounded bg-muted/50 font-mono">
                          {port.locode}
                        </code>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{port.country}</td>
                      <td className="py-3 px-4">
                        {port.region ? (
                          <span className="text-xs text-muted-foreground">
                            {port.region.replace(/_/g, " ")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded border ${HARBOR_BADGE[port.harborSize] || HARBOR_BADGE.V}`}>
                          {port.harborSize}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-xs font-mono text-muted-foreground">
                          {port.latitude.toFixed(4)}°, {port.longitude.toFixed(4)}°
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-muted-foreground truncate max-w-[150px] block">
                          {port.waterBody || "—"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between py-4 px-4 border-t border-border/50">
              <span className="text-sm text-muted-foreground">
                Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()} ports
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
