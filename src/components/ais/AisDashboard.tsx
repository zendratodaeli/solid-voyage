"use client";

/**
 * AIS Dashboard — Live vessel tracking with Leaflet
 *
 * Features:
 * - Ship search (autocomplete with 280ms debounce)
 * - Fleet auto-loading from Prisma DB
 * - Historical tracks
 * - Within Range query
 * - Find by Destination query
 * - Rotated ship markers via leaflet-rotatedmarker (CDN)
 * - Dark-themed ship popups
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type L from "leaflet";
import {
  Search,
  Ship,
  History,
  Radar,
  Navigation,
  Loader2,
  AlertTriangle,
  Zap,
  X,
  RefreshCw,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrgTheme } from "@/components/auth/OrgThemeProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  searchShips,
  getLastPosition,
  getOrgFleetPositions,
  getFleetPositions,
  getHistoricalTracks,
  getWithinRange,
  findByDestination,
  type AisShipSearchResult,
  type AisVesselPosition,
} from "@/actions/ais-actions";

import {
  getNavStatus,
  getShipTypeLabel,
  getFlagUrl,
  SHIP_TYPE_FILTER_OPTIONS,
} from "@/lib/ais-dictionaries";

// ── react-leaflet: single dynamic wrapper to preserve sub-components ──
const AisMapWrapper = dynamic(
  () => import("./AisMapWrapper"),
  { ssr: false }
) as React.ComponentType<{ onMapReady: (map: L.Map) => void }>;

// ── Constants ──
const DEFAULT_CENTER: [number, number] = [25, 0];
const DEFAULT_ZOOM = 3;
const SHIP_ICON_URL = "https://general-icons.navapi.cc/ShipIcon.svg";
const SHIP_ICON_SIZE = 17;
const DEBOUNCE_MS = 280;

// ── Dark popup CSS (injected once) ──
const POPUP_CSS = `
.ais-dark-popup .leaflet-popup-content-wrapper {
  background: #272932 !important; color: #fff !important;
  border: 1px solid #EF413D !important; box-shadow: none !important;
  max-width: 420px !important; border-radius: 6px !important;
}
.ais-dark-popup .leaflet-popup-content {
  margin: 5px 7px !important; line-height: 1.3em !important; font-size: 13px !important;
}
.ais-dark-popup .leaflet-popup-tip { background: #272932 !important; }
.ais-dark-popup .leaflet-popup-content table { border-collapse: collapse; width: 100%; }
.ais-dark-popup .leaflet-popup-content table td { padding: 2px 4px; vertical-align: top; }
.ais-dark-popup .leaflet-popup-content tr:nth-child(odd) { background: #2c2c34; }
.ais-dark-popup .leaflet-popup-content tr:nth-child(even) { background: #1f1f23; }
.ais-dark-popup .leaflet-popup-content table td:first-child strong { color: #DCE0E2 !important; }
`;

// ── Helpers ──
function dv(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
function dn(v: unknown, dec?: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return dec !== undefined ? n.toFixed(dec) : String(n);
}
function toIsoNoMs(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildPopupHtml(v: AisVesselPosition): string {
  const flagUrl = getFlagUrl(v.ShipFlag ?? "");
  const flagImg = flagUrl
    ? `<img src="${flagUrl}" alt="${v.ShipFlag}" style="width:24px;height:16px;vertical-align:middle;margin-right:6px;" />`
    : "";
  return `<table>
    <tr><td><strong>Name:</strong></td><td>${dv(v.ShipName)}</td></tr>
    <tr><td><strong>Flag:</strong></td><td>${flagImg}${dv(v.ShipFlag)}</td></tr>
    <tr><td><strong>IMO:</strong></td><td>${dv(v.ImoNumber)}</td></tr>
    <tr><td><strong>MMSI:</strong></td><td>${dv(v.MmsiNumber)}</td></tr>
    <tr><td><strong>Call Sign:</strong></td><td>${dv(v.CallSign)}</td></tr>
    <tr><td><strong>Ship Type:</strong></td><td>${getShipTypeLabel(v.ShipType)}</td></tr>
    <tr><td><strong>Nav Status:</strong></td><td>${getNavStatus(v.NavigationStatus)}</td></tr>
    <tr><td><strong>SOG (kt):</strong></td><td>${dn(v.SpeedOverGround, 1)}</td></tr>
    <tr><td><strong>COG (°):</strong></td><td>${dn(v.CourseOverGround, 0)}</td></tr>
    <tr><td><strong>Heading (°):</strong></td><td>${dn(v.CourseTransmitted, 0)}</td></tr>
    <tr><td><strong>Destination:</strong></td><td>${dv(v.DestDeclared)}</td></tr>
    <tr><td><strong>ETA:</strong></td><td>${dv(v.EtaDeclared)}</td></tr>
    <tr><td><strong>Draught:</strong></td><td>${dv(v.DraughtDeclared)}</td></tr>
    <tr><td><strong>Updated:</strong></td><td>${dv(v.PositionLastUpdated)}</td></tr>
  </table>`;
}

function createShipIcon(Leaf: typeof L) {
  return Leaf.icon({
    iconUrl: SHIP_ICON_URL,
    iconSize: [SHIP_ICON_SIZE, SHIP_ICON_SIZE],
    iconAnchor: [SHIP_ICON_SIZE / 2, SHIP_ICON_SIZE / 2],
  });
}

// ── Token budget badge ──
function TokenBadge() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-400 cursor-help">
            <Zap className="h-2.5 w-2.5 mr-0.5" />
            API
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">Uses API tokens from your NavAPI quota</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function AisDashboard({ orgId }: { orgId: string }) {
  const leafletRef = useRef<typeof L | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const trackRef = useRef<L.Polyline | null>(null);
  const arrowMarkersRef = useRef<L.Marker[]>([]);
  const rangeCircleRef = useRef<L.Circle | null>(null);
  const [mounted, setMounted] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AisShipSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fleet state
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetCount, setFleetCount] = useState(0);
  const [fleetAdHoc, setFleetAdHoc] = useState("");
  
  // Auto-refresh state (initialized from org preference)
  const { theme: orgTheme } = useOrgTheme();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const orgThemeInitRef = useRef(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const counterRef = useRef<NodeJS.Timeout | null>(null);

  // Sync org preference on first load
  useEffect(() => {
    if (!orgThemeInitRef.current && orgTheme.aisAutoRefresh) {
      setAutoRefresh(true);
      orgThemeInitRef.current = true;
    }
  }, [orgTheme.aisAutoRefresh]);

  // Tracks state
  const [tracksMmsi, setTracksMmsi] = useState("");
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksDateFrom, setTracksDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 16);
  });
  const [tracksDateTo, setTracksDateTo] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );

  // Range state
  const [rangeLat, setRangeLat] = useState("");
  const [rangeLon, setRangeLon] = useState("");
  const [rangeKm, setRangeKm] = useState("25");
  const [rangeShipType, setRangeShipType] = useState("0");
  const [rangeLoading, setRangeLoading] = useState(false);

  // Destination state
  const [destName, setDestName] = useState("");
  const [destShipType, setDestShipType] = useState("70");
  const [destLoading, setDestLoading] = useState(false);
  const [destDateFrom, setDestDateFrom] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [destDateTo, setDestDateTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 16);
  });

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  // Status
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK_AIS === "true";

  // ── Mount detection + CSS injection + dynamic leaflet import ──
  useEffect(() => {
    // Dynamically import leaflet (avoids "window is not defined" in SSR)
    import("leaflet").then((mod) => {
      leafletRef.current = mod.default ?? mod;
      setMounted(true);
    });

    // Inject Leaflet CSS
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Inject dark popup CSS
    if (!document.getElementById("ais-popup-css")) {
      const style = document.createElement("style");
      style.id = "ais-popup-css";
      style.textContent = POPUP_CSS;
      document.head.appendChild(style);
    }

    // Inject leaflet-rotatedmarker
    if (!document.querySelector('script[src*="rotatedMarker"]')) {
      const s = document.createElement("script");
      s.src =
        "https://cdn.jsdelivr.net/npm/leaflet-rotatedmarker@0.2.0/leaflet.rotatedMarker.min.js";
      document.head.appendChild(s);
    }
  }, []);

  // ── Map utilities ──
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, []);

  const clearArrows = useCallback(() => {
    arrowMarkersRef.current.forEach((m) => m.remove());
    arrowMarkersRef.current = [];
  }, []);

  const clearRangeCircle = useCallback(() => {
    if (rangeCircleRef.current) {
      rangeCircleRef.current.remove();
      rangeCircleRef.current = null;
    }
  }, []);

  const clearTrack = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.remove();
      trackRef.current = null;
    }
    clearArrows();
    clearRangeCircle();
  }, [clearArrows, clearRangeCircle]);

  const addVesselMarker = useCallback(
    (v: AisVesselPosition) => {
      const Leaf = leafletRef.current;
      const map = mapRef.current;
      if (!map || !Leaf) return;
      const lat = Number(v.Latitude);
      const lon = Number(v.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const courseTx = Number(v.CourseTransmitted);
      const angle =
        Number.isFinite(courseTx) ? ((courseTx % 360) + 360) % 360 : 0;

      const marker = Leaf.marker([lat, lon], {
        icon: createShipIcon(Leaf),
        // leaflet-rotatedmarker extends marker options at runtime
        rotationAngle: angle,
        rotationOrigin: "center center",
      } as L.MarkerOptions & { rotationAngle: number; rotationOrigin: string }).addTo(map);

      marker.bindPopup(buildPopupHtml(v), {
        className: "ais-dark-popup",
        maxWidth: 420,
      });

      markersRef.current.push(marker);
    },
    []
  );

  const fitToMarkers = useCallback(() => {
    const Leaf = leafletRef.current;
    const map = mapRef.current;
    if (!map || !Leaf || markersRef.current.length === 0) return;
    const group = Leaf.featureGroup(markersRef.current);
    map.fitBounds(group.getBounds().pad(0.1));
  }, []);

  // ── 1. SEARCH ──
  const handleSearchInput = useCallback(
    (val: string) => {
      setSearchQuery(val);
      setErrorMsg("");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const clean = val.replace(/[^\w\s]/g, "").trim();
      if (clean.length < 3) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setSearchLoading(true);
        const res = await searchShips(clean);
        setSearchLoading(false);
        if (res.success && res.data) {
          setSearchResults(res.data);
          setShowDropdown(res.data.length > 0);
        }
      }, DEBOUNCE_MS);
    },
    []
  );

  const handleSelectShip = useCallback(
    async (ship: AisShipSearchResult) => {
      setShowDropdown(false);
      setSearchQuery(ship.ShipName || ship.MmsiNumber);
      setSearchResults([]);
      setStatusMsg("Fetching position…");
      setErrorMsg("");

      const res = await getLastPosition({ mmsi: ship.MmsiNumber });
      setStatusMsg("");

      if (!res.success || !res.data?.length) {
        setErrorMsg(res.error || "No position found");
        return;
      }

      clearMarkers();
      clearTrack();
      res.data.forEach(addVesselMarker);
      fitToMarkers();
    },
    [clearMarkers, clearTrack, addVesselMarker, fitToMarkers]
  );

  // ── 2. FLEET (with ad-hoc MMSI/IMO merge) ──
  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    setStatusMsg("Loading fleet positions…");
    setErrorMsg("");

    // Parse ad-hoc MMSI/IMO numbers
    const adHocIds = fleetAdHoc
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const adHocMmsi = adHocIds.filter((id) => id.length === 9 && /^\d+$/.test(id));
    const adHocImo = adHocIds.filter((id) => id.length === 7 && /^\d+$/.test(id));

    // Load org fleet + ad-hoc in parallel
    const [orgRes, adHocRes] = await Promise.all([
      orgId ? getOrgFleetPositions(orgId) : Promise.resolve({ success: true as const, data: [] as AisVesselPosition[] }),
      adHocMmsi.length > 0 || adHocImo.length > 0
        ? getFleetPositions({ mmsiNumbers: adHocMmsi, imoNumbers: adHocImo })
        : Promise.resolve({ success: true as const, data: [] as AisVesselPosition[] }),
    ]);

    setFleetLoading(false);
    setStatusMsg("");

    if (!orgRes.success) {
      setErrorMsg(orgRes.error || "Fleet loading failed");
      return;
    }

    clearMarkers();
    clearTrack();
    const allVessels = [...(orgRes.data ?? []), ...(adHocRes.data ?? [])];
    setFleetCount(allVessels.length);
    allVessels.forEach(addVesselMarker);
    fitToMarkers();

    if (allVessels.length === 0) {
      setErrorMsg("No vessels found. Add MMSI/IMO numbers or check your fleet.");
    }
    setLastRefreshed(new Date());
    setSecondsAgo(0);
  }, [orgId, fleetAdHoc, clearMarkers, clearTrack, addVesselMarker, fitToMarkers]);

  // ── Auto-refresh timer ──
  useEffect(() => {
    // Clear existing timer
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }

    if (autoRefresh) {
      // Initial load if not already loaded
      if (fleetCount === 0) {
        loadFleet();
      }
      // Set interval: refresh every 60 seconds
      autoRefreshRef.current = setInterval(() => {
        loadFleet();
      }, 60_000);
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [autoRefresh, fleetCount, loadFleet]);

  // ── Seconds-ago counter ──
  useEffect(() => {
    if (counterRef.current) {
      clearInterval(counterRef.current);
      counterRef.current = null;
    }

    if (lastRefreshed) {
      counterRef.current = setInterval(() => {
        setSecondsAgo(Math.floor((Date.now() - lastRefreshed.getTime()) / 1000));
      }, 1000);
    }

    return () => {
      if (counterRef.current) {
        clearInterval(counterRef.current);
      }
    };
  }, [lastRefreshed]);

  // ── 3. HISTORICAL TRACKS ──
  const loadTracks = useCallback(async () => {
    if (!tracksMmsi.trim()) {
      setErrorMsg("Enter a MMSI number");
      return;
    }

    // Validate date range max 1 month (NavAPI limit)
    const from = new Date(tracksDateFrom);
    const to = new Date(tracksDateTo);
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 31) {
      setErrorMsg("Max 1-month range for historical tracks (NavAPI limit)");
      return;
    }
    if (diffDays <= 0) {
      setErrorMsg("End date must be after start date");
      return;
    }

    setTracksLoading(true);
    setStatusMsg("Fetching historical tracks…");
    setErrorMsg("");

    // Extract date portion and use full-day UTC boundaries
    // NavAPI expects "YYYY-MM-DDTHH:MM:SSZ" format
    // Using 00:01:00Z and 23:59:00Z matches the NavAPI reference implementation
    const fromDateStr = tracksDateFrom.slice(0, 10); // "YYYY-MM-DD"
    const toDateStr = tracksDateTo.slice(0, 10);     // "YYYY-MM-DD"

    const res = await getHistoricalTracks({
      mmsiNumber: tracksMmsi.trim(),
      historyFrom: `${fromDateStr}T00:01:00Z`,
      historyUntil: `${toDateStr}T23:59:00Z`,
    });

    setTracksLoading(false);
    setStatusMsg("");

    if (!res.success || !res.data?.length) {
      setErrorMsg(res.error || "No tracks found");
      return;
    }

    clearMarkers();
    clearTrack();

    const trackData = res.data[0];
    const points = (trackData.EnquiredDataArray ?? [])
      .map((p) => {
        const lat = Number(p.Latitude);
        const lon = Number(p.Longitude);
        return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] as [number, number] : null;
      })
      .filter((p): p is [number, number] => p !== null);

    if (points.length > 0) {
      const Leaf = leafletRef.current;
      const map = mapRef.current;
      if (map && Leaf) {
        // Dashed red polyline matching reference HTML
        trackRef.current = Leaf.polyline(points, {
          color: "#F36257",
          weight: 2.5,
          opacity: 0.8,
          dashArray: "5,5",
        }).addTo(map);
        map.fitBounds(trackRef.current.getBounds().pad(0.1));

        // Directional arrow markers along the track
        const trackPoints = trackData.EnquiredDataArray ?? [];
        const arrowSvg = `data:image/svg+xml;base64,${btoa('<svg width="12" height="12" viewBox="0 0 12 12" fill="#272932" xmlns="http://www.w3.org/2000/svg"><polygon points="6,1 1,11 11,11"/></svg>')}`;
        const arrowIcon = Leaf.icon({
          iconUrl: arrowSvg,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        // Skip-sample: place arrow every 2nd point to avoid clutter
        const step = Math.max(1, Math.floor(trackPoints.length / 20));
        for (let i = 0; i < trackPoints.length; i += step) {
          const pos = trackPoints[i];
          const lat = Number(pos.Latitude);
          const lon = Number(pos.Longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const cog = Number(pos.CourseOverGround) || 0;

          const arrowMarker = Leaf.marker([lat, lon], {
            icon: arrowIcon,
            rotationAngle: cog,
            rotationOrigin: "center center",
          } as L.MarkerOptions & { rotationAngle: number; rotationOrigin: string }).addTo(map);

          arrowMarker.bindPopup(
            `<div style="background:#272932;color:#fff;padding:6px;border-radius:4px;font-size:12px;">
              <b>COG:</b> ${pos.CourseOverGround ?? '—'}°<br/>
              <b>SOG:</b> ${pos.SpeedOverGround ?? '—'} kt<br/>
              <b>Time:</b> ${pos.PositionLastUpdated ?? '—'}
            </div>`,
            { className: "ais-dark-popup" }
          );
          arrowMarkersRef.current.push(arrowMarker);
        }
      }
    }

    setStatusMsg(`Track: ${points.length} positions plotted`);
  }, [tracksMmsi, tracksDateFrom, tracksDateTo, clearMarkers, clearTrack]);

  // ── 4. WITHIN RANGE (with circle overlay) ──
  const executeRange = useCallback(async () => {
    const lat = parseFloat(rangeLat);
    const lon = parseFloat(rangeLon);
    const km = parseFloat(rangeKm);
    const st = parseInt(rangeShipType);

    setRangeLoading(true);
    setStatusMsg("Searching within range…");
    setErrorMsg("");

    const res = await getWithinRange({
      latitude: lat,
      longitude: lon,
      km,
      shipType: st,
    });

    setRangeLoading(false);
    setStatusMsg("");

    if (!res.success) {
      setErrorMsg(res.error || "WithinRange failed");
      return;
    }

    clearMarkers();
    clearTrack();

    // Draw translucent circle overlay
    const Leaf = leafletRef.current;
    const map = mapRef.current;
    if (map && Leaf) {
      rangeCircleRef.current = Leaf.circle([lat, lon], {
        radius: km * 1000, // Leaflet Circle takes meters
        color: "#F36257",
        fillColor: "#F36257",
        fillOpacity: 0.1,
        weight: 1.5,
        dashArray: "5,5",
      }).addTo(map);
    }

    const vessels = res.data ?? [];
    vessels.forEach((v) =>
      addVesselMarker(v as unknown as AisVesselPosition)
    );
    if (vessels.length > 0) {
      fitToMarkers();
    } else if (map) {
      map.setView([lat, lon], 9);
    }
    setStatusMsg(`Found ${vessels.length} vessels`);
  }, [rangeLat, rangeLon, rangeKm, rangeShipType, clearMarkers, clearTrack, addVesselMarker, fitToMarkers]);

  const loadRange = useCallback(() => {
    const lat = parseFloat(rangeLat);
    const lon = parseFloat(rangeLon);
    const km = parseFloat(rangeKm);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setErrorMsg("Enter valid Latitude and Longitude");
      return;
    }
    if (!Number.isFinite(km) || km <= 0 || km > 1000) {
      setErrorMsg("Km must be between 1 and 1000");
      return;
    }
    const st = parseInt(rangeShipType);
    if (!Number.isFinite(st)) {
      setErrorMsg("Select a Ship Type");
      return;
    }

    // Skip confirmation in mock mode
    if (isMockMode) {
      executeRange();
      return;
    }
    setConfirmAction(() => executeRange);
    setConfirmOpen(true);
  }, [rangeLat, rangeLon, rangeKm, rangeShipType, isMockMode, executeRange]);

  // ── 5. FIND BY DESTINATION (multi-destination) ──
  const executeDest = useCallback(async () => {
    const st = parseInt(destShipType);
    const from = new Date(destDateFrom);
    const to = new Date(destDateTo);

    // Parse comma-separated destinations into array
    const destinations = destName
      .split(/[,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    setDestLoading(true);
    setStatusMsg("Searching by destination…");
    setErrorMsg("");

    const res = await findByDestination({
      destDeclared: destinations,
      etaFrom: toIsoNoMs(from),
      etaUntil: toIsoNoMs(to),
      shipType: st,
    });

    setDestLoading(false);
    setStatusMsg("");

    if (!res.success) {
      setErrorMsg(res.error || "FindByDestination failed");
      return;
    }

    clearMarkers();
    clearTrack();
    const vessels = res.data ?? [];
    vessels.forEach((v) =>
      addVesselMarker(v as unknown as AisVesselPosition)
    );
    fitToMarkers();
    setStatusMsg(`Found ${vessels.length} vessels heading to ${destinations.join(", ")}`);
  }, [destName, destShipType, destDateFrom, destDateTo, clearMarkers, clearTrack, addVesselMarker, fitToMarkers]);

  const loadDest = useCallback(() => {
    if (!destName.trim()) {
      setErrorMsg("Enter a destination name");
      return;
    }
    const st = parseInt(destShipType);
    if (!Number.isFinite(st) || st === 0) {
      setErrorMsg("Select a specific Ship Type filter");
      return;
    }

    const from = new Date(destDateFrom);
    const to = new Date(destDateTo);
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 3) {
      setErrorMsg("Max 3-day ETA range to conserve API tokens");
      return;
    }
    if (diffDays <= 0) {
      setErrorMsg("End date must be after start date");
      return;
    }

    // Skip confirmation in mock mode
    if (isMockMode) {
      executeDest();
      return;
    }
    setConfirmAction(() => executeDest);
    setConfirmOpen(true);
  }, [destName, destShipType, destDateFrom, destDateTo, isMockMode, executeDest]);

  // ── Map click handler for Range tab ──
  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    map.on("click", (e: L.LeafletMouseEvent) => {
      setRangeLat(e.latlng.lat.toFixed(6));
      setRangeLon(e.latlng.lng.toFixed(6));
    });
  }, []);

  // ── Ship type select options ──
  const shipTypeOptions = useMemo(
    () =>
      SHIP_TYPE_FILTER_OPTIONS.map((o) => (
        <SelectItem key={o.value} value={String(o.value)}>
          {o.value === 0 ? "All Ship Types" : `[${o.value}] ${o.label}`}
        </SelectItem>
      )),
    []
  );

  if (!mounted) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {/* ── Controls Panel (Top) ── */}
      <div className="w-full bg-background border-b relative z-[1001]">
        <Tabs defaultValue="search" className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-10">
            <TabsTrigger value="search" className="px-2 gap-1.5 text-xs">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </TabsTrigger>
            <TabsTrigger value="fleet" className="px-2 gap-1.5 text-xs">
              <Ship className="h-4 w-4" />
              <span className="hidden sm:inline">Fleet</span>
            </TabsTrigger>
            <TabsTrigger value="tracks" className="px-2 gap-1.5 text-xs">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Tracks</span>
            </TabsTrigger>
            <TabsTrigger value="range" className="px-2 gap-1.5 text-xs">
              <Radar className="h-4 w-4" />
              <span className="hidden sm:inline">Range</span>
            </TabsTrigger>
            <TabsTrigger value="dest" className="px-2 gap-1.5 text-xs">
              <Navigation className="h-4 w-4" />
              <span className="hidden sm:inline">Destination</span>
            </TabsTrigger>
          </TabsList>

          {/* ───── SEARCH TAB ───── */}
          <TabsContent value="search" className="p-3 space-y-2 mt-0">
            <h3 className="text-sm font-semibold">Ship Search</h3>
            <div className="relative">
              <Input
                placeholder="Enter name, IMO, MMSI, or call sign…"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="text-sm"
              />
              {searchLoading && (
                <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto z-[2000]">
                  {searchResults.map((ship, idx) => {
                    const flagUrl = getFlagUrl(ship.ShipFlag);
                    return (
                      <button
                        key={`${ship.MmsiNumber}-${idx}`}
                        className="w-full text-left px-3 py-2 hover:bg-accent/50 border-b last:border-b-0 transition-colors"
                        onClick={() => handleSelectShip(ship)}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {flagUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={flagUrl}
                              alt={ship.ShipFlag}
                              className="w-5 h-3.5 object-cover"
                            />
                          )}
                          {ship.ShipName || "Unknown"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          IMO: {ship.ImoNumber || "—"} · MMSI:{" "}
                          {ship.MmsiNumber || "—"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ───── FLEET TAB ───── */}
          <TabsContent value="fleet" className="p-3 space-y-3 mt-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">My Fleet</h3>
              <div className="flex items-center gap-2">
                <TokenBadge />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-loads vessels from your organization database. You can also add vessels manually below.
            </p>

            {/* Auto-refresh toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-accent/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "text-emerald-400 animate-spin" : "text-muted-foreground"}`}
                  style={autoRefresh ? { animationDuration: "3s" } : undefined}
                />
                <span className="text-xs font-medium">
                  Auto-refresh
                </span>
              </div>
              <button
                onClick={() => {
                  const next = !autoRefresh;
                  setAutoRefresh(next);
                  // Persist to org settings (fire-and-forget)
                  fetch("/api/org-theme", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ aisAutoRefresh: next }),
                  }).catch(() => { /* silent */ });
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  autoRefresh ? "bg-emerald-500" : "bg-zinc-600"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    autoRefresh ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Last updated counter */}
            {lastRefreshed && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Timer className="h-3 w-3" />
                <span>
                  Last updated: {secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`}
                  {autoRefresh && " · next in " + Math.max(0, 60 - secondsAgo) + "s"}
                </span>
              </div>
            )}

            <div>
              <Label className="text-xs">Additional MMSI / IMO Numbers</Label>
              <Textarea
                placeholder="Enter MMSI (9 digits) or IMO (7 digits), comma-separated&#10;e.g. 255806353, 9508395, 357512386"
                value={fleetAdHoc}
                onChange={(e) => setFleetAdHoc(e.target.value)}
                className="text-xs mt-1 min-h-[60px]"
                rows={2}
              />
            </div>
            <Button
              onClick={loadFleet}
              disabled={fleetLoading}
              className="w-full"
              size="sm"
            >
              {fleetLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {fleetLoading ? "Loading…" : "Load Fleet Positions"}
            </Button>
            {fleetCount > 0 && (
              <p className="text-xs text-green-400">
                {fleetCount} vessel(s) plotted on map
                {autoRefresh && " · auto-refreshing"}
              </p>
            )}
          </TabsContent>

          {/* ───── TRACKS TAB ───── */}
          <TabsContent value="tracks" className="p-3 space-y-3 mt-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Historical Tracks</h3>
              <TokenBadge />
            </div>
            <div>
              <Label className="text-xs">MMSI Number</Label>
              <Input
                placeholder="e.g. 477123456"
                value={tracksMmsi}
                onChange={(e) => setTracksMmsi(e.target.value)}
                className="text-sm mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">From</Label>
                <Input
                  type="datetime-local"
                  value={tracksDateFrom}
                  onChange={(e) => setTracksDateFrom(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Until</Label>
                <Input
                  type="datetime-local"
                  value={tracksDateTo}
                  onChange={(e) => setTracksDateTo(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>
            </div>
            <p className="text-[10px] text-amber-400/80">
              ⚠ Max 1-month range. Default: last 24 hours.
            </p>
            <Button
              onClick={loadTracks}
              disabled={tracksLoading}
              className="w-full"
              size="sm"
            >
              {tracksLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Fetch Tracks
            </Button>
          </TabsContent>

          {/* ───── RANGE TAB ───── */}
          <TabsContent value="range" className="p-3 space-y-3 mt-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Within Range</h3>
              <TokenBadge />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Click the map to set coordinates, or enter manually.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Latitude</Label>
                <Input
                  placeholder="e.g. 1.2644"
                  value={rangeLat}
                  onChange={(e) => setRangeLat(e.target.value)}
                  className="text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Longitude</Label>
                <Input
                  placeholder="e.g. 103.8200"
                  value={rangeLon}
                  onChange={(e) => setRangeLon(e.target.value)}
                  className="text-sm mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Radius (km) — max 50 km</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={rangeKm}
                onChange={(e) => setRangeKm(e.target.value)}
                className="text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Ship Type</Label>
              <Select value={rangeShipType} onValueChange={setRangeShipType}>
                <SelectTrigger className="mt-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[2000]">{shipTypeOptions}</SelectContent>
              </Select>
            </div>
            <Button
              onClick={loadRange}
              disabled={rangeLoading}
              className="w-full"
              size="sm"
            >
              {rangeLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Search Within Range
            </Button>
          </TabsContent>

          {/* ───── DESTINATION TAB ───── */}
          <TabsContent value="dest" className="p-3 space-y-3 mt-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Find by Destination</h3>
              <TokenBadge />
            </div>
            <div>
              <Label className="text-xs">Destination(s) — comma-separated</Label>
              <Input
                placeholder="e.g. ROTTERDAM, DEHAM, Helsinki"
                value={destName}
                onChange={(e) => setDestName(e.target.value)}
                className="text-sm mt-1 uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">ETA From</Label>
                <Input
                  type="datetime-local"
                  value={destDateFrom}
                  onChange={(e) => setDestDateFrom(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">ETA Until</Label>
                <Input
                  type="datetime-local"
                  value={destDateTo}
                  onChange={(e) => setDestDateTo(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>
            </div>
            <p className="text-[10px] text-amber-400/80">
              ⚠ Max 3-day ETA range. Ship Type filter required.
            </p>
            <div>
              <Label className="text-xs">Ship Type (required)</Label>
              <Select value={destShipType} onValueChange={setDestShipType}>
                <SelectTrigger className="mt-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[2000]">{shipTypeOptions}</SelectContent>
              </Select>
            </div>
            <Button
              onClick={loadDest}
              disabled={destLoading}
              className="w-full"
              size="sm"
            >
              {destLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Find Vessels
            </Button>
          </TabsContent>
        </Tabs>

        {/* ── Status / Error bar ── */}
        {(statusMsg || errorMsg) && (
          <div className="px-3 pb-3">
            {errorMsg && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                {errorMsg}
                <button onClick={() => setErrorMsg("")} className="ml-auto">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {statusMsg && !errorMsg && (
              <p className="text-xs text-muted-foreground">{statusMsg}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Confirmation Dialog for Bulk Searches ── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Warning: Bulk Search
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              This query will consume <strong>1 API token for every vessel found</strong>.
              In busy areas, this could cost <strong>50–100+ tokens</strong>.
              <br /><br />
              Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction) confirmAction();
                setConfirmAction(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Map (Bottom) ── */}
      <div className="w-full h-[600px] rounded-lg overflow-hidden border">
        <AisMapWrapper onMapReady={handleMapReady} />
      </div>
    </div>
  );
}
