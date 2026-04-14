"use client";

/**
 * AisMapWrapper — SSR-safe Leaflet map wrapper for AIS Dashboard.
 *
 * Thin wrapper around MaritimeMap that passes `onMapReady` through.
 * All shared map functionality (tiles, zones, legend) comes from MaritimeMap.
 */

import type L from "leaflet";
import MaritimeMap from "@/components/map/MaritimeMap";

interface AisMapWrapperProps {
  onMapReady: (map: L.Map) => void;
}

export default function AisMapWrapper({ onMapReady }: AisMapWrapperProps) {
  return (
    <MaritimeMap
      center={[25, 0]}
      zoom={3}
      onMapReady={onMapReady}
      hideAttribution
      worldCopyJump
    />
  );
}
