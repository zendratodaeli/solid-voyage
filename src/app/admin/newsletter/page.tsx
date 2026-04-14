"use client";

/**
 * Super Admin — Newsletter Management
 * 
 * Features:
 * - Subscriber CRUD: add, edit (email/name), delete
 * - Stats cards (total/active/pending/unsubscribed)
 * - Email template designer with presets
 * - Optimistic newsletter sending
 * - Double opt-in awareness (confirmed vs pending)
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSuperAdminGuard } from "@/hooks/useSuperAdminGuard";
import {
  Newspaper,
  Send,
  Users,
  UserMinus,
  UserPlus,
  RefreshCw,
  Mail,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Pencil,
  Trash2,
  X,
  Check,
  ShieldAlert,
  Clock,
  Palette,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { cn } from "@/lib/utils";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  confirmedAt: string | null;
  source: string;
  subscribedAt: string;
  unsubscribedAt: string | null;
}

interface Stats {
  total: number;
  active: number;
  pending: number;
  unsubscribed: number;
}

// ─── Email Template Presets ─────────────────────────────
interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  headerGradient: string;
  headerTextColor: string;
  accentColor: string;
  bodyBg: string;
  bodyText: string;
  footerBg: string;
  borderColor: string;
  brandIcon: string;
}

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "maritime",
    name: "Maritime Classic",
    description: "Navy blue header, professional maritime feel",
    headerGradient: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
    headerTextColor: "#ffffff",
    accentColor: "#0ea5e9",
    bodyBg: "#ffffff",
    bodyText: "#374151",
    footerBg: "#f9fafb",
    borderColor: "#e5e7eb",
    brandIcon: "⚓",
  },
  {
    id: "modern",
    name: "Modern Gradient",
    description: "Vibrant blue-to-purple with clean layout",
    headerGradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
    headerTextColor: "#ffffff",
    accentColor: "#8b5cf6",
    bodyBg: "#ffffff",
    bodyText: "#374151",
    footerBg: "#faf5ff",
    borderColor: "#ede9fe",
    brandIcon: "🚢",
  },
  {
    id: "bold",
    name: "Bold & Dark",
    description: "Dark background with high-contrast text",
    headerGradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    headerTextColor: "#f1f5f9",
    accentColor: "#38bdf8",
    bodyBg: "#1e293b",
    bodyText: "#e2e8f0",
    footerBg: "#0f172a",
    borderColor: "#334155",
    brandIcon: "⚓",
  },
  {
    id: "minimal",
    name: "Minimal Clean",
    description: "Light and simple, focus on content",
    headerGradient: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    headerTextColor: "#0f172a",
    accentColor: "#0284c7",
    bodyBg: "#ffffff",
    bodyText: "#374151",
    footerBg: "#f8fafc",
    borderColor: "#e2e8f0",
    brandIcon: "⚓",
  },
  {
    id: "ocean",
    name: "Ocean Breeze",
    description: "Teal-to-cyan gradient, fresh and modern",
    headerGradient: "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)",
    headerTextColor: "#ffffff",
    accentColor: "#14b8a6",
    bodyBg: "#ffffff",
    bodyText: "#374151",
    footerBg: "#f0fdfa",
    borderColor: "#ccfbf1",
    brandIcon: "🌊",
  },
];

export default function NewsletterPage() {
  const { isSuperAdmin, loading: guardLoading } = useSuperAdminGuard();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, pending: 0, unsubscribed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<string>("maritime");
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // List state
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Add subscriber state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Deliverability warning
  const [usingTestDomain, setUsingTestDomain] = useState(false);

  const currentTemplate = useMemo(
    () => TEMPLATE_PRESETS.find((t) => t.id === selectedTemplate) || TEMPLATE_PRESETS[0],
    [selectedTemplate]
  );

  const fetchSubscribers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/platform/newsletter");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Access denied.");
        throw new Error("Failed to fetch subscribers");
      }
      const data = await res.json();
      setSubscribers(data.subscribers);
      setStats(data.stats);
      if (data.usingTestDomain !== undefined) {
        setUsingTestDomain(data.usingTestDomain);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchSubscribers();
  }, [isSuperAdmin, fetchSubscribers]);

  const showMsg = (msg: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccess(msg);
      setError(null);
      setTimeout(() => setSuccess(null), 5000);
    } else {
      setError(msg);
    }
  };

  // ── Add subscriber ──────────────────────────────
  const handleAddSubscriber = async () => {
    if (!addEmail.trim()) return;
    const tempEmail = addEmail.trim();
    const tempName = addName.trim() || null;
    const tempId = `temp-${Date.now()}`;

    // Optimistic: insert into list immediately
    const tempSubscriber: Subscriber = {
      id: tempId,
      email: tempEmail,
      name: tempName,
      isActive: true,
      confirmedAt: new Date().toISOString(),
      source: "admin",
      subscribedAt: new Date().toISOString(),
      unsubscribedAt: null,
    };
    setSubscribers((prev) => [tempSubscriber, ...prev]);
    setStats((prev) => ({ ...prev, total: prev.total + 1, active: prev.active + 1 }));
    setAddEmail("");
    setAddName("");
    setShowAddForm(false);
    showMsg(`${tempEmail} has been added.`, "success");

    try {
      const res = await fetch("/api/platform/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_subscriber",
          email: tempEmail,
          name: tempName || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Revert
        setSubscribers((prev) => prev.filter((s) => s.id !== tempId));
        setStats((prev) => ({ ...prev, total: prev.total - 1, active: prev.active - 1 }));
        showMsg(data.error || "Failed to add subscriber", "error");
        return;
      }

      // Replace temp with real data
      if (data.subscriber) {
        setSubscribers((prev) =>
          prev.map((s) => (s.id === tempId ? { ...data.subscriber } : s))
        );
      }
    } catch {
      // Revert
      setSubscribers((prev) => prev.filter((s) => s.id !== tempId));
      setStats((prev) => ({ ...prev, total: prev.total - 1, active: prev.active - 1 }));
      showMsg("Failed to add subscriber", "error");
    }
  };

  // ── Edit subscriber ──────────────────────────────
  const startEdit = (sub: Subscriber) => {
    setEditingId(sub.id);
    setEditEmail(sub.email);
    setEditName(sub.name || "");
    setDeletingId(null);
  };

  const handleEditSubscriber = async () => {
    if (!editingId || !editEmail.trim()) return;
    const targetId = editingId;
    const newEmail = editEmail.trim();
    const newName = editName.trim();

    // Snapshot for rollback
    const original = subscribers.find((s) => s.id === targetId);
    if (!original) return;

    // Optimistic: update local + exit edit mode
    setSubscribers((prev) =>
      prev.map((s) => (s.id === targetId ? { ...s, email: newEmail, name: newName || null } : s))
    );
    setEditingId(null);
    showMsg("Subscriber updated.", "success");

    try {
      const res = await fetch("/api/platform/newsletter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId, email: newEmail, name: newName }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Revert
        setSubscribers((prev) =>
          prev.map((s) => (s.id === targetId ? original : s))
        );
        showMsg(data.error || "Failed to update subscriber", "error");
      }
    } catch {
      // Revert
      setSubscribers((prev) =>
        prev.map((s) => (s.id === targetId ? original : s))
      );
      showMsg("Failed to update subscriber", "error");
    }
  };

  // ── Delete subscriber ──────────────────────────────
  const handleDeleteSubscriber = async (id: string) => {
    // Snapshot for rollback
    const removed = subscribers.find((s) => s.id === id);
    if (!removed) return;

    // Optimistic: remove from list + update stats
    setSubscribers((prev) => prev.filter((s) => s.id !== id));
    setStats((prev) => ({
      ...prev,
      total: prev.total - 1,
      ...(removed.isActive ? { active: prev.active - 1 } : {}),
      ...(!removed.isActive && removed.confirmedAt ? { unsubscribed: prev.unsubscribed - 1 } : {}),
      ...(!removed.confirmedAt ? { pending: prev.pending - 1 } : {}),
    }));
    setDeletingId(null);
    showMsg("Subscriber deleted.", "success");

    try {
      const res = await fetch("/api/platform/newsletter", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Revert
        setSubscribers((prev) => [...prev, removed]);
        setStats((prev) => ({
          ...prev,
          total: prev.total + 1,
          ...(removed.isActive ? { active: prev.active + 1 } : {}),
          ...(!removed.isActive && removed.confirmedAt ? { unsubscribed: prev.unsubscribed + 1 } : {}),
          ...(!removed.confirmedAt ? { pending: prev.pending + 1 } : {}),
        }));
        showMsg(data.error || "Failed to delete subscriber", "error");
      }
    } catch {
      // Revert
      setSubscribers((prev) => [...prev, removed]);
      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        ...(removed.isActive ? { active: prev.active + 1 } : {}),
        ...(!removed.isActive && removed.confirmedAt ? { unsubscribed: prev.unsubscribed + 1 } : {}),
        ...(!removed.confirmedAt ? { pending: prev.pending + 1 } : {}),
      }));
      showMsg("Failed to delete subscriber", "error");
    }
  };

  // ── Optimistic newsletter send ──────────────────
  const handleSend = async () => {
    if (!subject.trim() || !content.trim()) return;

    // Optimistic: immediately close form and show success
    const sentSubject = subject.trim();
    setSending(true);
    setShowCompose(false);
    setConfirmSend(false);
    setSuccess(`Sending "${sentSubject}" to ${stats.active} subscriber${stats.active !== 1 ? "s" : ""}...`);

    try {
      const res = await fetch("/api/platform/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: sentSubject,
          content,
          previewText: previewText.trim() || undefined,
          templateId: selectedTemplate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send newsletter");

      // Update optimistic message with real result
      setSuccess(`✓ ${data.message}`);
      setSubject("");
      setContent("");
      setPreviewText("");
      setTimeout(() => setSuccess(null), 6000);
    } catch (err) {
      setSuccess(null);
      setError(err instanceof Error ? err.message : "Failed to send newsletter");
    } finally {
      setSending(false);
    }
  };

  const filtered = subscribers.filter((s) => {
    const matchesSearch =
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = showInactive ? true : (s.isActive || !s.confirmedAt);
    return matchesSearch && matchesStatus;
  });

  if (guardLoading || !isSuperAdmin || loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Newspaper className="h-8 w-8 text-primary" />
            Newsletter
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage subscribers and send newsletters to your audience.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSubscribers} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowAddForm(!showAddForm); setShowCompose(false); }} className="gap-2">
            <UserPlus className="h-4 w-4" /> Add
          </Button>
          <Button onClick={() => { setShowCompose(!showCompose); setShowAddForm(false); }} className="gap-2" disabled={stats.active === 0}>
            <Send className="h-4 w-4" /> Compose
          </Button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">{error}</div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
          {success}
        </div>
      )}

      {/* Deliverability Warning */}
      {usingTestDomain && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-400">Emails may land in spam</p>
            <p className="text-xs text-amber-400/70 mt-1">
              You&apos;re using Resend&apos;s test domain (onboarding@resend.dev). To ensure inbox delivery,
              add and verify your own domain at{" "}
              <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-300">
                resend.com/domains
              </a>
              , then update <code className="text-amber-400 bg-amber-500/10 px-1 rounded">FROM_EMAIL</code> in your .env file.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Confirmed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-400/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <UserMinus className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.unsubscribed}</p>
                <p className="text-xs text-muted-foreground">Unsubscribed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Subscriber Form */}
      {showAddForm && (
        <Card className="border-blue-500/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-500" /> Add Subscriber
            </CardTitle>
            <CardDescription>
              Manually add an email. Admin-added subscribers skip confirmation and are immediately active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="add-email" className="text-xs">Email *</Label>
                <Input id="add-email" type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="subscriber@example.com" disabled={addLoading} />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="add-name" className="text-xs">Name (optional)</Label>
                <Input id="add-name" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="John Doe" disabled={addLoading} />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleAddSubscriber} disabled={!addEmail.trim() || addLoading} size="sm" className="gap-2">
                  {addLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setAddEmail(""); setAddName(""); }}>Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compose Newsletter */}
      {showCompose && (
        <Card className="border-primary/30">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" /> Compose Newsletter
                </CardTitle>
                <CardDescription>
                  This will be sent to {stats.active} confirmed subscriber{stats.active !== 1 ? "s" : ""} via email.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTemplatePanel(!showTemplatePanel)}
                  className="gap-2"
                >
                  <Palette className="h-4 w-4" />
                  Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="gap-2"
                  disabled={!content.trim()}
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Picker */}
            {showTemplatePanel && (
              <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Choose Template
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {TEMPLATE_PRESETS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all text-xs",
                        selectedTemplate === t.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card hover:border-primary/50"
                      )}
                    >
                      {/* Mini template preview */}
                      <div className="w-full h-6 rounded-t mb-2" style={{ background: t.headerGradient }} />
                      <p className="font-medium truncate">{t.name}</p>
                      <p className="text-muted-foreground truncate mt-0.5">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live Preview */}
            {showPreview && content.trim() && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Email Preview — {currentTemplate.name}</p>
                  <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)} className="h-6 w-6 p-0">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="p-4 bg-gray-100 dark:bg-gray-900">
                  <div style={{ maxWidth: 600, margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                    {/* Header */}
                    <div style={{ background: currentTemplate.headerGradient, borderRadius: "12px 12px 0 0", padding: "24px 32px", textAlign: "center" }}>
                      <p style={{ margin: 0, fontSize: 28 }}>{currentTemplate.brandIcon}</p>
                      <h2 style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 700, color: currentTemplate.headerTextColor }}>
                        Solid Voyage
                      </h2>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: currentTemplate.headerTextColor, opacity: 0.7 }}>
                        Maritime Intelligence Newsletter
                      </p>
                    </div>
                    {/* Body */}
                    <div style={{ background: currentTemplate.bodyBg, padding: "32px", border: `1px solid ${currentTemplate.borderColor}`, borderTop: "none", color: currentTemplate.bodyText }}>
                      {subject && <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>{subject}</h3>}
                      <div dangerouslySetInnerHTML={{ __html: content }} />
                    </div>
                    {/* Footer */}
                    <div style={{ background: currentTemplate.footerBg, borderRadius: "0 0 12px 12px", border: `1px solid ${currentTemplate.borderColor}`, borderTop: "none", padding: "20px 32px", textAlign: "center" }}>
                      <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
                        You received this because you subscribed to the Solid Voyage newsletter.
                      </p>
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: currentTemplate.accentColor, textDecoration: "underline", cursor: "pointer" }}>
                        Unsubscribe
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="nl-subject">Subject Line *</Label>
              <Input id="nl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g., Maritime Market Update - Q2 2026" className="text-lg" maxLength={200} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nl-preview">Preview Text (optional)</Label>
              <Input id="nl-preview" value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Brief summary shown in email clients before opening" maxLength={200} />
              <p className="text-xs text-muted-foreground">This text appears next to the subject line in most email clients.</p>
            </div>

            <div className="space-y-2">
              <Label>Content *</Label>
              <RichTextEditor content={content} onChange={(html) => setContent(html)} placeholder="Write your newsletter content..." />
            </div>

            <div className="flex items-center gap-3 pt-2">
              {!confirmSend ? (
                <>
                  <Button onClick={() => setConfirmSend(true)} disabled={!subject.trim() || !content.trim() || sending} className="gap-2">
                    <Send className="h-4 w-4" /> Send Newsletter
                  </Button>
                  <Button variant="ghost" onClick={() => { setShowCompose(false); setSubject(""); setContent(""); setPreviewText(""); }}>
                    Cancel
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex-1">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-400 flex-1">
                    Send &quot;{subject}&quot; to <strong>{stats.active}</strong> subscriber{stats.active !== 1 ? "s" : ""}? This cannot be undone.
                  </p>
                  <Button onClick={handleSend} disabled={sending} size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700">
                    {sending ? <><RefreshCw className="h-4 w-4 animate-spin" /> Sending...</> : "Confirm Send"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmSend(false)} disabled={sending}>Cancel</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscribers List */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              Subscribers
              <span className="text-sm font-normal text-muted-foreground">({filtered.length})</span>
            </CardTitle>
            <button onClick={() => setShowInactive(!showInactive)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              {showInactive ? <><ChevronUp className="h-3 w-3" /> Hide unsubscribed</> : <><ChevronDown className="h-3 w-3" /> Show unsubscribed ({stats.unsubscribed})</>}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {stats.total === 0 && !showAddForm ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Subscribers Yet</h3>
              <p className="text-muted-foreground max-w-sm mx-auto text-sm mb-4">
                Subscribers will appear here when people sign up via the newsletter form on your landing page, or you can add them manually.
              </p>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)} className="gap-2">
                <UserPlus className="h-4 w-4" /> Add First Subscriber
              </Button>
            </div>
          ) : (
            <>
              {stats.total > 5 && (
                <div className="relative mb-4 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search subscribers..." className="pl-9" />
                </div>
              )}

              {filtered.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                        <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Source</th>
                        <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                        <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((sub) => {
                        const isPending = !sub.confirmedAt && !sub.isActive;
                        return (
                          <tr key={sub.id} className={cn("border-t border-border/50 transition-colors hover:bg-muted/20", (!sub.isActive && sub.confirmedAt) && "opacity-60")}>
                            <td className="p-3">
                              {editingId === sub.id ? (
                                <div className="space-y-1">
                                  <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" className="h-8 text-sm" disabled={editLoading} />
                                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name (optional)" className="h-8 text-sm" disabled={editLoading} />
                                </div>
                              ) : (
                                <div>
                                  <p className="font-medium">{sub.email}</p>
                                  {sub.name && <p className="text-xs text-muted-foreground">{sub.name}</p>}
                                </div>
                              )}
                            </td>
                            <td className="p-3 hidden sm:table-cell">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{sub.source}</span>
                            </td>
                            <td className="p-3 hidden md:table-cell text-muted-foreground">
                              {new Date(sub.subscribedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </td>
                            <td className="p-3 text-center">
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                sub.isActive
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : isPending
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                              )}>
                                {isPending && <Clock className="h-3 w-3" />}
                                {sub.isActive ? "Active" : isPending ? "Pending" : "Unsubscribed"}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {editingId === sub.id ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={handleEditSubscriber} disabled={editLoading || !editEmail.trim()} className="h-7 w-7 p-0 text-green-400 hover:text-green-300">
                                    {editLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={editLoading} className="h-7 w-7 p-0 text-muted-foreground">
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : deletingId === sub.id ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => handleDeleteSubscriber(sub.id)} disabled={deleteLoading} className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10">
                                    {deleteLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Delete"}
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)} disabled={deleteLoading} className="h-7 w-7 p-0 text-muted-foreground">
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => startEdit(sub)} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Edit">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => { setDeletingId(sub.id); setEditingId(null); }} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" title="Delete">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
