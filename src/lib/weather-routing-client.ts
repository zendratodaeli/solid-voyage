/**
 * Weather Routing Engine Client
 *
 * TypeScript client for the Python-based weather routing microservice.
 * Provides type-safe interfaces and graceful degradation when the engine is unavailable.
 */

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export interface WeatherRouteRequest {
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  vessel_speed_knots?: number;
  daily_consumption_mt?: number;
}

export interface WeatherWaypoint {
  lat: number;
  lon: number;
}

export interface WeatherRouteResponse {
  success: boolean;
  waypoints: WeatherWaypoint[];
  total_distance_nm: number;
  estimated_hours: number;
  estimated_days: number;
  estimated_fuel_mt: number;
  graph_timestamp: string | null;
  graph_nodes: number;
  graph_edges: number;
  disclaimer: string;
  error?: string;
}

export interface WeatherEngineHealth {
  status: "ok" | "building" | "offline";
  graph_loaded: boolean;
  graph_nodes: number;
  graph_edges: number;
  graph_timestamp: string | null;
  data_sources?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════
//  Client Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * Request a weather-optimized route from the Python engine.
 *
 * This calls the Next.js proxy at /api/weather-routing,
 * which forwards to the Python engine at localhost:8001.
 *
 * Returns null if the engine is unavailable (graceful degradation).
 */
export async function fetchWeatherRoute(
  request: WeatherRouteRequest
): Promise<WeatherRouteResponse | null> {
  try {
    const response = await fetch("/api/weather-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (response.status === 503) {
      // Engine not running — expected during development without Python
      console.log("[WeatherRouting] Engine offline — skipping weather route");
      return null;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Unknown error" }));
      console.warn("[WeatherRouting] Route failed:", data.error || response.statusText);
      return null;
    }

    const data: WeatherRouteResponse = await response.json();

    if (!data.success || !data.waypoints?.length) {
      console.warn("[WeatherRouting] No valid route returned");
      return null;
    }

    return data;
  } catch (error) {
    // Network error — engine is down, this is fine
    console.log("[WeatherRouting] Engine unreachable:", error instanceof Error ? error.message : "Unknown");
    return null;
  }
}

/**
 * Check the health of the weather routing engine.
 */
export async function checkWeatherEngineHealth(): Promise<WeatherEngineHealth> {
  try {
    const response = await fetch("/api/weather-routing", {
      method: "GET",
    });

    if (!response.ok) {
      return { status: "offline", graph_loaded: false, graph_nodes: 0, graph_edges: 0, graph_timestamp: null };
    }

    return await response.json();
  } catch {
    return { status: "offline", graph_loaded: false, graph_nodes: 0, graph_edges: 0, graph_timestamp: null };
  }
}

/**
 * Convert weather route waypoints to Leaflet-compatible coordinate pairs.
 * Returns [lon, lat] format matching the existing VoyageMap convention.
 */
export function weatherWaypointsToCoordinates(
  waypoints: WeatherWaypoint[]
): [number, number][] {
  return waypoints.map((wp) => [wp.lon, wp.lat] as [number, number]);
}

// ═══════════════════════════════════════════════════════════════════
//  Maritime Conditions (Point Query)
// ═══════════════════════════════════════════════════════════════════

export interface MaritimeConditions {
  success: boolean;
  lat: number;
  lon: number;
  is_ocean: boolean;
  // Wind
  wind_speed_knots: number;
  wind_direction_deg: number;
  // Waves
  wave_height_m: number;
  // Ocean currents
  current_speed_knots: number;
  current_direction_deg: number;
  // Ice
  ice_concentration_pct: number;
  ice_severity: "none" | "light" | "moderate" | "severe";
  // Maritime impact
  effective_speed_knots: number;
  speed_reduction_pct: number;
  navigability: "open" | "moderate" | "restricted" | "dangerous" | "blocked";
  advisory: string;
  // Metadata
  data_source: string;
  graph_timestamp: string | null;
}

/**
 * Fetch maritime conditions (currents, ice, navigability) for a specific coordinate.
 *
 * This supplements Open-Meteo weather data with ocean-physics intelligence
 * from the Python routing engine. Returns null if the engine is offline.
 */
export async function fetchMaritimeConditions(
  lat: number,
  lon: number,
  vesselSpeed: number = 12.5
): Promise<MaritimeConditions | null> {
  try {
    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      vessel_speed: vesselSpeed.toString(),
    });

    const response = await fetch(`/api/weather-routing/conditions?${params}`);

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    if (!json.success || !json.data) {
      return null;
    }

    return json.data as MaritimeConditions;
  } catch {
    // Engine offline — graceful degradation
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Ice Grid (Map Overlay)
// ═══════════════════════════════════════════════════════════════════

export interface IceCell {
  lat: number;
  lon: number;
  concentration: number;
}

export interface IceGridResponse {
  cells: IceCell[];
  source: string;
  count: number;
}

/**
 * Fetch ice concentration grid data for map overlay rendering.
 * Returns cells with ice concentration above threshold for the given bounds.
 */
export async function fetchIceGrid(
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  threshold: number = 0.05
): Promise<IceGridResponse | null> {
  try {
    const params = new URLSearchParams({ threshold: threshold.toString() });
    if (bounds) {
      params.set("min_lat", bounds.minLat.toString());
      params.set("max_lat", bounds.maxLat.toString());
      params.set("min_lon", bounds.minLon.toString());
      params.set("max_lon", bounds.maxLon.toString());
    }

    const response = await fetch(`/api/weather-routing/ice-grid?${params}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Icebergs (Map Markers)
// ═══════════════════════════════════════════════════════════════════

export interface IcebergPosition {
  lat: number;
  lon: number;
}

export interface IcebergResponse {
  available: boolean;
  count: number;
  source: string;
  positions?: IcebergPosition[];
  bulletin_excerpt?: string;
  limit_boundary?: {
    min_lon: number;
    min_lat: number;
    max_lon: number;
    max_lat: number;
  };
  limit_polygon?: IcebergPosition[];
}

/**
 * Fetch IIP iceberg data including positions and iceberg limit polygon.
 */
export async function fetchIcebergs(): Promise<IcebergResponse | null> {
  try {
    const response = await fetch("/api/weather-routing/icebergs");
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Multi-Step Forecast Series (Replaces Open-Meteo)
// ═══════════════════════════════════════════════════════════════════

export interface ForecastTimeseries {
  success: boolean;
  lat: number;
  lon: number;
  source: string;
  cycle: string;
  grid_resolution: string;
  hourly: {
    time: string[];
    wave_height: number[];
    wave_direction: number[];
    wave_period: number[];
    swell_wave_height: number[];
    wind_wave_height: number[];
    wind_speed_knots: number[];
    wind_direction: number[];
    beaufort: number[];
    pressure_hpa: number[];
    visibility_nm: number[];
    sea_surface_temperature?: number | null;
    sea_surface_temperature_forecast?: number | null;
  };
  daily: {
    date: string[];
    wave_height_max: number[];
    wind_speed_max_knots: number[];
    pressure_min_hpa: number[];
  };
  weather_windows: Array<{
    start: string;
    end: string;
    duration_hours: number;
  }>;
}

/**
 * Fetch authoritative NOAA multi-step forecast from the engine.
 *
 * @param lat Latitude
 * @param lon Longitude
 * @returns Fully populated `ForecastTimeseries` or null if offline.
 */
export async function fetchForecastSeries(
  lat: number,
  lon: number
): Promise<ForecastTimeseries | null> {
  try {
    const response = await fetch(`/api/forecast-series?lat=${lat}&lon=${lon}`);
    if (!response.ok) {
        console.warn(`[WeatherRouting] Forecast fetch failed: ${response.status}`);
        return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`[WeatherRouting] Forecast engine unreachable:`, error);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════
//  Route Forecast — Time-Aware Weather Along NavAPI Waypoints
// ═══════════════════════════════════════════════════════════════════

export interface RouteForecastWaypoint {
  lat: number;
  lon: number;
  eta: string;
  hours_from_departure: number;
  distance_from_departure_nm: number;
  // Weather at ETA
  wave_height_m: number;
  wave_period_s: number;
  wave_direction_deg: number;
  swell_height_m: number;
  wind_speed_knots: number;
  wind_direction_deg: number;
  pressure_hpa: number;
  visibility_nm: number;
  beaufort: number;
  sea_surface_temperature: number | null;
  // Vessel-specific impact
  speed_loss_pct: number;
  effective_speed_knots: number;
  navigability: "open" | "moderate" | "restricted" | "dangerous";
  advisory: string;
}

export interface RouteForecastResponse {
  success: boolean;
  waypoints: RouteForecastWaypoint[];
  total_distance_nm: number;
  total_hours_calm: number;
  total_hours_weather: number;
  weather_delay_hours: number;
  worst_segment: RouteForecastWaypoint | null;
  vessel_speed_curve: {
    vessel_type: string;
    dwt: number;
    block_coefficient: number;
    reference_losses: {
      wave_2m_pct: number;
      wave_4m_pct: number;
      wave_6m_pct: number;
    };
  };
  source: string;
  cycle: string | null;
  error?: string;
}

export interface RouteForecastRequest {
  waypoints: Array<{ lat: number; lon: number }>;
  etd: string;
  vessel_speed_knots: number;
  vessel_type?: string;
  vessel_dwt?: number;
  vessel_loa?: number | null;
  vessel_beam?: number | null;
}

/**
 * Fetch time-aware weather forecast along a planned route.
 *
 * Sends NavAPI waypoints + vessel characteristics to the engine.
 * Returns per-waypoint weather AT the vessel's ETA with speed penalties.
 */
export async function fetchRouteForecast(
  request: RouteForecastRequest
): Promise<RouteForecastResponse | null> {
  try {
    const response = await fetch("/api/route-forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.warn(`[WeatherRouting] Route forecast failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`[WeatherRouting] Route forecast engine unreachable:`, error);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════
//  Multi-Route Comparison — Weather Impact Across Alternatives
// ═══════════════════════════════════════════════════════════════════

export interface RouteWeatherSummary {
  route_id: string;
  label: string;
  total_distance_nm: number;
  total_hours_calm: number;
  total_hours_weather: number;
  weather_delay_hours: number;
  avg_wave_height_m: number;
  max_wave_height_m: number;
  avg_wind_speed_knots: number;
  max_wind_speed_knots: number;
  max_beaufort: number;
  avg_current_speed_knots: number;
  max_ice_concentration_pct: number;
  fuel_estimate_mt: number;
  co2_estimate_mt: number;
  risk_level: "low" | "moderate" | "high" | "extreme";
  worst_advisory: string;
  navigability_summary: string;
  waypoint_count: number;
}

export interface MultiRouteComparisonResponse {
  success: boolean;
  routes: RouteWeatherSummary[];
  recommended_route_id: string;
  recommendation_reason: string;
  source: string;
  cycle: string | null;
}

export interface MultiRouteForecastRequest {
  routes: Array<{
    route_id: string;
    label: string;
    waypoints: Array<{ lat: number; lon: number }>;
    total_distance_nm: number;
  }>;
  etd: string;
  vessel_speed_knots: number;
  vessel_type?: string;
  vessel_dwt?: number;
  vessel_loa?: number | null;
  vessel_beam?: number | null;
}

/**
 * Compare weather impact across multiple route alternatives.
 *
 * Sends all route alternatives + vessel characteristics to the engine.
 * Returns per-route weather summary with delay, fuel, CO2, risk, and recommendation.
 */
export async function fetchMultiRouteForecast(
  request: MultiRouteForecastRequest
): Promise<MultiRouteComparisonResponse | null> {
  try {
    const response = await fetch("/api/multi-route-forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.warn(`[WeatherRouting] Multi-route forecast failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`[WeatherRouting] Multi-route forecast engine unreachable:`, error);
    return null;
  }
}
