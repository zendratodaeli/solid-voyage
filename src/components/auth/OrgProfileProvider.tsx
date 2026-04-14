"use client";

/**
 * OrgProfileProvider
 * 
 * Fetches the active organization's profile completion status
 * and exposes it via React context. The org layout uses this
 * to gate access: if profileComplete === false, only the
 * onboarding form is rendered.
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useOrganization } from "@clerk/nextjs";

export interface OrgProfileData {
  profileComplete: boolean;
  imageUrl: string | null;
  logoSize: number;
  logoBorderRadius: string;
  companyLegalName: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  companyCountry: string | null;
  companyPostalCode: string | null;
  contactFullName: string | null;
  contactNickname: string | null;
  contactPhone: string | null;
  contactDepartment: string | null;
}

interface OrgProfileContextValue {
  profile: OrgProfileData | null;
  profileComplete: boolean;
  isLoading: boolean;
  refetch: () => void;
}

const OrgProfileContext = createContext<OrgProfileContextValue>({
  profile: null,
  profileComplete: false,
  isLoading: true,
  refetch: () => {},
});

export function useOrgProfile() {
  return useContext(OrgProfileContext);
}

export function OrgProfileProvider({ children }: { children: React.ReactNode }) {
  const { organization } = useOrganization();
  const [profile, setProfile] = useState<OrgProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!organization) {
      // Clerk hasn't resolved the org yet — stay in loading state
      // so the layout doesn't flash the onboarding gate.
      setProfile(null);
      return;
    }

    try {
      const res = await fetch("/api/org-profile");
      if (!res.ok) {
        setProfile(null);
        return;
      }

      const json = await res.json();
      if (json.success && json.data) {
        setProfile(json.data);
      }
    } catch {
      // Silently fail — don't break the layout
    } finally {
      setIsLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const profileComplete = profile?.profileComplete ?? false;

  return (
    <OrgProfileContext.Provider
      value={{ profile, profileComplete, isLoading, refetch: fetchProfile }}
    >
      {children}
    </OrgProfileContext.Provider>
  );
}
