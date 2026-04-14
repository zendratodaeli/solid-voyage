/**
 * Strategic Passages API
 * 
 * GET /api/passages - List all passages or search by name
 * Returns fallback data if database is empty
 */

import { NextRequest, NextResponse } from "next/server";

// Fallback data in case database is empty
// Canals include polyline arrays for accurate visual rendering
const FALLBACK_PASSAGES = [
  {
    id: "kiel-canal",
    name: "Kiel Canal",
    displayName: "Kiel Canal (Germany)",
    type: "canal",
    region: "Europe",
    entryLat: 53.8970,
    entryLng: 9.1520,
    entryName: "Brunsbüttel",
    exitLat: 54.3720,
    exitLng: 10.1231,
    exitName: "Holtenau",
    maxDraft: null,
    restriction: null,
    hasToll: true,
    isActive: true,
    // REAL Kiel Canal coordinates from OpenStreetMap (Nord-Ostsee-Kanal)
    // Traced from Brunsbüttel (SW) to Holtenau/Kiel (NE)
    polyline: [
      // Brunsbüttel entrance (Elbe)
      [53.8970, 9.1520],
      [53.9011, 9.1590],
      [53.9027, 9.1616],
      [53.9085, 9.1730],
      [53.9114, 9.1782],
      [53.9145, 9.1837],
      [53.9172, 9.1886],
      [53.9211, 9.1952],
      [53.9242, 9.1994],
      [53.9279, 9.2044],
      [53.9348, 9.2144],
      [53.9396, 9.2210],
      [53.9430, 9.2255],
      [53.9488, 9.2335],
      [53.9559, 9.2430],
      [53.9636, 9.2536],
      [53.9698, 9.2619],
      [53.9767, 9.2713],
      [53.9838, 9.2804],
      [53.9884, 9.2851],
      [53.9921, 9.2878],
      [53.9974, 9.2916],
      [54.0003, 9.2928],
      [54.0094, 9.2956],
      [54.0166, 9.2974],
      [54.0269, 9.3002],
      [54.0358, 9.3026],
      [54.0450, 9.3049],
      [54.0501, 9.3063],
      [54.0590, 9.3094],
      [54.0654, 9.3120],
      [54.0710, 9.3143],
      [54.0798, 9.3190],
      [54.0884, 9.3236],
      [54.0968, 9.3280],
      [54.1023, 9.3296],
      [54.1090, 9.3292],
      [54.1172, 9.3278],
      [54.1248, 9.3292],
      [54.1324, 9.3335],
      [54.1365, 9.3373],
      [54.1403, 9.3422],
      [54.1456, 9.3526],
      [54.1505, 9.3653],
      [54.1551, 9.3793],
      [54.1588, 9.3931],
      [54.1626, 9.4096],
      [54.1658, 9.4214],
      [54.1712, 9.4381],
      [54.1759, 9.4535],
      [54.1809, 9.4765],
      [54.1862, 9.5028],
      [54.1899, 9.5199],
      [54.1941, 9.5384],
      [54.1972, 9.5478],
      [54.2023, 9.5601],
      [54.2081, 9.5722],
      [54.2121, 9.5804],
      [54.2166, 9.5893],
      [54.2203, 9.5947],
      [54.2280, 9.6024],
      [54.2338, 9.6068],
      [54.2418, 9.6113],
      [54.2487, 9.6157],
      [54.2554, 9.6197],
      [54.2626, 9.6240],
      [54.2702, 9.6288],
      [54.2785, 9.6350],
      [54.2824, 9.6396],
      [54.2881, 9.6517],
      [54.2919, 9.6733],
      [54.2944, 9.6880],
      [54.2976, 9.6999],
      [54.3020, 9.7073],
      [54.3058, 9.7103],
      [54.3124, 9.7124],
      [54.3204, 9.7145],
      [54.3262, 9.7200],
      [54.3325, 9.7316],
      [54.3358, 9.7382],
      [54.3419, 9.7500],
      // Connecting section to Holtenau
      [54.3426, 9.9682],
      [54.3449, 9.9841],
      [54.3519, 10.0006],
      [54.3592, 10.0181],
      [54.3607, 10.0327],
      [54.3596, 10.0560],
      [54.3633, 10.0675],
      [54.3689, 10.0781],
      [54.3718, 10.0945],
      // Holtenau exit (Kiel Fjord)
      [54.3720, 10.1231],
    ],
    distanceNm: 53.2, // Official Kiel Canal distance
  },
  {
    id: "dover-strait",
    name: "Dover Strait",
    displayName: "Dover Strait (UK/France)",
    type: "strait",
    region: "Europe",
    entryLat: 51.02,
    entryLng: 1.48,
    entryName: "Dover TSS",
    exitLat: 50.97,
    exitLng: 1.85,
    exitName: "Calais TSS",
    maxDraft: null,
    restriction: null,
    hasToll: false,
    isActive: true,
    polyline: null, // Wide strait, no special polyline needed
  },
  {
    id: "bosphorus",
    name: "Bosphorus",
    displayName: "Bosphorus Strait (Turkey)",
    type: "strait",
    region: "Europe",
    entryLat: 41.2,
    entryLng: 29.13,
    entryName: "Black Sea Entrance",
    exitLat: 41.01,
    exitLng: 28.98,
    exitName: "Marmara Exit",
    maxDraft: null,
    restriction: "Daylight transit only for large vessels",
    hasToll: false,
    isActive: true,
    // S-curve through Istanbul
    polyline: [
      [41.2200, 29.1300],  // Black Sea entrance
      [41.1833, 29.1000],  
      [41.1500, 29.0700],  // North bend
      [41.1167, 29.0550],  
      [41.0833, 29.0400],  // Central Istanbul
      [41.0500, 29.0200],  
      [41.0333, 29.0100],  
      [41.0100, 28.9800],  // Marmara exit
    ],
    distanceNm: 16.5,
  },
  {
    id: "suez-canal",
    name: "Suez Canal",
    displayName: "Suez Canal (Egypt)",
    type: "canal",
    region: "Global",
    entryLat: 31.25,
    entryLng: 32.3,
    entryName: "Port Said",
    exitLat: 29.93,
    exitLng: 32.55,
    exitName: "Suez",
    maxDraft: 20.1,
    restriction: "Max draft 20.1m (Suezmax)",
    hasToll: true,
    isActive: true,
    // Curved path through the Suez Canal (prevents cutting through Sinai)
    polyline: [
      [31.2650, 32.3150],  // Port Said entrance
      [31.1500, 32.3500],  
      [31.0000, 32.4000],  // Lake Manzala area
      [30.8500, 32.4200],  
      [30.7000, 32.4400],  
      [30.5700, 32.4500],  // Ismailia region
      [30.4500, 32.4600],  
      [30.3500, 32.4800],  // Great Bitter Lake north
      [30.2500, 32.5000],  
      [30.1000, 32.5200],  // Great Bitter Lake
      [29.9500, 32.5400],  // Approaching Suez
      [29.9300, 32.5500],  // Suez exit
    ],
    distanceNm: 87.4,
  },
  {
    id: "panama-canal",
    name: "Panama Canal",
    displayName: "Panama Canal (Panama)",
    type: "canal",
    region: "Global",
    entryLat: 9.3,
    entryLng: -79.9,
    entryName: "Colón",
    exitLat: 8.95,
    exitLng: -79.53,
    exitName: "Balboa",
    maxDraft: 15.2,
    restriction: "Max draft 15.2m (Neopanamax)",
    hasToll: true,
    isActive: true,
    // Complex path through Gatun Lake
    polyline: [
      [9.3500, -79.9200],   // Colón / Atlantic entrance
      [9.3000, -79.9000],   // Gatun Locks area
      [9.2700, -79.8700],   
      [9.2400, -79.8500],   // Gatun Lake entrance
      [9.2000, -79.8300],   
      [9.1700, -79.8000],   // Gatun Lake
      [9.1400, -79.7700],   
      [9.1100, -79.7400],   
      [9.0800, -79.7100],   // Approaching Culebra Cut
      [9.0500, -79.6700],   // Culebra Cut (narrowest)
      [9.0200, -79.6300],   
      [9.0000, -79.5900],   // Pedro Miguel Locks
      [8.9700, -79.5600],   // Miraflores Lake
      [8.9500, -79.5300],   // Balboa / Pacific exit
    ],
    distanceNm: 40.0,
  },
  {
    id: "malacca-strait",
    name: "Malacca Strait",
    displayName: "Malacca Strait (Indonesia/Malaysia)",
    type: "strait",
    region: "Asia",
    entryLat: 5.4,
    entryLng: 99.5,
    entryName: "One Fathom Bank",
    exitLat: 1.2,
    exitLng: 103.5,
    exitName: "Singapore Strait",
    maxDraft: 20.5,
    restriction: "Max draft 20.5m (Malaccamax)",
    hasToll: false,
    isActive: true,
    polyline: null, // Wide strait
  },
  {
    id: "sunda-strait",
    name: "Sunda Strait",
    displayName: "Sunda Strait (Indonesia)",
    type: "strait",
    region: "Asia",
    entryLat: -5.55,
    entryLng: 105.9,
    entryName: "Java Sea",
    exitLat: -6.65,
    exitLng: 105.25,
    exitName: "Indian Ocean",
    maxDraft: 18.0,
    restriction: "Max draft 18.0m (Shallow/Strong Currents)",
    hasToll: false,
    isActive: true,
    polyline: null,
  },
  {
    id: "lombok-strait",
    name: "Lombok Strait",
    displayName: "Lombok Strait (Indonesia)",
    type: "strait",
    region: "Asia",
    entryLat: -8.25,
    entryLng: 115.75,
    entryName: "Bali Sea",
    exitLat: -9.1,
    exitLng: 115.55,
    exitName: "Indian Ocean",
    maxDraft: null,
    restriction: "Deep water (>150m). Safe for VLCCs.",
    hasToll: false,
    isActive: true,
    polyline: null,
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase();

    // Use fallback data directly (database not seeded yet)
    const passages = query
      ? FALLBACK_PASSAGES.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.displayName.toLowerCase().includes(query) ||
            p.region.toLowerCase().includes(query)
        )
      : FALLBACK_PASSAGES;

    return NextResponse.json(passages);
  } catch (error) {
    console.error("Error fetching passages:", error);
    // Return fallback data even on error
    return NextResponse.json(FALLBACK_PASSAGES);
  }
}

