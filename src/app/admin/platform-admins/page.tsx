"use client";

/**
 * Super Admin — Platform Administrators Management
 *
 * Manage who has platform-level super admin access.
 * - Root admins (from .env): shown as "Root", cannot be removed, full RBAC control
 * - Managed admins: RBAC permissions, editable by root admins
 * - Delete: root admins always, canManageAdmins admins for non-canManageAdmins targets
 */

import { useState, useEffect, useCallback } from "react";
import { useSuperAdminGuard } from "@/hooks/useSuperAdminGuard";
import {
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  UserPlus,
  Crown,
  Mail,
  Users,
  X,
  AlertTriangle,
  FileText,
  TrendingUp,
  Settings2,
  Newspaper,
  Pencil,
  Check,
  Compass,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AdminPermissions {
  canManagePages: boolean;
  canManageMarketData: boolean;
  canManageMaritimeIntel: boolean;
  canManageSettings: boolean;
  canManageAdmins: boolean;
  canManageNewsletter: boolean;
}

interface PlatformAdmin {
  id: string;
  email: string;
  name: string | null;
  addedBy: string;
  createdAt: string | null;
  isBootstrap: boolean;
  permissions: AdminPermissions;
}

const PERMISSION_LABELS = [
  { key: "canManagePages" as const, label: "Site Pages", icon: FileText, color: "blue" },
  { key: "canManageMarketData" as const, label: "Market Data", icon: TrendingUp, color: "emerald" },
  { key: "canManageMaritimeIntel" as const, label: "Maritime Intel", icon: Compass, color: "cyan" },
  { key: "canManageSettings" as const, label: "Settings", icon: Settings2, color: "purple" },
  { key: "canManageAdmins" as const, label: "Manage Admins", icon: Users, color: "amber", rootOnly: true },
  { key: "canManageNewsletter" as const, label: "Newsletter", icon: Newspaper, color: "rose" },
];

export default function PlatformAdminsPage() {
  const { isSuperAdmin, isRoot, permissions: myPerms, loading: guardLoading } = useSuperAdminGuard();
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<AdminPermissions>({
    canManagePages: false,
    canManageMarketData: false,
    canManageMaritimeIntel: false,
    canManageSettings: false,
    canManageAdmins: false,
    canManageNewsletter: false,
  });
  const [adding, setAdding] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<PlatformAdmin | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit permissions
  const [editingAdmin, setEditingAdmin] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<AdminPermissions | null>(null);
  const [saving, setSaving] = useState(false);

  const canAdd = isRoot || myPerms?.canManageAdmins;
  const canDelete = isRoot || myPerms?.canManageAdmins;
  const canEditPerms = isRoot; // Only root can edit permissions

  const fetchAdmins = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/platform/admins");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Access denied. Super admin privileges required.");
        throw new Error("Failed to fetch administrators");
      }
      const data = await res.json();
      setAdmins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load administrators");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchAdmins();
  }, [isSuperAdmin, fetchAdmins]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    const tempEmail = newEmail.trim();
    const tempName = newName.trim() || null;
    const tempPerms = { ...newPerms };
    const tempId = `temp-${Date.now()}`;

    // Optimistic: insert into list immediately
    const tempAdmin: PlatformAdmin = {
      id: tempId,
      email: tempEmail,
      name: tempName,
      addedBy: "you",
      createdAt: new Date().toISOString(),
      isBootstrap: false,
      permissions: tempPerms,
    };
    setAdmins((prev) => [...prev, tempAdmin]);
    setNewEmail("");
    setNewName("");
    setNewPerms({
      canManagePages: false,
      canManageMarketData: false,
      canManageMaritimeIntel: false,
      canManageSettings: false,
      canManageAdmins: false,
      canManageNewsletter: false,
    });
    setShowAddForm(false);
    setSuccess(`${tempEmail} has been added as a platform administrator.`);
    setTimeout(() => setSuccess(null), 4000);

    try {
      const res = await fetch("/api/platform/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: tempEmail,
          name: tempName || undefined,
          ...tempPerms,
        }),
      });

      const responseData = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Revert
        setAdmins((prev) => prev.filter((a) => a.id !== tempId));
        setError(responseData.error || "Failed to add administrator");
        setSuccess(null);
        return;
      }

      // Replace temp with real server data
      fetchAdmins();

      let emailNote = "";
      if (responseData.invitationSent) {
        emailNote = " An invitation email has been sent.";
      } else if (responseData.emailError) {
        emailNote = ` ⚠ Invitation email failed: ${responseData.emailError}`;
        if (responseData.emailHint) emailNote += ` (${responseData.emailHint})`;
      }
      setSuccess(`${tempEmail} has been added as a platform administrator.${emailNote}`);
      setTimeout(() => setSuccess(null), 4000);
    } catch {
      // Revert
      setAdmins((prev) => prev.filter((a) => a.id !== tempId));
      setError("Failed to add administrator");
      setSuccess(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    // Optimistic: remove from list immediately
    const removed = deleteTarget;
    setAdmins((prev) => prev.filter((a) => a.id !== removed.id));
    setDeleteTarget(null);
    setSuccess(`${removed.email} has been removed from platform administrators.`);
    setTimeout(() => setSuccess(null), 4000);

    try {
      const res = await fetch("/api/platform/admins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: removed.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Revert
        setAdmins((prev) => [...prev, removed]);
        setSuccess(null);
        setError(data.error || "Failed to remove administrator");
      }
    } catch {
      // Revert
      setAdmins((prev) => [...prev, removed]);
      setSuccess(null);
      setError("Failed to remove administrator");
    }
  };

  const startEditPerms = (admin: PlatformAdmin) => {
    setEditingAdmin(admin.id);
    setEditPerms({ ...admin.permissions });
  };

  const handleSavePerms = async () => {
    if (!editingAdmin || !editPerms) return;

    const targetId = editingAdmin;
    const newPermsSnapshot = { ...editPerms };

    // Snapshot for rollback
    const original = admins.find((a) => a.id === targetId);
    if (!original) return;

    // Optimistic: apply permissions and exit edit mode
    setAdmins((prev) =>
      prev.map((a) => (a.id === targetId ? { ...a, permissions: newPermsSnapshot } : a))
    );
    setEditingAdmin(null);
    setEditPerms(null);
    setSuccess("Permissions updated successfully.");
    setTimeout(() => setSuccess(null), 4000);

    try {
      const res = await fetch("/api/platform/admins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId, ...newPermsSnapshot }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Revert
        setAdmins((prev) =>
          prev.map((a) => (a.id === targetId ? original : a))
        );
        setSuccess(null);
        setError(data.error || "Failed to update permissions");
      }
    } catch {
      // Revert
      setAdmins((prev) =>
        prev.map((a) => (a.id === targetId ? original : a))
      );
      setSuccess(null);
      setError("Failed to update permissions");
    }
  };

  if (guardLoading || !isSuperAdmin || loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  const bootstrapAdmins = admins.filter((a) => a.isBootstrap);
  const dbAdmins = admins.filter((a) => !a.isBootstrap);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            Platform Administrators
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage who has platform-level super admin access with role-based permissions.
          </p>
        </div>
        {canAdd && (
          <Button
            onClick={() => setShowAddForm(true)}
            className="gap-2"
            disabled={showAddForm}
          >
            <UserPlus className="h-4 w-4" />
            Add Admin
          </Button>
        )}
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

      {/* Add Admin Form */}
      {showAddForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Add Platform Administrator
            </CardTitle>
            <CardDescription>
              The person will get super admin access the next time they log in.
              {!isRoot && " Note: You cannot grant admin management permissions."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="pl-10"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Display Name (optional)</Label>
                  <Input
                    id="admin-name"
                    placeholder="John Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
              </div>

              {/* RBAC Permission Toggles */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Permissions</Label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {PERMISSION_LABELS.map((p) => {
                    const disabled = p.rootOnly && !isRoot;
                    return (
                      <label
                        key={p.key}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          newPerms[p.key]
                            ? "border-primary/50 bg-primary/5"
                            : "border-border hover:border-border/80",
                          disabled && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={newPerms[p.key]}
                          onChange={(e) =>
                            !disabled &&
                            setNewPerms((prev) => ({
                              ...prev,
                              [p.key]: e.target.checked,
                            }))
                          }
                          disabled={disabled}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <p.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.label}</p>
                          {p.rootOnly && (
                            <p className="text-[10px] text-amber-500">Root only</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={adding || !newEmail.trim()} className="gap-2">
                  {adding ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Add Administrator
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewEmail("");
                    setNewName("");
                    setNewPerms({
                      canManagePages: false,
                      canManageMarketData: false,
                      canManageMaritimeIntel: false,
                      canManageSettings: false,
                      canManageAdmins: false,
                      canManageNewsletter: false,
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Root Administrators */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Root Administrators
          </CardTitle>
          <CardDescription>
            Defined in server configuration. Always have full access and cannot be removed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {bootstrapAdmins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Crown className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium">{admin.email}</p>
                    <p className="text-xs text-muted-foreground">Root · Full Access · Server configuration</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                  Protected
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Managed Administrators */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Managed Administrators
            {dbAdmins.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({dbAdmins.length})
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Added via this panel. Permissions can be{" "}
            {isRoot ? "edited by root admins." : "viewed here."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dbAdmins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No managed administrators yet.</p>
              {canAdd && (
                <p className="text-xs mt-1">
                  Click &quot;Add Admin&quot; to grant super admin access to a team member.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {dbAdmins.map((admin) => {
                const isEditing = editingAdmin === admin.id;
                const currentPerms = isEditing ? editPerms! : admin.permissions;
                // canDelete: root can delete anyone. canManageAdmins can delete non-canManageAdmins
                const showDelete =
                  canDelete &&
                  (isRoot || !admin.permissions.canManageAdmins);

                return (
                  <div
                    key={admin.id}
                    className="p-4 rounded-lg bg-card border border-border hover:border-border/80 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <Shield className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {admin.name || admin.email}
                          </p>
                          {admin.name && (
                            <p className="text-xs text-muted-foreground">{admin.email}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Added by {admin.addedBy}
                            {admin.createdAt && (
                              <> · {new Date(admin.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {canEditPerms && !isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => startEditPerms(admin)}
                            title="Edit permissions"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {isEditing && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                              onClick={handleSavePerms}
                              disabled={saving}
                            >
                              {saving ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setEditingAdmin(null);
                                setEditPerms(null);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {showDelete && !isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => setDeleteTarget(admin)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Permission Badges / Toggles */}
                    <div className="flex flex-wrap gap-1.5">
                      {PERMISSION_LABELS.map((p) => {
                        const active = currentPerms[p.key];
                        if (isEditing) {
                          return (
                            <button
                              key={p.key}
                              type="button"
                              onClick={() =>
                                setEditPerms((prev) =>
                                  prev ? { ...prev, [p.key]: !prev[p.key] } : null
                                )
                              }
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                                active
                                  ? `bg-${p.color}-500/20 text-${p.color}-400 ring-1 ring-${p.color}-500/30`
                                  : "bg-muted text-muted-foreground/50 line-through"
                              )}
                              style={{
                                backgroundColor: active
                                  ? `color-mix(in srgb, var(--color-${p.color === "emerald" ? "green" : p.color}-500) 15%, transparent)`
                                  : undefined,
                                color: active
                                  ? `var(--color-${p.color === "emerald" ? "green" : p.color}-400, inherit)`
                                  : undefined,
                              }}
                            >
                              <p.icon className="h-3 w-3" />
                              {p.label}
                            </button>
                          );
                        }
                        // View-only mode
                        if (!active) return null;
                        return (
                          <span
                            key={p.key}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                          >
                            <p.icon className="h-3 w-3" />
                            {p.label}
                          </span>
                        );
                      })}
                      {!isEditing &&
                        !Object.values(admin.permissions).some(Boolean) && (
                          <span className="text-xs text-muted-foreground/60 italic">
                            No permissions assigned
                          </span>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Remove Administrator</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Are you sure you want to remove{" "}
                  <strong>{deleteTarget.name || deleteTarget.email}</strong> from
                  platform administrators? They will lose access to all admin features
                  immediately.
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="gap-2"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Remove Admin
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
