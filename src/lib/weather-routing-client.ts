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
