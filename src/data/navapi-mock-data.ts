/**
 * NavAPI Sea Routing Mock Data
 *
 * Realistic hardcoded responses for port search and route calculation.
 * Used when NEXT_PUBLIC_USE_MOCK_ROUTING=true to avoid consuming API tokens.
 */

import type { ParsedPort, SingleRouteResult, RouteWaypoint } from "@/lib/navapi-client";

// ═══════════════════════════════════════════════════════════════════
// 1. PORT SEARCH — srtg/autc/SeaPortSearch
//    15 major world ports with UNLOCODE, coordinates, country codes
// ═══════════════════════════════════════════════════════════════════

export const MOCK_PORTS: ParsedPort[] = [
  // Europe
  { displayName: "Hamburg",                portCode: "DEHAM", country: "DE", latitude: 53.5511, longitude: 9.9937 },
  { displayName: "Rotterdam",              portCode: "NLRTM", country: "NL", latitude: 51.9244, longitude: 4.4777 },
  { displayName: "Amsterdam",              portCode: "NLAMS", country: "NL", latitude: 52.3808, longitude: 4.8981 },
  { displayName: "Antwerp",                portCode: "BEANR", country: "BE", latitude: 51.2194, longitude: 4.4025 },
  { displayName: "Bremerhaven",            portCode: "DEBRV", country: "DE", latitude: 53.5396, longitude: 8.5809 },
  { displayName: "Rostock",                portCode: "DERSK", country: "DE", latitude: 54.0887, longitude: 12.1407 },
  { displayName: "Felixstowe",             portCode: "GBFXT", country: "GB", latitude: 51.9536, longitude: 1.3511 },
  { displayName: "Le Havre",               portCode: "FRLEH", country: "FR", latitude: 49.4944, longitude: 0.1079 },
  { displayName: "Algeciras",              portCode: "ESALG", country: "ES", latitude: 36.1408, longitude: -5.4536 },
  { displayName: "Barcelona",              portCode: "ESBCN", country: "ES", latitude: 41.3590, longitude: 2.1688 },
  { displayName: "Gothenburg",             portCode: "SEGOT", country: "SE", latitude: 57.7089, longitude: 11.9746 },
  { displayName: "Gdansk",                 portCode: "PLGDN", country: "PL", latitude: 54.3520, longitude: 18.6466 },
  { displayName: "Piraeus",                portCode: "GRPIR", country: "GR", latitude: 37.9475, longitude: 23.6372 },
  { displayName: "Genoa",                  portCode: "ITGOA", country: "IT", latitude: 44.4056, longitude: 8.9463 },
  { displayName: "Wilhelmshaven",          portCode: "DEWVN", country: "DE", latitude: 53.5151, longitude: 8.1381 },
  // Asia
  { displayName: "Singapore",              portCode: "SGSIN", country: "SG", latitude: 1.2644,  longitude: 103.8198 },
  { displayName: "Tanjung Priok (Jakarta)", portCode: "IDTPP", country: "ID", latitude: -6.1017, longitude: 106.8817 },
  { displayName: "Tanjung Perak (Surabaya)", portCode: "IDSUB", country: "ID", latitude: -7.2000, longitude: 112.7333 },
  { displayName: "Shanghai",               portCode: "CNSHA", country: "CN", latitude: 31.2304, longitude: 121.4737 },
  { displayName: "Shenzhen (Yantian)",     portCode: "CNSZX", country: "CN", latitude: 22.5726, longitude: 114.2660 },
  { displayName: "Ningbo-Zhoushan",        portCode: "CNNGB", country: "CN", latitude: 29.8683, longitude: 121.5440 },
  { displayName: "Busan",                  portCode: "KRPUS", country: "KR", latitude: 35.1028, longitude: 129.0403 },
  { displayName: "Port Klang",             portCode: "MYPKG", country: "MY", latitude: 3.0000,  longitude: 101.4000 },
  { displayName: "Colombo",                portCode: "LKCMB", country: "LK", latitude: 6.9400,  longitude: 79.8500 },
  { displayName: "Mumbai (Nhava Sheva)",   portCode: "INNSA", country: "IN", latitude: 18.9500, longitude: 72.9500 },
  { displayName: "Tokyo",                  portCode: "JPTYO", country: "JP", latitude: 35.6528, longitude: 139.7895 },
  // Middle East
  { displayName: "Jeddah",                 portCode: "SAJED", country: "SA", latitude: 21.4858, longitude: 39.1925 },
  { displayName: "Jebel Ali (Dubai)",      portCode: "AEJEA", country: "AE", latitude: 25.0069, longitude: 55.0628 },
  { displayName: "Salalah",                portCode: "OMSLL", country: "OM", latitude: 16.9460, longitude: 54.0000 },
  // Americas
  { displayName: "New York / Newark",      portCode: "USNYC", country: "US", latitude: 40.6892, longitude: -74.0445 },
  { displayName: "Houston",                portCode: "USHOU", country: "US", latitude: 29.7604, longitude: -95.3698 },
  { displayName: "Santos",                 portCode: "BRSSZ", country: "BR", latitude: -23.9608, longitude: -46.3336 },
  { displayName: "Colon (Panama)",         portCode: "PAONX", country: "PA", latitude: 9.3560,  longitude: -79.9007 },
  // Africa
  { displayName: "Durban",                 portCode: "ZADUR", country: "ZA", latitude: -29.8587, longitude: 31.0218 },
  { displayName: "Cape Town",              portCode: "ZACPT", country: "ZA", latitude: -33.9249, longitude: 18.4241 },
  { displayName: "Port Said",              portCode: "EGPSD", country: "EG", latitude: 31.2653, longitude: 32.3019 },
  // Oceania
  { displayName: "Melbourne",              portCode: "AUMEL", country: "AU", latitude: -37.8208, longitude: 144.9582 },
  { displayName: "Sydney",                 portCode: "AUSYD", country: "AU", latitude: -33.8568, longitude: 151.2153 },
];

/**
 * Search mock ports by name substring (case-insensitive)
 */
export function searchMockPorts(query: string): ParsedPort[] {
  const q = query.toLowerCase();
  return MOCK_PORTS.filter(
    (p) =>
      p.displayName.toLowerCase().includes(q) ||
      p.portCode.toLowerCase().includes(q) ||
      p.country.toLowerCase().includes(q)
  );
}

// ═══════════════════════════════════════════════════════════════════
// 2. ROUTE CALCULATIONS — srtg/calc/SingleRoute
//    Pre-computed routes for common pairs with realistic
//    distances, SECA, canal breakdown, and full waypoint arrays.
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a great-circle route with realistic curvature and waypoints
 */
function generateRoute(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
  totalDistanceNm: number,
  secaDistanceNm: number,
  canalDistanceNm: number,
  numPoints: number = 24,
): SingleRouteResult {
  const waypoints: RouteWaypoint[] = [];
  const coordinates: [number, number][] = [];

  // Great-circle interpolation
  const toRad = (d: number) => d * Math.PI / 180;
  const toDeg = (r: number) => r * 180 / Math.PI;
  const lat1 = toRad(startLat);
  const lat2 = toRad(endLat);
  const lon1 = toRad(startLon);
  const lon2 = toRad(endLon);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const sinC = Math.sin(c);
    if (sinC === 0) {
      waypoints.push({ lat: startLat, lon: startLon });
      coordinates.push([startLon, startLat]);
      continue;
    }
    const A = Math.sin((1 - f) * c) / sinC;
    const B = Math.sin(f * c) / sinC;
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lon = toDeg(Math.atan2(y, x));

    // Slight sea-routing jitter (skip endpoints)
    const jLat = (i === 0 || i === numPoints) ? 0 : (Math.sin(i * 0.7) * 0.15 * Math.sin(f * Math.PI));
    const jLon = (i === 0 || i === numPoints) ? 0 : (Math.cos(i * 1.3) * 0.15 * Math.sin(f * Math.PI));

    const finalLat = i === 0 ? startLat : i === numPoints ? endLat : lat + jLat;
    const finalLon = i === 0 ? startLon : i === numPoints ? endLon : lon + jLon;
    waypoints.push({ lat: finalLat, lon: finalLon });
    coordinates.push([finalLon, finalLat]);
  }

  const nonSecaDistance = Math.max(0, totalDistanceNm - secaDistanceNm - canalDistanceNm);

  return {
    success: true,
    totalDistance: totalDistanceNm,
    secaDistance: secaDistanceNm,
    canalDistance: canalDistanceNm,
    nonSecaDistance,
    waypoints,
    geometry: { type: "LineString", coordinates },
  };
}

// ── Hamburg → Rotterdam (North Sea, full SECA) ──
const ROUTE_HAMBURG_ROTTERDAM = generateRoute(
  53.5511, 9.9937,   // Hamburg
  51.9244, 4.4777,   // Rotterdam
  260.5,             // Total NM
  260.5,             // 100% SECA (Baltic + North Sea)
  98.5,              // Kiel Canal transit (included in total)
  16,
);

// ── Rotterdam → Singapore (via Suez) ──
const ROUTE_ROTTERDAM_SINGAPORE = generateRoute(
  51.9244, 4.4777,   // Rotterdam
  1.2644, 103.8198,  // Singapore
  8290.0,            // Total NM
  384.6,             // North Sea SECA portion
  88.0,              // Suez Canal transit
  32,
);

// ── Hamburg → Piraeus (Baltic → Med via Kiel + Gibraltar) ──
const ROUTE_HAMBURG_PIRAEUS = generateRoute(
  53.5511, 9.9937,   // Hamburg
  37.9475, 23.6372,  // Piraeus
  3185.0,            // Total NM
  412.8,             // Baltic SECA + partial Med SECA
  98.5,              // Kiel Canal transit
  28,
);

// ── Rostock → Rotterdam (Kiel Canal route) ──
const ROUTE_ROSTOCK_ROTTERDAM = generateRoute(
  54.0887, 12.1407,  // Rostock
  51.9244, 4.4777,   // Rotterdam
  384.6,             // Total NM — via Kiel Canal
  384.6,             // 100% SECA
  98.5,              // Kiel Canal
  14,
);

// ── Rotterdam → New York (Transatlantic) ──
const ROUTE_ROTTERDAM_NEWYORK = generateRoute(
  51.9244, 4.4777,   // Rotterdam
  40.6892, -74.0445, // New York
  3459.0,            // Total NM
  185.0,             // North Sea + NA ECA portions
  0,                 // No canal
  28,
);

// ── Known route mapping ──
interface MockRouteKey {
  startCode?: string;
  endCode?: string;
}

interface MockRouteEntry {
  key: MockRouteKey;
  result: SingleRouteResult;
}

const MOCK_ROUTES: MockRouteEntry[] = [
  { key: { startCode: "DEHAM", endCode: "NLRTM" }, result: ROUTE_HAMBURG_ROTTERDAM },
  { key: { startCode: "NLRTM", endCode: "DEHAM" }, result: ROUTE_HAMBURG_ROTTERDAM },
  { key: { startCode: "NLRTM", endCode: "SGSIN" }, result: ROUTE_ROTTERDAM_SINGAPORE },
  { key: { startCode: "SGSIN", endCode: "NLRTM" }, result: ROUTE_ROTTERDAM_SINGAPORE },
  { key: { startCode: "DEHAM", endCode: "GRPIR" }, result: ROUTE_HAMBURG_PIRAEUS },
  { key: { startCode: "GRPIR", endCode: "DEHAM" }, result: ROUTE_HAMBURG_PIRAEUS },
  { key: { startCode: "DERSK", endCode: "NLRTM" }, result: ROUTE_ROSTOCK_ROTTERDAM },
  { key: { startCode: "NLRTM", endCode: "DERSK" }, result: ROUTE_ROSTOCK_ROTTERDAM },
  { key: { startCode: "NLRTM", endCode: "USNYC" }, result: ROUTE_ROTTERDAM_NEWYORK },
  { key: { startCode: "USNYC", endCode: "NLRTM" }, result: ROUTE_ROTTERDAM_NEWYORK },
];

/**
 * Find a pre-computed mock route for two port codes.
 * Falls back to dynamic Haversine-based route generator if no match found.
 */
export function findMockRoute(
  startCode?: string,
  endCode?: string,
  startLat?: number,
  startLon?: number,
  endLat?: number,
  endLon?: number,
): SingleRouteResult {
  // Try exact match first
  if (startCode && endCode) {
    const match = MOCK_ROUTES.find(
      (r) => r.key.startCode === startCode && r.key.endCode === endCode
    );
    if (match) return match.result;
  }

  // Try matching by coordinates against known ports
  const findPortByCoords = (lat?: number, lon?: number): string | undefined => {
    if (lat === undefined || lon === undefined) return undefined;
    const found = MOCK_PORTS.find(
      (p) => Math.abs(p.latitude - lat) < 0.5 && Math.abs(p.longitude - lon) < 0.5
    );
    return found?.portCode;
  };

  if (!startCode) startCode = findPortByCoords(startLat, startLon);
  if (!endCode) endCode = findPortByCoords(endLat, endLon);

  if (startCode && endCode) {
    const match = MOCK_ROUTES.find(
      (r) => r.key.startCode === startCode && r.key.endCode === endCode
    );
    if (match) return match.result;
  }

  // Fallback: generate a dynamic route from coordinates
  const sLat = startLat ?? MOCK_PORTS.find(p => p.portCode === startCode)?.latitude ?? 0;
  const sLon = startLon ?? MOCK_PORTS.find(p => p.portCode === startCode)?.longitude ?? 0;
  const eLat = endLat ?? MOCK_PORTS.find(p => p.portCode === endCode)?.latitude ?? 0;
  const eLon = endLon ?? MOCK_PORTS.find(p => p.portCode === endCode)?.longitude ?? 0;

  if (sLat === 0 && sLon === 0 && eLat === 0 && eLon === 0) {
    return {
      success: false,
      totalDistance: 0,
      secaDistance: 0,
      canalDistance: 0,
      nonSecaDistance: 0,
      waypoints: [],
      error: "No matching mock route found",
    };
  }

  // Haversine for estimated distance
  const R = 3440.065;
  const dLat = (eLat - sLat) * Math.PI / 180;
  const dLon = (eLon - sLon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(sLat * Math.PI / 180) * Math.cos(eLat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * R;
  const totalNm = Math.round(dist * 1.15 * 100) / 100; // 15% sea routing factor

  return generateRoute(sLat, sLon, eLat, eLon, totalNm, 0, 0, 24);
}

// ═══════════════════════════════════════════════════════════════════
// 3. API STATUS — acnt/view/ApiKeyStatus
// ═══════════════════════════════════════════════════════════════════

export const MOCK_API_STATUS = {
  success: true,
  tokens: 99999,
  expireDate: "2026-12-31T23:59:59Z",
  status: "MOCK_MODE",
};
