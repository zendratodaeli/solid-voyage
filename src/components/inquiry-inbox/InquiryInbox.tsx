"use client";

/**
 * InquiryInbox — Email triage interface for the Inquiry Pipeline
 *
 * Split-panel layout:
 * - Left: Email list with filters and category tags
 * - Right: Email detail view with AI parsing and "Create Inquiry" flow
 */

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  Mail,
  MailOpen,
  Search,
  Filter,
  Sparkles,
  Package,
  FileText,
  TrendingUp,
  X,
  Loader2,
  Archive,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Inbox,
  Ship,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getInboundEmails,
  getInboxStats,
  parseInboundEmail,
  dismissEmail,
  markEmailConverted,
  type InboundEmailItem,
  type InboxStats,
} from "@/actions/inbound-email-actions";
import { VoyageForm } from "@/components/voyages/VoyageForm";

// ═══════════════════════════════════════════════════════════════════
// CATEGORY CONFIG
// ═══════════════════════════════════════════════════════════════════

const CATEGORY_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  CARGO_OFFER: {
    label: "Cargo Offer",
    icon: Package,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  FIXTURE_RECAP: {
    label: "Fixture Recap",
    icon: FileText,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  MARKET_UPDATE: {
    label: "Market Update",
    icon: TrendingUp,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  OTHER: {
    label: "Other",
    icon: Mail,
    color: "text-gray-400",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
  },
  UNCLASSIFIED: {
    label: "Unclassified",
    icon: Mail,
    color: "text-gray-400",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
  },
};

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
}> = {
  NEW: { label: "New", color: "text-blue-400" },
  PROCESSING: { label: "Processing", color: "text-amber-400" },
  CONVERTED: { label: "Converted", color: "text-emerald-400" },
  DISMISSED: { label: "Dismissed", color: "text-gray-400" },
  ARCHIVED: { label: "Archived", color: "text-gray-500" },
};

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

interface InquiryInboxProps {
  orgSlug: string;
  vessels: any[];
}

export function InquiryInbox({ orgSlug, vessels }: InquiryInboxProps) {
  const [emails, setEmails] = useState<InboundEmailItem[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<InboundEmailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [showVoyageForm, setShowVoyageForm] = useState(false);
  const [parsedPrefill, setParsedPrefill] = useState<Record<string, unknown> | null>(null);

  // ─── Data loading ───────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const [emailsRes, statsRes] = await Promise.all([
      getInboundEmails({
        category: filterCategory || undefined,
        status: filterStatus || undefined,
        search: search || undefined,
      }),
      getInboxStats(),
    ]);
    if (emailsRes.success && emailsRes.data) setEmails(emailsRes.data);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    setLoading(false);
  }, [filterCategory, filterStatus, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ─── Actions ────────────────────────────────────────────────
  const handleParse = async (email: InboundEmailItem) => {
    setIsParsing(true);
    const res = await parseInboundEmail(email.id);
    if (res.success && res.data) {
      setParsedPrefill(res.data);
      toast.success("Email parsed successfully!");
      // Refresh the email to get updated parsedData
      loadData();
      // Update the selected email locally
      setSelectedEmail((prev) =>
        prev ? { ...prev, parsedData: res.data as any, status: "PROCESSING" } : prev
      );
    } else {
      toast.error(res.error || "Failed to parse email");
    }
    setIsParsing(false);
  };

  const handleDismiss = async (email: InboundEmailItem) => {
    startTransition(async () => {
      const res = await dismissEmail(email.id);
      if (res.success) {
        toast.success("Email dismissed");
        setSelectedEmail(null);
        loadData();
      } else {
        toast.error(res.error || "Failed to dismiss");
      }
    });
  };

  const handleCreateInquiry = (email: InboundEmailItem) => {
    setShowVoyageForm(true);
  };

  const handleInquirySaved = async () => {
    // Mark the selected email as converted
    if (selectedEmail) {
      // We don't have the inquiryId yet, but we mark it as converted
      await markEmailConverted(selectedEmail.id, "");
    }
    setShowVoyageForm(false);
    setParsedPrefill(null);
    toast.success("Inquiry created from email!");
    loadData();
  };

  // ─── Extract sender name ───────────────────────────────────
  const extractSenderName = (from: string) => {
    const match = from.match(/^"?([^"<]+)"?\s*</);
    return match ? match[1].trim() : from.split("@")[0];
  };

  const extractSenderEmail = (from: string) => {
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from;
  };

  // ─── Time formatting ───────────────────────────────────────
  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Inbox className="h-5 w-5 text-violet-400" />
            </span>
            Inquiry Inbox
            {stats && stats.unread > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-violet-500 text-white text-xs font-bold">
                {stats.unread}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inbound cargo offers — AI-classified and ready for conversion
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ═══ Stats Bar ═══ */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Unread", value: stats.unread, color: "text-blue-400" },
            { label: "Cargo Offers", value: stats.cargoOffers, color: "text-emerald-400" },
            { label: "Converted", value: stats.converted, color: "text-purple-400" },
            { label: "Dismissed", value: stats.dismissed, color: "text-gray-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-card/50 p-3 text-center"
            >
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Category filter buttons */}
        <div className="flex gap-1.5">
          <Button
            variant={filterCategory === null ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setFilterCategory(null)}
          >
            All
          </Button>
          {Object.entries(CATEGORY_CONFIG)
            .filter(([key]) => key !== "UNCLASSIFIED")
            .map(([key, config]) => (
              <Button
                key={key}
                variant={filterCategory === key ? "secondary" : "ghost"}
                size="sm"
                className={`h-8 text-xs gap-1.5 ${filterCategory === key ? config.color : ""}`}
                onClick={() => setFilterCategory(filterCategory === key ? null : key)}
              >
                <config.icon className="h-3 w-3" />
                {config.label}
              </Button>
            ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 border-l border-border pl-3">
          {(["NEW", "PROCESSING", "CONVERTED", "DISMISSED"] as const).map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFilterStatus(filterStatus === status ? null : status)}
            >
              {STATUS_CONFIG[status]?.label || status}
            </Button>
          ))}
        </div>
      </div>

      {/* ═══ Split Panel ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-0 rounded-xl border border-border overflow-hidden bg-card min-h-[600px]">
        {/* ─── Email List (Left) ─── */}
        <div className="border-r border-border overflow-y-auto max-h-[calc(100vh-280px)]">
          {loading && emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-3" />
              <span className="text-sm">Loading emails...</span>
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="h-16 w-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Mail className="h-8 w-8 text-violet-400/60" />
              </div>
              <h3 className="text-sm font-semibold mb-1">No emails yet</h3>
              <p className="text-xs text-muted-foreground max-w-[240px]">
                Forward cargo emails to your inbound address and they&apos;ll appear here automatically
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {emails.map((email) => {
                const cat = CATEGORY_CONFIG[email.category] || CATEGORY_CONFIG.OTHER;
                const isSelected = selectedEmail?.id === email.id;
                const isNew = email.status === "NEW";

                return (
                  <button
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/50 ${
                      isSelected ? "bg-violet-500/10 border-l-2 border-l-violet-500" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Unread dot */}
                      <div className="mt-1.5 shrink-0">
                        {isNew ? (
                          <div className="h-2 w-2 rounded-full bg-violet-500" />
                        ) : (
                          <div className="h-2 w-2" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Sender + time */}
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`text-sm truncate ${isNew ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                            {extractSenderName(email.from)}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatRelativeTime(email.receivedAt)}
                          </span>
                        </div>
                        {/* Subject */}
                        <p className={`text-xs truncate mb-1 ${isNew ? "text-foreground" : "text-muted-foreground"}`}>
                          {email.subject}
                        </p>
                        {/* Category tag + status */}
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${cat.color} ${cat.bgColor} ${cat.borderColor}`}>
                            <cat.icon className="h-2.5 w-2.5" />
                            {cat.label}
                          </span>
                          {email.confidence && email.confidence > 0 && (
                            <span className="text-[9px] text-muted-foreground">
                              {(email.confidence * 100).toFixed(0)}% conf.
                            </span>
                          )}
                          {email.status === "CONVERTED" && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Converted
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Email Detail (Right) ─── */}
        <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
          {selectedEmail ? (
            <EmailDetailView
              email={selectedEmail}
              onParse={handleParse}
              onDismiss={handleDismiss}
              onCreateInquiry={handleCreateInquiry}
              isParsing={isParsing}
              isPending={isPending}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
              <div className="h-20 w-20 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                <MailOpen className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Select an email</h3>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                Choose an email from the list to view its contents, run AI parsing, and create a cargo inquiry
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ VoyageForm Slide-over (Create Inquiry from Email) ═══ */}
      {showVoyageForm && selectedEmail && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowVoyageForm(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-lg font-semibold">Create Inquiry from Email</h2>
                <p className="text-xs text-muted-foreground">
                  From: {extractSenderName(selectedEmail.from)} — {selectedEmail.subject}
                </p>
              </div>
              <button
                onClick={() => setShowVoyageForm(false)}
                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <VoyageForm
                vessels={vessels}
                mode="inquiry"
                onInquirySaved={handleInquirySaved}
                onClose={() => setShowVoyageForm(false)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EMAIL DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════

function EmailDetailView({
  email,
  onParse,
  onDismiss,
  onCreateInquiry,
  isParsing,
  isPending,
}: {
  email: InboundEmailItem;
  onParse: (email: InboundEmailItem) => void;
  onDismiss: (email: InboundEmailItem) => void;
  onCreateInquiry: (email: InboundEmailItem) => void;
  isParsing: boolean;
  isPending: boolean;
}) {
  const cat = CATEGORY_CONFIG[email.category] || CATEGORY_CONFIG.OTHER;

  // Extract sender details
  const senderMatch = email.from.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  const senderName = senderMatch ? senderMatch[1].trim() : email.from.split("@")[0];
  const senderEmail = senderMatch ? senderMatch[2] : email.from;

  const parsed = email.parsedData as Record<string, unknown> | null;

  return (
    <div className="p-6 space-y-6">
      {/* ─── Header ─── */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold leading-tight">{email.subject}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{senderName}</span>
              <span>&lt;{senderEmail}&gt;</span>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${cat.color} ${cat.bgColor} ${cat.borderColor}`}>
            <cat.icon className="h-3 w-3" />
            {cat.label}
            {email.confidence && (
              <span className="opacity-60">
                {(email.confidence * 100).toFixed(0)}%
              </span>
            )}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(email.receivedAt).toLocaleString()}
          </span>
          <span>To: {email.to.join(", ")}</span>
          {email.cc.length > 0 && <span>CC: {email.cc.join(", ")}</span>}
        </div>
      </div>

      {/* ─── Action Buttons ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        {email.category === "CARGO_OFFER" && email.status !== "CONVERTED" && (
          <>
            {!parsed ? (
              <Button
                size="sm"
                className="gap-2 bg-violet-600 hover:bg-violet-700"
                onClick={() => onParse(email)}
                disabled={isParsing}
              >
                {isParsing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isParsing ? "Parsing..." : "AI Parse Email"}
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onCreateInquiry(email)}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Create Inquiry
              </Button>
            )}
          </>
        )}
        {email.status !== "CONVERTED" && email.status !== "DISMISSED" && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => onDismiss(email)}
            disabled={isPending}
          >
            <XCircle className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        )}
        {email.status === "CONVERTED" && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Converted to Inquiry</span>
          </div>
        )}
      </div>

      {/* ─── AI Parsed Data Preview ─── */}
      {parsed && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-violet-400">
            <Sparkles className="h-4 w-4" />
            AI-Extracted Data
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {Boolean(parsed.loadPort) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Load Port</div>
                <div className="font-medium">{String(parsed.loadPort)}</div>
              </div>
            )}
            {Boolean(parsed.dischargePort) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Discharge Port</div>
                <div className="font-medium">{String(parsed.dischargePort)}</div>
              </div>
            )}
            {Boolean(parsed.cargoType) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Cargo Type</div>
                <div className="font-medium">{String(parsed.cargoType)}</div>
              </div>
            )}
            {Boolean(parsed.cargoQuantity) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Cargo Qty (MT)</div>
                <div className="font-medium">{Number(parsed.cargoQuantity).toLocaleString()}</div>
              </div>
            )}
            {Boolean(parsed.freightRate) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Freight Rate</div>
                <div className="font-medium">${Number(parsed.freightRate).toFixed(2)}/MT</div>
              </div>
            )}
            {Boolean(parsed.laycanStart) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Laycan</div>
                <div className="font-medium">
                  {String(parsed.laycanStart)}{parsed.laycanEnd ? ` — ${String(parsed.laycanEnd)}` : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Email Body ─── */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs text-muted-foreground font-medium">
          Email Content
        </div>
        <div className="p-4 max-h-[500px] overflow-y-auto">
          {email.htmlBody ? (
            <div
              className="prose prose-sm prose-invert max-w-none text-sm [&_a]:text-violet-400 [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted/30"
              dangerouslySetInnerHTML={{ __html: email.htmlBody }}
            />
          ) : email.textBody ? (
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {email.textBody}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">No email content available</p>
          )}
        </div>
      </div>
    </div>
  );
}
