"use client";

/**
 * WeatherCard — Rich weather visualization for copilot.
 *
 * Displays current conditions, 5-day forecast grid, marine conditions,
 * safety assessment, and wind/wave details matching the Weather Dashboard page.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Cloud,
  Waves,
  Wind,
  Thermometer,
  Droplets,
  Eye,
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Compass,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Navigation,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgPath } from "@/hooks/useOrgPath";

// Dynamic map import
const CopilotMapWrapper = dynamic(
  () => import("../CopilotMapWrapper"),
  { ssr: false, loading: () => <div className="h-[180px] rounded-xl bg-[#1a1a2e] animate-pulse" /> }
);

// ═══════════════════════════════════════════════════════════════════
// WEATHER ICONS & HELPERS
// ═══════════════════════════════════════════════════════════════════

function getWeatherIcon(condition: string) {
  const lower = (condition || "").toLowerCase();
  if (lower.includes("thunder") || lower.includes("lightning")) return CloudLightning;
  if (lower.includes("snow") || lower.includes("sleet")) return CloudSnow;
  if (lower.includes("rain") || lower.includes("drizzle") || lower.includes("shower")) return CloudRain;
  if (lower.includes("clear") || lower.includes("sunny")) return Sun;
  return Cloud;
}

function getWeatherGradient(condition: string): string {
  const lower = (condition || "").toLowerCase();
  if (lower.includes("thunder")) return "from-purple-600/20 to-slate-800/20";
  if (lower.includes("rain") || lower.includes("drizzle")) return "from-blue-600/20 to-slate-800/20";
  if (lower.includes("clear") || lower.includes("sunny")) return "from-amber-500/20 to-blue-600/20";
  if (lower.includes("snow")) return "from-cyan-300/20 to-slate-600/20";
  return "from-slate-500/20 to-blue-800/20";
}

function getBeaufortScale(windSpeedKmh: number): { force: number; label: string; color: string } {
  if (windSpeedKmh < 1) return { force: 0, label: "Calm", color: "text-cyan-300" };
  if (windSpeedKmh <= 5) return { force: 1, label: "Light Air", color: "text-cyan-400" };
  if (windSpeedKmh <= 11) return { force: 2, label: "Light Breeze", color: "text-green-400" };
  if (windSpeedKmh <= 19) return { force: 3, label: "Gentle Breeze", color: "text-green-400" };
  if (windSpeedKmh <= 28) return { force: 4, label: "Moderate Breeze", color: "text-emerald-400" };
  if (windSpeedKmh <= 38) return { force: 5, label: "Fresh Breeze", color: "text-yellow-400" };
  if (windSpeedKmh <= 49) return { force: 6, label: "Strong Breeze", color: "text-amber-400" };
  if (windSpeedKmh <= 61) return { force: 7, label: "Near Gale", color: "text-orange-400" };
  if (windSpeedKmh <= 74) return { force: 8, label: "Gale", color: "text-red-400" };
  if (windSpeedKmh <= 88) return { force: 9, label: "Strong Gale", color: "text-red-500" };
  if (windSpeedKmh <= 102) return { force: 10, label: "Storm", color: "text-red-600" };
  if (windSpeedKmh <= 117) return { force: 11, label: "Violent Storm", color: "text-red-700" };
  return { force: 12, label: "Hurricane", color: "text-red-800" };
}

function getSeaState(waveHeight: number): { label: string; color: string; bg: string } {
  if (waveHeight < 0.5) return { label: "Calm", color: "text-cyan-400", bg: "bg-cyan-500/10" };
  if (waveHeight < 1.25) return { label: "Smooth", color: "text-green-400", bg: "bg-green-500/10" };
  if (waveHeight < 2.5) return { label: "Moderate", color: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (waveHeight < 4) return { label: "Rough", color: "text-amber-400", bg: "bg-amber-500/10" };
  if (waveHeight < 6) return { label: "Very Rough", color: "text-orange-400", bg: "bg-orange-500/10" };
  return { label: "High/Severe", color: "text-red-400", bg: "bg-red-500/10" };
}

function degreesToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function formatTemp(temp: string | number | null | undefined): string {
  if (temp == null) return "—";
  const num = typeof temp === "string" ? parseFloat(temp) : temp;
  if (isNaN(num)) return String(temp);
  return `${num.toFixed(1)}°C`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN WEATHER CARD
// ═══════════════════════════════════════════════════════════════════

export function WeatherResultCard({ result }: { result: any }) {
  const [showForecast, setShowForecast] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const { orgPath } = useOrgPath();

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
        <Cloud className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-400">{result.error}</span>
      </div>
    );
  }

  const port = result.port || result.location || "Unknown Location";
  const coords = result.coordinates || {};
  const current = result.current || {};
  const forecast = result.forecast || [];
  const safety = result.safetyAssessment ?? result.safety;

  const condition = current.condition || "Unknown";
  const WeatherIcon = getWeatherIcon(condition);
  // Prefer numeric fields to avoid encoding issues with degree symbols
  const tempC = current.temperatureC ?? parseFloat(String(current.temperature ?? "0").replace(/[^\d.-]/g, ""));
  const windSpeed = current.windSpeedKmh ?? parseFloat(String(current.windSpeed ?? "0"));
  const windDir = current.windDirectionDeg ?? parseFloat(String(current.windDirection ?? ""));
  const waveHeight = current.waveHeightM ?? parseFloat(String(current.waveHeight ?? "0"));
  const humidity = current.humidity;
  const visibility = current.visibility;
  const pressure = current.pressure;

  const beaufort = getBeaufortScale(windSpeed);
  const seaState = getSeaState(waveHeight);

  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10 overflow-hidden">
      {/* ── Current Conditions Hero ── */}
      <div className={cn("px-4 py-4 bg-gradient-to-r", getWeatherGradient(condition))}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{port}</span>
              {coords.latitude && (
                <span className="text-[10px] text-muted-foreground/60">
                  {coords.latitude.toFixed(2)}°, {coords.longitude.toFixed(2)}°
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl font-bold">{tempC.toFixed(1)}°C</span>
              <div>
                <div className="text-sm font-medium">{condition}</div>
                <div className="text-[10px] text-muted-foreground">
                  Feels like {tempC.toFixed(1)}°C
                </div>
              </div>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-background/20 backdrop-blur">
            <WeatherIcon className="h-10 w-10 text-blue-300" />
          </div>
        </div>
      </div>

      {/* ── Quick Stats Strip ── */}
      <div className="grid grid-cols-4 gap-0 border-b border-border/30">
        <div className="px-3 py-2.5 text-center border-r border-border/20">
          <Wind className="h-3.5 w-3.5 mx-auto mb-1 text-blue-400" />
          <div className="text-xs font-semibold">{windSpeed.toFixed(1)} km/h</div>
          <div className="text-[9px] text-muted-foreground">
            {!isNaN(windDir) ? degreesToCompass(windDir) : ""} Wind
          </div>
        </div>
        <div className="px-3 py-2.5 text-center border-r border-border/20">
          <Waves className="h-3.5 w-3.5 mx-auto mb-1 text-cyan-400" />
          <div className="text-xs font-semibold">{waveHeight.toFixed(1)} m</div>
          <div className="text-[9px] text-muted-foreground">Wave Height</div>
        </div>
        <div className="px-3 py-2.5 text-center border-r border-border/20">
          <Navigation className="h-3.5 w-3.5 mx-auto mb-1 text-emerald-400" />
          <div className={cn("text-xs font-semibold", beaufort.color)}>BF {beaufort.force}</div>
          <div className="text-[9px] text-muted-foreground">{beaufort.label}</div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <Waves className="h-3.5 w-3.5 mx-auto mb-1 text-purple-400" />
          <div className={cn("text-xs font-semibold", seaState.color)}>{seaState.label}</div>
          <div className="text-[9px] text-muted-foreground">Sea State</div>
        </div>
      </div>

      {/* ── Marine Conditions Detail ── */}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5 border-b border-border/30">
        {humidity != null && (
          <div className="flex items-center gap-2 text-xs">
            <Droplets className="h-3 w-3 text-blue-400" />
            <span className="text-muted-foreground">Humidity</span>
            <span className="font-medium ml-auto">{humidity}%</span>
          </div>
        )}
        {visibility != null && (
          <div className="flex items-center gap-2 text-xs">
            <Eye className="h-3 w-3 text-cyan-400" />
            <span className="text-muted-foreground">Visibility</span>
            <span className="font-medium ml-auto">{visibility} km</span>
          </div>
        )}
        {pressure != null && (
          <div className="flex items-center gap-2 text-xs">
            <Gauge className="h-3 w-3 text-amber-400" />
            <span className="text-muted-foreground">Pressure</span>
            <span className="font-medium ml-auto">{pressure} hPa</span>
          </div>
        )}
        {current.seaSurfaceTemp != null && (
          <div className="flex items-center gap-2 text-xs">
            <Thermometer className="h-3 w-3 text-orange-400" />
            <span className="text-muted-foreground">SST</span>
            <span className="font-medium ml-auto">{formatTemp(current.seaSurfaceTemp)}</span>
          </div>
        )}
      </div>

      {/* ── Safety Assessment ── */}
      {safety && typeof safety === "string" && (
        <div className={cn(
          "px-4 py-2.5 flex items-center gap-2 border-b border-border/30",
          safety.includes("✅") ? "bg-emerald-500/5" : "bg-amber-500/5"
        )}>
          {safety.includes("✅") ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          )}
          <span className="text-xs font-medium">
            {safety.replace(/[✅⚠️]/g, "").trim()}
          </span>
        </div>
      )}
      {safety && typeof safety === "object" && (safety.status || safety.safe != null) && (
        <div className={cn(
          "px-4 py-2.5 flex items-center gap-2 border-b border-border/30",
          safety.status === "SAFE" || safety.safe === true
            ? "bg-emerald-500/5"
            : safety.status === "CAUTION"
              ? "bg-amber-500/5"
              : "bg-red-500/5"
        )}>
          {safety.status === "SAFE" || safety.safe === true ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          )}
          <span className="text-xs font-medium">
            {safety.message || (safety.safe ? "Conditions within safe operating limits" : "Adverse conditions — exercise caution")}
          </span>
        </div>
      )}

      {/* ── 5-Day Forecast ── */}
      {forecast.length > 0 && (
        <div className="border-b border-border/30">
          <button
            onClick={() => setShowForecast(!showForecast)}
            className="flex items-center gap-2 px-4 py-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Sun className="h-3 w-3" />
            {showForecast ? "Hide 5-Day Forecast" : "Show 5-Day Forecast"}
            {showForecast ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
          </button>
          {showForecast && (
            <div className="px-4 pb-3 grid grid-cols-5 gap-1.5">
              {forecast.slice(0, 5).map((day: any, i: number) => {
                const DayIcon = getWeatherIcon(day.condition || "");
                // Prefer pure numeric fields to avoid encoding issues
                const dayWaveNum = day.waveHeightMaxM ?? parseFloat(day.waveHeight ?? day.maxWaveHeight ?? "0");
                const daySeaState = getSeaState(dayWaveNum);
                const windNum = day.windSpeedMaxKmh ?? parseFloat(String(day.maxWindSpeed ?? "0"));
                const precipNum = day.precipitationMm ?? parseFloat(String(day.precipitation ?? "0").replace(/[^\d.]/g, ""));
                const tMin = day.tempMin;
                const tMax = day.tempMax;
                return (
                  <div
                    key={i}
                    className="text-center p-2 rounded-lg bg-muted/20 border border-border/20 space-y-1"
                  >
                    <div className="text-[10px] font-medium text-muted-foreground">
                      {day.date ? new Date(day.date).toLocaleDateString("en-US", { weekday: "short" }) : `Day ${i + 1}`}
                    </div>
                    <DayIcon className="h-4 w-4 mx-auto text-blue-300" />
                    {/* Use numeric temp fields (encoding-safe) */}
                    {tMax != null ? (
                      <div className="text-[10px]">
                        <span className="font-semibold">{tMax}°</span>
                        {tMin != null && <span className="text-muted-foreground"> / {tMin}°</span>}
                      </div>
                    ) : null}
                    {windNum > 0 && (
                      <div className="text-[9px] text-muted-foreground">
                        💨 {windNum.toFixed(0)} km/h
                      </div>
                    )}
                    {dayWaveNum > 0 && (
                      <div className={cn("text-[9px]", daySeaState.color)}>
                        🌊 {dayWaveNum.toFixed(1)}m
                      </div>
                    )}
                    {precipNum > 0 && (
                      <div className="text-[9px] text-blue-400">
                        💧 {precipNum.toFixed(1)} mm
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Map Toggle ── */}
      {coords.latitude != null && (
        <div className="border-b border-border/30">
          <button
            onClick={() => setShowMap(!showMap)}
            className="flex items-center gap-2 px-4 py-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Globe className="h-3 w-3" />
            {showMap ? "Hide Map" : "Show Location on Map"}
            {showMap ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
          </button>
          {showMap && (
            <CopilotMapWrapper
              vessels={[{
                lat: coords.latitude,
                lon: coords.longitude,
                name: port,
                color: "#f59e0b",
              }]}
              height={200}
              zoom={8}
            />
          )}
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="px-4 py-2.5 bg-muted/20 flex items-center gap-2">
        <Link
          href={orgPath("/weather")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          <ArrowUpRight className="h-3 w-3" />
          View in Weather Dashboard
        </Link>
      </div>
    </div>
  );
}

// Alias for Gauge since it's not imported at top
function Gauge(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}
