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

