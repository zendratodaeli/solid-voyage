import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public routes that are always accessible
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/pages(.*)",               // Public CMS page data
  "/api/platform/settings",       // Public GET for branding (PUT is guarded server-side)
  "/api/newsletter/subscribe",    // Public newsletter subscribe
  "/api/newsletter/unsubscribe",  // Public newsletter unsubscribe
  "/api/newsletter/confirm",      // Public newsletter confirm
  "/api/contact",                 // Public contact form
  "/api/analytics/track",          // Public visitor tracking
  "/api/weather",                   // Public weather proxy (Open-Meteo)
  "/api/navapi(.*)",                // Public NavAPI proxy (port search, routing)
  "/api/wpi",                       // Public World Port Index
  "/pages/(.*)",                   // Public CMS pages
  "/unsubscribe",                  // Public unsubscribe page
  "/confirm-subscription",         // Public confirm subscription page
]);

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // ──────────────────────────────────────────────────────
  // FAST REDIRECT: authenticated user on "/" → /{org}/dashboard
  // Runs at the edge — no DB, no API calls, no page render.
  // Clerk auth already has the orgSlug available.
  // ──────────────────────────────────────────────────────
  if (pathname === "/" && !req.nextUrl.searchParams.has("landing")) {
    const { userId, orgSlug } = await auth();
    if (userId) {
      if (orgSlug) {
        // Has an active org → go to dashboard
        const dashboardUrl = new URL(`/${orgSlug}/dashboard`, req.url);
        return NextResponse.redirect(dashboardUrl);
      }
      // No active org → redirect to sign-in with org creation prompt
      // Clerk will prompt them to create or select an organization
      const createOrgUrl = new URL(`/sign-in`, req.url);
      return NextResponse.redirect(createOrgUrl);
    }
    // Not authenticated → let them see the landing page
    return;
  }

  // Protect all routes except public ones
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
