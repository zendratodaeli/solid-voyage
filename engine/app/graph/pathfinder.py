"""
A* pathfinder — finds weather-optimized routes on the ocean graph.

Uses NetworkX's built-in astar_path with a haversine heuristic for
efficient search. The heuristic is admissible (never overestimates)
because it assumes best-case speed over great-circle distance.
"""
import logging
import time
from datetime import datetime, timezone
from typing import Optional
import numpy as np
import networkx as nx
from app.graph.cost import haversine_nm
from app.graph.builder import build_ocean_graph
from app.data.parser import load_weather_data
from app.config import (
    GRID_RESOLUTION,
    FORECAST_RESOLUTION,
    DEFAULT_VESSEL_SPEED_KNOTS,
    DEFAULT_DAILY_CONSUMPTION_MT,
    SOLAS_DISCLAIMER,
)

logger = logging.getLogger(__name__)


class OceanRouter:
    """
    Manages the pre-built ocean graph and serves route queries.

    The graph is built once from weather data and held in memory.
    Route queries are served from this in-memory graph with sub-second latency.
    The graph is atomically replaced when new weather data arrives.

    Also maintains a ForecastStore for multi-step forecast time series.
    """

    def __init__(self):
        self.graph: Optional[nx.Graph] = None
        self.build_timestamp: Optional[str] = None
        self._building = False
        self.forecast_store = None  # Will hold multi-step forecast data

    @property
    def is_ready(self) -> bool:
        """Check if the graph is built and ready to serve routes."""
        return self.graph is not None and not self._building

    def build(self, weather_data: dict = None, vessel_speed: float = DEFAULT_VESSEL_SPEED_KNOTS):
        """
        Build the ocean graph from weather data + ice data.

        On each rebuild cycle:
        1. Downloads fresh NOAA data (GFS wind, WW3 waves, RTOFS currents)
        2. Downloads multi-step GFS/WW3 forecast (57 steps, 7 days)
        3. Downloads USNIC ice shapefiles and IIP iceberg positions
        4. Parses GRIB/NetCDF files into numpy arrays (falls back to synthetic)
        5. Builds the NetworkX graph with weather-based edge weights
        6. Builds the ForecastStore for time series queries
        7. Atomically swaps the old graph for the new one (zero downtime)
        """
        self._building = True
        logger.info("Starting ocean graph build...")

        try:
            if weather_data is None:
                # Download fresh NOAA data
                from app.data.downloader import download_all_data
                downloaded = download_all_data()

                # Parse downloaded files into numpy arrays
                # (automatically falls back to synthetic for any missing source)
                weather_data = load_weather_data(grib_paths=downloaded)

                # Store download results for the /health endpoint
                self._last_download = downloaded
            else:
                self._last_download = None
                downloaded = None

            # Load ice data — try downloading real USNIC shapefiles
            from app.data.ice import load_ice_data
            ice_data = load_ice_data(try_download=True)
            self._ice_data = ice_data  # Store for /ice-grid endpoint

            # Build the new graph with weather + ice
            new_graph = build_ocean_graph(weather_data, vessel_speed, ice_data=ice_data)

            # Store parsed data for the /conditions and /ice-grid endpoints
            self._weather_data = weather_data

            # Atomic swap
            self.graph = new_graph
            self.build_timestamp = datetime.now(timezone.utc).isoformat()

            logger.info(
                f"✅ Ocean graph ready — "
                f"{self.graph.number_of_nodes():,} nodes, "
                f"{self.graph.number_of_edges():,} edges"
            )

            # Build forecast store (non-blocking — graph is already ready for routing)
            if downloaded:
                self._build_forecast_store(downloaded)

        except Exception as e:
            logger.error(f"❌ Graph build failed: {e}")
            raise
        finally:
            self._building = False

    def _build_forecast_store(self, downloaded: dict):
        """
        Build the ForecastStore from downloaded multi-step GRIB files.
        This runs AFTER the graph is ready, so it doesn't block routing.
        """
        try:
            from app.data.forecast_parser import ForecastStore, parse_multistep_grib
            from app.data.parser import parse_rtofs_netcdf

            store = ForecastStore()

            cycle_date = downloaded.get("cycle_date", "")
            cycle_run = downloaded.get("cycle_run", "00")
            store.build_timestamps(cycle_date, cycle_run)

            n_lat, n_lon = store.n_lat, store.n_lon

            # --- Parse GFS multi-step forecast ---
            gfs_forecast = downloaded.get("gfs_forecast", {})
            gfs_paths = gfs_forecast.get("gfs_forecast_paths", {})

            if gfs_paths:
                logger.info(f"Parsing GFS forecast ({len(gfs_paths)} steps)...")

                # GFS files contain multiple variables — we need to parse each separately
                # For now, parse the combined file and extract wind U/V, pressure, visibility
                # Since each file contains all 4 variables, we parse per-variable using
                # the first data var (index 0 = UGRD, 1 = VGRD, etc.)
                wind_u_paths = {}
                wind_v_paths = {}
                pressure_paths = {}
                visibility_paths = {}

                for hour, path in gfs_paths.items():
                    # Each GFS file has 4 messages (UGRD, VGRD, PRMSL, VIS)
                    # We'll parse each separately by creating per-variable GRIB extracts
                    wind_u_paths[hour] = path
                    wind_v_paths[hour] = path
                    pressure_paths[hour] = path
                    visibility_paths[hour] = path

                # Parse each variable using xarray (it reads the first variable by default)
                # We need to use message-based access
                store.wind_u = self._parse_gfs_variable(gfs_paths, "u10", n_lat, n_lon)
                store.wind_v = self._parse_gfs_variable(gfs_paths, "v10", n_lat, n_lon)
                store.pressure = self._parse_gfs_variable(gfs_paths, "prmsl", n_lat, n_lon)
                store.visibility = self._parse_gfs_variable(gfs_paths, "vis", n_lat, n_lon)

                store.sources["wind"] = "NOAA GFS 0.25°"
                store.sources["pressure"] = "NOAA GFS 0.25°"
                store.sources["visibility"] = "NOAA GFS 0.25°"

            # --- Parse WW3 multi-step forecast ---
            ww3_forecast = downloaded.get("ww3_forecast", {})
            ww3_paths = ww3_forecast.get("ww3_forecast_paths", {})

            if ww3_paths:
                logger.info(f"Parsing WW3 forecast ({len(ww3_paths)} steps)...")

                store.wave_height = self._parse_ww3_variable(ww3_paths, "swh", n_lat, n_lon)
                store.wave_period = self._parse_ww3_variable(ww3_paths, "perpw", n_lat, n_lon)
                store.wave_direction = self._parse_ww3_variable(ww3_paths, "dirpw", n_lat, n_lon)
                store.wind_wave_height = self._parse_ww3_variable(ww3_paths, "shww", n_lat, n_lon)
                store.swell_height = self._parse_ww3_variable(ww3_paths, "swell", n_lat, n_lon)

                store.sources["waves"] = "NOAA WW3 0.25°"

            # --- Parse OISST ---
            oisst_data = downloaded.get("oisst", {})
            if oisst_data.get("oisst_nc_path"):
                store.sst_oisst = self._parse_oisst(oisst_data["oisst_nc_path"], n_lat, n_lon)
                if store.sst_oisst is not None:
                    store.sources["sst_satellite"] = "NOAA OISST v2.1"

            # --- Parse RTOFS SST ---
            rtofs_data = downloaded.get("rtofs", {})
            if rtofs_data.get("rtofs_nc_path"):
                store.sst_rtofs = self._parse_rtofs_sst(rtofs_data["rtofs_nc_path"], n_lat, n_lon)
                if store.sst_rtofs is not None:
                    store.sources["sst_forecast"] = "NOAA RTOFS"

            store.is_ready = True
            self.forecast_store = store

            logger.info(
                f"✅ ForecastStore ready (NOAA GFS/WW3) — "
                f"{store.n_steps} steps, "
                f"{store.n_lat}×{store.n_lon} grid, "
                f"sources: {store.sources}"
            )

            # ── ECMWF Enhancement ────────────────────────────────────────
            # Try to download and blend ECMWF IFS+WAM for superior 15-day forecasts.
            # This is non-blocking: if ECMWF is unavailable, GFS/WW3 stays active.
            self._try_load_ecmwf(store)

        except Exception as e:
            logger.error(f"⚠️ ForecastStore build failed (routing unaffected): {e}")
            import traceback
            traceback.print_exc()

    def _try_load_ecmwf(self, store) -> None:
        """
        Attempt to download ECMWF Open Data and blend it into the ForecastStore.
        Runs after NOAA GFS/WW3 is already in memory — completely non-destructive on failure.
        """
        try:
            from app.data.ecmwf_parser import ECMWFStore
            from app.config import ECMWF_DIR
            import os

            os.makedirs(ECMWF_DIR, exist_ok=True)
            ecmwf = ECMWFStore(n_lat=store.n_lat, n_lon=store.n_lon)

            success = ecmwf.load(ecmwf_dir=ECMWF_DIR)
            if success:
                blended = store.blend_with_ecmwf(ecmwf)
                if blended:
                    logger.info(
                        "🌍 ECMWF IFS+WAM active — 15-day forecast engaged. "
                        "NOAA RTOFS currents + USNIC ice retained."
                    )
                    # ── Load ECMWF Ensemble (51 members) for uncertainty ──
                    self._try_ensemble_load(store, ecmwf)
                else:
                    logger.info("ECMWF blend skipped — NOAA GFS/WW3 remains active")
            else:
                logger.info(
                    "ECMWF data unavailable or insufficient — "
                    "NOAA GFS/WW3 7-day forecast active (fallback)"
                )

        except Exception as e:
            logger.warning(f"ECMWF load failed (non-fatal): {e}")
            # GFS/WW3 store is untouched — routing and forecasts continue normally

    def _try_ensemble_load(self, store, ecmwf):
        """
        Load ECMWF ENS (51 members) for confidence bands.
        Runs after HRES is already loaded — completely non-blocking on failure.
        """
        try:
            from app.data.ecmwf_parser import ECMWFEnsembleStore
            from app.config import ECMWF_DIR

            ens = ECMWFEnsembleStore(n_lat=store.n_lat, n_lon=store.n_lon)
            success = ens.load(
                ecmwf_dir=ECMWF_DIR,
                cycle_timestamp=ecmwf.cycle_timestamp,
            )
            if success:
                store.ensemble_store = ens
                logger.info(
                    "🎯 ECMWF ENS (51 members) loaded — "
                    "P10/P50/P90 confidence bands available"
                )
            else:
                logger.info("ENS data unavailable — deterministic forecast only")
        except Exception as e:
            logger.warning(f"ENS load failed (non-fatal): {e}")


    def _parse_gfs_variable(
        self, file_paths: dict, var_key: str, n_lat: int, n_lon: int
    ) -> Optional[np.ndarray]:
        """Parse a specific variable from multi-step GFS GRIB files."""
        try:
            import xarray as xr
            from app.config import FORECAST_HOURS

            n_steps = len(FORECAST_HOURS)
            result = np.full((n_steps, n_lat, n_lon), np.nan, dtype=np.float32)
            parsed = 0

            # Map var_key to cfgrib filter keys
            var_filters = {
                "u10": {"shortName": "10u"},
                "v10": {"shortName": "10v"},
                "prmsl": {"shortName": "prmsl"},
                "vis": {"shortName": "vis"},
            }
            filter_keys = var_filters.get(var_key, {})

            for step_idx, hour in enumerate(FORECAST_HOURS):
                path = file_paths.get(hour)
                if not path:
                    continue
                try:
                    ds = xr.open_dataset(
                        path, engine="cfgrib",
                        backend_kwargs={"filter_by_keys": filter_keys}
                    )
                    data = list(ds.data_vars.values())[0].values.astype(np.float32)
                    ds.close()

                    # Resample if needed
                    if data.shape != (n_lat, n_lon):
                        from scipy.ndimage import zoom
                        data = zoom(data, (n_lat / data.shape[0], n_lon / data.shape[1]), order=1).astype(np.float32)

                    result[step_idx] = np.nan_to_num(data, nan=0.0)
                    parsed += 1
                except Exception:
                    continue

            logger.info(f"GFS {var_key}: parsed {parsed}/{n_steps} steps")
            return result if parsed > 0 else None

        except ImportError:
            logger.warning("xarray/cfgrib not available for GFS forecast parsing")
            return None

    def _parse_ww3_variable(
        self, file_paths: dict, var_key: str, n_lat: int, n_lon: int
    ) -> Optional[np.ndarray]:
        """Parse a specific variable from multi-step WW3 GRIB files."""
        try:
            import xarray as xr
            from app.config import FORECAST_HOURS

            n_steps = len(FORECAST_HOURS)
            result = np.full((n_steps, n_lat, n_lon), np.nan, dtype=np.float32)
            parsed = 0

            var_filters = {
                "swh": {"shortName": "swh"},
                "perpw": {"shortName": "perpw"},
                "dirpw": {"shortName": "dirpw"},
                "shww": {"shortName": "shww"},
                "swell": {"shortName": "swh", "typeOfLevel": "orderedSequence"},
            }
            filter_keys = var_filters.get(var_key, {})

            for step_idx, hour in enumerate(FORECAST_HOURS):
                path = file_paths.get(hour)
                if not path:
                    continue
                try:
                    ds = xr.open_dataset(
                        path, engine="cfgrib",
                        backend_kwargs={"filter_by_keys": filter_keys}
                    )
                    data = list(ds.data_vars.values())[0].values.astype(np.float32)
                    ds.close()

                    if data.shape != (n_lat, n_lon):
                        from scipy.ndimage import zoom
                        data = zoom(data, (n_lat / data.shape[0], n_lon / data.shape[1]), order=1).astype(np.float32)

                    result[step_idx] = np.nan_to_num(data, nan=0.0)
                    parsed += 1
                except Exception:
                    continue

            logger.info(f"WW3 {var_key}: parsed {parsed}/{n_steps} steps")
            return result if parsed > 0 else None

        except ImportError:
            logger.warning("xarray/cfgrib not available for WW3 forecast parsing")
            return None

    def _parse_oisst(self, nc_path: str, n_lat: int, n_lon: int) -> Optional[np.ndarray]:
        """Parse NOAA OISST NetCDF into a 2D SST array."""
        try:
            import xarray as xr
            from scipy.ndimage import zoom

            ds = xr.open_dataset(nc_path)
            # OISST variable is 'sst' with dimensions (time, zlev, lat, lon)
            sst = ds["sst"].isel(time=0, zlev=0).values.astype(np.float32)
            ds.close()

            sst = np.nan_to_num(sst, nan=0.0)

            if sst.shape != (n_lat, n_lon):
                sst = zoom(sst, (n_lat / sst.shape[0], n_lon / sst.shape[1]), order=1).astype(np.float32)

            logger.info(f"Parsed OISST: shape {sst.shape}, range {sst.min():.1f}–{sst.max():.1f}°C")
            return sst

        except Exception as e:
            logger.warning(f"OISST parsing failed: {e}")
            return None

    def _parse_rtofs_sst(self, nc_path: str, n_lat: int, n_lon: int) -> Optional[np.ndarray]:
        """Extract SST from the RTOFS diagnostic NetCDF file."""
        try:
            import xarray as xr
            from scipy.interpolate import griddata

            ds = xr.open_dataset(nc_path)

            # RTOFS SST variable
            sst_var = None
            for name in ['sst', 'SST', 'sea_surface_temperature', 'temperature']:
                if name in ds.data_vars:
                    sst_var = name
                    break

            if sst_var is None:
                ds.close()
                return None

            sst_data = ds[sst_var]
            if sst_data.ndim > 2:
                sst_data = sst_data.isel({
                    dim: 0 for dim in sst_data.dims
                    if dim not in ['lat', 'latitude', 'Latitude', 'Y', 'y',
                                   'lon', 'longitude', 'Longitude', 'X', 'x']
                })

            sst_raw = sst_data.values.astype(np.float32)

            # Check for 2D coordinates (tripolar grid)
            lat_2d = None
            for name in ['Latitude', 'latitude', 'lat']:
                if name in ds.coords or name in ds.data_vars:
                    arr = ds[name].values
                    if arr.ndim == 2:
                        lat_2d = arr
                        break

            lon_2d = None
            for name in ['Longitude', 'longitude', 'lon']:
                if name in ds.coords or name in ds.data_vars:
                    arr = ds[name].values
                    if arr.ndim == 2:
                        lon_2d = arr
                        break

            ds.close()

            if lat_2d is not None and lon_2d is not None:
                # Tripolar grid — regrid to regular grid
                from app.config import LAT_MIN, LAT_MAX, LON_MIN, LON_MAX
                target_lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
                target_lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)
                target_lon_grid, target_lat_grid = np.meshgrid(target_lons, target_lats)

                flat_lat = lat_2d.ravel()
                flat_lon = np.where(lon_2d.ravel() > 180, lon_2d.ravel() - 360, lon_2d.ravel())
                flat_sst = np.nan_to_num(sst_raw.ravel(), nan=0.0)

                valid = (np.abs(flat_lat) <= 90) & (np.abs(flat_lon) <= 180) & np.isfinite(flat_lat)
                src_points = np.column_stack([flat_lat[valid], flat_lon[valid]])

                step = 4
                sst_result = griddata(
                    src_points[::step], flat_sst[valid][::step],
                    np.column_stack([target_lat_grid.ravel(), target_lon_grid.ravel()]),
                    method='nearest', fill_value=0.0
                )
                sst_result = sst_result.reshape(target_lat_grid.shape).astype(np.float32)
            else:
                from scipy.ndimage import zoom
                sst_result = np.nan_to_num(sst_raw, nan=0.0)
                if sst_result.shape != (n_lat, n_lon):
                    sst_result = zoom(sst_result, (n_lat / sst_result.shape[0], n_lon / sst_result.shape[1]), order=1).astype(np.float32)

            logger.info(f"Parsed RTOFS SST: shape {sst_result.shape}")
            return sst_result

        except Exception as e:
            logger.warning(f"RTOFS SST parsing failed: {e}")
            return None

    def _snap_to_grid(self, lat: float, lon: float) -> tuple[float, float]:
        """
        Snap arbitrary coordinates to the nearest grid node that exists in the graph.

        Uses a spiral search outward from the rounded grid position to handle
        cases where the nearest grid cell is land.
        """
        # Round to nearest grid cell
        snapped_lat = round(lat / GRID_RESOLUTION) * GRID_RESOLUTION
        snapped_lon = round(lon / GRID_RESOLUTION) * GRID_RESOLUTION

        # If exact node exists, use it
        if (snapped_lat, snapped_lon) in self.graph:
            return (snapped_lat, snapped_lon)

        # Spiral search for nearest ocean node (up to 10° radius)
        best_node = None
        best_dist = float('inf')
        max_steps = int(10.0 / GRID_RESOLUTION)

        for r in range(1, max_steps):
            for di in range(-r, r + 1):
                for dj in range(-r, r + 1):
                    if abs(di) != r and abs(dj) != r:
                        continue  # Only check perimeter of each ring

                    candidate = (
                        snapped_lat + di * GRID_RESOLUTION,
                        snapped_lon + dj * GRID_RESOLUTION,
                    )
                    if candidate in self.graph:
                        dist = haversine_nm(lat, lon, candidate[0], candidate[1])
                        if dist < best_dist:
                            best_dist = dist
                            best_node = candidate

            if best_node is not None:
                break  # Found at least one node in this ring

        if best_node is None:
            raise ValueError(
                f"No ocean grid node found within 10° of ({lat}, {lon}). "
                f"The coordinates may be deep inland."
            )

        logger.debug(
            f"Snapped ({lat:.2f}, {lon:.2f}) → ({best_node[0]:.1f}, {best_node[1]:.1f}) "
            f"({best_dist:.0f} NM offset)"
        )
        return best_node

    def find_route(
        self,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float,
        vessel_speed: float = DEFAULT_VESSEL_SPEED_KNOTS,
        daily_consumption_mt: float = DEFAULT_DAILY_CONSUMPTION_MT,
    ) -> dict:
        """
        Find the weather-optimized route between two points.

        Args:
            start_lat, start_lon: Departure coordinates
            end_lat, end_lon: Destination coordinates
            vessel_speed: Service speed in knots
            daily_consumption_mt: Daily fuel consumption in MT

        Returns:
            dict with waypoints, distance, time, fuel estimates
        """
        if not self.is_ready:
            return {"success": False, "error": "Graph not ready"}

        search_start = time.time()

        try:
            # Snap to grid
            start_node = self._snap_to_grid(start_lat, start_lon)
            end_node = self._snap_to_grid(end_lat, end_lon)

            logger.info(
                f"Routing: ({start_lat:.2f}, {start_lon:.2f}) → ({end_lat:.2f}, {end_lon:.2f})"
            )

            # A* search with haversine heuristic
            # The heuristic divides by a generous speed (vessel_speed + 2 knots max current)
            # to ensure it never overestimates (admissible)
            optimistic_speed = vessel_speed + 2.0

            def heuristic(a, b):
                return haversine_nm(a[0], a[1], b[0], b[1]) / optimistic_speed

            path = nx.astar_path(
                self.graph,
                start_node,
                end_node,
                heuristic=heuristic,
                weight='weight',
            )

            # Calculate metrics along the path
            total_hours = 0.0
            total_distance_nm = 0.0
            waypoints = []

            for i, node in enumerate(path):
                waypoints.append({"lat": node[0], "lon": node[1]})

                if i > 0:
                    # Accumulate edge weight (hours) and distance
                    edge_data = self.graph[path[i - 1]][path[i]]
                    total_hours += edge_data.get("weight", 0)
                    total_distance_nm += haversine_nm(
                        path[i - 1][0], path[i - 1][1],
                        path[i][0], path[i][1]
                    )

            total_days = total_hours / 24.0
            estimated_fuel_mt = total_days * daily_consumption_mt

            search_time = time.time() - search_start

            logger.info(
                f"Route found in {search_time:.2f}s — "
                f"{len(path)} waypoints, {total_distance_nm:.0f} NM, "
                f"{total_days:.1f} days, ~{estimated_fuel_mt:.0f} MT fuel"
            )

            # Simplify the path — remove redundant collinear points
            simplified = self._simplify_path(waypoints)

            return {
                "success": True,
                "waypoints": simplified,
                "total_distance_nm": round(total_distance_nm, 1),
                "estimated_hours": round(total_hours, 1),
                "estimated_days": round(total_days, 1),
                "estimated_fuel_mt": round(estimated_fuel_mt, 1),
                "graph_timestamp": self.build_timestamp,
                "graph_nodes": self.graph.number_of_nodes(),
                "graph_edges": self.graph.number_of_edges(),
                "search_time_ms": round(search_time * 1000),
                "raw_waypoint_count": len(path),
                "simplified_waypoint_count": len(simplified),
                "disclaimer": SOLAS_DISCLAIMER,
            }

        except nx.NodeNotFound as e:
            logger.error(f"Node not in graph: {e}")
            return {"success": False, "error": f"Coordinate not in ocean grid: {e}"}

        except nx.NetworkXNoPath:
            logger.warning("No path found between the given coordinates")
            return {
                "success": False,
                "error": "No navigable path found. The route may be blocked by land, ice, or dangerous wave conditions.",
            }

        except ValueError as e:
            logger.error(f"Snapping error: {e}")
            return {"success": False, "error": str(e)}

        except Exception as e:
            logger.error(f"Routing error: {e}")
            return {"success": False, "error": f"Internal routing error: {str(e)}"}

    def _simplify_path(self, waypoints: list[dict], tolerance_deg: float = 0.5) -> list[dict]:
        """
        Simplify the path by removing points that are nearly collinear.
        Keeps the first, last, and every significant direction change.

        This reduces the waypoint count from ~200 to ~20-40 for smoother
        Leaflet rendering on the frontend.
        """
        if len(waypoints) <= 3:
            return waypoints

        simplified = [waypoints[0]]

        for i in range(1, len(waypoints) - 1):
            prev = waypoints[i - 1]
            curr = waypoints[i]
            next_wp = waypoints[i + 1]

            # Calculate heading change
            heading1 = np.arctan2(
                curr["lon"] - prev["lon"],
                curr["lat"] - prev["lat"]
            )
            heading2 = np.arctan2(
                next_wp["lon"] - curr["lon"],
                next_wp["lat"] - curr["lat"]
            )

            angle_change = abs(heading2 - heading1)
            if angle_change > np.pi:
                angle_change = 2 * np.pi - angle_change

            # Keep point if direction changes significantly (> ~5°)
            if angle_change > np.radians(5):
                simplified.append(curr)

        simplified.append(waypoints[-1])  # Always keep the destination

        return simplified

    def get_conditions(self, lat: float, lon: float, vessel_speed: float = DEFAULT_VESSEL_SPEED_KNOTS) -> dict:
        """
        Get maritime conditions at a specific coordinate.

        Returns wind, wave, current, ice, and navigability data by looking
        up the nearest grid cell in the pre-built weather/ocean data arrays.
        """
        from app.data.land_mask import get_land_mask, lat_to_index, lon_to_index
        from app.data.parser import load_weather_data
        from app.data.ice import load_ice_data

        land_mask = get_land_mask()
        lat_idx = lat_to_index(lat)
        lon_idx = lon_to_index(lon)

        # Check bounds
        n_lat, n_lon = land_mask.shape
        if lat_idx < 0 or lat_idx >= n_lat or lon_idx < 0 or lon_idx >= n_lon:
            return {"is_ocean": False, "advisory": "Coordinates out of grid range"}

        # Check if land
        if land_mask[lat_idx, lon_idx]:
            return {"is_ocean": False, "advisory": "Location is on land — no marine data"}

        # Use the stored NOAA-parsed weather data (not re-loading from file)
        weather_data = getattr(self, '_weather_data', None)
        if weather_data is None:
            # Fallback: re-load (will use synthetic if no grib paths)
            weather_data = load_weather_data()
        wind_u = float(weather_data["wind_u"][lat_idx, lon_idx])
        wind_v = float(weather_data["wind_v"][lat_idx, lon_idx])
        wave_h = float(weather_data["wave_height"][lat_idx, lon_idx])
        cur_u = float(weather_data["current_u"][lat_idx, lon_idx])
        cur_v = float(weather_data["current_v"][lat_idx, lon_idx])

        import math
        wind_speed_ms = math.sqrt(wind_u ** 2 + wind_v ** 2)
        wind_speed_kn = wind_speed_ms * 1.944  # m/s → knots
        wind_dir = (math.degrees(math.atan2(-wind_u, -wind_v)) + 360) % 360

        cur_speed_ms = math.sqrt(cur_u ** 2 + cur_v ** 2)
        cur_speed_kn = cur_speed_ms * 1.944
        cur_dir = (math.degrees(math.atan2(cur_u, cur_v)) + 360) % 360

        # Ice data
        # Ice data — use the stored NOAA data
        ice_data = getattr(self, '_ice_data', None)
        if ice_data is None:
            ice_data = load_ice_data()
        ice_conc = 0.0
        if ice_data is not None and lat_idx < ice_data.shape[0] and lon_idx < ice_data.shape[1]:
            ice_conc = float(ice_data[lat_idx, lon_idx])

        # Classify ice severity
        if ice_conc >= 0.70:
            ice_severity = "severe"
        elif ice_conc >= 0.30:
            ice_severity = "moderate"
        elif ice_conc >= 0.10:
            ice_severity = "light"
        else:
            ice_severity = "none"

        # Speed impact: waves slow vessels down, headwind reduces speed
        # (simplified: every 1m wave height above 2m reduces speed ~0.5 kn)
        wave_penalty_kn = max(0, (wave_h - 2.0) * 0.5)
        # Headwind penalty: ~5% per 10 kn headwind (simplified)
        wind_penalty_kn = wind_speed_kn * 0.005 * vessel_speed
        # Current effect: favorable current adds, adverse subtracts
        current_effect_kn = cur_speed_kn * 0.5  # simplified — assume partial alignment

        effective_speed = max(2.0, vessel_speed - wave_penalty_kn - wind_penalty_kn)
        speed_reduction_pct = round((1 - effective_speed / vessel_speed) * 100, 1)

        # Navigability
        if ice_conc >= 0.70:
            navigability = "blocked"
            advisory = "⛔ Heavy ice — route is impassable without icebreaker escort"
        elif wave_h >= 6.0:
            navigability = "dangerous"
            advisory = f"⚠️ Dangerous seas ({wave_h:.1f}m waves) — alter course recommended"
        elif ice_conc >= 0.30 or wave_h >= 4.0:
            navigability = "restricted"
            advisory = (
                f"Caution: {'Ice zone (' + str(round(ice_conc * 100)) + '%) — reduced speed required' if ice_conc >= 0.30 else ''}"
                f"{'Heavy seas (' + str(round(wave_h, 1)) + 'm waves)' if wave_h >= 4.0 else ''}"
            ).strip()
        elif wave_h >= 2.5 or wind_speed_kn >= 25:
            navigability = "moderate"
            advisory = f"Moderate conditions — {wave_h:.1f}m waves, {wind_speed_kn:.0f} kn wind"
        else:
            navigability = "open"
            advisory = "Clear conditions — no weather restrictions"

        return {
            "is_ocean": True,
            "wind_speed_knots": round(wind_speed_kn, 1),
            "wind_direction_deg": round(wind_dir, 0),
            "wave_height_m": round(wave_h, 2),
            "current_speed_knots": round(cur_speed_kn, 2),
            "current_direction_deg": round(cur_dir, 0),
            "ice_concentration_pct": round(ice_conc * 100, 1),
            "ice_severity": ice_severity,
            "effective_speed_knots": round(effective_speed, 1),
            "speed_reduction_pct": speed_reduction_pct,
            "navigability": navigability,
            "advisory": advisory,
        }

