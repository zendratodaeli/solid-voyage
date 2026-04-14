/**
 * Visitor Tracking API (Public)
 *
 * POST: Record a page view with IP geolocation data from ipinfo.io.
 * 
 * Deduplication: Same IP + path within 5 minutes = skipped.
 * IP Caching: ipinfo.io responses cached in memory (15 min TTL).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── IP Info Cache ──────────────────────────────────────────
interface GeoInfo {
  country: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
  timezone: string | null;
  org: string | null;
  latitude: number | null;
  longitude: number | null;
}

const geoCache = new Map<string, { data: GeoInfo; expires: number }>();
const GEO_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ─── User Agent Parser ──────────────────────────────────────
function parseUserAgent(ua: string): { device: string; browser: string; os: string } {
  // Device
  let device = "desktop";
  if (/mobile|android|iphone|ipod/i.test(ua)) device = "mobile";
  else if (/tablet|ipad/i.test(ua)) device = "tablet";

  // Browser
  let browser = "Unknown";
  if (/edg\//i.test(ua)) {
    const match = ua.match(/edg\/([\d.]+)/i);
    browser = `Edge ${match?.[1]?.split(".")[0] || ""}`.trim();
  } else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) {
    const match = ua.match(/chrome\/([\d.]+)/i);
    browser = `Chrome ${match?.[1]?.split(".")[0] || ""}`.trim();
  } else if (/firefox\//i.test(ua)) {
    const match = ua.match(/firefox\/([\d.]+)/i);
    browser = `Firefox ${match?.[1]?.split(".")[0] || ""}`.trim();
  } else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) {
    const match = ua.match(/version\/([\d.]+)/i);
    browser = `Safari ${match?.[1]?.split(".")[0] || ""}`.trim();
  }

  // OS
  let os = "Unknown";
  if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os x/i.test(ua)) os = "macOS";
  else if (/android ([\d.]+)/i.test(ua)) {
    const match = ua.match(/android ([\d.]+)/i);
    os = `Android ${match?.[1] || ""}`.trim();
  } else if (/iphone os|ipad.*os/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return { device, browser, os };
}

// ─── IP Geolocation ─────────────────────────────────────────
async function getGeoInfo(ip: string): Promise<GeoInfo> {
  const empty: GeoInfo = {
    country: null, countryCode: null, city: null,
    region: null, timezone: null, org: null,
    latitude: null, longitude: null,
  };

  // Skip private IPs
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { ...empty, country: "Local", countryCode: "LO", city: "Localhost" };
  }

  // Check cache
  const cached = geoCache.get(ip);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const token = process.env.IP_INFO_TOKEN;
  if (!token) return empty;

  try {
    const res = await fetch(`https://ipinfo.io/${ip}?token=${token}`, {
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (!res.ok) return empty;

    const data = await res.json();
    const [lat, lon] = (data.loc || "").split(",").map(Number);

    const geo: GeoInfo = {
      country: data.country ? getCountryName(data.country) : null,
      countryCode: data.country || null,
      city: data.city || null,
      region: data.region || null,
      timezone: data.timezone || null,
      org: data.org || null,
      latitude: isNaN(lat) ? null : lat,
      longitude: isNaN(lon) ? null : lon,
    };

    geoCache.set(ip, { data: geo, expires: Date.now() + GEO_CACHE_TTL });
    return geo;
  } catch {
    return empty;
  }
}

// ─── Country Code → Name ────────────────────────────────────
function getCountryName(code: string): string {
  try {
    const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

// ─── API Handler ────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { path, referrer } = body;

    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    // Get visitor IP
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ||
               req.headers.get("x-real-ip") ||
               "unknown";

    // Deduplication: skip if same IP+path within 5 minutes
    if (ip !== "unknown") {
      const recentView = await prisma.pageView.findFirst({
        where: {
          ip,
          path,
          createdAt: { gt: new Date(Date.now() - DEDUP_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (recentView) {
        return NextResponse.json({ tracked: false, reason: "duplicate" });
      }
    }

    // Get UA data
    const ua = req.headers.get("user-agent") || "";
    const { device, browser, os } = parseUserAgent(ua);

    // Get geo data (async, non-blocking feel via fire-and-forget if slow)
    const geo = await getGeoInfo(ip);

    // Store page view
    await prisma.pageView.create({
      data: {
        path,
        ip: ip !== "unknown" ? ip : null,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
        region: geo.region,
        timezone: geo.timezone,
        org: geo.org,
        latitude: geo.latitude,
        longitude: geo.longitude,
        userAgent: ua.substring(0, 500), // cap length
        device,
        browser,
        os,
        referrer: referrer?.substring(0, 500) || null,
      },
    });

    return NextResponse.json({ tracked: true });
  } catch (error) {
    console.error("[Visitor Track] Error:", error);
    return NextResponse.json({ error: "Failed to track" }, { status: 500 });
  }
}
