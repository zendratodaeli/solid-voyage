"""
Ocean graph builder — constructs a NetworkX weighted graph from weather data.

The graph represents the navigable ocean at GRID_RESOLUTION spacing.
Each node is a (lat, lon) tuple representing an ocean grid cell.
Each edge connects adjacent cells (8-directional) with a weight
equal to the fuel-cost-equivalent transit time.

Ice Integration:
When ice data is provided, edges entering cells with high ice concentration
are blocked (>70%) or penalized (10-70%), forcing routes around ice zones.
"""
import time
import logging
import numpy as np
import networkx as nx
from app.config import GRID_RESOLUTION, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, DEFAULT_VESSEL_SPEED_KNOTS
from app.data.land_mask import get_land_mask, lat_to_index, lon_to_index, index_to_lat, index_to_lon
from app.data.ice import ICE_BLOCK_THRESHOLD, ICE_PENALTY_THRESHOLD, ICE_PENALTY_FACTOR
from app.graph.cost import calculate_edge_cost

logger = logging.getLogger(__name__)

# 8-directional neighbor offsets (N, NE, E, SE, S, SW, W, NW)
NEIGHBOR_OFFSETS = [
    (-1, 0), (-1, 1), (0, 1), (1, 1),
    (1, 0), (1, -1), (0, -1), (-1, -1),
]


def build_ocean_graph(
    weather_data: dict,
    vessel_speed: float = DEFAULT_VESSEL_SPEED_KNOTS,
    ice_data: np.ndarray = None,
) -> nx.Graph:
    """
    Build the complete ocean routing graph from weather data arrays.

    Args:
        weather_data: Dict with 'wind_u', 'wind_v', 'wave_height',
                      'current_u', 'current_v' as numpy arrays [lat_idx, lon_idx]
        vessel_speed: Default vessel speed for edge cost calculation
        ice_data: Optional 2D numpy array [n_lat, n_lon] of ice concentrations [0-1].
                  If provided, edges into icy cells are penalized or blocked.

    Returns:
        NetworkX Graph with (lat, lon) tuple nodes and 'weight' edge attributes
    """
    start_time = time.time()

    # Load the land mask
    land_mask = get_land_mask()
    n_lat, n_lon = land_mask.shape

    wind_u = weather_data["wind_u"]
    wind_v = weather_data["wind_v"]
    wave_height = weather_data["wave_height"]
    current_u = weather_data["current_u"]
    current_v = weather_data["current_v"]

    has_ice = ice_data is not None
    if has_ice:
        logger.info(
            f"Ice layer active — "
            f"icy cells (>10%): {(ice_data > ICE_PENALTY_THRESHOLD).sum():,}, "
            f"blocked cells (>70%): {(ice_data > ICE_BLOCK_THRESHOLD).sum():,}"
        )

    logger.info(f"Building ocean graph at {GRID_RESOLUTION}° resolution...")
    logger.info(f"Grid dimensions: {n_lat} x {n_lon} = {n_lat * n_lon:,} total cells")

    # Step 1: Identify all ocean nodes (excluding ice-blocked cells)
    G = nx.Graph()
    ocean_count = 0
    land_count = 0
    ice_blocked_nodes = 0

    for i in range(n_lat):
        for j in range(n_lon):
            if land_mask[i, j]:
                land_count += 1
                continue

            # Block nodes in severe ice (>70% concentration)
            if has_ice and ice_data[i, j] > ICE_BLOCK_THRESHOLD:
                ice_blocked_nodes += 1
                land_count += 1  # Treat as impassable
                continue

            lat = index_to_lat(i)
            lon = index_to_lon(j)
            G.add_node((lat, lon))
            ocean_count += 1

    logger.info(
        f"Ocean nodes: {ocean_count:,} | Land nodes: {land_count:,}"
        + (f" | Ice-blocked: {ice_blocked_nodes:,}" if has_ice else "")
    )

    # Step 2: Add edges between adjacent ocean cells
    edge_count = 0
    infinite_count = 0
    ice_penalized_count = 0

    for i in range(n_lat):
        for j in range(n_lon):
            if land_mask[i, j]:
                continue
            # Skip ice-blocked source nodes
            if has_ice and ice_data[i, j] > ICE_BLOCK_THRESHOLD:
                continue

            from_lat = index_to_lat(i)
            from_lon = index_to_lon(j)

            for di, dj in NEIGHBOR_OFFSETS:
                ni, nj = i + di, j + dj

                # Bounds check
                if ni < 0 or ni >= n_lat or nj < 0 or nj >= n_lon:
                    continue

                # Handle antimeridian wrapping
                if nj < 0:
                    nj += n_lon
                elif nj >= n_lon:
                    nj -= n_lon

                # Skip land neighbors
                if land_mask[ni, nj]:
                    continue

                # Skip ice-blocked destinations
                if has_ice and ice_data[ni, nj] > ICE_BLOCK_THRESHOLD:
                    continue

                to_lat = index_to_lat(ni)
                to_lon = index_to_lon(nj)

                # Calculate edge cost using destination cell's weather
                wi = min(ni, wind_u.shape[0] - 1)
                wj = min(nj, wind_u.shape[1] - 1)

                cost = calculate_edge_cost(
                    from_lat, from_lon,
                    to_lat, to_lon,
                    wind_u=float(wind_u[wi, wj]),
                    wind_v=float(wind_v[wi, wj]),
                    current_u=float(current_u[wi, wj]),
                    current_v=float(current_v[wi, wj]),
                    wave_height=float(wave_height[wi, wj]),
                    vessel_speed=vessel_speed,
                )

                if cost < float('inf'):
                    # Apply ice penalty to edges entering icy cells
                    if has_ice and ice_data[ni, nj] > ICE_PENALTY_THRESHOLD:
                        ice_conc = float(ice_data[ni, nj])
                        # Linear penalty: 1.0x at threshold → ICE_PENALTY_FACTOR at block threshold
                        penalty_range = ICE_BLOCK_THRESHOLD - ICE_PENALTY_THRESHOLD
                        penalty_frac = (ice_conc - ICE_PENALTY_THRESHOLD) / penalty_range
                        ice_multiplier = 1.0 + (ICE_PENALTY_FACTOR - 1.0) * penalty_frac
                        cost *= ice_multiplier
                        ice_penalized_count += 1

                    G.add_edge((from_lat, from_lon), (to_lat, to_lon), weight=cost)
                    edge_count += 1
                else:
                    infinite_count += 1

    elapsed = time.time() - start_time
    logger.info(
        f"Graph built in {elapsed:.1f}s — "
        f"{G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges, "
        f"{infinite_count:,} blocked (waves/safety)"
        + (f", {ice_penalized_count:,} ice-penalized" if has_ice else "")
    )

    return G
