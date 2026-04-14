"use client";

/**
 * AccountSettingsDrawer
 *
 * Custom replacement for Clerk's `openUserProfile()` modal.
 * Uses Sheet (slide-over drawer) with two tabs:
 *   - Profile: avatar, name, email
 *   - Security: password change, active sessions
 *
 * Fully themed to match the app's dark/light mode.
 * Kept separate from the Clerk built-in so the user can compare both.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useUser, useClerk, useSession } from "@clerk/nextjs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Camera,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Shield,
  Mail,
  MailPlus,
  Key,
  Monitor,
  Smartphone,
  Globe,
  Clock,
  Eye,
  EyeOff,
  Save,
  Plus,
  Star,
  X,
  Lock,
  UserX,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getDeviceIcon(deviceType?: string) {
  if (!deviceType) return <Globe className="h-4 w-4" />;
  const lower = deviceType.toLowerCase();
  if (lower.includes("mobile") || lower.includes("phone"))
    return <Smartphone className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface AccountSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountSettingsDrawer({
  open,
  onOpenChange,
}: AccountSettingsDrawerProps) {
  const { user, isLoaded } = useUser();
  const { session: currentSession } = useSession();
  const clerk = useClerk();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Avatar state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Email management state
  const [addingEmail, setAddingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<any>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [removingConnectedAccount, setRemovingConnectedAccount] = useState<string | null>(null);

  // Session reverification state (for sensitive operations)
  const [needsReverification, setNeedsReverification] = useState(false);
  const [reverifyPassword, setReverifyPassword] = useState("");
  const [reverifying, setReverifying] = useState(false);
  const [showReverifyPw, setShowReverifyPw] = useState(false);
  const [reverifyLabel, setReverifyLabel] = useState("");

  /**
   * Stores the pending operation to retry after reverification.
   * type: "add" | "remove" | "setPrimary"
   * email: display label for the confirmation prompt
   * emailId: for remove/setPrimary operations
   */
  const pendingActionRef = useRef<{
    type: "add" | "remove" | "setPrimary";
    email: string;
    emailId?: string;
  } | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Track if user has a password (vs pure OAuth)
  const hasPassword = user?.passwordEnabled ?? false;

  // Pre-fill form
  useEffect(() => {
    if (user && open) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      // Reset password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [user, open]);

  // Load sessions when security tab is active
  const loadSessions = useCallback(async () => {
    if (!user) return;
    setLoadingSessions(true);
    try {
      const sessionsData = await clerk.client?.activeSessions;
      setSessions(sessionsData ?? []);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  }, [user, clerk]);

  // ─── Profile Actions ──────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setProfileSaved(true);
      toast.success("Profile updated successfully");
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.longMessage || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !user) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image must be under 10 MB");
        return;
      }

      setUploadingAvatar(true);
      try {
        await user.setProfileImage({ file });
        toast.success("Profile photo updated");
      } catch (err: any) {
        toast.error(
          err?.errors?.[0]?.longMessage || "Failed to upload photo"
        );
      } finally {
        setUploadingAvatar(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [user]
  );

  const handleAvatarRemove = useCallback(async () => {
    if (!user) return;
    setRemovingAvatar(true);
    try {
      await user.setProfileImage({ file: null });
      toast.success("Profile photo removed");
    } catch (err: any) {
      toast.error(
        err?.errors?.[0]?.longMessage || "Failed to remove photo"
      );
    } finally {
      setRemovingAvatar(false);
    }
  }, [user]);

  // ─── Email Actions ─────────────────────────────────────────────

  /**
   * Checks if a Clerk error is a session step-up verification requirement.
   * Clerk requires re-authentication before sensitive operations like
   * adding emails, changing primary email, etc.
   */
  function isReverificationError(err: any): boolean {
    const code = err?.errors?.[0]?.code;
    const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "";
    return (
      code === "session_step_up_verification_required" ||
      code === "verification_required" ||
      msg.toLowerCase().includes("additional verification")
    );
  }

  /**
   * Triggers the reverification flow for any sensitive operation.
   */
  function triggerReverification(action: typeof pendingActionRef.current, label: string) {
    pendingActionRef.current = action;
    setReverifyLabel(label);
    setNeedsReverification(true);
    setReverifyPassword("");
    setEmailError(null);
  }

  const handleAddEmail = async () => {
    if (!user || !newEmail.trim()) return;

    // Basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setSavingEmail(true);
    setEmailError(null);

    try {
      const emailAddress = await user.createEmailAddress({ email: newEmail.trim() });
      // Start verification — sends OTP code to the new email
      await emailAddress.prepareVerification({ strategy: "email_code" });
      setPendingVerification(emailAddress);
      setNeedsReverification(false);
      toast.success("Verification code sent to " + newEmail.trim());
    } catch (err: any) {
      if (isReverificationError(err)) {
        triggerReverification(
          { type: "add", email: newEmail.trim() },
          `add ${newEmail.trim()}`
        );
      } else {
        const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Failed to add email";
        setEmailError(msg);
      }
    } finally {
      setSavingEmail(false);
    }
  };

  /**
   * Freshen the session by re-authenticating with password,
   * then retry whatever pending action triggered the reverification.
   *
   * In single-session mode, Clerk blocks signIn.create() when a session
   * already exists ("You're already signed in"). We must end the current
   * session first, then re-authenticate. If the password is wrong we
   * recover by re-activating any remaining session.
   */
  const handleReverifyAndRetry = async () => {
    if (!reverifyPassword.trim() || !user) return;

    setReverifying(true);
    setEmailError(null);

    const identifier = user.primaryEmailAddress?.emailAddress || "";

    try {
      // Step 1: End current session so Clerk allows a new signIn.create()
      const currentSession = clerk.session;
      if (currentSession) {
        try {
          await currentSession.end();
        } catch {
          // Session may already be invalid — continue anyway
        }
      }

      // Step 2: Create a fresh sign-in with the user's password
      const signInAttempt = await clerk.client?.signIn.create({
        identifier,
        password: reverifyPassword,
      });

      if (signInAttempt?.status === "complete" && signInAttempt.createdSessionId) {
        // Step 3: Set the new (fresh) session as active
        await clerk.setActive({ session: signInAttempt.createdSessionId });

        // Small delay for session to propagate
        await new Promise((r) => setTimeout(r, 500));

        setNeedsReverification(false);
        setReverifyPassword("");

        // Step 4: Retry the pending action with a fresh user reference
        const action = pendingActionRef.current;
        pendingActionRef.current = null;

        if (!action) return;

        try {
          const freshUser = clerk.user;
          if (!freshUser) return;

          switch (action.type) {
            case "add": {
              const emailAddress = await freshUser.createEmailAddress({ email: action.email });
              await emailAddress.prepareVerification({ strategy: "email_code" });
              setPendingVerification(emailAddress);
              toast.success("Verification code sent to " + action.email);
              break;
            }
            case "remove": {
              const emailObj = freshUser.emailAddresses.find((e) => e.id === action.emailId);
              if (emailObj) {
                await emailObj.destroy();
                toast.success("Email removed");
              }
              break;
            }
            case "setPrimary": {
              const emailObj = freshUser.emailAddresses.find((e) => e.id === action.emailId);
              if (emailObj) {
                await freshUser.update({ primaryEmailAddressId: action.emailId! });
                toast.success(`${emailObj.emailAddress} is now your primary email`);
              }
              break;
            }
          }
        } catch (retryErr: any) {
          const msg = retryErr?.errors?.[0]?.longMessage || retryErr?.errors?.[0]?.message || "Operation failed after verification";
          setEmailError(msg);
          toast.error(msg);
        }
      } else {
        setEmailError("Verification failed. Please check your password.");
        // Try to recover a session
        await recoverSession();
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Incorrect password";
      setEmailError(msg);
      // Password was wrong and we already ended the session — try to recover
      await recoverSession();
    } finally {
      setReverifying(false);
    }
  };

  /**
   * After a failed reverification attempt (wrong password), the original
   * session was ended. Try to find and reactivate any remaining session
   * on the client so the user doesn't get kicked out entirely.
   * If no sessions remain, redirect to sign-in.
   */
  const recoverSession = async () => {
    try {
      const remaining = clerk.client?.activeSessions;
      if (remaining && remaining.length > 0) {
        await clerk.setActive({ session: remaining[0].id });
      } else {
        // No sessions left — user must re-authenticate
        toast.error("Session expired. Please sign in again.");
        onOpenChange(false);
        window.location.href = "/sign-in";
      }
    } catch {
      window.location.href = "/sign-in";
    }
  };

  const handleVerifyEmail = async () => {
    if (!pendingVerification || !verificationCode.trim()) return;

    setVerifyingEmail(true);
    try {
      await pendingVerification.attemptVerification({ code: verificationCode.trim() });
      toast.success("Email verified successfully!");
      // Reset all add-email state
      setPendingVerification(null);
      setVerificationCode("");
      setNewEmail("");
      setAddingEmail(false);
      setEmailError(null);
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || "Invalid verification code";
      setEmailError(msg);
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleCancelVerification = () => {
    // If the email was created but not verified, destroy it
    if (pendingVerification) {
      try {
        pendingVerification.destroy();
      } catch {}
    }
    setPendingVerification(null);
    setVerificationCode("");
    setEmailError(null);
  };

  const handleSetPrimary = async (emailId: string) => {
    if (!user) return;
    setSettingPrimary(emailId);
    try {
      const emailObj = user.emailAddresses.find((e) => e.id === emailId);
      if (emailObj) {
        await user.update({ primaryEmailAddressId: emailId });
        toast.success(`${emailObj.emailAddress} is now your primary email`);
      }
    } catch (err: any) {
      if (isReverificationError(err)) {
        const emailObj = user.emailAddresses.find((e) => e.id === emailId);
        triggerReverification(
          { type: "setPrimary", email: emailObj?.emailAddress || "", emailId },
          `set ${emailObj?.emailAddress || "email"} as primary`
        );
      } else {
        toast.error(err?.errors?.[0]?.longMessage || "Failed to set primary email");
      }
    } finally {
      setSettingPrimary(null);
    }
  };

  const handleRemoveEmail = async (emailId: string) => {
    if (!user) return;
    setRemovingEmail(emailId);
    try {
      const emailObj = user.emailAddresses.find((e) => e.id === emailId);
      if (emailObj) {
        await emailObj.destroy();
        toast.success("Email removed");
      }
    } catch (err: any) {
      if (isReverificationError(err)) {
        const emailObj = user.emailAddresses.find((e) => e.id === emailId);
        triggerReverification(
          { type: "remove", email: emailObj?.emailAddress || "", emailId },
          `remove ${emailObj?.emailAddress || "email"}`
        );
      } else {
        toast.error(err?.errors?.[0]?.longMessage || "Failed to remove email");
      }
    } finally {
      setRemovingEmail(null);
    }
  };

  // ─── Password Actions ─────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!user) return;
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSavingPassword(true);
    try {
      await user.updatePassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(
        err?.errors?.[0]?.longMessage || "Failed to change password"
      );
    } finally {
      setSavingPassword(false);
    }
  };

  // ─── Session Actions ──────────────────────────────────────────

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      const targetSession = sessions.find((s) => s.id === sessionId);
      if (targetSession) {
        await targetSession.revoke();
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        toast.success("Session revoked");
      }
    } catch (err: any) {
      toast.error("Failed to revoke session");
    } finally {
      setRevokingSession(null);
    }
  };

  if (!isLoaded || !user) return null;

  const fullName = user.fullName || user.firstName || "User";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const hasCustomAvatar =
    !!user.imageUrl && !user.imageUrl.includes("/default/");
  const isProfileDirty =
    firstName.trim() !== (user.firstName ?? "") ||
    lastName.trim() !== (user.lastName ?? "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* ─── Header ─── */}
        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border-b border-border/50">
          <SheetHeader className="p-0">
            <SheetTitle className="text-xl font-bold tracking-tight">
              Account Settings
            </SheetTitle>
            <SheetDescription className="text-sm">
              Manage your personal profile, security, and sessions
            </SheetDescription>
          </SheetHeader>

          {/* User summary card */}
          <div className="flex items-center gap-3.5 mt-4 p-3 rounded-xl bg-card/60 border border-border/40 backdrop-blur-sm">
            <div className="relative shrink-0">
              <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                <AvatarImage src={user.imageUrl} alt={fullName} />
                <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                  {getInitials(fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-card" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold truncate">{fullName}</span>
              <span className="text-xs text-muted-foreground truncate">
                {email}
              </span>
            </div>
          </div>
        </div>

        {/* ─── Tabbed Content ─── */}
        <Tabs
          defaultValue="profile"
          className="flex-1 flex flex-col min-h-0"
          onValueChange={(val) => {
            if (val === "security") loadSessions();
          }}
        >
          <div className="px-6 pt-3 border-b border-border/50">
            <TabsList className="w-full">
              <TabsTrigger value="profile" className="gap-1.5 flex-1">
                <User className="h-3.5 w-3.5" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-1.5 flex-1">
                <Shield className="h-3.5 w-3.5" />
                Security
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ═══ Profile Tab ═══ */}
          <TabsContent
            value="profile"
            className="flex-1 overflow-y-auto px-6 py-5 space-y-6 m-0"
          >
            {/* Avatar Management */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
                  <Camera className="h-3.5 w-3.5 text-violet-500" />
                </div>
                <h3 className="text-sm font-semibold">Profile Photo</h3>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative group">
                  <Avatar className="h-20 w-20 ring-2 ring-border/50 transition-all group-hover:ring-primary/30">
                    <AvatarImage src={user.imageUrl} alt={fullName} />
                    <AvatarFallback className="bg-primary/15 text-primary text-lg font-bold">
                      {getInitials(fullName)}
                    </AvatarFallback>
                  </Avatar>
                  {(uploadingAvatar || removingAvatar) && (
                    <div className="absolute inset-0 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    id="avatar-upload-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={uploadingAvatar || removingAvatar}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    {hasCustomAvatar ? "Change Photo" : "Upload Photo"}
                  </Button>
                  {hasCustomAvatar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted-foreground hover:text-destructive"
                      disabled={uploadingAvatar || removingAvatar}
                      onClick={handleAvatarRemove}
                    >
                      {removingAvatar ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Name Fields */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15">
                  <User className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <h3 className="text-sm font-semibold">Personal Info</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="account-firstName" className="text-xs font-medium">
                    First Name
                  </Label>
                  <Input
                    id="account-firstName"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-lastName" className="text-xs font-medium">
                    Last Name
                  </Label>
                  <Input
                    id="account-lastName"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              {/* Email Addresses */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    Email Addresses
                  </Label>
                  {!addingEmail && !pendingVerification && (
                    <button
                      type="button"
                      onClick={() => { setAddingEmail(true); setEmailError(null); }}
                      className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add email
                    </button>
                  )}
                </div>

                {/* Existing emails list */}
                <div className="space-y-1.5">
                  {user.emailAddresses.map((emailAddr) => {
                    const isPrimary = emailAddr.id === user.primaryEmailAddressId;
                    const isVerified = emailAddr.verification?.status === "verified";
                    return (
                      <div
                        key={emailAddr.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                          isPrimary
                            ? "bg-primary/5 border-primary/20"
                            : "bg-muted/30 border-border/50"
                        )}
                      >
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className={cn(
                          "truncate flex-1",
                          isPrimary ? "text-foreground font-medium" : "text-muted-foreground"
                        )}>
                          {emailAddr.emailAddress}
                        </span>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPrimary && (
                            <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
                              Primary
                            </span>
                          )}
                          {isVerified ? (
                            <span className="text-[9px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              Verified
                            </span>
                          ) : (
                            <span className="text-[9px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              Unverified
                            </span>
                          )}
                        </div>

                        {/* Actions — only for non-primary emails */}
                        {!isPrimary && isVerified && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(emailAddr.id)}
                            disabled={settingPrimary === emailAddr.id}
                            title="Set as primary"
                            className="text-muted-foreground hover:text-primary transition-colors p-1 rounded hover:bg-primary/10 shrink-0"
                          >
                            {settingPrimary === emailAddr.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Star className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        {!isPrimary && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(emailAddr.id)}
                            disabled={removingEmail === emailAddr.id}
                            title="Remove email"
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10 shrink-0"
                          >
                            {removingEmail === emailAddr.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add email form */}
                {addingEmail && !pendingVerification && !needsReverification && (
                  <div className="space-y-2 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <MailPlus className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs font-medium text-primary">Add new email</span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="new@example.com"
                        value={newEmail}
                        onChange={(e) => { setNewEmail(e.target.value); setEmailError(null); }}
                        className="h-9 text-sm flex-1"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddEmail(); } }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5 h-9 shrink-0"
                        disabled={!newEmail.trim() || savingEmail}
                        onClick={handleAddEmail}
                      >
                        {savingEmail ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        Add
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 shrink-0"
                        onClick={() => { setAddingEmail(false); setNewEmail(""); setEmailError(null); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {emailError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {emailError}
                      </p>
                    )}
                  </div>
                )}

                {/* Reverification prompt — shown when session needs step-up auth */}
                {needsReverification && (
                  <div className="space-y-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        Confirm your identity
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      For security, please enter your password to{" "}
                      <strong className="text-foreground">{reverifyLabel}</strong>
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showReverifyPw ? "text" : "password"}
                          placeholder="Enter your password"
                          value={reverifyPassword}
                          onChange={(e) => { setReverifyPassword(e.target.value); setEmailError(null); }}
                          className="h-9 text-sm pr-9"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleReverifyAndRetry(); } }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowReverifyPw(!showReverifyPw)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showReverifyPw ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5 h-9 shrink-0"
                        disabled={!reverifyPassword.trim() || reverifying}
                        onClick={handleReverifyAndRetry}
                      >
                        {reverifying ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 shrink-0"
                        onClick={() => {
                          setNeedsReverification(false);
                          setReverifyPassword("");
                          setEmailError(null);
                          setAddingEmail(false);
                          setNewEmail("");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {emailError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {emailError}
                      </p>
                    )}
                  </div>
                )}

                {/* Verification code input */}
                {pendingVerification && (
                  <div className="space-y-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        Verify your email
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      We sent a 6-digit code to <strong className="text-foreground">{newEmail}</strong>
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter 6-digit code"
                        value={verificationCode}
                        onChange={(e) => { setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setEmailError(null); }}
                        className="h-9 text-sm font-mono tracking-widest text-center flex-1"
                        maxLength={6}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleVerifyEmail(); } }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5 h-9 shrink-0"
                        disabled={verificationCode.length < 6 || verifyingEmail}
                        onClick={handleVerifyEmail}
                      >
                        {verifyingEmail ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Verify
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 text-muted-foreground shrink-0"
                        onClick={handleCancelVerification}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {emailError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {emailError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Save profile */}
              <Button
                type="button"
                size="sm"
                className="gap-2 w-full"
                disabled={!isProfileDirty || savingProfile}
                onClick={handleSaveProfile}
              >
                {savingProfile ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : profileSaved ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {profileSaved ? "Saved!" : "Save Changes"}
              </Button>
            </div>

            <Separator />

            {/* Connected Accounts */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15">
                  <Globe className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <h3 className="text-sm font-semibold">Connected Accounts</h3>
              </div>

              {user.externalAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground pl-9">
                  No external accounts connected
                </p>
              ) : (
                <div className="space-y-2">
                  {user.externalAccounts.map((account) => {
                    const providerName = account.provider
                      ?.replace(/^oauth_/, "")
                      ?.replace(/_/g, " ");
                    const isGoogle = providerName?.toLowerCase().includes("google");
                    const isGithub = providerName?.toLowerCase().includes("github");

                    return (
                      <div
                        key={account.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-card/50"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/80 shrink-0">
                          {isGoogle ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                          ) : isGithub ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                            </svg>
                          ) : (
                            <Globe className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">
                            {providerName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {account.emailAddress}
                          </p>
                        </div>
                        <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded shrink-0">
                          Connected
                        </span>
                        <button
                          type="button"
                          title="Disconnect account"
                          disabled={removingConnectedAccount === account.id}
                          onClick={async () => {
                            setRemovingConnectedAccount(account.id);
                            try {
                              await account.destroy();
                              toast.success(`${providerName} account disconnected`);
                            } catch (err: any) {
                              if (isReverificationError(err)) {
                                triggerReverification(
                                  { type: "remove", email: account.emailAddress || "", emailId: account.id },
                                  `disconnect ${providerName} (${account.emailAddress})`
                                );
                              } else {
                                toast.error(
                                  err?.errors?.[0]?.longMessage || "Failed to disconnect account"
                                );
                              }
                            } finally {
                              setRemovingConnectedAccount(null);
                            }
                          }}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10 shrink-0"
                        >
                          {removingConnectedAccount === account.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Unlink className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══ Security Tab ═══ */}
          <TabsContent
            value="security"
            className="flex-1 overflow-y-auto px-6 py-5 space-y-6 m-0"
          >
            {/* Password Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15">
                  <Key className="h-3.5 w-3.5 text-rose-500" />
                </div>
                <h3 className="text-sm font-semibold">
                  {hasPassword ? "Change Password" : "Set Password"}
                </h3>
              </div>

              <div className="space-y-3 rounded-lg border border-border/50 bg-card/50 p-4">
                {hasPassword && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="current-password"
                      className="text-xs font-medium"
                    >
                      Current Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="current-password"
                        type={showCurrentPw ? "text" : "password"}
                        placeholder="Enter current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showCurrentPw ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label
                    htmlFor="new-password"
                    className="text-xs font-medium"
                  >
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPw ? "text" : "password"}
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showNewPw ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="confirm-password"
                    className="text-xs font-medium"
                  >
                    Confirm New Password
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-10"
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Passwords don&apos;t match
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2 w-full mt-1"
                  disabled={
                    savingPassword ||
                    !newPassword ||
                    newPassword !== confirmPassword ||
                    (hasPassword && !currentPassword)
                  }
                  onClick={handleChangePassword}
                >
                  {savingPassword ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Key className="h-3.5 w-3.5" />
                  )}
                  {hasPassword ? "Update Password" : "Set Password"}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Active Sessions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15">
                    <Monitor className="h-3.5 w-3.5 text-cyan-500" />
                  </div>
                  <h3 className="text-sm font-semibold">Active Sessions</h3>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-muted-foreground"
                  onClick={loadSessions}
                  disabled={loadingSessions}
                >
                  {loadingSessions ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  Refresh
                </Button>
              </div>

              {loadingSessions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No active sessions found
                </p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session) => {
                    const isCurrent = session.id === currentSession?.id;
                    const latestActivity = session.lastActiveAt
                      ? new Date(session.lastActiveAt)
                      : null;

                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                          isCurrent
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/50 bg-card/50 hover:bg-card"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                            isCurrent
                              ? "bg-primary/15 text-primary"
                              : "bg-muted/80 text-muted-foreground"
                          )}
                        >
                          {getDeviceIcon(
                            session.latestActivity?.deviceType
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {session.latestActivity?.browserName ||
                                "Unknown Browser"}
                            </p>
                            {isCurrent && (
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded shrink-0">
                                This device
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {session.latestActivity?.ipAddress || "Unknown IP"}
                            {session.latestActivity?.city &&
                              ` · ${session.latestActivity.city}`}
                          </p>
                          {latestActivity && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              Last active {timeAgo(latestActivity)}
                            </p>
                          )}
                        </div>
                        {!isCurrent && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                            disabled={revokingSession === session.id}
                            onClick={() => handleRevokeSession(session.id)}
                          >
                            {revokingSession === session.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Revoke"
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* Danger Zone — Delete Account */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/15">
                  <UserX className="h-3.5 w-3.5 text-destructive" />
                </div>
                <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
              </div>

              {!showDeleteConfirm ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    Permanently delete your account and all associated data. This action
                    cannot be undone.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Account
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                  <div className="flex items-start gap-2.5 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-semibold">Are you absolutely sure?</p>
                      <p className="text-xs text-muted-foreground">
                        This will permanently delete your account, remove you from all
                        organizations, and erase all your data. This cannot be reversed.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Type <strong className="text-foreground font-mono">{email}</strong> to confirm
                    </Label>
                    <Input
                      placeholder={email}
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="h-9 text-sm font-mono border-destructive/30 focus-visible:ring-destructive/30"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="gap-2 flex-1"
                      disabled={deleteConfirmText !== email || deletingAccount}
                      onClick={async () => {
                        if (!user || deleteConfirmText !== email) return;
                        setDeletingAccount(true);
                        try {
                          await user.delete();
                          toast.success("Account deleted. Goodbye.");
                          onOpenChange(false);
                          await clerk.signOut();
                        } catch (err: any) {
                          toast.error(
                            err?.errors?.[0]?.longMessage || "Failed to delete account"
                          );
                          setDeletingAccount(false);
                        }
                      }}
                    >
                      {deletingAccount ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {deletingAccount ? "Deleting..." : "Permanently Delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={deletingAccount}
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Security footer */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/50 pt-2 pb-4">
              <Shield className="h-3 w-3" />
              Authentication managed securely via Clerk
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
