"""
Edge weight (cost) calculation for the ocean routing graph.

Each edge represents sailing from one grid cell to an adjacent cell.
The cost is calculated as "effective time" incorporating:
- Base transit time (distance / speed)
- Ocean current effect (along-track decomposition)
- Wave height penalty (speed reduction in heavy seas)
- Wind effect (head/tail wind adjustment)
- Safety walls (infinite cost for dangerous conditions)
"""
import numpy as np
from app.config import (
    WAVE_HEIGHT_LIMIT,
    WAVE_PENALTY_THRESHOLD,
    WAVE_PENALTY_FACTOR,
    MIN_EFFECTIVE_SPEED,
    HEAD_WIND_THRESHOLD,
    HEAD_WIND_PENALTY,
    HEAD_WIND_SECTOR,
)


def haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points in nautical miles.
    """
    R_NM = 3440.065  # Earth radius in nautical miles

    lat1_r, lat2_r = np.radians(lat1), np.radians(lat2)
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)

    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

    return R_NM * c


def calculate_edge_cost(
    from_lat: float, from_lon: float,
    to_lat: float, to_lon: float,
    wind_u: float,       # m/s, eastward component at destination cell
    wind_v: float,       # m/s, northward component at destination cell
    current_u: float,    # m/s, eastward component at destination cell
    current_v: float,    # m/s, northward component at destination cell
    wave_height: float,  # meters, significant wave height at destination cell
    vessel_speed: float, # knots, service speed
) -> float:
    """
    Calculate the fuel-cost-equivalent weight of sailing between two grid cells.

    The cost is expressed in hours-equivalent, adjusted for environmental factors.
    Higher cost = more fuel burned (slower effective speed or longer distance).

    Returns:
        float: Edge weight in hours. Returns inf if the cell is unsafe.
    """
    # ═══════════════════════════════════════════════════
    # SAFETY WALL — Absolute barrier for dangerous seas
    # ═══════════════════════════════════════════════════
    if wave_height >= WAVE_HEIGHT_LIMIT:
        return float('inf')

    # ═══════════════════════════════════════════════════
    # BASE COST — Time to cross the cell at service speed
    # ═══════════════════════════════════════════════════
    distance_nm = haversine_nm(from_lat, from_lon, to_lat, to_lon)

    # ═══════════════════════════════════════════════════
    # CURRENT EFFECT — Along-track decomposition
    # Project the current vector onto the vessel's heading
    # ═══════════════════════════════════════════════════
    dlat = to_lat - from_lat
    dlon = (to_lon - from_lon) * np.cos(np.radians(from_lat))  # Correct for latitude

    heading_rad = np.arctan2(dlon, dlat)

    # Current vector decomposition
    current_speed_ms = np.sqrt(current_u ** 2 + current_v ** 2)
    if current_speed_ms > 0.01:  # Avoid division by zero
        current_dir_rad = np.arctan2(current_u, current_v)  # Direction current flows TO
        along_track_ms = current_speed_ms * np.cos(current_dir_rad - heading_rad)
        along_track_knots = along_track_ms * 1.94384  # m/s to knots
    else:
        along_track_knots = 0.0

    effective_speed = vessel_speed + along_track_knots

    # ═══════════════════════════════════════════════════
    # WAVE PENALTY — Speed reduction in heavy seas
    # ═══════════════════════════════════════════════════
    if wave_height > WAVE_PENALTY_THRESHOLD:
        wave_penalty = (wave_height - WAVE_PENALTY_THRESHOLD) * WAVE_PENALTY_FACTOR
        effective_speed -= wave_penalty

    # ═══════════════════════════════════════════════════
    # WIND EFFECT — Head wind penalty
    # ═══════════════════════════════════════════════════
    wind_speed_knots = np.sqrt(wind_u ** 2 + wind_v ** 2) * 1.94384
    if wind_speed_knots > HEAD_WIND_THRESHOLD:
        wind_dir_rad = np.arctan2(wind_u, wind_v)
        # Relative angle: difference between wind direction and vessel heading
        relative_angle = abs(wind_dir_rad - heading_rad)
        if relative_angle > np.pi:
            relative_angle = 2 * np.pi - relative_angle

        # Check if wind is within the "head wind" sector
        head_wind_rad = np.radians(HEAD_WIND_SECTOR)
        if relative_angle > (np.pi - head_wind_rad):  # Wind coming from ahead
            effective_speed *= HEAD_WIND_PENALTY

    # ═══════════════════════════════════════════════════
    # SPEED FLOOR — Prevent unrealistic values
    # ═══════════════════════════════════════════════════
    effective_speed = max(effective_speed, MIN_EFFECTIVE_SPEED)

    # ═══════════════════════════════════════════════════
    # FINAL COST — Transit time in hours
    # ═══════════════════════════════════════════════════
    time_hours = distance_nm / effective_speed

    return time_hours
