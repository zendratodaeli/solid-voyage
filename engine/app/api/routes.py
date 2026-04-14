"""
API route handlers for the Maritime Weather Routing Engine.
"""
import logging
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    RouteRequest,
    RouteResponse,
    HealthResponse,
    GraphInfoResponse,
    Waypoint,
)
from app.graph.pathfinder import OceanRouter
from app.scheduler import GraphScheduler
from app.config import SOLAS_DISCLAIMER, GRID_RESOLUTION, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX

logger = logging.getLogger(__name__)

router = APIRouter()

# Singleton instances — shared across all requests
ocean_router = OceanRouter()
graph_scheduler = GraphScheduler(ocean_router)


def get_ocean_router() -> OceanRouter:
    """Get the global ocean router instance."""
    return ocean_router


def get_scheduler() -> GraphScheduler:
    """Get the global scheduler instance."""
    return graph_scheduler


@router.post("/route", response_model=RouteResponse)
async def calculate_weather_route(request: RouteRequest):
    """
    Calculate the weather-optimized maritime route between two coordinates.

    The route is computed via A* search on a pre-built ocean graph weighted
    by wind, wave, and current conditions from the latest weather data.
    """
    if not ocean_router.is_ready:
        raise HTTPException(
            status_code=503,
            detail="Routing engine is not ready. Graph is being built — please retry in 30 seconds."
        )

    result = ocean_router.find_route(
        start_lat=request.start_lat,
        start_lon=request.start_lon,
        end_lat=request.end_lat,
        end_lon=request.end_lon,
        vessel_speed=request.vessel_speed_knots,
        daily_consumption_mt=request.daily_consumption_mt,
    )

    if not result.get("success", False):
        raise HTTPException(
            status_code=422,
            detail=result.get("error", "Unknown routing error")
        )

    return RouteResponse(
        success=True,
        waypoints=[Waypoint(lat=wp["lat"], lon=wp["lon"]) for wp in result["waypoints"]],
        total_distance_nm=result["total_distance_nm"],
        estimated_hours=result["estimated_hours"],
        estimated_days=result["estimated_days"],
        estimated_fuel_mt=result["estimated_fuel_mt"],
        graph_timestamp=result.get("graph_timestamp"),
        graph_nodes=result.get("graph_nodes", 0),
        graph_edges=result.get("graph_edges", 0),
        disclaimer=SOLAS_DISCLAIMER,
    )


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint for monitoring and load balancer probes.
    """
    return HealthResponse(
        status="ok" if ocean_router.is_ready else "building",
        graph_loaded=ocean_router.graph is not None,
        graph_nodes=ocean_router.graph.number_of_nodes() if ocean_router.graph else 0,
        graph_edges=ocean_router.graph.number_of_edges() if ocean_router.graph else 0,
        graph_timestamp=ocean_router.build_timestamp,
        data_sources={
            "wind": "synthetic_climatological",
            "waves": "synthetic_climatological",
            "currents": "synthetic_climatological",
            "ice": "synthetic_seasonal",
        },
    )


@router.get("/graph-info", response_model=GraphInfoResponse)
async def graph_info():
    """
    Detailed information about the current ocean graph state.
    """
    if ocean_router.graph is None:
        return GraphInfoResponse(loaded=False)

    n_nodes = ocean_router.graph.number_of_nodes()
    n_edges = ocean_router.graph.number_of_edges()
    memory_mb = (n_nodes * 100 + n_edges * 50) / (1024 * 1024)

    return GraphInfoResponse(
        loaded=True,
        nodes=n_nodes,
        edges=n_edges,
        resolution_deg=GRID_RESOLUTION,
        build_timestamp=ocean_router.build_timestamp,
        lat_range=(LAT_MIN, LAT_MAX),
        lon_range=(LON_MIN, LON_MAX),
        memory_estimate_mb=round(memory_mb, 1),
    )


@router.post("/rebuild")
async def trigger_rebuild():
    """
    Manually trigger a graph rebuild.

    Use this to refresh the graph after a major weather event,
    or to re-ingest updated ice data. The rebuild runs in the background
    — the current graph continues serving requests until the new one is ready.
    """
    result = graph_scheduler.trigger_rebuild()
    return result


@router.get("/scheduler")
async def scheduler_status():
    """
    Get the current scheduler status including last rebuild time,
    rebuild count, and whether a build is in progress.
    """
    return graph_scheduler.status
