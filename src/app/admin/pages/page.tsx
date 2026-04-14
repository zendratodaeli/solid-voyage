"use client";

/**
 * Super Admin — Pages Manager
 *
 * Full CRUD interface for managing dynamic site pages (Privacy Policy, Contact, etc.)
 * Only accessible to platform super admins (SUPER_ADMIN_EMAILS env var).
 */

import { useState, useEffect, useCallback } from "react";
import { useSuperAdminGuard } from "@/hooks/useSuperAdminGuard";
import {
  FileText,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Globe,
  Save,
  X,
  ExternalLink,
  GripVertical,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { cn } from "@/lib/utils";

interface SitePage {
  id: string;
  slug: string;
  title: string;
  content: string;
  metaDesc: string | null;
  isPublished: boolean;
  sortOrder: number;
  icon: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

type EditorMode = "list" | "create" | "edit";

export default function AdminPagesPage() {
  const { isSuperAdmin, loading: guardLoading } = useSuperAdminGuard();
  const [pages, setPages] = useState<SitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("list");
  const [editingPage, setEditingPage] = useState<SitePage | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SitePage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    content: "",
    metaDesc: "",
    isPublished: true,
    sortOrder: 0,
    icon: "",
  });

  // Fetch pages
  const fetchPages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/platform/pages");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Access denied. Super admin privileges required.");
        throw new Error("Failed to fetch pages");
      }
      const data = await res.json();
      setPages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchPages();
  }, [fetchPages, isSuperAdmin]);

  // Auto-generate slug from title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleTitleChange = (title: string) => {
    setFormData((prev) => ({
      ...prev,
      title,
      // Only auto-generate slug when creating (not editing)
      ...(mode === "create" ? { slug: generateSlug(title) } : {}),
    }));
  };

  const resetForm = () => {
    setFormData({
      title: "",
      slug: "",
      content: "",
      metaDesc: "",
      isPublished: true,
      sortOrder: 0,
      icon: "",
    });
    setEditingPage(null);
  };

  const handleCreate = () => {
    resetForm();
    setMode("create");
  };

  const handleEdit = (page: SitePage) => {
    setEditingPage(page);
    setFormData({
      title: page.title,
      slug: page.slug,
      content: page.content,
      metaDesc: page.metaDesc || "",
      isPublished: page.isPublished,
      sortOrder: page.sortOrder,
      icon: page.icon || "",
    });
    setMode("edit");
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const payload = {
        ...formData,
        metaDesc: formData.metaDesc || null,
        icon: formData.icon || null,
      };

      let res: Response;
      if (mode === "create") {
        res = await fetch("/api/platform/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/platform/pages/${editingPage!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save page");
      }

      setSuccess(mode === "create" ? "Page created successfully!" : "Page updated successfully!");
      setTimeout(() => setSuccess(null), 3000);
      resetForm();
      setMode("list");
      fetchPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save page");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    // Optimistic: remove from list immediately
    const removedPage = deleteTarget;
    setPages((prev) => prev.filter((p) => p.id !== removedPage.id));
    setDeleteTarget(null);
    toast.success("Page deleted");

    try {
      const res = await fetch(`/api/platform/pages/${removedPage.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        // Revert
        setPages((prev) => [...prev, removedPage].sort((a, b) => a.sortOrder - b.sortOrder));
        toast.error("Failed to delete page — restored");
      }
    } catch {
      // Revert
      setPages((prev) => [...prev, removedPage].sort((a, b) => a.sortOrder - b.sortOrder));
      toast.error("Failed to delete page — restored");
    }
  };

  const handleTogglePublish = async (page: SitePage) => {
    // Optimistic: flip badge immediately
    const oldPublished = page.isPublished;
    setPages((prev) =>
      prev.map((p) => (p.id === page.id ? { ...p, isPublished: !p.isPublished } : p))
    );

    try {
      const res = await fetch(`/api/platform/pages/${page.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !oldPublished }),
      });
      if (!res.ok) {
        // Revert
        setPages((prev) =>
          prev.map((p) => (p.id === page.id ? { ...p, isPublished: oldPublished } : p))
        );
        toast.error("Failed to toggle publish state");
      }
    } catch {
      // Revert
      setPages((prev) =>
        prev.map((p) => (p.id === page.id ? { ...p, isPublished: oldPublished } : p))
      );
      toast.error("Failed to toggle publish state");
    }
  };

  const filteredPages = pages.filter(
    (p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Loading State ──────────────────────────────────────────────
  if (guardLoading || !isSuperAdmin || loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Editor View (Create / Edit) ──────────────────────────────
  if (mode === "create" || mode === "edit") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              {mode === "create" ? "Create New Page" : "Edit Page"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {mode === "create"
                ? "Create a new content page for your platform."
                : `Editing: ${editingPage?.title}`}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              resetForm();
              setMode("list");
            }}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main Editor */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Page Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g., Privacy Policy"
                    className="text-lg font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">
                    URL Slug{" "}
                    <span className="text-muted-foreground font-normal">
                      (/{formData.slug || "your-page-url"})
                    </span>
                  </Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, slug: e.target.value }))
                    }
                    placeholder="e.g., privacy-policy"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Content</Label>
                  <RichTextEditor
                    content={formData.content}
                    onChange={(html) =>
                      setFormData((prev) => ({ ...prev, content: html }))
                    }
                    placeholder="Start writing your page content..."
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Settings */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Page Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="metaDesc">
                    SEO Description
                    <span className="text-muted-foreground font-normal ml-1">
                      ({formData.metaDesc.length}/320)
                    </span>
                  </Label>
                  <textarea
                    id="metaDesc"
                    value={formData.metaDesc}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        metaDesc: e.target.value,
                      }))
                    }
                    placeholder="Brief description for search engines..."
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    maxLength={320}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sortOrder">Sort Order</Label>
                  <Input
                    id="sortOrder"
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        sortOrder: parseInt(e.target.value) || 0,
                      }))
                    }
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower numbers appear first in the footer.
                  </p>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label>Published</Label>
                    <p className="text-xs text-muted-foreground">
                      Visible to the public
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.isPublished}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        isPublished: !prev.isPublished,
                      }))
                    }
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      formData.isPublished ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
                        formData.isPublished ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Preview Link */}
            {formData.slug && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Globe className="h-4 w-4" />
                    <span>Will be published at:</span>
                  </div>
                  <p className="text-sm font-mono mt-1 text-primary">
                    /pages/{formData.slug}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Save Button */}
            <Button
              onClick={handleSave}
              disabled={saving || !formData.title || !formData.slug || !formData.content}
              className="w-full gap-2 h-11"
              size="lg"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {mode === "create" ? "Create Page" : "Save Changes"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── List View ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Site Pages
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your platform&apos;s content pages — Privacy Policy, Contact, Guidance, and more.
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New Page
        </Button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
          ✓ {success}
        </div>
      )}

      {/* Search */}
      {pages.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pages..."
            className="pl-9"
          />
        </div>
      )}

      {/* Pages List */}
      {pages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Pages Yet</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Create your first content page to get started. Add pages like Privacy Policy, Contact, or a User Guide.
            </p>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Create First Page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredPages.map((page) => (
            <Card
              key={page.id}
              className="group hover:border-primary/30 transition-colors duration-200"
            >
              <CardContent className="flex items-center gap-4 py-4">
                {/* Drag handle placeholder */}
                <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />

                {/* Page info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{page.title}</h3>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                        page.isPublished
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      )}
                    >
                      {page.isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-mono text-xs">/{page.slug}</span>
                    <span>·</span>
                    <span>
                      Updated{" "}
                      {new Date(page.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {page.updatedBy && (
                      <>
                        <span>·</span>
                        <span>by {page.updatedBy}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTogglePublish(page)}
                    title={page.isPublished ? "Unpublish" : "Publish"}
                    className="h-8 w-8"
                  >
                    {page.isPublished ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  {page.isPublished && (
                    <a
                      href={`/pages/${page.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="View live page"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(page)}
                    title="Edit"
                    className="h-8 w-8"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(page)}
                    title="Delete"
                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This
              action cannot be undone and the page will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
