"""
Pydantic models for API request/response schemas.
"""
from pydantic import BaseModel, Field
from typing import Optional


class RouteRequest(BaseModel):
    """Request body for weather-optimized route calculation."""
    start_lat: float = Field(..., description="Departure latitude", ge=-90, le=90)
    start_lon: float = Field(..., description="Departure longitude", ge=-180, le=180)
    end_lat: float = Field(..., description="Destination latitude", ge=-90, le=90)
    end_lon: float = Field(..., description="Destination longitude", ge=-180, le=180)
    vessel_speed_knots: float = Field(
        default=12.5,
        description="Vessel service speed in knots",
        gt=0, le=30
    )
    daily_consumption_mt: float = Field(
        default=28.0,
        description="Daily fuel consumption in metric tonnes",
        gt=0, le=200
    )


class Waypoint(BaseModel):
    """A single waypoint on the route."""
    lat: float
    lon: float


class RouteResponse(BaseModel):
    """Response body for a calculated weather route."""
    success: bool = True
    waypoints: list[Waypoint] = Field(default_factory=list)
    total_distance_nm: float = 0.0
    estimated_hours: float = 0.0
    estimated_days: float = 0.0
    estimated_fuel_mt: float = 0.0
    graph_timestamp: Optional[str] = None
    graph_nodes: int = 0
    graph_edges: int = 0
    disclaimer: str = ""
    error: Optional[str] = None


class HealthResponse(BaseModel):
    """Response body for the health check endpoint."""
    status: str = "ok"
    graph_loaded: bool = False
    graph_nodes: int = 0
    graph_edges: int = 0
    graph_timestamp: Optional[str] = None
    data_sources: dict = Field(default_factory=dict)
    scheduler: Optional[dict] = None


class GraphInfoResponse(BaseModel):
    """Detailed information about the current ocean graph."""
    loaded: bool = False
    nodes: int = 0
    edges: int = 0
    resolution_deg: float = 0.5
    build_timestamp: Optional[str] = None
    lat_range: tuple[float, float] = (-78.0, 78.0)
    lon_range: tuple[float, float] = (-180.0, 180.0)
    memory_estimate_mb: float = 0.0


class ConditionsRequest(BaseModel):
    """Request body for maritime conditions at a specific point."""
    lat: float = Field(..., description="Latitude", ge=-90, le=90)
    lon: float = Field(..., description="Longitude", ge=-180, le=180)


class ConditionsResponse(BaseModel):
    """Maritime conditions at a specific ocean point from the engine's data."""
    success: bool = True
    lat: float = 0.0
    lon: float = 0.0
    is_ocean: bool = False
    # Wind
    wind_speed_knots: float = 0.0
    wind_direction_deg: float = 0.0
    # Waves
    wave_height_m: float = 0.0
    # Ocean currents
    current_speed_knots: float = 0.0
    current_direction_deg: float = 0.0
    # Ice
    ice_concentration_pct: float = 0.0
    ice_severity: str = "none"  # none, light, moderate, severe
    # Maritime impact assessment
    effective_speed_knots: float = 0.0
    speed_reduction_pct: float = 0.0
    navigability: str = "open"  # open, restricted, dangerous, blocked
    advisory: str = ""
    # Metadata
    data_source: str = "synthetic_climatological"
    graph_timestamp: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════
#  ROUTE FORECAST — Time-aware weather along NavAPI waypoints
# ═══════════════════════════════════════════════════════════════════

class RouteWaypoint(BaseModel):
    """A waypoint from NavAPI route with coordinates."""
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class RouteForecastRequest(BaseModel):
    """
    Request body for time-aware route weather forecast.

    Takes NavAPI waypoints + ETD + vessel characteristics.
    For each waypoint, the engine calculates the ETA and extracts
    the forecast at the exact time the vessel will be there.
    """
    waypoints: list[RouteWaypoint] = Field(
        ...,
        min_length=2,
        description="Ordered waypoints from NavAPI route"
    )
    etd: str = Field(
        ...,
        description="Estimated Time of Departure (ISO 8601)"
    )
    vessel_speed_knots: float = Field(
        default=12.5,
        description="Vessel service speed in knots",
        gt=0, le=30
    )
    # Vessel characteristics for speed curves
    vessel_type: str = Field(
        default="BULK_CARRIER",
        description="Vessel type enum matching Prisma VesselType"
    )
    vessel_dwt: float = Field(
        default=50000,
        description="Deadweight tonnage",
        gt=0
    )
    vessel_loa: Optional[float] = Field(
        default=None,
        description="Length Overall in meters"
    )
    vessel_beam: Optional[float] = Field(
        default=None,
        description="Beam in meters"
    )


class WaypointForecast(BaseModel):
    """Weather forecast at a single waypoint at the vessel's ETA."""
    lat: float
    lon: float
    eta: str  # ISO 8601
    hours_from_departure: float
    distance_from_departure_nm: float

    # Weather at ETA
    wave_height_m: float = 0.0
    wave_period_s: float = 0.0
    wave_direction_deg: float = 0.0
    swell_height_m: float = 0.0
    wind_speed_knots: float = 0.0
    wind_direction_deg: float = 0.0
    pressure_hpa: float = 0.0
    visibility_nm: float = 0.0
    beaufort: int = 0
    sea_surface_temperature: Optional[float] = None

    # Ocean currents (NOAA RTOFS)
    current_speed_knots: float = 0.0
    current_direction_deg: float = 0.0

    # Ice (NOAA USNIC)
    ice_concentration_pct: float = 0.0
    ice_severity: str = "none"  # none | light | moderate | severe

    # Vessel-specific impact
    speed_loss_pct: float = 0.0
    effective_speed_knots: float = 0.0
    navigability: str = "open"
    advisory: str = ""


class RouteForecastResponse(BaseModel):
    """Response body for time-aware route weather forecast."""
    success: bool = True
    waypoints: list[WaypointForecast] = Field(default_factory=list)
    total_distance_nm: float = 0.0
    total_hours_calm: float = 0.0      # Time if no weather penalty
    total_hours_weather: float = 0.0   # Time with weather penalties
    weather_delay_hours: float = 0.0   # Difference
    worst_segment: Optional[WaypointForecast] = None
    vessel_speed_curve: dict = Field(default_factory=dict)
    source: str = "ECMWF+NOAA"
    cycle: Optional[str] = None
    error: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════
# MULTI-ROUTE COMPARISON
# ═══════════════════════════════════════════════════════════════════

class SingleRouteInput(BaseModel):
    """One route alternative for multi-route comparison."""
    route_id: str                    # "primary" | "avoid-canal" | "seca-minimized" | "weather-avoidance"
    label: str                       # "Via Suez Canal"
    waypoints: list[Waypoint]        # Sampled coordinates along the route
    total_distance_nm: float = 0.0   # Pre-computed from NavAPI

class MultiRouteForecastRequest(BaseModel):
    """Request body for comparing weather across multiple route alternatives."""
    routes: list[SingleRouteInput]
    etd: str                         # ISO 8601 departure time
    vessel_speed_knots: float = 12.5
    vessel_type: str = "BULK_CARRIER"
    vessel_dwt: float = 50000
    vessel_loa: Optional[float] = None
    vessel_beam: Optional[float] = None

class RouteWeatherSummary(BaseModel):
    """Weather impact summary for a single route alternative."""
    route_id: str
    label: str
    total_distance_nm: float = 0.0
    total_hours_calm: float = 0.0
    total_hours_weather: float = 0.0
    weather_delay_hours: float = 0.0
    avg_wave_height_m: float = 0.0
    max_wave_height_m: float = 0.0
    avg_wind_speed_knots: float = 0.0
    max_wind_speed_knots: float = 0.0
    max_beaufort: int = 0
    avg_current_speed_knots: float = 0.0
    max_ice_concentration_pct: float = 0.0
    fuel_estimate_mt: float = 0.0
    co2_estimate_mt: float = 0.0
    risk_level: str = "low"          # low | moderate | high | extreme
    worst_advisory: str = ""
    navigability_summary: str = ""   # "Open (10/12 waypoints), Moderate (2/12)"
    waypoint_count: int = 0

class MultiRouteComparisonResponse(BaseModel):
    """Response body comparing weather impact across route alternatives."""
    success: bool = True
    routes: list[RouteWeatherSummary] = Field(default_factory=list)
    recommended_route_id: str = ""
    recommendation_reason: str = ""
    source: str = "ECMWF+NOAA"
    cycle: Optional[str] = None
