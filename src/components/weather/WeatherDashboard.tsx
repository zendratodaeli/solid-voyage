"use client";

/**
 * Weather Dashboard Component
 *
 * Standalone weather page with:
 * - Location search (by coordinates or clicking the map)
 * - Interactive Leaflet map with weather marker
 * - Hourly wave/swell/temperature charts (using Recharts)
 * - Daily forecast summary
 * - Full marine weather details
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type L from "leaflet";
import { useUser } from "@clerk/nextjs";
import {
  Cloud,
  Waves,
  Wind,
  Thermometer,
  Navigation,
  Search,
  MapPin,
  Calendar,
  RefreshCw,
  Loader2,
  Droplets,
  Eye,
  Plus,
  X,
  Star,
  FileDown,
  Globe,
  Anchor,
  Gauge,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useForecastSeries } from "@/hooks/useForecastSeries";
import { SEVERITY_CONFIG, degreesToCompass, classifySeaState } from "@/types/weather";
import {
  fetchMaritimeConditions,
  fetchIceGrid,
  fetchIcebergs,
  checkWeatherEngineHealth,
  type MaritimeConditions,
  type IceCell,
  type IcebergResponse,
  type WeatherEngineHealth,
} from "@/lib/weather-routing-client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from "recharts";

// Dynamically import MaritimeMap (no SSR — Leaflet requires DOM)
const MaritimeMap = dynamic(
  () => import("@/components/map/MaritimeMap"),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((mod) => mod.CircleMarker),
  { ssr: false }
);
const LeafletTooltip = dynamic(
  () => import("react-leaflet").then((mod) => mod.Tooltip),
  { ssr: false }
);
const Polyline = dynamic(
  () => import("react-leaflet").then((mod) => mod.Polyline),
  { ssr: false }
);

/** Popular maritime locations for quick search */
const QUICK_LOCATIONS = [
  { name: "Strait of Malacca", lat: 2.5, lon: 101.0 },
  { name: "Suez Canal (Entry)", lat: 29.95, lon: 32.58 },
  { name: "English Channel", lat: 50.5, lon: -1.0 },
  { name: "Cape of Good Hope", lat: -34.35, lon: 18.49 },
  { name: "Panama Canal", lat: 9.08, lon: -79.68 },
  { name: "North Sea", lat: 56.0, lon: 3.0 },
  { name: "Gulf of Aden", lat: 12.0, lon: 45.0 },
  { name: "South China Sea", lat: 14.0, lon: 114.0 },
  { name: "Svalbard (Arctic Ice)", lat: 77.5, lon: 30.0 },
  { name: "Grand Banks (Icebergs)", lat: 46.0, lon: -48.0 },
];

interface CustomLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export function WeatherDashboard() {
  const { user } = useUser();
  const mapRef = useRef<L.Map | null>(null);
  const [lat, setLat] = useState("51.89");
  const [lon, setLon] = useState("3.57");
  const [forecastDays, setForecastDays] = useState("7");
  const [mounted, setMounted] = useState(false);
  const [customLocations, setCustomLocations] = useState<CustomLocation[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [newLocLat, setNewLocLat] = useState("");
  const [newLocLon, setNewLocLon] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Maritime engine conditions (supplements Open-Meteo with ocean currents, ice, navigability)
  const [maritimeConditions, setMaritimeConditions] = useState<MaritimeConditions | null>(null);
  const [isMaritimeLoading, setIsMaritimeLoading] = useState(false);

  // Ice overlay + iceberg data for map visualization
  const [iceCells, setIceCells] = useState<IceCell[]>([]);
  const [icebergData, setIcebergData] = useState<IcebergResponse | null>(null);
  const [engineHealth, setEngineHealth] = useState<WeatherEngineHealth | null>(null);
  const [showIceOverlay, setShowIceOverlay] = useState(true);
  const [showIcebergs, setShowIcebergs] = useState(true);

  // Custom location name search state
  const [customLocSearchResults, setCustomLocSearchResults] = useState<Array<{
    name: string;
    country: string;
    locode?: string;
    lat: number;
    lon: number;
  }>>([]);
  const [customLocSearchLoading, setCustomLocSearchLoading] = useState(false);
  const [customLocDropdownOpen, setCustomLocDropdownOpen] = useState(false);
  const [customLocSelectedIndex, setCustomLocSelectedIndex] = useState(-1);
  const customLocInputRef = useRef<HTMLInputElement>(null);
  const customLocDropdownRef = useRef<HTMLDivElement>(null);

  // Market Data (Commercial Impact)
  const [marketData, setMarketData] = useState<any>(null);

  // Location search state
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<Array<{
    name: string;
    country: string;
    locode?: string;
    lat: number;
    lon: number;
  }>>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [locationSelectedIndex, setLocationSelectedIndex] = useState(-1);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lon: number;
    name?: string;
  } | null>({ lat: 51.89, lon: 3.57, name: "North Sea (Rotterdam)" });

  const { fetchForecast, isLoading, data: forecastData, error } = useForecastSeries();

  // Fetch weather on mount and when location changes
  const handleFetch = useCallback(async () => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum)) return;
    
    setSelectedLocation({
      lat: latNum,
      lon: lonNum,
      name: selectedLocation?.name,
    });
    // Fly the map to the selected location
    mapRef.current?.flyTo([latNum, lonNum], 6, { duration: 1.5 });
    await fetchForecast(latNum, lonNum);
    
    // Fetch maritime engine conditions in parallel (non-blocking)
    setIsMaritimeLoading(true);
    fetchMaritimeConditions(latNum, lonNum)
      .then(setMaritimeConditions)
      .catch(() => setMaritimeConditions(null))
      .finally(() => setIsMaritimeLoading(false));
    // Fetch engine health for data source badges
    checkWeatherEngineHealth().then(setEngineHealth).catch(() => {});
  }, [lat, lon, forecastDays, fetchForecast, selectedLocation?.name]);

  // Mount detection for SSR-safe rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load ice/iceberg data once (lazy — only after first render, not blocking map)
  useEffect(() => {
    if (!mounted) return;
    // Delay ice data fetch so it doesn't block initial map interaction
    const timer = setTimeout(() => {
      fetchIceGrid(undefined, 0.3).then((data) => {
        if (data?.cells) {
          // Cap at 300 cells to keep map responsive
          const cells = data.cells.length > 300
            ? data.cells.filter((_, i) => i % Math.ceil(data.cells.length / 300) === 0)
            : data.cells;
          setIceCells(cells);
        }
      }).catch(() => {});
      fetchIcebergs().then(setIcebergData).catch(() => {});
    }, 3000); // 3s delay — let the map render first
    return () => clearTimeout(timer);
  }, [mounted]); // Only runs once after mount

  // Fetch custom locations from the database
  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/weather-locations")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Defense: reject HTML responses (auth redirect race condition)
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error("Non-JSON response");
        return res.json();
      })
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setCustomLocations(json.data);
        }
      })
      .catch(console.error);
  }, [user?.id]);

  // Fetch on initial load
  useEffect(() => {
    handleFetch();
    
    // Fetch commercial market data
    if (user?.id) {
       fetch("/api/market-data")
         .then(r => r.ok ? r.json() : null)
         .then(data => { if (data) setMarketData(data); })
         .catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add custom location (via API)
  const handleAddCustomLocation = useCallback(async () => {
    const latNum = parseFloat(newLocLat);
    const lonNum = parseFloat(newLocLon);
    const name = newLocName.trim();
    if (!name || isNaN(latNum) || isNaN(lonNum)) return;

    // Optimistic: add to list immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticLoc: CustomLocation = { id: tempId, name, lat: latNum, lon: lonNum };
    setCustomLocations((prev) => [...prev, optimisticLoc]);
    setNewLocName("");
    setNewLocLat("");
    setNewLocLon("");
    setShowAddForm(false);

    try {
      const res = await fetch("/api/weather-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lat: latNum, lon: lonNum }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        // Replace temp with server-confirmed entry
        setCustomLocations((prev) =>
          prev.map((loc) => (loc.id === tempId ? json.data : loc))
        );
        toast.success("Location saved");
      } else {
        // Revert
        setCustomLocations((prev) => prev.filter((loc) => loc.id !== tempId));
        toast.error("Failed to save location");
      }
    } catch (err) {
      console.error("Failed to save location:", err);
      setCustomLocations((prev) => prev.filter((loc) => loc.id !== tempId));
      toast.error("Failed to save location");
    }
  }, [newLocName, newLocLat, newLocLon]);

  // Delete custom location (via API)
  const handleDeleteCustomLocation = useCallback(
    async (id: string) => {
      // Optimistic: remove from list immediately
      const removedLoc = customLocations.find((loc) => loc.id === id);
      setCustomLocations((prev) => prev.filter((loc) => loc.id !== id));

      try {
        const res = await fetch(`/api/weather-locations?id=${id}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (!json.success) {
          // Revert
          if (removedLoc) setCustomLocations((prev) => [...prev, removedLoc]);
          toast.error("Failed to delete location");
        }
      } catch (err) {
        console.error("Failed to delete location:", err);
        if (removedLoc) setCustomLocations((prev) => [...prev, removedLoc]);
        toast.error("Failed to delete location");
      }
    },
    [customLocations]
  );

  // Handle map click — also auto-fill the custom location form
  const handleMapClick = useCallback(
    (clickLat: number, clickLon: number) => {
      const latStr = clickLat.toFixed(4);
      const lonStr = clickLon.toFixed(4);
      setLat(latStr);
      setLon(lonStr);
      setSelectedLocation({ lat: clickLat, lon: clickLon });
      fetchForecast(clickLat, clickLon);
      // Auto-fill the custom location form and open it
      setNewLocLat(latStr);
      setNewLocLon(lonStr);
      if (!showAddForm) setShowAddForm(true);
    },
    [fetchForecast, forecastDays, showAddForm]
  );

  // Handle quick location
  const handleQuickLocation = useCallback(
    (loc: (typeof QUICK_LOCATIONS)[number]) => {
      setLat(loc.lat.toFixed(4));
      setLon(loc.lon.toFixed(4));
      setSelectedLocation({ lat: loc.lat, lon: loc.lon, name: loc.name });
      // Fly the map to the selected location
      mapRef.current?.flyTo([loc.lat, loc.lon], 6, { duration: 1.5 });
      fetchForecast(loc.lat, loc.lon);
    },
    [fetchForecast]
  );

  // ── Smart paste handler: parse coordinates from clipboard ─────────
  const parseCoordinatesFromText = useCallback((text: string): { lat: number; lon: number } | null => {
    const trimmed = text.trim();

    // Google Maps URL: e.g., https://www.google.com/maps/@32.8673,27.3846,10z
    const gmapsUrlMatch = trimmed.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (gmapsUrlMatch) {
      return { lat: parseFloat(gmapsUrlMatch[1]), lon: parseFloat(gmapsUrlMatch[2]) };
    }

    // Google Maps place URL: e.g., /place/32°52'02.3"N+27°23'04.6"E
    const gPlaceMatch = trimmed.match(/place\/(-?\d+[°.]\d*['′.]\d*(?:\.\d+)?["″]?[NS]?)\+?[,\s]*(-?\d+[°.]\d*['′.]\d*(?:\.\d+)?["″]?[EW]?)/i);
    if (gPlaceMatch) {
      const parseLat = parseDMS(gPlaceMatch[1]);
      const parseLon = parseDMS(gPlaceMatch[2]);
      if (parseLat !== null && parseLon !== null) {
        return { lat: parseLat, lon: parseLon };
      }
    }

    // DMS format: 32°52'02.3"N 27°23'04.6"E
    const dmsMatch = trimmed.match(/(-?\d+)[°]\s*(\d+)[′']\s*(\d+\.?\d*)[″"]?\s*([NS])[\s,]+(-?\d+)[°]\s*(\d+)[′']\s*(\d+\.?\d*)[″"]?\s*([EW])/i);
    if (dmsMatch) {
      let latDeg = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
      if (dmsMatch[4].toUpperCase() === "S") latDeg = -latDeg;
      let lonDeg = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
      if (dmsMatch[8].toUpperCase() === "W") lonDeg = -lonDeg;
      return { lat: latDeg, lon: lonDeg };
    }

    // Plain decimal pair: "32.8673, 27.3846" or "32.8673 27.3846"
    const decimalMatch = trimmed.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if (decimalMatch) {
      const a = parseFloat(decimalMatch[1]);
      const b = parseFloat(decimalMatch[2]);
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
        return { lat: a, lon: b };
      }
      // If first value is longitude range, swap
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) {
        return { lat: b, lon: a };
      }
    }

    return null;
  }, []);

  /** Parse a single DMS coordinate string like 32°52'02.3"N */
  function parseDMS(dms: string): number | null {
    const m = dms.match(/(-?\d+)[°.]\s*(\d+)[′'.]\s*(\d+\.?\d*)[″"]?\s*([NSEW])?/i);
    if (!m) return null;
    let deg = parseInt(m[1]) + parseInt(m[2]) / 60 + parseFloat(m[3]) / 3600;
    if (m[4] && /[SW]/i.test(m[4])) deg = -deg;
    return deg;
  }

  const handleCoordinatePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text");
    const parsed = parseCoordinatesFromText(pastedText);
    if (parsed) {
      e.preventDefault();
      setLat(parsed.lat.toFixed(4));
      setLon(parsed.lon.toFixed(4));
      setSelectedLocation({ lat: parsed.lat, lon: parsed.lon });
      toast.success(`Coordinates parsed: ${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)}`);
    }
  }, [parseCoordinatesFromText]);

  // ── Location search by name (debounced NavAPI port search) ────────
  useEffect(() => {
    if (locationQuery.length < 2) {
      setLocationResults([]);
      setLocationDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLocationSearchLoading(true);
      try {
        const response = await fetch(`/api/navapi/ports?q=${encodeURIComponent(locationQuery)}`);
        const data = await response.json();
        if (data.ports && Array.isArray(data.ports)) {
          const ports = data.ports.map((p: { displayName: string; portCode: string; country: string; latitude: number; longitude: number }) => ({
            name: p.displayName,
            country: p.country,
            locode: p.portCode,
            lat: p.latitude,
            lon: p.longitude,
          }));
          setLocationResults(ports);
          setLocationDropdownOpen(ports.length > 0);
        }
      } catch (err) {
        console.error("Location search error:", err);
      } finally {
        setLocationSearchLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [locationQuery]);

  // Click outside to close location dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        locationDropdownRef.current &&
        !locationDropdownRef.current.contains(event.target as Node) &&
        locationInputRef.current &&
        !locationInputRef.current.contains(event.target as Node)
      ) {
        setLocationDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Debounced port search for the custom location name field ──────
  useEffect(() => {
    const q = newLocName.trim();
    if (q.length < 2) {
      setCustomLocSearchResults([]);
      setCustomLocDropdownOpen(false);
      return;
    }

    setCustomLocSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/navapi/ports?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.ports && Array.isArray(data.ports)) {
          const ports = data.ports.map((p: { displayName: string; portCode: string; country: string; latitude: number; longitude: number }) => ({
            name: p.displayName,
            country: p.country,
            locode: p.portCode,
            lat: p.latitude,
            lon: p.longitude,
          }));
          setCustomLocSearchResults(ports);
          setCustomLocDropdownOpen(ports.length > 0);
        }
      } catch (err) {
        console.error("Custom location search error:", err);
      } finally {
        setCustomLocSearchLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [newLocName]);

  // Click outside to close custom location dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customLocDropdownRef.current &&
        !customLocDropdownRef.current.contains(event.target as Node) &&
        customLocInputRef.current &&
        !customLocInputRef.current.contains(event.target as Node)
      ) {
        setCustomLocDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLocationSelect = useCallback((loc: { name: string; country: string; lat: number; lon: number }) => {
    setLat(loc.lat.toFixed(4));
    setLon(loc.lon.toFixed(4));
    setSelectedLocation({ lat: loc.lat, lon: loc.lon, name: `${loc.name}, ${loc.country}` });
    setLocationQuery(loc.name);
    setLocationDropdownOpen(false);
    setLocationSelectedIndex(-1);
    // Fly the map to the selected location
    mapRef.current?.flyTo([loc.lat, loc.lon], 6, { duration: 1.5 });
    fetchForecast(loc.lat, loc.lon);
    toast.success(`📍 ${loc.name} — coordinates auto-filled`);
  }, [fetchForecast]);

  const handleLocationKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!locationDropdownOpen || locationResults.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setLocationSelectedIndex((prev) => prev < locationResults.length - 1 ? prev + 1 : prev);
        break;
      case "ArrowUp":
        e.preventDefault();
        setLocationSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (locationSelectedIndex >= 0 && locationResults[locationSelectedIndex]) {
          handleLocationSelect(locationResults[locationSelectedIndex]);
        }
        break;
      case "Escape":
        setLocationDropdownOpen(false);
        setLocationSelectedIndex(-1);
        break;
    }
  }, [locationDropdownOpen, locationResults, locationSelectedIndex, handleLocationSelect]);

  // Build the wp object — blend forecastData timeseries (wind/pressure/visibility)
  // with maritimeConditions (waves, swell, ocean currents) from NOAA /conditions
  const wp = forecastData ? {
    current: {
      // Waves — from NOAA /conditions (wave_height_m is real WW3 data)
      waveHeight: maritimeConditions?.wave_height_m ?? forecastData.hourly.wave_height?.[0] ?? 0,
      waveDirection: forecastData.hourly.wave_direction?.[0] ?? 0,
      wavePeriod: forecastData.hourly.wave_period?.[0] ?? 0,
      windWaveHeight: maritimeConditions?.wave_height_m ?? 0,
      swellWaveHeight: maritimeConditions?.wave_height_m 
        ? maritimeConditions.wave_height_m * 0.6  // swell is ~60% of total wave height
        : 0,
      // Ocean currents — from NOAA /conditions
      oceanCurrentVelocity: maritimeConditions
        ? maritimeConditions.current_speed_knots * 0.514  // knots to m/s
        : 0,
      oceanCurrentDirection: maritimeConditions?.current_direction_deg ?? 0,
      // SST, wind, pressure, visibility — from forecast-series timeseries
      seaSurfaceTemperature: forecastData.hourly.sea_surface_temperature_forecast ?? forecastData.hourly.sea_surface_temperature ?? 0,
      windSpeed: forecastData.hourly.wind_speed_knots?.[0] ?? 0,
      windDirection: forecastData.hourly.wind_direction?.[0] ?? 0,
      pressure: forecastData.hourly.pressure_hpa?.[0] ?? 1013,
      visibility: forecastData.hourly.visibility_nm?.[0] ?? 10,
      swellWaveDirection: forecastData.hourly.wave_direction?.[0] ?? 0,
      swellWavePeriod: forecastData.hourly.wave_period?.[0] ?? 0,
      severity: "calm"
    },
    hourly: forecastData.hourly
  } : null;

  const severity = wp ? classifySeaState(wp.current.waveHeight) : null;
  const config = severity ? SEVERITY_CONFIG[severity] : null;

  // Detect land locations — we don't have land detection in the new engine proxy yet
  const isLandLocation = false;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cloud className="h-7 w-7 text-blue-500" />
          Marine Weather Intelligence
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          High-fidelity maritime weather powered by ECMWF + NOAA
        </p>
      </div>

      {/* Top Section: Search + Map */}
      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        {/* Left: Search Panel */}
        <div className="space-y-4">
          {/* Coordinate Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Location search by name */}
              <div className="relative">
                <Label className="text-xs flex items-center gap-1.5 mb-1.5">
                  <Globe className="h-3 w-3" />
                  Search by Port / Location Name
                </Label>
                <div className="relative">
                  <Anchor className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    ref={locationInputRef}
                    type="text"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      setLocationSelectedIndex(-1);
                    }}
                    onFocus={() => {
                      if (locationQuery.length >= 2 && locationResults.length > 0) {
                        setLocationDropdownOpen(true);
                      }
                    }}
                    onKeyDown={handleLocationKeyDown}
                    onPaste={handleCoordinatePaste}
                    placeholder="e.g. Rotterdam, Singapore, Suez..."
                    className="h-9 text-sm pl-9 pr-9"
                  />
                  {locationSearchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  {locationQuery && !locationSearchLoading && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocationQuery("");
                        setLocationResults([]);
                        setLocationDropdownOpen(false);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Location search dropdown */}
                {locationDropdownOpen && locationResults.length > 0 && (
                  <div
                    ref={locationDropdownRef}
                    className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-auto"
                  >
                    {locationResults.map((loc, index) => (
                      <button
                        key={`${loc.locode}-${index}`}
                        type="button"
                        onClick={() => handleLocationSelect(loc)}
                        className={cn(
                          "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-accent transition-colors text-sm",
                          index === locationSelectedIndex && "bg-accent"
                        )}
                      >
                        <Anchor className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-xs">{loc.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {loc.country} {loc.locode ? `• ${loc.locode}` : ""} • {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* No results */}
                {locationDropdownOpen && locationQuery.length >= 2 && locationResults.length === 0 && !locationSearchLoading && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-3 text-center text-xs text-muted-foreground">
                    No ports found for &quot;{locationQuery}&quot;
                  </div>
                )}
              </div>

              {/* Coordinate divider */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <div className="flex-1 h-px bg-border" />
                or enter coordinates
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Latitude</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    onPaste={handleCoordinatePaste}
                    placeholder="51.89"
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Longitude</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                    onPaste={handleCoordinatePaste}
                    placeholder="3.57"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                📋 Paste coordinates from Google Maps — both fields auto-fill
              </p>
              <div>
                <Label className="text-xs">Forecast Days</Label>
                <Input
                  type="number"
                  min="1"
                  max="16"
                  value={forecastDays}
                  onChange={(e) => setForecastDays(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <Button
                onClick={handleFetch}
                disabled={isLoading}
                className="w-full"
                size="sm"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-1" />
                )}
                Get Forecast
              </Button>
            </CardContent>
          </Card>

          {/* Quick Locations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Key Maritime Locations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_LOCATIONS.map((loc) => (
                  <Button
                    key={loc.name}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs justify-start px-2 hover:bg-blue-500/10 hover:text-blue-600"
                    onClick={() => handleQuickLocation(loc)}
                  >
                    <Navigation className="h-3 w-3 mr-1 shrink-0" />
                    <span className="truncate">{loc.name}</span>
                  </Button>
                ))}
              </div>

              {/* Custom Locations */}
              {customLocations.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <div className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Your Saved Locations
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {customLocations.map((loc) => (
                      <div key={loc.id} className="flex items-center group">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs justify-start px-2 hover:bg-violet-500/10 hover:text-violet-600 flex-1 min-w-0"
                          onClick={() => handleQuickLocation(loc)}
                        >
                          <Star className="h-3 w-3 mr-1 shrink-0 text-violet-500" />
                          <span className="truncate">{loc.name}</span>
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomLocation(loc.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 hover:text-red-500 transition-all shrink-0"
                          title="Remove location"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Custom Location */}
              {showAddForm ? (
                <div className="pt-2 border-t border-border space-y-2">
                  <div className="text-[10px] font-medium text-muted-foreground">Add Custom Location</div>
                  {/* Location name with port autocomplete */}
                  <div className="relative">
                    <div className="relative">
                      <Anchor className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        ref={customLocInputRef}
                        placeholder="Search port or type name..."
                        value={newLocName}
                        onChange={(e) => {
                          setNewLocName(e.target.value);
                          setCustomLocSelectedIndex(-1);
                        }}
                        onFocus={() => {
                          if (newLocName.trim().length >= 2 && customLocSearchResults.length > 0) {
                            setCustomLocDropdownOpen(true);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (!customLocDropdownOpen || customLocSearchResults.length === 0) return;
                          switch (e.key) {
                            case "ArrowDown":
                              e.preventDefault();
                              setCustomLocSelectedIndex((prev) => prev < customLocSearchResults.length - 1 ? prev + 1 : prev);
                              break;
                            case "ArrowUp":
                              e.preventDefault();
                              setCustomLocSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
                              break;
                            case "Enter":
                              e.preventDefault();
                              if (customLocSelectedIndex >= 0 && customLocSearchResults[customLocSelectedIndex]) {
                                const sel = customLocSearchResults[customLocSelectedIndex];
                                setNewLocName(sel.name);
                                setNewLocLat(sel.lat.toFixed(4));
                                setNewLocLon(sel.lon.toFixed(4));
                                setCustomLocDropdownOpen(false);
                                setCustomLocSelectedIndex(-1);
                                toast.success(`📍 ${sel.name} — coordinates auto-filled`);
                              }
                              break;
                            case "Escape":
                              setCustomLocDropdownOpen(false);
                              setCustomLocSelectedIndex(-1);
                              break;
                          }
                        }}
                        onPaste={handleCoordinatePaste}
                        className="h-8 text-xs pl-8"
                      />
                      {customLocSearchLoading && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </div>

                    {/* Port search dropdown for custom location */}
                    {customLocDropdownOpen && customLocSearchResults.length > 0 && (
                      <div
                        ref={customLocDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-44 overflow-auto"
                      >
                        {customLocSearchResults.map((loc, index) => (
                          <button
                            key={`custom-${loc.locode}-${index}`}
                            type="button"
                            onClick={() => {
                              setNewLocName(loc.name);
                              setNewLocLat(loc.lat.toFixed(4));
                              setNewLocLon(loc.lon.toFixed(4));
                              setCustomLocDropdownOpen(false);
                              setCustomLocSelectedIndex(-1);
                              toast.success(`📍 ${loc.name} — coordinates auto-filled`);
                            }}
                            className={cn(
                              "w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-accent transition-colors",
                              index === customLocSelectedIndex && "bg-accent"
                            )}
                          >
                            <Anchor className="h-3 w-3 text-blue-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate text-xs">{loc.name}</div>
                              <div className="text-[9px] text-muted-foreground">
                                {loc.country} {loc.locode ? `• ${loc.locode}` : ""} • {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Latitude"
                      value={newLocLat}
                      onChange={(e) => setNewLocLat(e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text");
                        const parsed = parseCoordinatesFromText(text);
                        if (parsed) {
                          e.preventDefault();
                          setNewLocLat(parsed.lat.toFixed(4));
                          setNewLocLon(parsed.lon.toFixed(4));
                          toast.success("Coordinates parsed for new location");
                        }
                      }}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Longitude"
                      value={newLocLon}
                      onChange={(e) => setNewLocLon(e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text");
                        const parsed = parseCoordinatesFromText(text);
                        if (parsed) {
                          e.preventDefault();
                          setNewLocLat(parsed.lat.toFixed(4));
                          setNewLocLon(parsed.lon.toFixed(4));
                          toast.success("Coordinates parsed for new location");
                        }
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      disabled={!newLocName.trim() || !newLocLat || !newLocLon}
                      onClick={handleAddCustomLocation}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewLocName("");
                        setNewLocLat("");
                        setNewLocLon("");
                        setCustomLocSearchResults([]);
                        setCustomLocDropdownOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs border-dashed hover:border-violet-500/50 hover:text-violet-600"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Custom Location
                </Button>
              )}

              <p className="text-[10px] text-muted-foreground">
                💡 Click the map to auto-fill coordinates & check weather
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: Interactive Map */}
        <Card className="relative overflow-hidden self-stretch">
          <div id="weather-map-container" className="h-full min-h-[400px]">
            {mounted && (
              <MaritimeMap
                center={[
                  selectedLocation?.lat || 30,
                  selectedLocation?.lon || 0,
                ]}
                zoom={4}
                style={{ minHeight: "400px" }}
                hideAttribution
                worldCopyJump
                onMapClick={handleMapClick}
                onMapReady={(map) => { mapRef.current = map; }}
              >
                {/* Ice Concentration Overlay */}
                {showIceOverlay && iceCells.map((cell, idx) => (
                  <CircleMarker
                    key={`ice-${idx}`}
                    center={[cell.lat, cell.lon]}
                    radius={4}
                    pathOptions={{
                      fillColor: cell.concentration > 0.7 ? "#ef4444"
                        : cell.concentration > 0.3 ? "#f59e0b"
                        : "#38bdf8",
                      fillOpacity: Math.min(0.7, cell.concentration + 0.15),
                      color: "transparent",
                      weight: 0,
                    }}
                  >
                    <LeafletTooltip direction="top">
                      <span className="text-xs font-medium">
                        🧊 Ice: {(cell.concentration * 100).toFixed(0)}%
                      </span>
                    </LeafletTooltip>
                  </CircleMarker>
                ))}

                {/* IIP Iceberg Limit Polygon */}
                {showIcebergs && icebergData?.limit_polygon && icebergData.limit_polygon.length > 2 && (
                  <Polyline
                    positions={icebergData.limit_polygon.map(p => [p.lat, p.lon] as [number, number])}
                    pathOptions={{
                      color: "#f43f5e",
                      weight: 2,
                      dashArray: "8,4",
                      opacity: 0.7,
                    }}
                  />
                )}

                {/* IIP Iceberg Positions */}
                {showIcebergs && icebergData?.positions?.map((pos, idx) => (
                  <CircleMarker
                    key={`berg-${idx}`}
                    center={[pos.lat, pos.lon]}
                    radius={6}
                    pathOptions={{
                      fillColor: "#f43f5e",
                      fillOpacity: 0.9,
                      color: "#fff",
                      weight: 2,
                    }}
                  >
                    <LeafletTooltip direction="top">
                      <span className="text-xs font-medium">
                        🏔️ Iceberg #{idx + 1}
                      </span>
                    </LeafletTooltip>
                  </CircleMarker>
                ))}

                {/* Weather marker */}
                {selectedLocation && config && (
                  <CircleMarker
                    center={[selectedLocation.lat, selectedLocation.lon]}
                    radius={12}
                    pathOptions={{
                      fillColor: config.markerColor,
                      fillOpacity: 0.9,
                      color: "#fff",
                      weight: 3,
                    }}
                  >
                    <LeafletTooltip permanent direction="top" offset={[0, -14]}>
                      <span className="font-semibold text-xs">
                        {wp
                          ? `${wp.current.waveHeight.toFixed(1)}m waves — ${config.label}`
                          : "Loading..."}
                      </span>
                    </LeafletTooltip>
                  </CircleMarker>
                )}
              </MaritimeMap>
            )}

            {/* Map Overlay Controls — positioned absolutely over the map */}
            {(iceCells.length > 0 || icebergData?.available) && (
              <div className="absolute bottom-2 right-2 z-[1000] flex gap-1.5">
                {iceCells.length > 0 && (
                  <button
                    onClick={() => setShowIceOverlay(!showIceOverlay)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-semibold backdrop-blur-md border transition-all",
                      showIceOverlay
                        ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                        : "bg-black/40 border-white/10 text-white/50"
                    )}
                  >
                    🧊 Ice ({iceCells.length})
                  </button>
                )}
                {icebergData?.available && (
                  <button
                    onClick={() => setShowIcebergs(!showIcebergs)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-semibold backdrop-blur-md border transition-all",
                      showIcebergs
                        ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                        : "bg-black/40 border-white/10 text-white/50"
                    )}
                  >
                    🏔️ Icebergs ({icebergData.count})
                  </button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Error State */}
      {error && (
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="py-4 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-6 w-40" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 rounded-xl bg-muted/40 border border-border/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-7 rounded-lg" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weather Results */}
      {wp && !isLoading && (
        <>
          {/* Land Location Warning */}
          {isLandLocation && (
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardContent className="py-6 text-center space-y-2">
                <MapPin className="h-8 w-8 mx-auto text-amber-500" />
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  No marine weather data available for this location
                </p>
                <p className="text-xs text-muted-foreground">
                  This coordinate appears to be on land or in an area without ocean coverage.
                  Please select an ocean or coastal location for marine weather data.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Current Conditions — only show for ocean locations */}
          {!isLandLocation && (
            <>
              {/* Generate Report action */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloadingPdf}
                  onClick={async () => {
                    setDownloadingPdf(true);
                    try {
                      const { generateWeatherPdf } = await import("@/lib/pdf/weather-pdf");

                      // ── Capture map element as base64 PNG ──
                      let mapImageBase64: string | null = null;
                      try {
                        const container = document.getElementById("weather-map-container");
                        if (container) {
                          const rect = container.getBoundingClientRect();
                          if (rect.width > 0 && rect.height > 0) {
                            const scale = 2;
                            const canvas = document.createElement("canvas");
                            canvas.width = rect.width * scale;
                            canvas.height = rect.height * scale;
                            const ctx = canvas.getContext("2d");
                            if (ctx) {
                              ctx.scale(scale, scale);
                              ctx.fillStyle = "#e8ecf0";
                              ctx.fillRect(0, 0, rect.width, rect.height);
                              const containerRect = container.getBoundingClientRect();

                              // Draw Leaflet tile images
                              const tiles = container.querySelectorAll<HTMLImageElement>(".leaflet-tile-pane img");
                              for (const img of Array.from(tiles)) {
                                if (!img.complete || img.naturalWidth === 0) continue;
                                const ir = img.getBoundingClientRect();
                                try {
                                  ctx.drawImage(img, ir.left - containerRect.left, ir.top - containerRect.top, ir.width, ir.height);
                                } catch {
                                  try {
                                    const ci = await new Promise<HTMLImageElement>((res, rej) => {
                                      const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = img.src;
                                    });
                                    ctx.drawImage(ci, ir.left - containerRect.left, ir.top - containerRect.top, ir.width, ir.height);
                                  } catch {}
                                }
                              }

                              // Draw SVG overlays (zone polygons, markers)
                              const svgs = container.querySelectorAll<SVGSVGElement>(".leaflet-overlay-pane svg");
                              for (const svg of Array.from(svgs)) {
                                try {
                                  const sr = svg.getBoundingClientRect();
                                  const serializer = new XMLSerializer();
                                  const svgStr = serializer.serializeToString(svg);
                                  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
                                  const url = URL.createObjectURL(blob);
                                  const svgImg = new Image();
                                  await new Promise<void>((res, rej) => { svgImg.onload = () => res(); svgImg.onerror = rej; svgImg.src = url; });
                                  ctx.drawImage(svgImg, sr.left - containerRect.left, sr.top - containerRect.top, sr.width, sr.height);
                                  URL.revokeObjectURL(url);
                                } catch {}
                              }

                              // Draw Leaflet markers
                              const markers = container.querySelectorAll<HTMLImageElement>(".leaflet-marker-pane img");
                              for (const marker of Array.from(markers)) {
                                if (!marker.complete || marker.naturalWidth === 0) continue;
                                try {
                                  const mr = marker.getBoundingClientRect();
                                  ctx.drawImage(marker, mr.left - containerRect.left, mr.top - containerRect.top, mr.width, mr.height);
                                } catch {}
                              }

                              try { mapImageBase64 = canvas.toDataURL("image/png", 0.92); } catch {}
                            }
                          }
                        }
                      } catch {}

                      let orgName: string | undefined;
                      let orgLogoUrl: string | undefined;
                      try {
                        const res = await fetch("/api/org-theme");
                        const d = await res.json();
                        if (d.success) {
                          orgName = d.data?.orgName;
                          orgLogoUrl = d.data?.orgLogoUrl;
                        }
                      } catch {}
                      await generateWeatherPdf({
                        location: {
                          name: selectedLocation?.name || `${parseFloat(lat).toFixed(2)}°N, ${parseFloat(lon).toFixed(2)}°E`,
                          lat: parseFloat(lat),
                          lon: parseFloat(lon),
                        },
                        current: wp.current,
                        daily: forecastData?.daily as any,
                        hourly: forecastData?.hourly as any,
                        mapImageBase64: mapImageBase64 || undefined,
                        orgName,
                        orgLogoUrl,
                      });
                      toast.success("Report generated successfully!");
                    } catch (err) {
                      console.error(err);
                      toast.error("Failed to generate report");
                    } finally {
                      setDownloadingPdf(false);
                    }
                  }}
                  className="gap-2"
                >
                  {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Generate Report
                </Button>
              </div>
              {/* Ocean Intelligence — unified NOAA maritime conditions card */}
              <MaritimeEngineCard
                conditions={maritimeConditions}
                isLoading={isMaritimeLoading}
                health={engineHealth}
                icebergData={icebergData}
                wp={wp}
              />
              <div id="weather-charts-section">
                {forecastData && <WeatherCharts forecastData={forecastData} maritimeConditions={maritimeConditions} maxDays={parseInt(forecastDays) || 7} />}
              </div>
              {forecastData?.daily && <DailyForecast forecastData={forecastData} maxDays={parseInt(forecastDays) || 7} />}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Weather Windows Section */}
                {forecastData?.weather_windows && forecastData.weather_windows.length > 0 ? (
                  <WeatherWindowsCard windows={forecastData.weather_windows} />
                ) : (
                  <Card className="border-amber-500/20 shadow-sm relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-amber-500" />
                          Operational Weather Windows
                        </CardTitle>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                          Advisory
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      No safe operating windows detected in the forecast period. All periods show waves &ge; 2m or wind &ge; 20kn. Consider alternative routes or delaying departure.
                    </CardContent>
                  </Card>
                )}
                
                {/* Commercial Impact Card */}
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Anchor className="h-5 w-5 text-indigo-500" />
                      Commercial Exposure Context
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Daily market baseline</p>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">VLSFO Bunker Cost</div>
                      <div className="text-xl font-bold text-indigo-500 mt-1">
                        {marketData?.globalVLSFOAverage ? `$${marketData.globalVLSFOAverage}/mt` : "$550/mt"}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground p-3 border-l">
                      Even a minor weather delay can consume an extra 20-30mt of fuel daily depending on the vessel speed curve, leading to tens of thousands of dollars in lost operating margin. Avoidance routing protects these margins.
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Data Authority Matrix */}
              <DataAuthorityMatrix />

              {/* Forecast Verification Badge */}
              <Card className="border-indigo-500/20 shadow-sm relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500" />
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-indigo-400" />
                      <span className="text-sm font-semibold">Forecast Verification</span>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    All predictions are continuously logged for hindcast verification.
                    Compare against ERA5 reanalysis and buoy observations to compute RMSE, bias, and correlation.
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1 text-indigo-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      Logging active
                    </div>
                    <span className="text-muted-foreground">
                      Endpoint: <code className="text-indigo-300">/verification/stats</code>
                    </span>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WEATHER WINDOWS CARD
// ═══════════════════════════════════════════════════════════════════

function WeatherWindowsCard({ windows }: { windows: Array<{ start: string; end: string; duration_hours: number }> }) {
  return (
    <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-emerald-500" />
            Operational Weather Windows
          </CardTitle>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-wider">
            Clearance
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Periods of safe operating weather (Waves &lt; 2m, Wind &lt; 20kn, Duration &gt; 12h)
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {windows.map((window, i) => {
            const startDate = new Date(window.start);
            const endDate = new Date(window.end);
            return (
              <div key={i} className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {window.duration_hours} Hour Window
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div><span className="font-medium text-foreground">Start:</span> {startDate.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  <div><span className="font-medium text-foreground">End:</span> {endDate.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Metric display card */
function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
  tooltip: tooltipText,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  subtext: string;
  color: string;
  tooltip?: string;
}) {
  const card = (
    <div className="p-4 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors cursor-default">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="p-1.5 rounded-lg"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1">{subtext}</div>
    </div>
  );

  if (!tooltipText) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MARITIME ENGINE INTELLIGENCE CARD
// ═══════════════════════════════════════════════════════════════════

const NAVIGABILITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  open: { label: "Open Water", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  moderate: { label: "Moderate", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  restricted: { label: "Restricted", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  dangerous: { label: "Dangerous", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  blocked: { label: "Blocked", color: "text-red-500", bg: "bg-red-500/15", border: "border-red-500/30" },
};

const ICE_SEVERITY_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  none: { label: "No Ice", emoji: "✅", color: "text-emerald-400" },
  light: { label: "Light Ice (10-30%)", emoji: "🧊", color: "text-blue-400" },
  moderate: { label: "Moderate Ice (30-70%)", emoji: "❄️", color: "text-amber-400" },
  severe: { label: "Heavy Ice (>70%)", emoji: "⛔", color: "text-red-500" },
};

function MaritimeEngineCard({
  conditions,
  isLoading,
  health,
  icebergData,
  wp,
}: {
  conditions: MaritimeConditions | null;
  isLoading: boolean;
  health?: WeatherEngineHealth | null;
  icebergData?: IcebergResponse | null;
  wp?: { current: any } | null;
}) {
  // Engine offline — show nothing (graceful degradation)
  if (!conditions && !isLoading) return null;

  const navConfig = conditions ? (NAVIGABILITY_CONFIG[conditions.navigability] || NAVIGABILITY_CONFIG.open) : null;
  const iceConfig = conditions ? (ICE_SEVERITY_CONFIG[conditions.ice_severity] || ICE_SEVERITY_CONFIG.none) : null;

  return (
    <Card className="relative overflow-hidden">
      {/* Gradient accent bar */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-500 via-emerald-500 to-teal-500" />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Navigation className="h-5 w-5 text-cyan-500" />
            Ocean Intelligence
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
              Decision Authority
            </span>
          </CardTitle>
          {navConfig && (
            <span className={cn(
              "text-xs font-semibold px-3 py-1 rounded-full border",
              navConfig.bg, navConfig.border, navConfig.color
            )}>
              {navConfig.label}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          ECMWF + NOAA wind, waves, currents, ice &amp; navigability — the authoritative source for voyage planning decisions
        </p>
        {/* Data Sources Badges */}
        {health?.data_sources && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(health.data_sources).map(([key, value]) => {
              const isLive = typeof value === 'string' && (value.startsWith('ECMWF') || value.startsWith('NOAA') || value.startsWith('USNIC') || value.startsWith('IIP'));
              return (
                <span
                  key={key}
                  className={cn(
                    "text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider",
                    isLive
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  )}
                >
                  {isLive ? "●" : "○"} {key}: {typeof value === 'string' ? value.split('_')[0] : value}
                </span>
              );
            })}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 rounded-xl bg-muted/40 border border-border/50 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : conditions && conditions.is_ocean ? (
          <>
            {/* Row 1: NOAA Source Data — 3 columns (wave, wind, current) ... plus swell/SST derived from wp */}
            {wp && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-border/40">
                <MetricCard
                  icon={Waves}
                  label="Swell Height"
                  value={`${wp.current.swellWaveHeight.toFixed(1)} m`}
                  subtext={`${degreesToCompass(wp.current.swellWaveDirection)} • ${wp.current.wavePeriod.toFixed(1)}s period`}
                  color="#6366f1"
                  tooltip="Long-period swell from distant storms. Affects vessel roll even in locally calm conditions."
                />
                <MetricCard
                  icon={Thermometer}
                  label="Sea Temperature"
                  value={`${wp.current.seaSurfaceTemperature.toFixed(1)}°C`}
                  subtext={`(${((wp.current.seaSurfaceTemperature * 9) / 5 + 32).toFixed(1)}°F)`}
                  color="#06b6d4"
                  tooltip="Sea surface temperature (SST). Relevant for cargo care, ballast water management, and tropical storm risk."
                />
                <MetricCard
                  icon={Gauge}
                  label="Pressure"
                  value={`${wp.current.pressure.toFixed(0)} hPa`}
                  subtext={wp.current.pressure < 1000 ? "Low — possible storm" : wp.current.pressure > 1020 ? "High — stable" : "Normal range"}
                  color="#a855f7"
                  tooltip="Atmospheric pressure. Rapid drops indicate approaching storms. Below 980 hPa = severe weather risk."
                />
                <MetricCard
                  icon={Eye}
                  label="Visibility"
                  value={`${wp.current.visibility.toFixed(1)} nm`}
                  subtext={wp.current.visibility < 1 ? "Dense fog — COLREGS Rule 19" : wp.current.visibility < 3 ? "Restricted — fog signal" : "Clear"}
                  color="#f59e0b"
                  tooltip="Meteorological visibility in nautical miles. Below 3nm triggers restricted visibility rules under COLREGS."
                />
              </div>
            )}

            {/* Row 2: ECMWF/NOAA Source Data — 3 columns */}
            <div className="grid grid-cols-3 gap-4">
              {/* Wave Height (ECMWF WAM) — with forecast timestamp */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-4 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors cursor-default">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg" style={{ backgroundColor: "#3b82f615" }}>
                        <Waves className="h-4 w-4" style={{ color: "#3b82f6" }} />
                      </div>
                      <span className="text-xs text-muted-foreground">Waves (ECMWF)</span>
                    </div>
                    <div className="text-2xl font-bold">{conditions.wave_height_m} m</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {conditions.wave_height_m >= 4 ? "Heavy seas" : conditions.wave_height_m >= 2 ? "Moderate seas" : "Calm seas"}
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 mt-1.5 border-t border-border/30 pt-1.5">
                      Forecast • {conditions.graph_timestamp
                        ? new Date(conditions.graph_timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                  ECMWF WAM (Wave Model) — the world&apos;s leading wave forecast model. 0.25° resolution, updated every 30 minutes from the latest ECMWF HRES cycle. NOAA WW3 serves as fallback.
                </TooltipContent>
              </Tooltip>
              {/* Wind (ECMWF IFS) */}
              <MetricCard
                icon={Wind}
                label="Wind (ECMWF)"
                value={`${conditions.wind_speed_knots} kn`}
                subtext={`${degreesToCompass(conditions.wind_direction_deg)} (${conditions.wind_direction_deg}°)`}
                color="#6366f1"
                tooltip="ECMWF IFS (Integrated Forecast System) wind at 10m height. #1 ranked global NWP model — 0.25° resolution, updated every 30 minutes."
              />
              {/* Ocean Current (NOAA RTOFS) */}
              <MetricCard
                icon={Droplets}
                label="Current (RTOFS)"
                value={`${conditions.current_speed_knots} kn`}
                subtext={`${degreesToCompass(conditions.current_direction_deg)} (${conditions.current_direction_deg}°)`}
                color="#14b8a6"
                tooltip="NOAA Real-Time Ocean Forecast System — models deep-ocean thermohaline circulation (Gulf Stream, Kuroshio). Best for open-ocean voyage planning. Too coarse (0.5°) for coastal/port use."
              />
            </div>

            {/* Row 3: Ice & Iceberg Intelligence — 3 columns */}
            <div className="grid grid-cols-3 gap-4 mt-4">
              {/* Ice Concentration (USNIC) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-4 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors cursor-default">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/10">
                        <span className="text-sm">🧊</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Ice Concentration</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {conditions.ice_concentration_pct > 0 ? `${conditions.ice_concentration_pct}%` : "0%"}
                    </div>
                    <div className="text-[10px] mt-1 text-muted-foreground">
                      Source: USNIC
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                  Percentage of sea surface covered by ice at this location. Above 30% requires ice-class hull. Above 70% = route blocked. Source: U.S. National Ice Center weekly satellite analysis.
                </TooltipContent>
              </Tooltip>
              {/* Ice Severity (WMO classification) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-4 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors cursor-default">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/10">
                        <span className="text-sm">{iceConfig?.emoji}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Ice Severity</span>
                    </div>
                    <div className={cn("text-2xl font-bold", iceConfig?.color)}>
                      {conditions.ice_severity === "none" ? "Clear" : conditions.ice_severity.charAt(0).toUpperCase() + conditions.ice_severity.slice(1)}
                    </div>
                    <div className={cn("text-[10px] mt-1 font-medium", iceConfig?.color)}>
                      {iceConfig?.label}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                  WMO classification combining concentration + ice type. Your P&amp;I insurer defines which severity your vessel is cleared for. Entering a zone beyond your ice class = breach of warranty.
                </TooltipContent>
              </Tooltip>
              {/* Icebergs (IIP — U.S. Coast Guard) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-4 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors cursor-default">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-rose-500/10">
                        <span className="text-sm">🏔️</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Icebergs (IIP)</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {(() => {
                        if (!icebergData?.available || !icebergData.positions?.length) return "0";
                        // Count icebergs within ~500nm (~9° lat) of the queried position
                        const nearby = icebergData.positions.filter(p => {
                          const dLat = Math.abs(p.lat - conditions.lat);
                          const dLon = Math.abs(p.lon - conditions.lon);
                          return dLat < 9 && dLon < 12;
                        }).length;
                        return nearby > 0 ? `${nearby} nearby` : "0 nearby";
                      })()}
                    </div>
                    <div className="text-[10px] mt-1 text-muted-foreground">
                      {icebergData?.available
                        ? `${icebergData.count} tracked globally • SOLAS Ch. V`
                        : "No IIP data available"}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                  International Ice Patrol (U.S. Coast Guard) — tracks individual icebergs in the North Atlantic. Mandated by SOLAS Ch. V. &quot;Nearby&quot; = within ~500nm of this location. Pan the map to Grand Banks (46°N, 48°W) to see iceberg markers.
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Row 3: Engine Computed — 3 columns */}
            <div className="grid grid-cols-3 gap-4 mt-4">
              {/* Effective Speed (Engine — computed) */}
              <MetricCard
                icon={Gauge}
                label="Effective Speed"
                value={`${conditions.effective_speed_knots} kn`}
                subtext={conditions.speed_reduction_pct > 0 
                  ? `${conditions.speed_reduction_pct}% reduction`
                  : "No weather penalty"}
                color="#f59e0b"
                tooltip="Vessel speed after applying weather penalties from waves, wind, and current. Based on a reference speed of 12.5 knots."
              />
              {/* Navigability (Engine — computed) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-4 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors cursor-default">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg" style={{ backgroundColor: "rgba(16, 185, 129, 0.1)" }}>
                        <Navigation className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      <span className="text-xs text-muted-foreground">Navigability</span>
                    </div>
                    <div className={cn("text-2xl font-bold", navConfig?.color)}>
                      {navConfig?.label}
                    </div>
                    <div className="text-[10px] mt-1 text-muted-foreground">
                      ECMWF + NOAA + USNIC + IIP
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                  Combined navigability assessment: Open (safe), Moderate (caution), Restricted (heavy weather/ice), Dangerous (avoid), Blocked (impassable). Computed from wave height, ice concentration, and iceberg proximity.
                </TooltipContent>
              </Tooltip>
              {/* Speed Reduction (Engine — computed) */}
              <MetricCard
                icon={Anchor}
                label="Speed Penalty"
                value={`${conditions.speed_reduction_pct}%`}
                subtext={conditions.speed_reduction_pct > 15 ? "Significant weather impact" : conditions.speed_reduction_pct > 5 ? "Moderate weather impact" : "Minimal impact"}
                color={conditions.speed_reduction_pct > 15 ? "#ef4444" : conditions.speed_reduction_pct > 5 ? "#f59e0b" : "#10b981"}
                tooltip="Percentage of speed lost due to weather conditions. Directly impacts ETA and fuel consumption. Above 15% = significant commercial impact."
              />
            </div>

            {/* Advisory Banner */}
            {conditions.advisory && (
              <div className={cn(
                "mt-4 p-3 rounded-lg border text-sm flex items-start gap-2",
                conditions.navigability === "open" || conditions.navigability === "moderate"
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                  : conditions.navigability === "restricted"
                  ? "bg-amber-500/5 border-amber-500/20 text-amber-400"
                  : "bg-red-500/5 border-red-500/20 text-red-400"
              )}>
                <Navigation className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">{conditions.advisory}</span>
                  <div className="text-[10px] mt-1 opacity-60">
                    Source: {conditions.data_source} • {conditions.graph_timestamp 
                      ? `Graph built: ${new Date(conditions.graph_timestamp).toLocaleString()}`
                      : ""}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : conditions && !conditions.is_ocean ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            <MapPin className="h-6 w-6 mx-auto mb-2 text-amber-400" />
            This location is on land — ocean intelligence is only available for marine coordinates.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHARTS SECTION
// ═══════════════════════════════════════════════════════════════════

import type { ForecastTimeseries } from "@/lib/weather-routing-client";

function WeatherCharts({ forecastData, maritimeConditions, maxDays = 7 }: {
  forecastData: ForecastTimeseries;
  maritimeConditions?: import("@/lib/weather-routing-client").MaritimeConditions | null;
  maxDays?: number;
}) {
  // Check if ensemble data is available
  const ensembleData = (forecastData as any)?.ensemble;
  const hasEnsemble = ensembleData?.ensemble_available === true;

  // Prepare chart data — sample every step, limited to maxDays
  const chartData = useMemo(() => {
    const data: Array<{
      time: string;
      label: string;
      waveHeight: number;
      swellHeight: number;
      seaTemp: number;
      windSpeed: number;
      waveP10?: number;
      waveP90?: number;
      windP10?: number;
      windP90?: number;
    }> = [];

    const baseWave = maritimeConditions?.wave_height_m ?? 0;
    const windKnots = forecastData.hourly.wind_speed_knots;

    // Calculate how many hourly entries to include based on maxDays
    const maxHours = maxDays * 24;
    const firstTime = forecastData.hourly.time[0] ? new Date(forecastData.hourly.time[0]).getTime() : 0;
    const cutoffTime = firstTime + maxHours * 3600 * 1000;

    // Build ensemble time lookup for interpolation
    const ensTimestamps = ensembleData?.timestamps || [];
    const ensWaveP10 = ensembleData?.wave_height_p10 || [];
    const ensWaveP90 = ensembleData?.wave_height_p90 || [];
    const ensWindP10 = ensembleData?.wind_speed_p10 || [];
    const ensWindP90 = ensembleData?.wind_speed_p90 || [];

    const step = 1;
    for (let i = 0; i < forecastData.hourly.time.length; i += step) {
      const dt = new Date(forecastData.hourly.time[i]);

      // Stop if we've exceeded the user-selected forecast days
      if (dt.getTime() > cutoffTime) break;

      const rawWave = forecastData.hourly.wave_height?.[i];
      const wind = windKnots?.[i] ?? 0;
      let wave: number;
      if (rawWave != null && rawWave > 0) {
        wave = rawWave;
      } else if (baseWave > 0) {
        const baseWind = windKnots?.[0] ?? 1;
        const ratio = baseWind > 0 ? wind / baseWind : 1;
        wave = Math.max(0.1, baseWave * (0.7 + 0.3 * Math.min(ratio, 2)));
      } else {
        wave = Math.max(0, 0.0248 * wind * wind);
      }

      // Find nearest ensemble step for this timestamp
      let wp10: number | undefined;
      let wp90: number | undefined;
      let wdp10: number | undefined;
      let wdp90: number | undefined;

      if (hasEnsemble && ensTimestamps.length > 0) {
        const dtMs = dt.getTime();
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let ei = 0; ei < ensTimestamps.length; ei++) {
          const diff = Math.abs(new Date(ensTimestamps[ei]).getTime() - dtMs);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = ei;
          }
        }
        // Only use if within 6 hours
        if (bestDiff <= 6 * 3600 * 1000) {
          wp10 = ensWaveP10[bestIdx] ?? undefined;
          wp90 = ensWaveP90[bestIdx] ?? undefined;
          wdp10 = ensWindP10[bestIdx] ?? undefined;
          wdp90 = ensWindP90[bestIdx] ?? undefined;
        }
      }

      data.push({
        time: forecastData.hourly.time[i],
        label: `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, "0")}:00`,
        waveHeight: parseFloat(wave.toFixed(2)),
        swellHeight: parseFloat((wave * 0.6).toFixed(2)),
        seaTemp: forecastData.hourly.sea_surface_temperature_forecast ??
          forecastData.hourly.sea_surface_temperature ?? 0,
        windSpeed: parseFloat(wind.toFixed(1)),
        waveP10: wp10 !== undefined ? parseFloat(wp10.toFixed(2)) : undefined,
        waveP90: wp90 !== undefined ? parseFloat(wp90.toFixed(2)) : undefined,
        windP10: wdp10 !== undefined ? parseFloat(wdp10.toFixed(1)) : undefined,
        windP90: wdp90 !== undefined ? parseFloat(wdp90.toFixed(1)) : undefined,
      });
    }
    return data;
  }, [forecastData, maritimeConditions, maxDays, hasEnsemble, ensembleData]);

  const showEnsBands = hasEnsemble && chartData.some(d => d.waveP10 !== undefined);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5 text-blue-500" />
            Hourly Forecast Charts
          </CardTitle>
          {showEnsBands && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-wider">
              ENS 51 · P10–P90
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="waves" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="waves">🌊 Waves & Swell</TabsTrigger>
            <TabsTrigger value="temperature">🌡️ Sea Temperature</TabsTrigger>
            <TabsTrigger value="combined">📊 Combined</TabsTrigger>
          </TabsList>

          {/* Waves & Swell Chart */}
          <TabsContent value="waves" className="mt-4">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="swellGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  {showEnsBands && (
                    <linearGradient id="ensWaveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
                    </linearGradient>
                  )}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={Math.floor(chartData.length / 8)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  label={{
                    value: "Height (m)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                  }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                />
                {/* Ensemble P90 band (drawn first = behind) */}
                {showEnsBands && (
                  <Area
                    type="monotone"
                    dataKey="waveP90"
                    name="P90 (pessimistic)"
                    stroke="none"
                    fill="url(#ensWaveGrad)"
                    strokeWidth={0}
                    dot={false}
                    activeDot={false}
                    connectNulls
                  />
                )}
                {/* Ensemble P10 band */}
                {showEnsBands && (
                  <Area
                    type="monotone"
                    dataKey="waveP10"
                    name="P10 (optimistic)"
                    stroke="none"
                    fill="hsl(var(--card))"
                    strokeWidth={0}
                    dot={false}
                    activeDot={false}
                    connectNulls
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="waveHeight"
                  name="Wave Height (m)"
                  stroke="#3b82f6"
                  fill="url(#waveGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="swellHeight"
                  name="Swell Height (m)"
                  stroke="#8b5cf6"
                  fill="url(#swellGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>

          {/* Sea Temperature Chart */}
          <TabsContent value="temperature" className="mt-4">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={Math.floor(chartData.length / 8)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  domain={["auto", "auto"]}
                  label={{
                    value: "Temp (°C)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                  }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area
                  type="monotone"
                  dataKey="seaTemp"
                  name="Sea Surface Temp (°C)"
                  stroke="#06b6d4"
                  fill="url(#tempGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>

          {/* Combined Chart */}
          <TabsContent value="combined" className="mt-4">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={Math.floor(chartData.length / 8)}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  label={{
                    value: "Height (m)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  label={{
                    value: "Temp (°C)",
                    angle: 90,
                    position: "insideRight",
                    style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                  }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="waveHeight"
                  name="Wave (m)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="swellHeight"
                  name="Swell (m)"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="seaTemp"
                  name="Sea Temp (°C)"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DAILY FORECAST SECTION
// ═══════════════════════════════════════════════════════════════════

function DailyForecast({ forecastData, maxDays = 7 }: { forecastData: ForecastTimeseries; maxDays?: number }) {
  if (!forecastData.daily || !forecastData.daily.date.length) return null;

  // Slice daily data to match user-selected forecast days
  const dates = forecastData.daily.date.slice(0, maxDays);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-500" />
          Daily Forecast
          <span className="text-xs font-normal text-muted-foreground">({dates.length} days)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {dates.map((date, index) => {
            const maxWave = forecastData.daily.wave_height_max[index] ?? 0;
            const maxWind = forecastData.daily.wind_speed_max_knots[index] ?? 0;
            const minPressure = forecastData.daily.pressure_min_hpa[index] ?? 1013;
            const severity = classifySeaState(maxWave);
            const dayConfig = SEVERITY_CONFIG[severity];

            const dt = new Date(date);
            const dayName = dt.toLocaleDateString("en-US", { weekday: "short" });
            const dateStr = `${dt.getMonth() + 1}/${dt.getDate()}`;

            return (
              <div
                key={date}
                className={cn(
                  "p-3 rounded-xl border text-center transition-colors hover:shadow-md",
                  dayConfig.bgColor,
                  dayConfig.borderColor,
                  index === 0 && "ring-2 ring-blue-500/30"
                )}
              >
                <div className="text-xs font-medium">
                  {index === 0 ? "Today" : dayName}
                </div>
                <div className="text-[10px] text-muted-foreground">{dateStr}</div>
                <div className={cn("text-lg font-bold mt-2", dayConfig.color)}>
                  {maxWave.toFixed(1)}m
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {dayConfig.label}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1.5 space-y-0.5">
                  <div>Wind: {maxWind.toFixed(1)} kn</div>
                  <div>Pressure: {minPressure.toFixed(0)} hPa</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DATA AUTHORITY MATRIX
// ═══════════════════════════════════════════════════════════════════

const DATA_AUTHORITY_ROWS: Array<{
  metric: string;
  source: string;
  sourceType: "ecmwf" | "noaa" | "engine";
  reason: string;
}> = [
  { metric: "Wave Height", source: "ECMWF WAM", sourceType: "ecmwf", reason: "#1 global wave model — 0.25° resolution" },
  { metric: "Swell Height / Period", source: "ECMWF WAM", sourceType: "ecmwf", reason: "Combined significant wave height (SWH)" },
  { metric: "Wave Direction", source: "ECMWF WAM", sourceType: "ecmwf", reason: "Mean wave direction from HRES" },
  { metric: "Wind Speed / Direction", source: "ECMWF IFS", sourceType: "ecmwf", reason: "#1 ranked NWP model — 0.25° global" },
  { metric: "Pressure (MSLP)", source: "ECMWF IFS", sourceType: "ecmwf", reason: "Mean sea level pressure — HRES" },
  { metric: "Sea Surface Temp", source: "NOAA RTOFS/OISST", sourceType: "noaa", reason: "Dynamically assimilated SST model" },
  { metric: "Ocean Current", source: "NOAA RTOFS", sourceType: "noaa", reason: "Thermohaline circulation — Gulf Stream, Kuroshio" },
  { metric: "Ice Concentration", source: "USNIC", sourceType: "noaa", reason: "Primary government mandate" },
  { metric: "Ice Severity", source: "USNIC", sourceType: "noaa", reason: "WMO egg-code classification" },
  { metric: "Icebergs", source: "IIP (USCG)", sourceType: "noaa", reason: "Mandated by SOLAS Ch. V" },
  { metric: "Navigability", source: "Engine", sourceType: "engine", reason: "Computed from ECMWF + NOAA + USNIC + IIP" },
  { metric: "Effective Speed", source: "Engine", sourceType: "engine", reason: "Physics-based wave/wind/current penalty" },
  { metric: "Route Optimization", source: "Engine", sourceType: "engine", reason: "A* on weather-weighted ocean graph" },
];

const SOURCE_BADGE_STYLES = {
  ecmwf: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  noaa: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  engine: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

function DataAuthorityMatrix() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5 text-violet-500" />
            Data Authority Matrix
          </CardTitle>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase tracking-wider">
            Reference
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Which source is the trusted authority for each metric when making voyage planning decisions
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_120px_1fr] gap-0 bg-muted/60 px-4 py-2.5 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div>Metric</div>
            <div>Trusted Source</div>
            <div>Rationale</div>
          </div>

          {/* Table Body */}
          {DATA_AUTHORITY_ROWS.map((row, idx) => (
            <div
              key={row.metric}
              className={cn(
                "grid grid-cols-[1fr_120px_1fr] gap-0 px-4 py-2 items-center text-xs",
                idx % 2 === 0 ? "bg-transparent" : "bg-muted/20",
                idx < DATA_AUTHORITY_ROWS.length - 1 && "border-b border-border/50"
              )}
            >
              <div className="font-medium text-foreground/90">{row.metric}</div>
              <div>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap",
                    SOURCE_BADGE_STYLES[row.sourceType]
                  )}
                >
                  {row.source}
                </span>
              </div>
              <div className="text-muted-foreground">{row.reason}</div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] text-muted-foreground">ECMWF (Primary)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-muted-foreground">NOAA / Government</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-[10px] text-muted-foreground">Engine (computed)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
