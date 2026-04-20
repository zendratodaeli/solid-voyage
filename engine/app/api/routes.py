"""
API route handlers for the Maritime Weather Routing Engine.
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import (
    RouteRequest,
    RouteResponse,
    HealthResponse,
    GraphInfoResponse,
    ConditionsResponse,
    RouteForecastRequest,
    RouteForecastResponse,
    WaypointForecast,
    Waypoint,
)
from app.graph.pathfinder import OceanRouter
from app.scheduler import SmartScheduler
from app.config import SOLAS_DISCLAIMER, GRID_RESOLUTION, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX

logger = logging.getLogger(__name__)

router = APIRouter()

# Singleton instances — shared across all requests
ocean_router = OceanRouter()
graph_scheduler = SmartScheduler(ocean_router)


def get_ocean_router() -> OceanRouter:
    """Get the global ocean router instance."""
    return ocean_router


def get_scheduler() -> SmartScheduler:
    """Get the global smart polling scheduler instance."""
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


@router.get("/conditions", response_model=ConditionsResponse)
async def get_conditions(
    lat: float = Query(..., description="Latitude", ge=-90, le=90),
    lon: float = Query(..., description="Longitude", ge=-180, le=180),
    vessel_speed: float = Query(default=12.5, description="Vessel speed in knots", gt=0, le=30),
):
    """
    Get maritime conditions at a specific ocean coordinate.

    Returns wind, waves, ocean currents, ice concentration, speed impact,
    and navigability classification — data that supplements Open-Meteo's
    atmospheric forecasts with ocean-physics intelligence.
    """
    conditions = ocean_router.get_conditions(lat, lon, vessel_speed)

    return ConditionsResponse(
        lat=round(lat, 4),
        lon=round(lon, 4),
        is_ocean=conditions.get("is_ocean", False),
        wind_speed_knots=conditions.get("wind_speed_knots", 0),
        wind_direction_deg=conditions.get("wind_direction_deg", 0),
        wave_height_m=conditions.get("wave_height_m", 0),
        current_speed_knots=conditions.get("current_speed_knots", 0),
        current_direction_deg=conditions.get("current_direction_deg", 0),
        ice_concentration_pct=conditions.get("ice_concentration_pct", 0),
        ice_severity=conditions.get("ice_severity", "none"),
        effective_speed_knots=conditions.get("effective_speed_knots", 0),
        speed_reduction_pct=conditions.get("speed_reduction_pct", 0),
        navigability=conditions.get("navigability", "open"),
        advisory=conditions.get("advisory", ""),
        data_source=_get_data_source_label(),
        graph_timestamp=ocean_router.build_timestamp,
    )


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint for monitoring and load balancer probes.
    Includes smart scheduler status (polling state, cycles, rebuild counts).
    """
    health = HealthResponse(
        status="ok" if ocean_router.is_ready else "building",
        graph_loaded=ocean_router.graph is not None,
        graph_nodes=ocean_router.graph.number_of_nodes() if ocean_router.graph else 0,
        graph_edges=ocean_router.graph.number_of_edges() if ocean_router.graph else 0,
        graph_timestamp=ocean_router.build_timestamp,
        data_sources=_get_data_sources_dict(),
    )
    # Attach scheduler status as extra field
    health.scheduler = graph_scheduler.status
    return health


@router.get("/forecast-series")
async def get_forecast_series(
    lat: float = Query(..., description="Latitude", ge=-90, le=90),
    lon: float = Query(..., description="Longitude", ge=-180, le=180),
):
    """
    Get 10-day forecast time series for a specific coordinate.

    Returns ECMWF IFS + WAM forecast data (with NOAA GFS/WW3 fallback) including:
    - Wave height, period, direction (ECMWF WAM 0.25°)
    - Wind speed/direction (ECMWF IFS 0.25°)
    - Barometric pressure (ECMWF IFS)
    - Sea surface temperature (NOAA RTOFS + OISST)
    - Beaufort scale (derived)
    - Weather windows (operationally safe periods)
    - Daily aggregates (max wave, max wind, min pressure)

    All data from authoritative government sources. ECMWF is primary,
    NOAA GFS/WW3 serves as fallback when ECMWF is unavailable.
    """
    store = ocean_router.forecast_store

    if store is None or not store.is_ready:
        raise HTTPException(
            status_code=503,
            detail="Forecast store not ready. Data is being downloaded — please retry in 60 seconds."
        )

    result = store.get_timeseries(lat, lon)
    return result


@router.post("/route-forecast")
async def get_route_forecast(request: RouteForecastRequest):
    """
    Time-aware weather forecast along a planned route.

    For each NavAPI waypoint:
    1. Calculates the vessel's ETA at that point (accounting for speed penalties at prior waypoints)
    2. Extracts ECMWF IFS/WAM weather + NOAA currents/ice at the EXACT future timestamp
    3. Applies vessel-class-specific speed curves (Capesize vs Handysize)
    4. Returns per-waypoint weather, currents, ice, navigability, and total delay estimate

    This is what commercial weather routing services charge $50k/year for.
    """
    from datetime import datetime, timezone, timedelta
    import math
    from app.models.schemas import (
        RouteForecastRequest as RFR,
        RouteForecastResponse,
        WaypointForecast,
    )
    from app.models.speed_curves import get_speed_curve
    from app.graph.cost import haversine_nm

    store = ocean_router.forecast_store
    if store is None or not store.is_ready:
        raise HTTPException(
            status_code=503,
            detail="Forecast store not ready. Data is being downloaded — please retry in 60 seconds."
        )

    # Parse ETD
    try:
        etd = datetime.fromisoformat(request.etd.replace("Z", "+00:00"))
        if etd.tzinfo is None:
            etd = etd.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid ETD format: {request.etd}")

    # Build vessel speed curve
    speed_curve = get_speed_curve(
        vessel_type=request.vessel_type,
        dwt=request.vessel_dwt,
        loa=request.vessel_loa,
        beam=request.vessel_beam,
    )
    base_speed = request.vessel_speed_knots

    # Walk the waypoints, computing ETA at each
    waypoint_forecasts: list[WaypointForecast] = []
    cumulative_hours = 0.0
    cumulative_distance_nm = 0.0
    cumulative_hours_calm = 0.0  # Without weather penalty
    worst_wp = None
    worst_wave = 0.0

    wps = request.waypoints

    for i, wp in enumerate(wps):
        if i > 0:
            # Distance from previous waypoint
            prev = wps[i - 1]
            leg_distance_nm = haversine_nm(prev.lat, prev.lon, wp.lat, wp.lon)

            # Calm-weather time for this leg
            calm_hours = leg_distance_nm / base_speed if base_speed > 0 else 0
            cumulative_hours_calm += calm_hours

            # Get weather at the PREVIOUS waypoint's ETA to compute speed for THIS leg
            # (the vessel experiences the weather during transit, not at arrival)
            if waypoint_forecasts:
                prev_weather = waypoint_forecasts[-1]
                prev_wave = prev_weather.wave_height_m
                prev_wind = prev_weather.wind_speed_knots
                prev_wave_dir = prev_weather.wave_direction_deg

                # Approximate vessel heading from prev → current
                import math
                dlat = wp.lat - prev.lat
                dlon = wp.lon - prev.lon
                heading = (math.degrees(math.atan2(dlon, dlat)) + 360) % 360

                effective_spd = speed_curve.effective_speed(
                    base_speed, prev_wave, prev_wave_dir, heading, prev_wind
                )
            else:
                effective_spd = base_speed

            # Time for this leg at effective speed
            leg_hours = leg_distance_nm / effective_spd if effective_spd > 0 else 0
            cumulative_hours += leg_hours
            cumulative_distance_nm += leg_distance_nm

        # ETA at this waypoint
        eta = etd + timedelta(hours=cumulative_hours)

        # Extract forecast AT this waypoint AT this ETA
        wx = store.get_at_time(wp.lat, wp.lon, eta)

        if "error" in wx:
            continue

        # ── Extract ocean currents (NOAA RTOFS) ──
        cur_speed_kn = 0.0
        cur_dir_deg = 0.0
        weather_data = getattr(ocean_router, '_weather_data', None)
        if weather_data is not None:
            from app.data.land_mask import lat_to_index, lon_to_index
            ci = lat_to_index(wp.lat)
            cj = lon_to_index(wp.lon)
            try:
                cu = float(weather_data["current_u"][ci, cj])
                cv = float(weather_data["current_v"][ci, cj])
                cur_speed_kn = round(math.sqrt(cu**2 + cv**2) * 1.944, 2)
                cur_dir_deg = round((math.degrees(math.atan2(cu, cv)) + 360) % 360, 0)
            except (IndexError, KeyError, TypeError):
                pass

        # ── Extract ice concentration (NOAA USNIC) ──
        ice_conc = 0.0
        ice_severity = "none"
        ice_data = getattr(ocean_router, '_ice_data', None)
        if ice_data is not None:
            from app.data.land_mask import lat_to_index, lon_to_index
            ii = lat_to_index(wp.lat)
            ij = lon_to_index(wp.lon)
            try:
                if ii < ice_data.shape[0] and ij < ice_data.shape[1]:
                    ice_conc = float(ice_data[ii, ij])
            except (IndexError, TypeError):
                pass
            if ice_conc >= 0.70:
                ice_severity = "severe"
            elif ice_conc >= 0.30:
                ice_severity = "moderate"
            elif ice_conc >= 0.10:
                ice_severity = "light"

        # Compute vessel-specific speed penalty at this waypoint
        loss_pct = speed_curve.speed_loss_pct(
            wave_height=wx.get("wave_height_m", 0),
            wave_direction=wx.get("wave_direction_deg", 0),
            wind_speed_knots=wx.get("wind_speed_knots", 0),
        )
        eff_speed = speed_curve.effective_speed(
            base_speed,
            wave_height=wx.get("wave_height_m", 0),
            wave_direction=wx.get("wave_direction_deg", 0),
            wind_speed_knots=wx.get("wind_speed_knots", 0),
        )

        # Navigability classification (includes ice)
        wave_h = wx.get("wave_height_m", 0)
        wind_kn = wx.get("wind_speed_knots", 0)
        if ice_conc >= 0.70:
            navigability = "blocked"
            advisory = f"⛔ Heavy ice ({round(ice_conc*100)}%) — impassable without icebreaker"
        elif wave_h >= 6.0:
            navigability = "dangerous"
            advisory = f"⚠️ Dangerous seas ({wave_h:.1f}m) — consider route deviation"
        elif ice_conc >= 0.30 or wave_h >= 4.0 or wind_kn >= 34:
            navigability = "restricted"
            parts = []
            if ice_conc >= 0.30:
                parts.append(f"Ice zone ({round(ice_conc*100)}%)")
            if wave_h >= 4.0:
                parts.append(f"Heavy seas ({wave_h:.1f}m)")
            if wind_kn >= 34:
                parts.append(f"Gale force BF{wx.get('beaufort', 0)}")
            advisory = " + ".join(parts) + " — speed reduction expected"
        elif wave_h >= 2.5 or wind_kn >= 22:
            navigability = "moderate"
            advisory = f"Moderate seas ({wave_h:.1f}m, {wind_kn:.0f}kn) — minor delay"
        else:
            navigability = "open"
            advisory = "Clear conditions"

        wpf = WaypointForecast(
            lat=wp.lat,
            lon=wp.lon,
            eta=eta.isoformat(),
            hours_from_departure=round(cumulative_hours, 1),
            distance_from_departure_nm=round(cumulative_distance_nm, 1),
            wave_height_m=wx.get("wave_height_m", 0),
            wave_period_s=wx.get("wave_period_s", 0),
            wave_direction_deg=wx.get("wave_direction_deg", 0),
            swell_height_m=wx.get("swell_height_m", 0),
            wind_speed_knots=wx.get("wind_speed_knots", 0),
            wind_direction_deg=wx.get("wind_direction_deg", 0),
            pressure_hpa=wx.get("pressure_hpa", 0),
            visibility_nm=wx.get("visibility_nm", 0),
            beaufort=wx.get("beaufort", 0),
            sea_surface_temperature=wx.get("sea_surface_temperature"),
            current_speed_knots=cur_speed_kn,
            current_direction_deg=cur_dir_deg,
            ice_concentration_pct=round(ice_conc * 100, 1),
            ice_severity=ice_severity,
            speed_loss_pct=loss_pct,
            effective_speed_knots=eff_speed,
            navigability=navigability,
            advisory=advisory,
        )

        waypoint_forecasts.append(wpf)

        # Track worst segment
        if wave_h > worst_wave:
            worst_wave = wave_h
            worst_wp = wpf

    weather_delay = cumulative_hours - cumulative_hours_calm

    return RouteForecastResponse(
        success=True,
        waypoints=waypoint_forecasts,
        total_distance_nm=round(cumulative_distance_nm, 1),
        total_hours_calm=round(cumulative_hours_calm, 1),
        total_hours_weather=round(cumulative_hours, 1),
        weather_delay_hours=round(max(0, weather_delay), 1),
        worst_segment=worst_wp,
        vessel_speed_curve=speed_curve.to_dict(),
        source="ECMWF+NOAA",
        cycle=store.cycle_timestamp.isoformat() if store.cycle_timestamp else None,
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


@router.get("/ice-grid")
async def get_ice_grid(
    min_lat: float = Query(-78, ge=-90, le=90),
    max_lat: float = Query(78, ge=-90, le=90),
    min_lon: float = Query(-180, ge=-180, le=180),
    max_lon: float = Query(180, ge=-180, le=180),
    threshold: float = Query(0.05, ge=0, le=1, description="Min ice concentration to include"),
):
    """
    Return ice concentration grid cells for map overlay rendering.

    Returns an array of {lat, lon, concentration} objects for cells
    with ice above the threshold. Sampled at engine grid resolution (0.5°).
    """
    import numpy as np

    ice_data = getattr(ocean_router, '_ice_data', None)
    if ice_data is None:
        return {"cells": [], "source": "none", "count": 0}

    lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
    lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)

    cells = []
    for i, lat in enumerate(lats):
        if lat < min_lat or lat > max_lat:
            continue
        for j, lon in enumerate(lons):
            if lon < min_lon or lon > max_lon:
                continue
            conc = float(ice_data[i, j])
            if conc >= threshold:
                cells.append({
                    "lat": round(float(lat), 2),
                    "lon": round(float(lon), 2),
                    "concentration": round(conc, 3),
                })

    dl = getattr(ocean_router, '_last_download', None) or {}
    source = "USNIC" if dl.get("ice") else "synthetic"

    return {"cells": cells, "source": source, "count": len(cells)}


@router.get("/icebergs")
async def get_icebergs():
    """
    Return IIP iceberg data for map visualization.

    Returns iceberg limit polygon info and bulletin summary.
    """
    dl = getattr(ocean_router, '_last_download', None) or {}
    iceberg_data = dl.get("icebergs", {})

    result = {
        "available": bool(iceberg_data),
        "count": iceberg_data.get("iceberg_count", 0),
        "source": "IIP (U.S. Coast Guard)",
    }

    # If we have the bulletin, extract key info
    bulletin_path = iceberg_data.get("bulletin_path")
    if bulletin_path:
        try:
            import os
            if os.path.exists(bulletin_path):
                with open(bulletin_path, "r") as f:
                    text = f.read()
                result["bulletin_excerpt"] = text[:500]
                # Extract coordinates from the bulletin text
                # IIP uses format like "48-30N 048-30W"
                import re
                positions = []
                pattern = r'(\d{2})-(\d{2})([NS])\s+(\d{3})-(\d{2})([EW])'
                for m in re.finditer(pattern, text):
                    lat = int(m.group(1)) + int(m.group(2))/60
                    if m.group(3) == 'S': lat = -lat
                    lon = int(m.group(4)) + int(m.group(5))/60
                    if m.group(6) == 'W': lon = -lon
                    positions.append({"lat": round(lat, 4), "lon": round(lon, 4)})
                result["positions"] = positions
        except Exception as e:
            logger.warning(f"Failed to parse iceberg bulletin: {e}")

    # If we have the shapefile, extract the bounding box
    shp_path = iceberg_data.get("iceberg_shp_path")
    if shp_path:
        try:
            import os
            if os.path.exists(shp_path):
                import geopandas as gpd
                import zipfile
                extract_dir = os.path.join(os.path.dirname(shp_path), "iip_extracted")
                os.makedirs(extract_dir, exist_ok=True)
                with zipfile.ZipFile(shp_path, "r") as zf:
                    zf.extractall(extract_dir)
                for root, dirs, files in os.walk(extract_dir):
                    for f in files:
                        if f.endswith(".shp"):
                            gdf = gpd.read_file(os.path.join(root, f))
                            if not gdf.empty:
                                bounds = gdf.total_bounds  # [minx, miny, maxx, maxy]
                                result["limit_boundary"] = {
                                    "min_lon": round(float(bounds[0]), 2),
                                    "min_lat": round(float(bounds[1]), 2),
                                    "max_lon": round(float(bounds[2]), 2),
                                    "max_lat": round(float(bounds[3]), 2),
                                }
                                # Extract simplified polygon coordinates for rendering
                                coords = []
                                for _, row in gdf.iterrows():
                                    if row.geometry and not row.geometry.is_empty:
                                        simplified = row.geometry.simplify(0.5)
                                        if hasattr(simplified, 'exterior'):
                                            for x, y in simplified.exterior.coords:
                                                coords.append({"lat": round(y, 3), "lon": round(x, 3)})
                                        elif hasattr(simplified, 'geoms'):
                                            for geom in simplified.geoms:
                                                if hasattr(geom, 'exterior'):
                                                    for x, y in geom.exterior.coords:
                                                        coords.append({"lat": round(y, 3), "lon": round(x, 3)})
                                result["limit_polygon"] = coords[:200]  # Cap at 200 points
                            break
        except Exception as e:
            logger.warning(f"Failed to parse IIP shapefile: {e}")

    return result


# ═══════════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ═══════════════════════════════════════════════════════════════════

def _get_data_sources_dict() -> dict:
    """Build data sources dict from the router's last download results."""
    dl = getattr(ocean_router, '_last_download', None) or {}

    # Check if ECMWF was blended into the forecast store
    fs = ocean_router.forecast_store
    ecmwf_active = (
        fs is not None
        and hasattr(fs, 'sources')
        and fs.sources.get('wind') == 'ECMWF IFS'
    )

    return {
        "wind": "ECMWF IFS" if ecmwf_active else ("NOAA GFS" if dl.get("gfs") else "synthetic_climatological"),
        "waves": "ECMWF WAM" if ecmwf_active else ("NOAA WW3" if dl.get("ww3") else "synthetic_climatological"),
        "currents": "NOAA RTOFS" if dl.get("rtofs") else "synthetic_climatological",
        "ice": "USNIC" if dl.get("ice") else "synthetic_seasonal",
        "icebergs": f"IIP ({dl['icebergs'].get('iceberg_count', 0)} tracked)" if dl.get("icebergs") else "not_available",
    }


def _get_data_source_label() -> str:
    """Get a summary label for the current data source mix."""
    dl = getattr(ocean_router, '_last_download', None) or {}
    live_count = sum(1 for k in ["gfs", "ww3", "rtofs"] if dl.get(k))

    # Check if ECMWF was blended in
    fs = ocean_router.forecast_store
    ecmwf_active = (
        fs is not None
        and hasattr(fs, 'sources')
        and fs.sources.get('wind') == 'ECMWF IFS'
    )

    if ecmwf_active and live_count >= 1:
        return "ECMWF+NOAA_live"
    elif ecmwf_active:
        return "ECMWF_live"
    elif live_count == 3:
        return "NOAA_live"
    elif live_count > 0:
        return "NOAA_partial"
    else:
        return "synthetic_climatological"

