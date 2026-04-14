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
    """

    def __init__(self):
        self.graph: Optional[nx.Graph] = None
        self.build_timestamp: Optional[str] = None
        self._building = False

    @property
    def is_ready(self) -> bool:
        """Check if the graph is built and ready to serve routes."""
        return self.graph is not None and not self._building

    def build(self, weather_data: dict = None, vessel_speed: float = DEFAULT_VESSEL_SPEED_KNOTS):
        """
        Build the ocean graph from weather data + ice data.

        If weather_data is None, generates synthetic climatological data.
        Ice data is loaded automatically (synthetic seasonal patterns).
        This method performs an atomic swap: the old graph continues serving
        requests until the new one is fully built.
        """
        self._building = True
        logger.info("Starting ocean graph build...")

        try:
            # Load weather data
            if weather_data is None:
                weather_data = load_weather_data()

            # Load ice data (seasonal, based on current month)
            from app.data.ice import load_ice_data
            ice_data = load_ice_data()

            # Build the new graph with weather + ice
            new_graph = build_ocean_graph(weather_data, vessel_speed, ice_data=ice_data)

            # Atomic swap
            self.graph = new_graph
            self.build_timestamp = datetime.now(timezone.utc).isoformat()

            logger.info(
                f"✅ Ocean graph ready — "
                f"{self.graph.number_of_nodes():,} nodes, "
                f"{self.graph.number_of_edges():,} edges"
            )

        except Exception as e:
            logger.error(f"❌ Graph build failed: {e}")
            raise
        finally:
            self._building = False

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

        # Load current weather data
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

