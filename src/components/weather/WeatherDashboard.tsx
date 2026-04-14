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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useWeather } from "@/hooks/useWeather";
import type { WaypointWeather } from "@/types/weather";
import { SEVERITY_CONFIG, degreesToCompass, classifySeaState } from "@/types/weather";
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

  const { fetchWeather, isLoading, data, error } = useWeather();

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
    await fetchWeather([{ lat: latNum, lon: lonNum }], {
      forecastDays: parseInt(forecastDays) || 7,
    });
  }, [lat, lon, forecastDays, fetchWeather, selectedLocation?.name]);

  // Mount detection for SSR-safe rendering + load custom locations from DB
  useEffect(() => {
    setMounted(true);
  }, []);

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
      fetchWeather([{ lat: clickLat, lon: clickLon }], {
        forecastDays: parseInt(forecastDays) || 7,
      });
      // Auto-fill the custom location form and open it
      setNewLocLat(latStr);
      setNewLocLon(lonStr);
      if (!showAddForm) setShowAddForm(true);
    },
    [fetchWeather, forecastDays, showAddForm]
  );

  // Handle quick location
  const handleQuickLocation = useCallback(
    (loc: (typeof QUICK_LOCATIONS)[number]) => {
      setLat(loc.lat.toFixed(4));
      setLon(loc.lon.toFixed(4));
      setSelectedLocation({ lat: loc.lat, lon: loc.lon, name: loc.name });
      // Fly the map to the selected location
      mapRef.current?.flyTo([loc.lat, loc.lon], 6, { duration: 1.5 });
      fetchWeather([{ lat: loc.lat, lon: loc.lon }], {
        forecastDays: parseInt(forecastDays) || 7,
      });
    },
    [fetchWeather, forecastDays]
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
    fetchWeather([{ lat: loc.lat, lon: loc.lon }], {
      forecastDays: parseInt(forecastDays) || 7,
    });
    toast.success(`📍 ${loc.name} — coordinates auto-filled`);
  }, [fetchWeather, forecastDays]);

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

  const wp = data?.waypoints?.[0] ?? null;
  const severity = wp ? classifySeaState(wp.current.waveHeight) : null;
  const config = severity ? SEVERITY_CONFIG[severity] : null;

  // Detect land locations — Open-Meteo returns all zeros for non-ocean coordinates
  const isLandLocation = wp
    ? wp.current.waveHeight === 0 &&
      wp.current.wavePeriod === 0 &&
      wp.current.swellWaveHeight === 0 &&
      wp.current.windWaveHeight === 0 &&
      wp.current.oceanCurrentVelocity === 0 &&
      wp.hourly.waveHeight.every((v) => v === 0 || v === null)
    : false;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cloud className="h-7 w-7 text-blue-500" />
          Marine Weather
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Real-time marine weather data powered by Open-Meteo • ECMWF & GFS models
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
                        daily: wp.daily,
                        hourly: wp.hourly,
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
              <CurrentConditions wp={wp} locationName={selectedLocation?.name} />
              <div id="weather-charts-section">
                <WeatherCharts wp={wp} />
              </div>
              {wp.daily && <DailyForecast wp={wp} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CURRENT CONDITIONS SECTION
// ═══════════════════════════════════════════════════════════════════

function CurrentConditions({
  wp,
  locationName,
}: {
  wp: WaypointWeather;
  locationName?: string;
}) {
  const severity = classifySeaState(wp.current.waveHeight);
  const config = SEVERITY_CONFIG[severity];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Waves className="h-5 w-5 text-blue-500" />
            Current Conditions
            {locationName && (
              <span className="text-sm font-normal text-muted-foreground">
                — {locationName}
              </span>
            )}
          </CardTitle>
          <span
            className={cn(
              "text-xs font-semibold px-3 py-1 rounded-full border",
              config.bgColor,
              config.borderColor,
              config.color
            )}
          >
            {config.label}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            icon={Waves}
            label="Wave Height"
            value={`${wp.current.waveHeight.toFixed(1)}m`}
            subtext={config.description}
            color={config.markerColor}
          />
          <MetricCard
            icon={Wind}
            label="Swell"
            value={`${wp.current.swellWaveHeight.toFixed(1)}m`}
            subtext={`${degreesToCompass(wp.current.swellWaveDirection)} • ${wp.current.swellWavePeriod.toFixed(1)}s period`}
            color="#6366f1"
          />
          <MetricCard
            icon={Thermometer}
            label="Sea Temperature"
            value={`${wp.current.seaSurfaceTemperature.toFixed(1)}°C`}
            subtext={`(${((wp.current.seaSurfaceTemperature * 9) / 5 + 32).toFixed(1)}°F)`}
            color="#06b6d4"
          />
          <MetricCard
            icon={Droplets}
            label="Ocean Current"
            value={`${wp.current.oceanCurrentVelocity.toFixed(2)} m/s`}
            subtext={`Direction: ${degreesToCompass(wp.current.oceanCurrentDirection)} (${wp.current.oceanCurrentDirection.toFixed(0)}°)`}
            color="#14b8a6"
          />
        </div>

        {/* Additional details */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Wave Direction</div>
            <div className="text-sm font-semibold mt-0.5">
              {degreesToCompass(wp.current.waveDirection)} ({wp.current.waveDirection.toFixed(0)}°)
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Wave Period</div>
            <div className="text-sm font-semibold mt-0.5">
              {wp.current.wavePeriod.toFixed(1)}s
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Wind Waves</div>
            <div className="text-sm font-semibold mt-0.5">
              {wp.current.windWaveHeight.toFixed(1)}m
            </div>
          </div>
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
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  subtext: string;
  color: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors">
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
}

// ═══════════════════════════════════════════════════════════════════
// CHARTS SECTION
// ═══════════════════════════════════════════════════════════════════

function WeatherCharts({ wp }: { wp: WaypointWeather }) {
  // Prepare chart data — sample every 3 hours for readability
  const chartData = useMemo(() => {
    const data: Array<{
      time: string;
      label: string;
      waveHeight: number;
      swellHeight: number;
      seaTemp: number;
    }> = [];

    const step = 3; // every 3 hours
    for (let i = 0; i < wp.hourly.time.length; i += step) {
      const dt = new Date(wp.hourly.time[i]);
      data.push({
        time: wp.hourly.time[i],
        label: `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, "0")}:00`,
        waveHeight: wp.hourly.waveHeight[i] ?? 0,
        swellHeight: wp.hourly.swellWaveHeight[i] ?? 0,
        seaTemp: wp.hourly.seaSurfaceTemperature[i] ?? 0,
      });
    }
    return data;
  }, [wp]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Eye className="h-5 w-5 text-blue-500" />
          Hourly Forecast Charts
        </CardTitle>
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

function DailyForecast({ wp }: { wp: WaypointWeather }) {
  if (!wp.daily || !wp.daily.time.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-500" />
          Daily Forecast
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {wp.daily.time.map((date, index) => {
            const maxWave = wp.daily!.waveHeightMax[index] ?? 0;
            const maxSwell = wp.daily!.swellWaveHeightMax[index] ?? 0;
            const maxTemp = wp.daily!.seaSurfaceTemperatureMax[index] ?? 0;
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
                  <div>Swell: {maxSwell.toFixed(1)}m</div>
                  <div>Temp: {maxTemp.toFixed(1)}°C</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
