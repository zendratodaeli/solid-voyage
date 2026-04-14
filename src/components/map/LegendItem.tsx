"use client";

/**
 * LegendItem — Reusable legend entry with optional click-to-expand definition.
 *
 * Extracted into its own file so it can be safely imported by SSR-rendered
 * components (like VoyageMap) without pulling in react-leaflet / window deps.
 */

import { useState } from "react";
import { Info } from "lucide-react";

// ── Zone definitions for info tooltips ──
export const ZONE_DEFINITIONS: Record<string, string> = {
  open_sea:
    "International waters beyond national jurisdiction. Standard fuel and emission rules apply.",
  eca: "Emission Control Area (MARPOL Annex VI). Vessels must use low-sulfur fuel (≤0.10% S) — e.g. Baltic Sea, North Sea, North America.",
  hra: "IMO-designated High Risk Area with elevated piracy/armed robbery risk. Requires enhanced security measures (BMP5).",
  canal:
    "Strategic waterway passage (e.g. Suez, Panama Canal). Subject to transit fees and special navigation rules.",
  eez: "Exclusive Economic Zone — extends 200nm from coastline. Coastal state has sovereign rights over natural resources.",
  eez_12nm:
    "Territorial Sea — extends 12nm from baseline. Full sovereignty of the coastal state; foreign vessels have right of innocent passage.",
  iho: "International Hydrographic Organization sea area. Standard geographic naming and charting boundary for navigation.",
};

// ── Legend item with optional info button ──
export function LegendItem({
  color,
  label,
  definitionKey,
  dotClassName,
}: {
  color?: string;
  label: string;
  definitionKey?: string;
  dotClassName?: string;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const def = definitionKey ? ZONE_DEFINITIONS[definitionKey] : undefined;

  return (
    <div>
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full shrink-0 ${dotClassName || ""}`}
          style={color ? { backgroundColor: color } : undefined}
        />
        <span className="flex-1">{label}</span>
        {def && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowInfo(!showInfo);
            }}
            className="p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
            aria-label={`Info about ${label}`}
          >
            <Info className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
        )}
      </div>
      {showInfo && def && (
        <div className="mt-1 ml-5 text-[10px] leading-snug text-muted-foreground bg-muted/50 rounded px-2 py-1.5 max-w-[200px]">
          {def}
        </div>
      )}
    </div>
  );
}
