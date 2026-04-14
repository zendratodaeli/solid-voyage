/**
 * UserActivityTracker — Client-side component for authenticated user behavior tracking.
 *
 * Tracks:
 * - Page views with feature classification
 * - Session duration (pings every 30s)
 * - Automatically captures userId and orgId from Clerk
 *
 * Invisible component — renders nothing.
 */

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

export function UserActivityTracker() {
  const pathname = usePathname();
  const { userId, orgId } = useAuth();
  const lastPath = useRef<string>("");
  const sessionStart = useRef<number>(Date.now());

  useEffect(() => {
    if (!userId || !pathname) return;
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;

    // Track page view (non-blocking, delayed)
    const timer = setTimeout(() => {
      fetch("/api/activity/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "page_view",
          path: pathname,
          orgId: orgId || null,
        }),
      }).catch(() => {});
    }, 300);

    return () => clearTimeout(timer);
  }, [pathname, userId, orgId]);

  // Track session duration on unload
  useEffect(() => {
    if (!userId) return;

    // Log session start
    fetch("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "session_start",
        path: window.location.pathname,
        orgId: orgId || null,
      }),
    }).catch(() => {});

    sessionStart.current = Date.now();

    const handleUnload = () => {
      const duration = Math.round((Date.now() - sessionStart.current) / 1000);
      // Use sendBeacon for reliability on page unload
      navigator.sendBeacon(
        "/api/activity/track",
        JSON.stringify({
          event: "action",
          action: "session_end",
          path: window.location.pathname,
          orgId: orgId || null,
          duration,
        })
      );
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [userId, orgId]);

  return null;
}
