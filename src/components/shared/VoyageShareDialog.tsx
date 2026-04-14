"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Share2,
  UserPlus,
  Loader2,
  Trash2,
  Eye,
  Pencil,
  Copy,
  Check,
  Users,
  ChevronDown,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface OrgMember {
  userId: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
  role: string;
}

interface VoyageShare {
  id: string;
  voyageId: string;
  sharedWith: string;
  permission: "view" | "read" | "update";
  createdAt: string;
}

interface VoyageShareDialogProps {
  voyageId: string;
  voyageName: string;
}

const permissionConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  view: {
    label: "View only",
    icon: <Eye className="h-3.5 w-3.5" />,
    color: "text-muted-foreground",
  },
  update: {
    label: "Can edit",
    icon: <Pencil className="h-3.5 w-3.5" />,
    color: "text-green-400",
  },
};

export function VoyageShareDialog({ voyageId, voyageName }: VoyageShareDialogProps) {
  const routeParams = useParams();
  const orgSlug = routeParams.orgSlug as string;
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<VoyageShare[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [updatingPerm, setUpdatingPerm] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Member picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const [permission, setPermission] = useState<"view" | "update">("view");
  const pickerRef = useRef<HTMLDivElement>(null);
  const [permPickerOpen, setPermPickerOpen] = useState(false);
  const permPickerRef = useRef<HTMLDivElement>(null);

  // Close pickers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
      if (permPickerRef.current && !permPickerRef.current.contains(e.target as Node)) {
        setPermPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchShares = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/voyages/${voyageId}/share`);
      const json = await res.json();
      if (json.success) {
        setShares(json.data);
      }
    } catch (error) {
      console.error("Failed to load shares:", error);
    } finally {
      setLoading(false);
    }
  }, [voyageId]);

  const fetchMembers = useCallback(async () => {
    try {
      setLoadingMembers(true);
      const res = await fetch("/api/org-members");
      const json = await res.json();
      if (json.success) {
        setMembers(json.data);
      }
    } catch (error) {
      console.error("Failed to load members:", error);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchShares();
      fetchMembers();
    } else {
      // Reset state when dialog closes
      setSelectedMember(null);
      setSearchQuery("");
      setPickerOpen(false);
    }
  }, [open, fetchShares, fetchMembers]);

  // Filter members: exclude already shared + search
  const availableMembers = members.filter(
    (m) => !shares.some((s) => s.sharedWith === m.userId)
  );

  const filteredMembers = availableMembers.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.name && m.name.toLowerCase().includes(q)) ||
      m.email.toLowerCase().includes(q)
    );
  });

  const getMemberInfo = (userId: string): OrgMember | undefined => {
    return members.find((m) => m.userId === userId);
  };

  const handleSelectMember = (member: OrgMember) => {
    setSelectedMember(member);
    setPickerOpen(false);
    setSearchQuery("");
  };

  const handleShare = async () => {
    if (!selectedMember) return;

    // Optimistic: add to share list immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticShare: VoyageShare = {
      id: tempId,
      voyageId,
      sharedWith: selectedMember.userId,
      permission,
      createdAt: new Date().toISOString(),
    };
    setShares((prev) => [...prev, optimisticShare]);
    const sharedMember = selectedMember;
    const sharedPerm = permission;
    setSelectedMember(null);
    setPermission("view");

    try {
      setSharing(true);
      const res = await fetch(`/api/voyages/${voyageId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWith: sharedMember.userId,
          permission: sharedPerm,
        }),
      });

      const json = await res.json();
      if (json.success) {
        // Replace temp entry with server-confirmed entry
        setShares((prev) =>
          prev.map((s) => (s.id === tempId ? { ...s, id: json.data?.id || s.id } : s))
        );
      } else {
        // Revert optimistic add
        setShares((prev) => prev.filter((s) => s.id !== tempId));
        toast.error(json.error || "Failed to share voyage");
      }
    } catch (error) {
      console.error("Error sharing voyage:", error);
      // Revert optimistic add
      setShares((prev) => prev.filter((s) => s.id !== tempId));
      toast.error("Failed to share voyage. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  const handleRemove = async (sharedWith: string) => {
    // Optimistic: remove from list immediately
    const removedShares = shares.filter((s) => s.sharedWith === sharedWith);
    setShares((prev) => prev.filter((s) => s.sharedWith !== sharedWith));

    try {
      setRemoving(sharedWith);
      const res = await fetch(`/api/voyages/${voyageId}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWith }),
      });

      const json = await res.json();
      if (!json.success) {
        // Revert: add back removed shares
        setShares((prev) => [...prev, ...removedShares]);
        toast.error(json.error || "Failed to remove share");
      }
    } catch (error) {
      console.error("Error removing share:", error);
      // Revert: add back removed shares
      setShares((prev) => [...prev, ...removedShares]);
      toast.error("Failed to remove share");
    } finally {
      setRemoving(null);
    }
  };

  const copyVoyageLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/${orgSlug}/voyages/${voyageId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const MemberAvatar = ({ member, size = "sm" }: { member: OrgMember; size?: "sm" | "md" }) => {
    const sizeClasses = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
    const initials = (member.name || member.email).slice(0, 2).toUpperCase();
    
    return member.imageUrl ? (
      <img src={member.imageUrl} alt="" className={`${sizeClasses} rounded-full shrink-0 object-cover`} />
    ) : (
      <div className={`${sizeClasses} rounded-full bg-primary/10 flex items-center justify-center font-medium text-primary shrink-0`}>
        {initials}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Voyage
          </DialogTitle>
          <DialogDescription>
            Share <strong>{voyageName}</strong> with organization members
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Add member form */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Add member</Label>

            <div className="flex gap-2">
              {/* Custom member picker (not using shadcn Select for complex items) */}
              <div className="relative flex-1" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setPickerOpen(!pickerOpen)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedMember ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <MemberAvatar member={selectedMember} size="sm" />
                      <span className="truncate text-sm">
                        {selectedMember.name || selectedMember.email}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select a member...</span>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                </button>

                {pickerOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md">
                    {/* Search input */}
                    <div className="p-2 border-b">
                      <div className="flex items-center gap-2 px-2">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input
                          type="text"
                          placeholder="Search members..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* Member list */}
                    <div className="max-h-[200px] overflow-y-auto p-1">
                      {loadingMembers ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                          <span className="text-sm text-muted-foreground">Loading...</span>
                        </div>
                      ) : filteredMembers.length === 0 ? (
                        <div className="flex items-center justify-center py-4">
                          <Users className="h-4 w-4 text-muted-foreground mr-2" />
                          <span className="text-sm text-muted-foreground">
                            {members.length === 0
                              ? "No other members"
                              : availableMembers.length === 0
                              ? "All members already shared"
                              : "No matches found"}
                          </span>
                        </div>
                      ) : (
                        filteredMembers.map((member) => (
                          <button
                            key={member.userId}
                            type="button"
                            onClick={() => handleSelectMember(member)}
                            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <MemberAvatar member={member} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {member.name || member.email}
                              </p>
                              {member.name && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.email}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {member.role.replace("org:", "")}
                            </Badge>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Permission selector - custom dropdown */}
              <div className="relative" ref={permPickerRef}>
                <button
                  type="button"
                  onClick={() => setPermPickerOpen(!permPickerOpen)}
                  className="flex h-9 w-[120px] items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <span className={`flex items-center gap-1.5 ${permissionConfig[permission]?.color || ''}`}>
                    {permissionConfig[permission]?.icon}
                    {permission === 'view' ? 'View' : 'Update'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </button>

                {permPickerOpen && (
                  <div className="absolute z-50 top-full right-0 mt-1 w-[140px] rounded-md border bg-popover text-popover-foreground shadow-md p-1">
                    {(['view', 'update'] as const).map((perm) => (
                      <button
                        key={perm}
                        type="button"
                        onClick={() => {
                          setPermission(perm);
                          setPermPickerOpen(false);
                        }}
                        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                          permission === perm ? 'bg-accent' : ''
                        }`}
                      >
                        <span className={`flex items-center gap-1.5 ${permissionConfig[perm].color}`}>
                          {permissionConfig[perm].icon}
                          {perm === 'view' ? 'View' : 'Update'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={handleShare}
              disabled={!selectedMember || sharing}
              size="sm"
              className="w-full"
            >
              {sharing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Share with member
                </>
              )}
            </Button>
          </div>

          {/* Existing shares */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Shared with</Label>
              {shares.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {shares.length} member{shares.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : shares.length === 0 ? (
              <div className="text-center py-6 rounded-lg bg-muted/30 border border-dashed border-border/50">
                <Share2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Not shared with anyone yet
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {shares.map((share) => {
                  const pConfig = permissionConfig[share.permission];
                  const memberInfo = getMemberInfo(share.sharedWith);
                  const displayName = memberInfo?.name || memberInfo?.email || share.sharedWith;
                  const initials = (memberInfo?.name || memberInfo?.email || share.sharedWith)
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/30 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {memberInfo?.imageUrl ? (
                          <img
                            src={memberInfo.imageUrl}
                            alt=""
                            className="w-8 h-8 rounded-full shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {displayName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Clickable role toggle */}
                        <button
                          type="button"
                          onClick={async () => {
                            const newPerm = share.permission === 'update' ? 'view' : 'update';
                            const oldPerm = share.permission;
                            // Optimistic: flip permission badge immediately
                            setShares((prev) =>
                              prev.map((s) =>
                                s.sharedWith === share.sharedWith
                                  ? { ...s, permission: newPerm as "view" | "update" }
                                  : s
                              )
                            );
                            setUpdatingPerm(share.sharedWith);
                            try {
                              const res = await fetch(`/api/voyages/${voyageId}/share`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  sharedWith: share.sharedWith,
                                  permission: newPerm,
                                }),
                              });
                              const json = await res.json();
                              if (!json.success) {
                                // Revert permission on failure
                                setShares((prev) =>
                                  prev.map((s) =>
                                    s.sharedWith === share.sharedWith
                                      ? { ...s, permission: oldPerm }
                                      : s
                                  )
                                );
                                toast.error('Failed to update permission');
                              }
                            } catch (error) {
                              console.error('Error updating permission:', error);
                              // Revert permission on failure
                              setShares((prev) =>
                                prev.map((s) =>
                                  s.sharedWith === share.sharedWith
                                    ? { ...s, permission: oldPerm }
                                    : s
                                )
                              );
                              toast.error('Failed to update permission');
                            } finally {
                              setUpdatingPerm(null);
                            }
                          }}
                          disabled={updatingPerm === share.sharedWith}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer hover:bg-accent ${
                            pConfig?.color || 'text-muted-foreground'
                          }`}
                          title={`Click to change to ${share.permission === 'update' ? 'View only' : 'Can edit'}`}
                        >
                          {updatingPerm === share.sharedWith ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              {pConfig?.icon}
                              {pConfig?.label || share.permission}
                            </>
                          )}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => handleRemove(share.sharedWith)}
                          disabled={removing === share.sharedWith}
                        >
                          {removing === share.sharedWith ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={copyVoyageLink}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
