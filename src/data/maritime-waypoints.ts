/**
 * Maritime Waypoints - Major Sea Lane Chokepoints
 * 
 * Defines key maritime waypoints for realistic sea routing.
 * Routes are constructed by passing through these waypoints
 * rather than using direct great-circle paths.
 */

// Major maritime waypoints (chokepoints, canal entrances, capes)
export const MARITIME_WAYPOINTS = {
  // Suez Canal
  SUEZ_NORTH: { id: "suez-north", name: "Port Said (Suez North)", lat: 31.26, lng: 32.31 },
  SUEZ_SOUTH: { id: "suez-south", name: "Suez (Suez South)", lat: 29.97, lng: 32.55 },
  
  // Red Sea / Bab el-Mandeb
  BAB_EL_MANDEB: { id: "bab-el-mandeb", name: "Bab el-Mandeb Strait", lat: 12.58, lng: 43.33 },
  
  // Gibraltar Strait
  GIBRALTAR: { id: "gibraltar", name: "Strait of Gibraltar", lat: 35.97, lng: -5.50 },
  
  // English Channel
  DOVER: { id: "dover", name: "Dover Strait", lat: 51.00, lng: 1.50 },
  
  // Atlantic Coast Waypoints (to avoid routing through France/Spain)
  USHANT: { id: "ushant", name: "Ushant (Brittany)", lat: 48.45, lng: -5.10 },       // Off Brittany coast
  FINISTERRE: { id: "finisterre", name: "Cape Finisterre", lat: 42.88, lng: -9.27 },  // NW Spain
  
  // Malacca Strait
  MALACCA_WEST: { id: "malacca-west", name: "Malacca Strait West", lat: 5.50, lng: 95.50 },
  MALACCA_EAST: { id: "malacca-east", name: "Malacca Strait East (Singapore)", lat: 1.26, lng: 103.80 },
  
  // Cape of Good Hope
  CAPE_GOOD_HOPE: { id: "cape-good-hope", name: "Cape of Good Hope", lat: -34.35, lng: 18.50 },
  
  // Cape Horn
  CAPE_HORN: { id: "cape-horn", name: "Cape Horn", lat: -55.98, lng: -67.27 },
  
  // Panama Canal
  PANAMA_ATLANTIC: { id: "panama-atlantic", name: "Panama (Atlantic)", lat: 9.38, lng: -79.92 },
  PANAMA_PACIFIC: { id: "panama-pacific", name: "Panama (Pacific)", lat: 8.95, lng: -79.57 },
  
  // Arabian Sea waypoints
  GULF_OF_ADEN: { id: "gulf-of-aden", name: "Gulf of Aden", lat: 12.00, lng: 48.00 },
  ARABIAN_SEA: { id: "arabian-sea", name: "Arabian Sea", lat: 15.00, lng: 65.00 },
  
  // Indian Ocean
  SRI_LANKA: { id: "sri-lanka", name: "South of Sri Lanka", lat: 5.50, lng: 80.00 },
  
  // South China Sea
  SOUTH_CHINA_SEA: { id: "south-china-sea", name: "South China Sea", lat: 10.00, lng: 115.00 },
  
  // Mediterranean
  MALTA: { id: "malta", name: "Malta", lat: 35.90, lng: 14.50 },
  CRETE: { id: "crete", name: "South of Crete", lat: 34.00, lng: 25.00 },
  SICILY: { id: "sicily", name: "South of Sicily", lat: 36.80, lng: 15.10 },        // Between Malta and Greece
};

export type WaypointId = keyof typeof MARITIME_WAYPOINTS;
export type Waypoint = { id: string; name: string; lat: number; lng: number };

// Define maritime regions for routing logic
export enum MaritimeRegion {
  NORTH_EUROPE = "NORTH_EUROPE",      // North Sea, Baltic
  MEDITERRANEAN = "MEDITERRANEAN",
  RED_SEA = "RED_SEA",
  ARABIAN_GULF = "ARABIAN_GULF",      // Persian Gulf
  INDIAN_OCEAN = "INDIAN_OCEAN",
  SOUTHEAST_ASIA = "SOUTHEAST_ASIA",  // Malacca, Singapore
  EAST_ASIA = "EAST_ASIA",            // China, Japan, Korea
  WEST_AFRICA = "WEST_AFRICA",
  EAST_AFRICA = "EAST_AFRICA",
  SOUTH_AFRICA = "SOUTH_AFRICA",
  NORTH_AMERICA_EAST = "NORTH_AMERICA_EAST",
  NORTH_AMERICA_WEST = "NORTH_AMERICA_WEST",
  SOUTH_AMERICA_EAST = "SOUTH_AMERICA_EAST",
  SOUTH_AMERICA_WEST = "SOUTH_AMERICA_WEST",
  OCEANIA = "OCEANIA",
}

/**
 * Determine maritime region for a given coordinate
 */
export function getMaritimeRegion(lat: number, lng: number): MaritimeRegion {
  // North Europe (Baltic, North Sea)
  if (lat > 48 && lng > -10 && lng < 30) {
    return MaritimeRegion.NORTH_EUROPE;
  }
  
  // Mediterranean
  if (lat > 30 && lat < 46 && lng > -6 && lng < 36) {
    return MaritimeRegion.MEDITERRANEAN;
  }
  
  // Red Sea
  if (lat > 12 && lat < 30 && lng > 32 && lng < 44) {
    return MaritimeRegion.RED_SEA;
  }
  
  // Arabian Gulf (Persian Gulf)
  if (lat > 23 && lat < 31 && lng > 47 && lng < 57) {
    return MaritimeRegion.ARABIAN_GULF;
  }
  
  // South Africa
  if (lat < -25 && lng > 15 && lng < 40) {
    return MaritimeRegion.SOUTH_AFRICA;
  }
  
  // West Africa
  if (lat > -10 && lat < 20 && lng > -20 && lng < 15) {
    return MaritimeRegion.WEST_AFRICA;
  }
  
  // East Africa
  if (lat > -15 && lat < 12 && lng > 35 && lng < 55) {
    return MaritimeRegion.EAST_AFRICA;
  }
  
  // Indian Ocean / Indian Subcontinent
  if (lat > -10 && lat < 25 && lng > 55 && lng < 95) {
    return MaritimeRegion.INDIAN_OCEAN;
  }
  
  // Southeast Asia (Malacca, Indonesia, Philippines)
  if (lat > -10 && lat < 20 && lng > 95 && lng < 130) {
    return MaritimeRegion.SOUTHEAST_ASIA;
  }
  
  // East Asia (China, Japan, Korea)
  if (lat > 20 && lng > 100 && lng < 150) {
    return MaritimeRegion.EAST_ASIA;
  }
  
  // Oceania
  if (lat < 0 && lng > 100 && lng < 180) {
    return MaritimeRegion.OCEANIA;
  }
  
  // North America East
  if (lat > 10 && lat < 60 && lng > -100 && lng < -40) {
    return MaritimeRegion.NORTH_AMERICA_EAST;
  }
  
  // North America West
  if (lat > 10 && lat < 60 && lng > -140 && lng < -100) {
    return MaritimeRegion.NORTH_AMERICA_WEST;
  }
  
  // South America East
  if (lat < 10 && lat > -60 && lng > -60 && lng < -30) {
    return MaritimeRegion.SOUTH_AMERICA_EAST;
  }
  
  // South America West
  if (lat < 10 && lat > -60 && lng > -90 && lng < -60) {
    return MaritimeRegion.SOUTH_AMERICA_WEST;
  }
  
  // Default to ocean based on hemisphere
  if (lng > 20 && lng < 100) {
    return MaritimeRegion.INDIAN_OCEAN;
  }
  
  return MaritimeRegion.NORTH_EUROPE;
}

/**
 * Get required waypoints to travel between two regions
 * Routes via Suez Canal for Europe <-> Asia routes
 */
export function getRouteWaypoints(
  fromRegion: MaritimeRegion,
  toRegion: MaritimeRegion
): Waypoint[] {
  const W = MARITIME_WAYPOINTS;
  
  // Same region - no waypoints needed
  if (fromRegion === toRegion) {
    return [];
  }
  
  // Europe to/from Asian regions (via Suez)
  // Routes go: Dover -> Ushant (Brittany) -> Finisterre (NW Spain) -> Gibraltar
  if (fromRegion === MaritimeRegion.NORTH_EUROPE) {
    switch (toRegion) {
      case MaritimeRegion.MEDITERRANEAN:
        // Go around Atlantic coast to Gibraltar, then through Med
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR, W.SICILY];
      case MaritimeRegion.RED_SEA:
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR, W.MALTA, W.SUEZ_NORTH, W.SUEZ_SOUTH];
      case MaritimeRegion.ARABIAN_GULF:
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR, W.MALTA, W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB, W.ARABIAN_SEA];
      case MaritimeRegion.INDIAN_OCEAN:
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR, W.MALTA, W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB, W.ARABIAN_SEA, W.SRI_LANKA];
      case MaritimeRegion.SOUTHEAST_ASIA:
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR, W.MALTA, W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB, W.ARABIAN_SEA, W.SRI_LANKA, W.MALACCA_WEST, W.MALACCA_EAST];
      case MaritimeRegion.EAST_ASIA:
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR, W.MALTA, W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB, W.ARABIAN_SEA, W.SRI_LANKA, W.MALACCA_WEST, W.MALACCA_EAST, W.SOUTH_CHINA_SEA];
      case MaritimeRegion.WEST_AFRICA:
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR];
      case MaritimeRegion.EAST_AFRICA:
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR, W.MALTA, W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB];
      case MaritimeRegion.SOUTH_AFRICA:
        return [W.DOVER, W.USHANT, W.FINISTERRE, W.GIBRALTAR, W.CAPE_GOOD_HOPE];
      case MaritimeRegion.NORTH_AMERICA_EAST:
        return []; // Direct Atlantic crossing
      case MaritimeRegion.NORTH_AMERICA_WEST:
        return [W.PANAMA_ATLANTIC, W.PANAMA_PACIFIC];
      default:
        return [];
    }
  }
  
  // Mediterranean routes
  if (fromRegion === MaritimeRegion.MEDITERRANEAN) {
    switch (toRegion) {
      case MaritimeRegion.NORTH_EUROPE:
        // Reverse: Sicily -> Gibraltar -> Finisterre -> Ushant -> Dover
        return [W.SICILY, W.GIBRALTAR, W.FINISTERRE, W.USHANT, W.DOVER];
      case MaritimeRegion.RED_SEA:
        return [W.SUEZ_NORTH, W.SUEZ_SOUTH];
      case MaritimeRegion.ARABIAN_GULF:
        return [W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB, W.ARABIAN_SEA];
      case MaritimeRegion.INDIAN_OCEAN:
        return [W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB, W.ARABIAN_SEA, W.SRI_LANKA];
      case MaritimeRegion.SOUTHEAST_ASIA:
        return [W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB, W.ARABIAN_SEA, W.SRI_LANKA, W.MALACCA_WEST, W.MALACCA_EAST];
      case MaritimeRegion.EAST_ASIA:
        return [W.SUEZ_NORTH, W.SUEZ_SOUTH, W.BAB_EL_MANDEB, W.ARABIAN_SEA, W.SRI_LANKA, W.MALACCA_WEST, W.MALACCA_EAST, W.SOUTH_CHINA_SEA];
      default:
        return [W.GIBRALTAR];
    }
  }
  
  // Southeast Asia routes
  if (fromRegion === MaritimeRegion.SOUTHEAST_ASIA) {
    switch (toRegion) {
      case MaritimeRegion.NORTH_EUROPE:
        return [W.MALACCA_WEST, W.SRI_LANKA, W.ARABIAN_SEA, W.BAB_EL_MANDEB, W.SUEZ_SOUTH, W.SUEZ_NORTH, W.MALTA, W.GIBRALTAR, W.DOVER];
      case MaritimeRegion.MEDITERRANEAN:
        return [W.MALACCA_WEST, W.SRI_LANKA, W.ARABIAN_SEA, W.BAB_EL_MANDEB, W.SUEZ_SOUTH, W.SUEZ_NORTH];
      case MaritimeRegion.ARABIAN_GULF:
        return [W.MALACCA_WEST, W.SRI_LANKA, W.ARABIAN_SEA];
      case MaritimeRegion.INDIAN_OCEAN:
        return [W.MALACCA_WEST, W.SRI_LANKA];
      case MaritimeRegion.EAST_ASIA:
        return [W.SOUTH_CHINA_SEA];
      default:
        return [W.MALACCA_WEST];
    }
  }
  
  // East Asia routes
  if (fromRegion === MaritimeRegion.EAST_ASIA) {
    switch (toRegion) {
      case MaritimeRegion.NORTH_EUROPE:
        return [W.SOUTH_CHINA_SEA, W.MALACCA_EAST, W.MALACCA_WEST, W.SRI_LANKA, W.ARABIAN_SEA, W.BAB_EL_MANDEB, W.SUEZ_SOUTH, W.SUEZ_NORTH, W.MALTA, W.GIBRALTAR, W.DOVER];
      case MaritimeRegion.MEDITERRANEAN:
        return [W.SOUTH_CHINA_SEA, W.MALACCA_EAST, W.MALACCA_WEST, W.SRI_LANKA, W.ARABIAN_SEA, W.BAB_EL_MANDEB, W.SUEZ_SOUTH, W.SUEZ_NORTH];
      case MaritimeRegion.ARABIAN_GULF:
        return [W.SOUTH_CHINA_SEA, W.MALACCA_EAST, W.MALACCA_WEST, W.SRI_LANKA, W.ARABIAN_SEA];
      case MaritimeRegion.SOUTHEAST_ASIA:
        return [W.SOUTH_CHINA_SEA];
      case MaritimeRegion.NORTH_AMERICA_WEST:
        return []; // Direct Pacific crossing
      default:
        return [W.SOUTH_CHINA_SEA, W.MALACCA_EAST, W.MALACCA_WEST];
    }
  }
  
  // Arabian Gulf routes
  if (fromRegion === MaritimeRegion.ARABIAN_GULF) {
    switch (toRegion) {
      case MaritimeRegion.NORTH_EUROPE:
        return [W.ARABIAN_SEA, W.BAB_EL_MANDEB, W.SUEZ_SOUTH, W.SUEZ_NORTH, W.MALTA, W.GIBRALTAR, W.DOVER];
      case MaritimeRegion.MEDITERRANEAN:
        return [W.ARABIAN_SEA, W.BAB_EL_MANDEB, W.SUEZ_SOUTH, W.SUEZ_NORTH];
      case MaritimeRegion.SOUTHEAST_ASIA:
        return [W.ARABIAN_SEA, W.SRI_LANKA, W.MALACCA_WEST, W.MALACCA_EAST];
      case MaritimeRegion.EAST_ASIA:
        return [W.ARABIAN_SEA, W.SRI_LANKA, W.MALACCA_WEST, W.MALACCA_EAST, W.SOUTH_CHINA_SEA];
      case MaritimeRegion.INDIAN_OCEAN:
        return [W.ARABIAN_SEA, W.SRI_LANKA];
      case MaritimeRegion.SOUTH_AFRICA:
        return [W.ARABIAN_SEA, W.GULF_OF_ADEN, W.CAPE_GOOD_HOPE];
      default:
        return [W.ARABIAN_SEA];
    }
  }
  
  // Default: return empty (direct route)
  return [];
}

/**
 * Build complete maritime route with waypoints
 */
export function buildMaritimeRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): { lat: number; lng: number }[] {
  const fromRegion = getMaritimeRegion(fromLat, fromLng);
  const toRegion = getMaritimeRegion(toLat, toLng);
  
  const waypoints = getRouteWaypoints(fromRegion, toRegion);
  
  // Build route: start -> waypoints -> end
  const route: { lat: number; lng: number }[] = [
    { lat: fromLat, lng: fromLng },
    ...waypoints.map(w => ({ lat: w.lat, lng: w.lng })),
    { lat: toLat, lng: toLng },
  ];
  
  return route;
}
