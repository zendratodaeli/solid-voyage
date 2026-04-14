"use client";

/**
 * VesselTrackingCard — Rich AIS vessel tracking renderer for copilot.
 *
 * Renders an interactive Leaflet map with vessel position, speed/heading display,
 * vessel details panel, and "View in AIS Dashboard" link.
 * Works for both single vessel and fleet tracking.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Ship,
  Navigation,
  Anchor,
  MapPin,
  Compass,
  Clock,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Globe,
  Waves,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgPath } from "@/hooks/useOrgPath";
import type { VesselMarkerData } from "../CopilotMapWrapper";

// Dynamic import for Leaflet (no SSR)
const CopilotMapWrapper = dynamic(
  () => import("../CopilotMapWrapper"),
  { ssr: false, loading: () => <MapSkeleton /> }
);

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getNavStatusLabel(status: number | string | null | undefined): string {
  const statusMap: Record<number, string> = {
    0: "Under Way (Engine)",
    1: "At Anchor",
    2: "Not Under Command",
    3: "Restricted Maneuverability",
    4: "Constrained by Draught",
    5: "Moored",
    6: "Aground",
    7: "Engaged in Fishing",
    8: "Under Way (Sailing)",
    11: "Towing Astern",
    12: "Towing Alongside",
    14: "AIS-SART Active",
    15: "undefined",
  };
  if (status == null) return "Unknown";
  const num = typeof status === "string" ? parseInt(status) : status;
  return statusMap[num] || `Status ${status}`;
}

function getNavStatusColor(status: number | string | null | undefined): string {
  const num = typeof status === "string" ? parseInt(status as string) : (status ?? 15);
  if (num === 0 || num === 8) return "text-emerald-400"; // underway
  if (num === 1 || num === 5) return "text-amber-400"; // anchored/moored
  if (num === 6) return "text-red-400"; // aground
  return "text-muted-foreground";
}

function MapSkeleton() {
  return (
    <div className="rounded-xl border border-border/30 bg-[#1a1a2e] flex items-center justify-center" style={{ height: 280 }}>
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Globe className="h-4 w-4 animate-pulse" />
        Loading map...
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STAT PILL
// ═══════════════════════════════════════════════════════════════════

function StatPill({
  icon: Icon,
  label,
  value,
  color = "text-muted-foreground",
}: {
  icon: any;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/20">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-xs font-semibold ml-auto">{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SINGLE VESSEL CARD
// ═══════════════════════════════════════════════════════════════════

export function SingleVesselCard({ result }: { result: any }) {
  const [showDetails, setShowDetails] = useState(false);
  const { orgPath } = useOrgPath();

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
        <Ship className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-400">{result.error}</span>
      </div>
    );
  }

  // Normalize data - handle both single vessel and searched vessel
  const vessel = result.position || result;
  const lat = vessel.latitude ?? vessel.lat;
  const lon = vessel.longitude ?? vessel.lon;
  const name = vessel.shipName ?? vessel.name ?? "Unknown Vessel";
  const speed = vessel.speed ?? vessel.sog;
  const heading = vessel.heading ?? vessel.cog ?? vessel.course;
  const destination = vessel.destination;
  const navStatus = vessel.navStatus ?? vessel.navigationStatus;
  const imo = vessel.imo ?? vessel.imoNumber;
  const mmsi = vessel.mmsi;
  const draft = vessel.draft ?? vessel.draught;
  const eta = vessel.eta;
  const flag = vessel.flag ?? vessel.flagCountry;
  const shipType = vessel.shipType ?? vessel.type;
  const lastUpdate = vessel.lastUpdate ?? vessel.timestamp;

  const markers: VesselMarkerData[] = lat != null && lon != null ? [{
    lat, lon, heading, name, speed, destination,
    color: speed > 0 ? "#3b82f6" : "#f59e0b",
  }] : [];

  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Ship className="h-4 w-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold truncate">{name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {flag && <span className="text-[10px] text-muted-foreground">🏳️ {flag}</span>}
              {imo && <span className="text-[10px] text-muted-foreground">IMO: {imo}</span>}
              {mmsi && <span className="text-[10px] text-muted-foreground">MMSI: {mmsi}</span>}
            </div>
          </div>
          {navStatus != null && (
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full border",
              getNavStatusColor(navStatus),
              "bg-background/50 border-border/30"
            )}>
              {getNavStatusLabel(navStatus)}
            </span>
          )}
        </div>
      </div>

      {/* ── Map ── */}
      {markers.length > 0 && (
        <CopilotMapWrapper
          vessels={markers}
          height={280}
          zoom={7}
        />
      )}

      {/* ── Key Stats Grid ── */}
      <div className="px-4 py-3 grid grid-cols-2 gap-2">
        <StatPill icon={Navigation} label="Speed" value={speed != null ? `${speed} kn` : "—"} color="text-blue-400" />
        <StatPill icon={Compass} label="Heading" value={heading != null ? `${heading}°` : "—"} color="text-cyan-400" />
        {destination && (
          <StatPill icon={MapPin} label="Destination" value={destination} color="text-amber-400" />
        )}
        {eta && (
          <StatPill icon={Clock} label="ETA" value={eta} color="text-purple-400" />
        )}
        {draft != null && (
          <StatPill icon={Waves} label="Draft" value={`${draft}m`} color="text-teal-400" />
        )}
        {lat != null && lon != null && (
          <StatPill icon={Globe} label="Position" value={`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`} color="text-muted-foreground" />
        )}
      </div>

      {/* ── Expandable Details ── */}
      <div className="border-t border-border/30">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 px-4 py-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="h-3 w-3" />
          {showDetails ? "Hide Details" : "Show Full Details"}
          {showDetails ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </button>
        {showDetails && (
          <div className="px-4 pb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
            {shipType && <div className="flex justify-between"><span className="text-muted-foreground">Ship Type</span><span className="font-medium">{shipType}</span></div>}
            {lastUpdate && <div className="flex justify-between"><span className="text-muted-foreground">Last Update</span><span className="font-medium">{new Date(lastUpdate).toLocaleString()}</span></div>}
            {vessel.length && <div className="flex justify-between"><span className="text-muted-foreground">Length</span><span className="font-medium">{vessel.length}m</span></div>}
            {vessel.width && <div className="flex justify-between"><span className="text-muted-foreground">Width</span><span className="font-medium">{vessel.width}m</span></div>}
            {vessel.callsign && <div className="flex justify-between"><span className="text-muted-foreground">Callsign</span><span className="font-medium">{vessel.callsign}</span></div>}
          </div>
        )}
      </div>

      {/* ── Action Bar ── */}
      <div className="px-4 py-2.5 border-t border-border/30 bg-muted/20 flex items-center gap-2">
        <Link
          href={orgPath("/ais-dashboard")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          <ArrowUpRight className="h-3 w-3" />
          View in AIS Dashboard
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FLEET MAP CARD (MULTIPLE VESSELS)
// ═══════════════════════════════════════════════════════════════════

export function FleetMapCard({ result }: { result: any }) {
  const { orgPath } = useOrgPath();
  const [showList, setShowList] = useState(true);

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
        <Ship className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-400">{result.error}</span>
      </div>
    );
  }

  const positions = result.positions || result.data || [];
  const vesselCount = result.vesselCount ?? positions.length;

  // Count by status
  const underway = positions.filter((p: any) => (p.speed ?? p.sog ?? 0) > 0.5).length;
  const stationary = vesselCount - underway;

  const markers: VesselMarkerData[] = positions
    .filter((p: any) => p.latitude != null || p.lat != null)
    .map((p: any) => ({
      lat: p.latitude ?? p.lat,
      lon: p.longitude ?? p.lon,
      heading: p.heading ?? p.cog,
      name: p.shipName ?? p.name ?? "Unknown",
      speed: p.speed ?? p.sog,
      destination: p.destination,
      color: (p.speed ?? p.sog ?? 0) > 0.5 ? "#3b82f6" : "#f59e0b",
    }));

  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10 overflow-hidden">
      {/* ── Header with stats ── */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Globe className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-sm font-bold">{vesselCount} Fleet Position{vesselCount !== 1 ? "s" : ""}</h3>
        </div>
        {vesselCount > 0 && (
          <div className="flex items-center gap-3 mt-2">
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Navigation className="h-2.5 w-2.5" /> {underway} Underway
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Anchor className="h-2.5 w-2.5" /> {stationary} Stationary
            </span>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      {markers.length > 0 && (
        <CopilotMapWrapper
          vessels={markers}
          height={300}
        />
      )}

      {/* ── Vessel List ── */}
      {positions.length > 0 && (
        <div className="border-t border-border/30">
          <button
            onClick={() => setShowList(!showList)}
            className="flex items-center gap-2 px-4 py-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Ship className="h-3 w-3" />
            {showList ? "Hide Vessel List" : "Show Vessel List"}
            {showList ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
          </button>
          {showList && (
            <div className="px-4 pb-3 space-y-1 max-h-60 overflow-y-auto">
              {positions.slice(0, 20).map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      (p.speed ?? p.sog ?? 0) > 0.5 ? "bg-emerald-400" : "bg-amber-400"
                    )}
                  />
                  <span className="font-medium truncate flex-1">{p.shipName ?? p.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {p.speed != null || p.sog != null ? `${p.speed ?? p.sog} kn` : "—"}
                  </span>
                  {p.destination && (
                    <span className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]">→ {p.destination}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="px-4 py-2.5 border-t border-border/30 bg-muted/20 flex items-center gap-2">
        <Link
          href={orgPath("/ais-dashboard")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          <ArrowUpRight className="h-3 w-3" />
          View in AIS Dashboard
        </Link>
      </div>
    </div>
  );
}
