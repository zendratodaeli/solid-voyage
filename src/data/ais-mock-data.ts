/**
 * AIS Mock Data — Realistic hardcoded responses for all 6 NavAPI endpoints.
 * Used when NEXT_PUBLIC_USE_MOCK_AIS=true to avoid consuming API tokens.
 */

import type {
  AisShipSearchResult,
  AisVesselPosition,
  AisHistoricalTracksResult,
  AisWithinRangeResult,
  AisFindByDestResult,
} from "@/actions/ais-actions";

// ═══════════════════════════════════════════════════════════════════
// 1. SHIP SEARCH — autc/ShipSearch
// ═══════════════════════════════════════════════════════════════════

export const MOCK_SHIP_SEARCH: AisShipSearchResult[] = [
  { ShipName: "BBC BERGEN", ImoNumber: "9508395", MmsiNumber: "255806353", CallSign: "CQPC", ShipFlag: "PRT" },
  { ShipName: "BBC COLORADO", ImoNumber: "9504748", MmsiNumber: "305856000", CallSign: "V2FZ", ShipFlag: "ATG" },
  { ShipName: "WINNING PIONEER 24", ImoNumber: "9507300", MmsiNumber: "357512386", CallSign: "HO5286", ShipFlag: "PAN" },
  { ShipName: "MSC AURORA", ImoNumber: "9839284", MmsiNumber: "353136000", CallSign: "3FBR7", ShipFlag: "PAN" },
  { ShipName: "MAERSK HANGZHOU", ImoNumber: "9619957", MmsiNumber: "219018579", CallSign: "OXOS2", ShipFlag: "DNK" },
  { ShipName: "EVER GIVEN", ImoNumber: "9811000", MmsiNumber: "353136001", CallSign: "3EBP5", ShipFlag: "PAN" },
  { ShipName: "CMA CGM MARCO POLO", ImoNumber: "9454436", MmsiNumber: "228339600", CallSign: "FNAW", ShipFlag: "FRA" },
  { ShipName: "STENA GERMANICA", ImoNumber: "9145176", MmsiNumber: "266327000", CallSign: "SGUH", ShipFlag: "SWE" },
];

// ═══════════════════════════════════════════════════════════════════
// 2. LAST POSITION — svsl/LastPosition
// ═══════════════════════════════════════════════════════════════════

export const MOCK_LAST_POSITION: Record<string, AisVesselPosition> = {
  // BBC BERGEN — near Rotterdam
  "255806353": {
    ShipName: "BBC BERGEN", ImoNumber: "9508395", MmsiNumber: "255806353",
    CallSign: "CQPC", ShipFlag: "PRT", ShipType: "70",
    NavigationStatus: 0, Latitude: 51.89, Longitude: 4.49,
    SpeedOverGround: 12.3, CourseOverGround: 45.2, CourseTransmitted: 44.8,
    TrueHeading: 45, DestDeclared: "ROTTERDAM", EtaDeclared: "2026-02-28T14:00:00Z",
    OriginDeclared: "ANTWERP", DraughtDeclared: 7.5,
    PositionLastUpdated: new Date().toISOString(), Length: 143, Beam: 23,
  },
  // BBC JADE — near Hamburg
  "255806100": {
    ShipName: "BBC JADE", ImoNumber: "9508400", MmsiNumber: "255806100",
    CallSign: "CQPD", ShipFlag: "PRT", ShipType: "70",
    NavigationStatus: 0, Latitude: 53.55, Longitude: 9.93,
    SpeedOverGround: 0, CourseOverGround: 180, CourseTransmitted: 180,
    TrueHeading: 180, DestDeclared: "HAMBURG", EtaDeclared: "2026-03-01T08:00:00Z",
    OriginDeclared: "BREMERHAVEN", DraughtDeclared: 6.8,
    PositionLastUpdated: new Date().toISOString(), Length: 143, Beam: 23,
  },
  // BBC LONDON — near Antwerp
  "255806200": {
    ShipName: "BBC LONDON", ImoNumber: "9508410", MmsiNumber: "255806200",
    CallSign: "CQPE", ShipFlag: "PRT", ShipType: "70",
    NavigationStatus: 0, Latitude: 51.35, Longitude: 4.28,
    SpeedOverGround: 8.5, CourseOverGround: 310, CourseTransmitted: 309,
    TrueHeading: 310, DestDeclared: "ANTWERP", EtaDeclared: "2026-03-01T12:00:00Z",
    OriginDeclared: "LONDON", DraughtDeclared: 7.2,
    PositionLastUpdated: new Date().toISOString(), Length: 143, Beam: 23,
  },
  // BBC EVEREST — near Singapore
  "255806300": {
    ShipName: "BBC EVEREST", ImoNumber: "9508420", MmsiNumber: "255806300",
    CallSign: "CQPF", ShipFlag: "PRT", ShipType: "70",
    NavigationStatus: 5, Latitude: 1.27, Longitude: 103.85,
    SpeedOverGround: 0, CourseOverGround: 0, CourseTransmitted: 0,
    TrueHeading: 0, DestDeclared: "SINGAPORE", EtaDeclared: "2026-03-02T06:00:00Z",
    OriginDeclared: "HONG KONG", DraughtDeclared: 8.0,
    PositionLastUpdated: new Date().toISOString(), Length: 143, Beam: 23,
  },
};

/** Lookup helper: find mock position by MMSI, IMO, or name */
export function findMockPosition(params: { mmsi?: string; imo?: string; name?: string }): AisVesselPosition[] {
  // Try exact MMSI match
  if (params.mmsi && MOCK_LAST_POSITION[params.mmsi]) {
    return [MOCK_LAST_POSITION[params.mmsi]];
  }
  // Try IMO match
  if (params.imo) {
    const byImo = Object.values(MOCK_LAST_POSITION).find(v => v.ImoNumber === params.imo);
    if (byImo) return [byImo];
  }
  // Try name match
  if (params.name) {
    const q = params.name.toUpperCase();
    const byName = Object.values(MOCK_LAST_POSITION).find(v => v.ShipName?.toUpperCase().includes(q));
    if (byName) return [byName];
  }
  // Fallback: generate a deterministic position from the identifier so each vessel always gets a unique spot
  const id = params.mmsi || params.imo || params.name || "0";
  const hash = Array.from(id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const lat = 40 + (hash % 20) - 10; // Range: 30-50°N
  const lng = (hash % 40) - 10;       // Range: -10 to 30°E
  return [{
    ShipName: params.name || `Vessel ${id}`, ImoNumber: params.imo || null, MmsiNumber: params.mmsi || null,
    CallSign: null, ShipFlag: null, ShipType: "70",
    NavigationStatus: 0, Latitude: lat, Longitude: lng,
    SpeedOverGround: 0, CourseOverGround: 0, CourseTransmitted: 0,
    TrueHeading: 0, DestDeclared: null, EtaDeclared: null,
    OriginDeclared: null, DraughtDeclared: null,
    PositionLastUpdated: new Date().toISOString(), Length: null, Beam: null,
  }];
}

// ═══════════════════════════════════════════════════════════════════
// 3. FLEET POSITIONS — mvsl/FleetPositions
// ═══════════════════════════════════════════════════════════════════

export const MOCK_FLEET_POSITIONS: AisVesselPosition[] = [
  {
    ShipName: "BBC BERGEN", ImoNumber: "9508395", MmsiNumber: "255806353",
    CallSign: "CQPC", ShipFlag: "PRT", ShipType: "70",
    NavigationStatus: 0, Latitude: 51.89, Longitude: 4.49,
    SpeedOverGround: 12.3, CourseOverGround: 45.2, CourseTransmitted: 44.8,
    TrueHeading: 45, DestDeclared: "ROTTERDAM", EtaDeclared: "2026-02-28T14:00:00Z",
    OriginDeclared: "ANTWERP", DraughtDeclared: 7.5,
    PositionLastUpdated: "2026-02-27T08:30:00Z", Length: 143, Beam: 23,
  },
  {
    ShipName: "WINNING PIONEER 24", ImoNumber: "9507300", MmsiNumber: "357512386",
    CallSign: "HO5286", ShipFlag: "PAN", ShipType: "70",
    NavigationStatus: 5, Latitude: 1.27, Longitude: 103.85,
    SpeedOverGround: 0, CourseOverGround: 180, CourseTransmitted: 180,
    TrueHeading: 180, DestDeclared: "SINGAPORE", EtaDeclared: "2026-02-27T00:00:00Z",
    OriginDeclared: "HONG KONG", DraughtDeclared: 8.2,
    PositionLastUpdated: "2026-02-27T07:15:00Z", Length: 190, Beam: 32,
  },
  {
    ShipName: "MSC AURORA", ImoNumber: "9839284", MmsiNumber: "353136000",
    CallSign: "3FBR7", ShipFlag: "PAN", ShipType: "71",
    NavigationStatus: 0, Latitude: 36.12, Longitude: -5.35,
    SpeedOverGround: 18.5, CourseOverGround: 270, CourseTransmitted: 269,
    TrueHeading: 270, DestDeclared: "NEW YORK", EtaDeclared: "2026-03-05T06:00:00Z",
    OriginDeclared: "ALGECIRAS", DraughtDeclared: 14.5,
    PositionLastUpdated: "2026-02-27T09:00:00Z", Length: 400, Beam: 59,
  },
];

// ═══════════════════════════════════════════════════════════════════
// 4. HISTORICAL TRACKS — svsl/HistoricalTracks
//    Route: Rotterdam → Bergen (North Sea), 15 track points
// ═══════════════════════════════════════════════════════════════════

export const MOCK_HISTORICAL_TRACKS: AisHistoricalTracksResult[] = [
  {
    ShipName: "BBC BERGEN", ImoNumber: "9508395", MmsiNumber: "255806353",
    CallSign: "CQPC", ShipFlag: "PRT", ShipType: "70",
    EnquiredDataArray: [
      { Latitude: 51.90, Longitude: 4.50,  SpeedOverGround: 0,    CourseOverGround: 0,    CourseTransmitted: 0,    NavigationStatus: 5, PositionLastUpdated: "2026-02-25T06:00:00Z" },
      { Latitude: 51.95, Longitude: 4.30,  SpeedOverGround: 8.2,  CourseOverGround: 310,  CourseTransmitted: 310,  NavigationStatus: 0, PositionLastUpdated: "2026-02-25T08:00:00Z" },
      { Latitude: 52.10, Longitude: 3.80,  SpeedOverGround: 11.5, CourseOverGround: 320,  CourseTransmitted: 319,  NavigationStatus: 0, PositionLastUpdated: "2026-02-25T10:00:00Z" },
      { Latitude: 52.40, Longitude: 3.20,  SpeedOverGround: 12.1, CourseOverGround: 335,  CourseTransmitted: 334,  NavigationStatus: 0, PositionLastUpdated: "2026-02-25T12:00:00Z" },
      { Latitude: 52.80, Longitude: 3.00,  SpeedOverGround: 12.8, CourseOverGround: 350,  CourseTransmitted: 350,  NavigationStatus: 0, PositionLastUpdated: "2026-02-25T14:00:00Z" },
      { Latitude: 53.30, Longitude: 3.10,  SpeedOverGround: 13.0, CourseOverGround: 5,    CourseTransmitted: 5,    NavigationStatus: 0, PositionLastUpdated: "2026-02-25T16:00:00Z" },
      { Latitude: 53.90, Longitude: 3.50,  SpeedOverGround: 12.5, CourseOverGround: 15,   CourseTransmitted: 15,   NavigationStatus: 0, PositionLastUpdated: "2026-02-25T18:00:00Z" },
      { Latitude: 54.50, Longitude: 4.00,  SpeedOverGround: 12.0, CourseOverGround: 20,   CourseTransmitted: 20,   NavigationStatus: 0, PositionLastUpdated: "2026-02-25T20:00:00Z" },
      { Latitude: 55.20, Longitude: 4.50,  SpeedOverGround: 13.2, CourseOverGround: 15,   CourseTransmitted: 14,   NavigationStatus: 0, PositionLastUpdated: "2026-02-25T22:00:00Z" },
      { Latitude: 56.00, Longitude: 4.80,  SpeedOverGround: 12.8, CourseOverGround: 10,   CourseTransmitted: 10,   NavigationStatus: 0, PositionLastUpdated: "2026-02-26T00:00:00Z" },
      { Latitude: 56.80, Longitude: 5.00,  SpeedOverGround: 12.5, CourseOverGround: 5,    CourseTransmitted: 5,    NavigationStatus: 0, PositionLastUpdated: "2026-02-26T02:00:00Z" },
      { Latitude: 57.50, Longitude: 5.10,  SpeedOverGround: 11.8, CourseOverGround: 0,    CourseTransmitted: 360,  NavigationStatus: 0, PositionLastUpdated: "2026-02-26T04:00:00Z" },
      { Latitude: 58.20, Longitude: 5.15,  SpeedOverGround: 11.0, CourseOverGround: 355,  CourseTransmitted: 355,  NavigationStatus: 0, PositionLastUpdated: "2026-02-26T06:00:00Z" },
      { Latitude: 59.00, Longitude: 5.20,  SpeedOverGround: 9.5,  CourseOverGround: 350,  CourseTransmitted: 350,  NavigationStatus: 0, PositionLastUpdated: "2026-02-26T08:00:00Z" },
      { Latitude: 60.39, Longitude: 5.32,  SpeedOverGround: 0,    CourseOverGround: 0,    CourseTransmitted: 0,    NavigationStatus: 5, PositionLastUpdated: "2026-02-26T12:00:00Z" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// 5. WITHIN RANGE — mvsl/WithinRange
//    12 vessels in English Channel area (51.6°N, 2.6°E, ~50km)
// ═══════════════════════════════════════════════════════════════════

export const MOCK_WITHIN_RANGE: AisWithinRangeResult[] = [
  { ShipName: "BALTIC CARRIER",   ImoNumber: "9301234", MmsiNumber: "219001111", CallSign: "OXTB", ShipFlag: "DNK", ShipType: "70", NavigationStatus: 0, Latitude: 51.60, Longitude: 2.50, SpeedOverGround: 10.5, CourseOverGround: 45,  CourseTransmitted: 45,  DestDeclared: "ROTTERDAM",  EtaDeclared: "2026-02-27T18:00:00Z", PositionLastUpdated: "2026-02-27T09:00:00Z" },
  { ShipName: "NORD SPIRIT",      ImoNumber: "9412345", MmsiNumber: "244001234", CallSign: "PDFA", ShipFlag: "NLD", ShipType: "80", NavigationStatus: 0, Latitude: 51.55, Longitude: 2.70, SpeedOverGround: 12.0, CourseOverGround: 220, CourseTransmitted: 220, DestDeclared: "LE HAVRE",   EtaDeclared: "2026-02-27T22:00:00Z", PositionLastUpdated: "2026-02-27T09:05:00Z" },
  { ShipName: "STENA HOLLANDICA", ImoNumber: "9419163", MmsiNumber: "245719000", CallSign: "PHSO", ShipFlag: "NLD", ShipType: "60", NavigationStatus: 0, Latitude: 51.70, Longitude: 2.40, SpeedOverGround: 20.5, CourseOverGround: 90,  CourseTransmitted: 90,  DestDeclared: "HARWICH",    EtaDeclared: "2026-02-27T12:00:00Z", PositionLastUpdated: "2026-02-27T09:10:00Z" },
  { ShipName: "PIONEER GLORY",    ImoNumber: "9523456", MmsiNumber: "636092222", CallSign: "D5GJ2",ShipFlag: "LBR", ShipType: "70", NavigationStatus: 0, Latitude: 51.68, Longitude: 2.80, SpeedOverGround: 8.5,  CourseOverGround: 180, CourseTransmitted: 180, DestDeclared: "ANTWERP",    EtaDeclared: "2026-02-28T04:00:00Z", PositionLastUpdated: "2026-02-27T09:15:00Z" },
  { ShipName: "SEAWISE GIANT",    ImoNumber: "9634567", MmsiNumber: "538003333", CallSign: "V7UN3",ShipFlag: "MHL", ShipType: "80", NavigationStatus: 0, Latitude: 51.50, Longitude: 2.90, SpeedOverGround: 14.2, CourseOverGround: 310, CourseTransmitted: 310, DestDeclared: "IMMINGHAM",  EtaDeclared: "2026-02-28T08:00:00Z", PositionLastUpdated: "2026-02-27T09:20:00Z" },
  { ShipName: "ATLANTIC DAWN",    ImoNumber: "9745678", MmsiNumber: "249004444", CallSign: "9HCK4",ShipFlag: "MLT", ShipType: "30", NavigationStatus: 7, Latitude: 51.62, Longitude: 2.35, SpeedOverGround: 3.2,  CourseOverGround: 120, CourseTransmitted: 120, DestDeclared: "OSTEND",     EtaDeclared: "2026-02-27T16:00:00Z", PositionLastUpdated: "2026-02-27T09:25:00Z" },
  { ShipName: "COSCO SHIPPING",   ImoNumber: "9856789", MmsiNumber: "477005555", CallSign: "VRBI", ShipFlag: "HKG", ShipType: "71", NavigationStatus: 0, Latitude: 51.75, Longitude: 2.55, SpeedOverGround: 16.8, CourseOverGround: 270, CourseTransmitted: 270, DestDeclared: "FELIXSTOWE", EtaDeclared: "2026-02-27T14:00:00Z", PositionLastUpdated: "2026-02-27T09:30:00Z" },
  { ShipName: "EMMA MAERSK",      ImoNumber: "9321483", MmsiNumber: "220417000", CallSign: "OXVJ2",ShipFlag: "DNK", ShipType: "71", NavigationStatus: 0, Latitude: 51.58, Longitude: 2.15, SpeedOverGround: 18.0, CourseOverGround: 35,  CourseTransmitted: 35,  DestDeclared: "BREMERHAVEN",EtaDeclared: "2026-02-28T10:00:00Z", PositionLastUpdated: "2026-02-27T09:35:00Z" },
  { ShipName: "VIKING GRACE",     ImoNumber: "9606900", MmsiNumber: "230970000", CallSign: "OJMU", ShipFlag: "FIN", ShipType: "60", NavigationStatus: 0, Latitude: 51.45, Longitude: 2.60, SpeedOverGround: 22.0, CourseOverGround: 160, CourseTransmitted: 160, DestDeclared: "DUNKERQUE",  EtaDeclared: "2026-02-27T11:00:00Z", PositionLastUpdated: "2026-02-27T09:40:00Z" },
  { ShipName: "BERGE STAHL",      ImoNumber: "8506091", MmsiNumber: "257006666", CallSign: "LAGP7",ShipFlag: "NOR", ShipType: "80", NavigationStatus: 1, Latitude: 51.80, Longitude: 2.20, SpeedOverGround: 0,    CourseOverGround: 0,   CourseTransmitted: 0,   DestDeclared: "EUROPOORT",  EtaDeclared: "2026-02-27T20:00:00Z", PositionLastUpdated: "2026-02-27T09:45:00Z" },
  { ShipName: "FEDERAL RHINE",    ImoNumber: "9567890", MmsiNumber: "316007777", CallSign: "CFV7", ShipFlag: "CAN", ShipType: "70", NavigationStatus: 0, Latitude: 51.52, Longitude: 2.45, SpeedOverGround: 11.0, CourseOverGround: 55,  CourseTransmitted: 55,  DestDeclared: "HAMBURG",    EtaDeclared: "2026-02-28T16:00:00Z", PositionLastUpdated: "2026-02-27T09:50:00Z" },
  { ShipName: "HAVEN SEEKER",     ImoNumber: "9678901", MmsiNumber: "235008888", CallSign: "MABP", ShipFlag: "GBR", ShipType: "31", NavigationStatus: 0, Latitude: 51.65, Longitude: 2.75, SpeedOverGround: 6.5,  CourseOverGround: 200, CourseTransmitted: 200, DestDeclared: "ZEEBRUGGE",  EtaDeclared: "2026-02-27T15:00:00Z", PositionLastUpdated: "2026-02-27T09:55:00Z" },
];

// ═══════════════════════════════════════════════════════════════════
// 6. FIND BY DESTINATION — mvsl/FindByDestination
//    Vessels heading to Rotterdam
// ═══════════════════════════════════════════════════════════════════

export const MOCK_FIND_BY_DEST: AisFindByDestResult[] = [
  { ShipName: "BALTIC CARRIER",  ImoNumber: "9301234", MmsiNumber: "219001111", CallSign: "OXTB",  ShipFlag: "DNK", ShipType: "70", NavigationStatus: 0, Latitude: 51.60, Longitude: 2.50, SpeedOverGround: 10.5, CourseOverGround: 45,  CourseTransmitted: 45,  DestDeclared: "ROTTERDAM", EtaDeclared: "2026-02-27T18:00:00Z", OriginDeclared: "GDANSK",     DraughtDeclared: 8.5,  PositionLastUpdated: "2026-02-27T09:00:00Z" },
  { ShipName: "PIONEER GLORY",   ImoNumber: "9523456", MmsiNumber: "636092222", CallSign: "D5GJ2", ShipFlag: "LBR", ShipType: "70", NavigationStatus: 0, Latitude: 52.10, Longitude: 3.20, SpeedOverGround: 11.8, CourseOverGround: 30,  CourseTransmitted: 30,  DestDeclared: "ROTTERDAM", EtaDeclared: "2026-02-28T02:00:00Z", OriginDeclared: "BREMERHAVEN", DraughtDeclared: 7.2,  PositionLastUpdated: "2026-02-27T08:45:00Z" },
  { ShipName: "FEDERAL RHINE",   ImoNumber: "9567890", MmsiNumber: "316007777", CallSign: "CFV7",  ShipFlag: "CAN", ShipType: "70", NavigationStatus: 0, Latitude: 54.20, Longitude: 6.80, SpeedOverGround: 12.0, CourseOverGround: 220, CourseTransmitted: 220, DestDeclared: "ROTTERDAM", EtaDeclared: "2026-02-28T10:00:00Z", OriginDeclared: "HAMBURG",     DraughtDeclared: 9.0,  PositionLastUpdated: "2026-02-27T09:10:00Z" },
  { ShipName: "COSCO SHIPPING",  ImoNumber: "9856789", MmsiNumber: "477005555", CallSign: "VRBI",  ShipFlag: "HKG", ShipType: "71", NavigationStatus: 0, Latitude: 48.50, Longitude: -5.10, SpeedOverGround: 18.5, CourseOverGround: 50,  CourseTransmitted: 50,  DestDeclared: "ROTTERDAM", EtaDeclared: "2026-02-28T22:00:00Z", OriginDeclared: "SUEZ",        DraughtDeclared: 14.0, PositionLastUpdated: "2026-02-27T08:30:00Z" },
  { ShipName: "EMMA MAERSK",     ImoNumber: "9321483", MmsiNumber: "220417000", CallSign: "OXVJ2", ShipFlag: "DNK", ShipType: "71", NavigationStatus: 0, Latitude: 56.30, Longitude: 8.10, SpeedOverGround: 16.0, CourseOverGround: 250, CourseTransmitted: 250, DestDeclared: "ROTTERDAM", EtaDeclared: "2026-02-28T06:00:00Z", OriginDeclared: "GOTHENBURG",  DraughtDeclared: 15.5, PositionLastUpdated: "2026-02-27T09:20:00Z" },
  { ShipName: "NORD SPIRIT",     ImoNumber: "9412345", MmsiNumber: "244001234", CallSign: "PDFA",  ShipFlag: "NLD", ShipType: "80", NavigationStatus: 0, Latitude: 50.80, Longitude: 1.20, SpeedOverGround: 13.0, CourseOverGround: 60,  CourseTransmitted: 60,  DestDeclared: "ROTTERDAM", EtaDeclared: "2026-02-27T20:00:00Z", OriginDeclared: "SOUTHAMPTON", DraughtDeclared: 11.0, PositionLastUpdated: "2026-02-27T09:15:00Z" },
];
