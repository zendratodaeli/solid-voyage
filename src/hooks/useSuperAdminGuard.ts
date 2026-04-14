"use client";

/**
 * useSuperAdminGuard — Client-side guard hook
 * 
 * Checks if the current user is a super admin.
 * If not, redirects to "/" (landing page, which auto-redirects to org or sign-in).
 * Returns admin context: permissions, isRoot status, loading state.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface AdminPermissions {
  canManagePages: boolean;
  canManageMarketData: boolean;
  canManageMaritimeIntel: boolean;
  canManageSettings: boolean;
  canManageAdmins: boolean;
  canManageNewsletter: boolean;
  canManagePorts: boolean;
}

export function useSuperAdminGuard() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isRoot, setIsRoot] = useState(false);
  const [permissions, setPermissions] = useState<AdminPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/platform/check-access")
      .then((res) => res.json())
      .then((data) => {
        if (data.isSuperAdmin === true) {
          setIsSuperAdmin(true);
          setIsRoot(data.isRoot === true);
          setPermissions(data.permissions || null);
        } else {
          // Not an admin — redirect to home
          router.replace("/");
        }
      })
      .catch(() => {
        router.replace("/");
      })
      .finally(() => setLoading(false));
  }, [router]);

  return { isSuperAdmin, isRoot, permissions, loading };
}
