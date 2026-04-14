/**
 * Route Report Helper — Shared PDF Generation Logic
 *
 * Single entry point for generating route planner PDF reports.
 * Used by both the Route Planner page and the Saved Routes page
 * to eliminate code duplication and ensure consistent reports.
 */

import type { RoutePlannerPdfData } from "@/lib/pdf/route-planner-pdf";

/**
 * Parameters for generating a route report.
 * Supports two modes:
 * 1. "live" — from Route Planner (data already in component state)
 * 2. "saved" — from Saved Routes (data fetched from API by route ID)
 */
export interface GenerateRouteReportParams {
  /** Route calculation result (RouteResultData) */
  result: RoutePlannerPdfData["result"];
  /** Waypoint array with ports, passages, configs */
  waypoints: RoutePlannerPdfData["waypoints"];
  /** Average speed (knots) */
  speed: number;
  /** Vessel info (optional — omitted if no vessel selected) */
  vessel?: { name: string; dwt: number; vesselType: string } | null;
  /** Weather data (optional — passed directly when already fetched) */
  weather?: RoutePlannerPdfData["weather"];
  /** Map element ID for screenshot (optional) */
  mapElementId?: string;
}

/**
 * Load an image with CORS enabled, returning a fresh HTMLImageElement.
 * Used to re-fetch tiles that were originally loaded without crossOrigin.
 */
function loadCorsImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Captures a DOM element as a base64 PNG using native Canvas API.
 * Works with Leaflet maps by compositing tile layers and SVG overlays
 * without any external dependencies (no html2canvas needed).
 *
 * Strategy: Tries direct drawImage first. If tiles are tainted (CORS),
 * falls back to re-fetching each tile with crossOrigin="anonymous".
 */
async function captureMapElement(elementId: string): Promise<string | null> {
  try {
    const container = document.getElementById(elementId);
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return null;

    // Use higher DPI for print quality
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.scale(scale, scale);

    // 1. Draw a background (map tiles use white/light base)
    ctx.fillStyle = "#e8ecf0";
    ctx.fillRect(0, 0, width, height);

    const containerRect = container.getBoundingClientRect();

    // 2. Draw all tile images from Leaflet tile layers
    const tileImages = container.querySelectorAll<HTMLImageElement>(".leaflet-tile-pane img");
    for (const img of Array.from(tileImages)) {
      if (!img.complete || img.naturalWidth === 0) continue;
      const imgRect = img.getBoundingClientRect();
      const x = imgRect.left - containerRect.left;
      const y = imgRect.top - containerRect.top;

      try {
        // Try direct draw first (works if tile has crossOrigin set)
        ctx.drawImage(img, x, y, imgRect.width, imgRect.height);
      } catch {
        // Tile is tainted — re-fetch with CORS
        try {
          const corsImg = await loadCorsImage(img.src);
          ctx.drawImage(corsImg, x, y, imgRect.width, imgRect.height);
        } catch {
          // Tile server doesn't support CORS — skip this tile
        }
      }
    }

    // 3. Draw SVG overlays (route lines, zone polygons)
    const svgs = container.querySelectorAll<SVGSVGElement>(".leaflet-overlay-pane svg");
    for (const svg of Array.from(svgs)) {
      try {
        const svgRect = svg.getBoundingClientRect();
        const x = svgRect.left - containerRect.left;
        const y = svgRect.top - containerRect.top;

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const svgUrl = URL.createObjectURL(svgBlob);

        const svgImage = new Image();
        await new Promise<void>((resolve, reject) => {
          svgImage.onload = () => resolve();
          svgImage.onerror = reject;
          svgImage.src = svgUrl;
        });

        ctx.drawImage(svgImage, x, y, svgRect.width, svgRect.height);
        URL.revokeObjectURL(svgUrl);
      } catch {
        // SVG rendering issue — skip
      }
    }

    // 4. Draw marker images (port icons, waypoints)
    const markers = container.querySelectorAll<HTMLImageElement>(".leaflet-marker-pane img");
    for (const marker of Array.from(markers)) {
      if (!marker.complete || marker.naturalWidth === 0) continue;
      try {
        const markerRect = marker.getBoundingClientRect();
        const x = markerRect.left - containerRect.left;
        const y = markerRect.top - containerRect.top;
        ctx.drawImage(marker, x, y, markerRect.width, markerRect.height);
      } catch {}
    }

    // 5. Export canvas — wrapped in try/catch for any remaining taint
    try {
      return canvas.toDataURL("image/png", 0.92);
    } catch {
      console.warn("[Map Capture] Canvas tainted, cannot export");
      return null;
    }
  } catch (err) {
    console.warn("[Map Capture] Failed to capture map:", err);
    return null;
  }
}

/**
 * Generates a route planner PDF report with full org branding.
 * Handles fetching org theme and capturing the map internally.
 */
export async function generateRouteReport(params: GenerateRouteReportParams): Promise<void> {
  const { generateRoutePlannerPdf } = await import("@/lib/pdf/route-planner-pdf");

  // Capture map screenshot (if element is available — Route Planner page)
  let mapImageBase64: string | null = null;
  if (params.mapElementId) {
    mapImageBase64 = await captureMapElement(params.mapElementId);
  }

  // Fetch org branding
  let orgName: string | undefined;
  let orgLogoUrl: string | undefined;
  try {
    const res = await fetch("/api/org-theme");
    const data = await res.json();
    if (data.success) {
      orgName = data.data?.orgName;
      orgLogoUrl = data.data?.orgLogoUrl;
    }
  } catch {}

  await generateRoutePlannerPdf({
    result: params.result,
    waypoints: params.waypoints,
    speed: params.speed,
    vessel: params.vessel || null,
    mapElementId: params.mapElementId,
    mapImageBase64: mapImageBase64 || undefined,
    orgName,
    orgLogoUrl,
    weather: params.weather,
  });
}

/**
 * Fetches vessel data by ID and returns the subset needed for PDF.
 * Returns null if vessel not found or fetch fails.
 */
export async function fetchVesselForReport(
  vesselId: string
): Promise<{ name: string; dwt: number; vesselType: string } | null> {
  try {
    const res = await fetch(`/api/vessels/${vesselId}`);
    const data = await res.json();
    if (data.success && data.data) {
      return {
        name: data.data.name,
        dwt: data.data.dwt,
        vesselType: data.data.vesselType,
      };
    }
  } catch {}
  return null;
}

/**
 * Fetches live weather for route coordinates (for saved routes
 * that don't have weather data cached in state).
 */
export async function fetchWeatherForReport(
  routeResult: any
): Promise<RoutePlannerPdfData["weather"] | undefined> {
  try {
    if (!routeResult?.legs?.length) return undefined;

    // Collect coordinates from leg endpoints
    const coords: { lat: number; lon: number }[] = [];
    routeResult.legs.forEach((leg: any) => {
      if (leg.from?.coordinates) {
        coords.push({ lat: leg.from.coordinates[1], lon: leg.from.coordinates[0] });
      }
      if (leg.to?.coordinates) {
        coords.push({ lat: leg.to.coordinates[1], lon: leg.to.coordinates[0] });
      }
    });

    // Sample up to 10 evenly-spaced points
    const step = Math.max(1, Math.floor(coords.length / 10));
    const sampled = coords.filter((_, i) => i % step === 0).slice(0, 10);
    if (sampled.length < 2) return undefined;

    const latParam = sampled.map(c => c.lat.toFixed(4)).join(",");
    const lonParam = sampled.map(c => c.lon.toFixed(4)).join(",");
    const res = await fetch(`/api/weather?lat=${latParam}&lon=${lonParam}&forecast_days=3`);
    const json = await res.json();
    // API returns { success: true, data: RouteWeatherSummary }
    // We need the inner `data` object which contains waypoints, worstConditions, etc.
    if (json.success && json.data) return json.data;
  } catch {}
  return undefined;
}
