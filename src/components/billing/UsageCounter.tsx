"use client";

/**
 * Usage Counter Badge
 * 
 * Displays "2/3 Free Calculations Used Today" for free orgs.
 * Hidden for paid orgs. Fetches usage from /api/usage.
 */

import { useEffect, useState, useCallback } from "react";
import { useOrganization } from "@clerk/nextjs";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageData {
  used: number;
  limit: number;
  isPaid: boolean;
}

interface UsageCounterProps {
  className?: string;
  /** Call this ref callback to trigger a refetch from the parent */
  onRefetch?: (refetchFn: () => void) => void;
}

export function UsageCounter({ className, onRefetch }: UsageCounterProps) {
  const { organization } = useOrganization();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    if (!organization) return;

    try {
      const res = await fetch("/api/usage");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setUsage(data.data.routePlanner);
      }
    } catch {
      // Silently fail — don't block the UI
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Expose refetch to parent
  useEffect(() => {
    if (onRefetch) {
      onRefetch(fetchUsage);
    }
  }, [onRefetch, fetchUsage]);

  // Don't render anything for paid orgs or while loading
  if (loading || !usage || usage.isPaid) return null;

  const remaining = usage.limit - usage.used;
  const isLow = remaining <= 1;
  const isExhausted = remaining <= 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
        isExhausted
          ? "bg-destructive/15 text-destructive border border-destructive/30"
          : isLow
          ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30"
          : "bg-muted text-muted-foreground border border-border",
        className
      )}
    >
      <Gauge className="h-3.5 w-3.5" />
      <span>
        {usage.used}/{usage.limit} Free Calculations Used Today
      </span>
    </div>
  );
}
