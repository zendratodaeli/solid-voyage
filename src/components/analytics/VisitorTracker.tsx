"use client";

/**
 * VisitorTracker — Invisible client-side component that tracks page views.
 *
 * Fires a POST to /api/analytics/track on each page navigation.
 * Lightweight, non-blocking, and dedup-safe (server-side dedup by IP+path).
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function VisitorTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string>("");

  useEffect(() => {
    // Skip if same path (avoid duplicate on re-renders)
    if (pathname === lastTracked.current) return;
    lastTracked.current = pathname;

    // Fire async — don't block rendering
    const trackVisit = async () => {
      try {
        await fetch("/api/analytics/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: pathname,
            referrer: document.referrer || null,
          }),
        });
      } catch {
        // Silent fail — tracking should never impact UX
      }
    };

    // Small delay to not compete with page hydration
    const timer = setTimeout(trackVisit, 500);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null; // Invisible component
}
