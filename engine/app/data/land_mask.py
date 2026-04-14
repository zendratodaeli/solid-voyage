"""
Land mask generator for the ocean routing graph.

Strategy: At 0.5° resolution, we WANT coastal cells to be ocean (navigable).
The land mask should only block definitive interior land. For any cell that
could be coastal water, we err towards "ocean" since NavAPI handles the
precise coastal navigation.

Approach: We use a combination of:
1. Conservative continental interiors (pulled inward from actual coastlines)
2. Generous ocean passage carve-outs
3. An "offset" approach: land boundaries are at least 1° from actual coast
"""
import numpy as np
import os
from app.config import LAND_MASK_PATH, GRID_RESOLUTION, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX


# --- Continental INTERIORS (deliberately pulled inward from coasts) ---
# Every boundary is offset ~1-2° inland from the actual coastline
# to ensure all ports and coastal waters remain navigable.
LAND_REGIONS = [
    # North America interior (well inland)
    {"lat": (30, 70), "lon": (-125, -65)},
    {"lat": (48, 65), "lon": (-140, -65)},
    {"lat": (27, 30), "lon": (-105, -82)},

    # Central America (narrow — only the widest parts)
    {"lat": (10, 17), "lon": (-89, -80)},

    # South America interior
    {"lat": (-50, -5), "lon": (-72, -40)},
    {"lat": (-5, 8), "lon": (-72, -45)},

    # Europe interior
    {"lat": (43, 68), "lon": (0, 35)},
    {"lat": (37, 43), "lon": (-5, 25)},

    # Africa interior
    {"lat": (-30, 33), "lon": (-10, 45)},

    # Middle East
    {"lat": (15, 38), "lon": (35, 58)},

    # Russia / Central Asia
    {"lat": (45, 75), "lon": (40, 175)},

    # South Asia interior
    {"lat": (12, 32), "lon": (70, 88)},

    # China interior
    {"lat": (22, 50), "lon": (80, 125)},

    # SE Asia mainland
    {"lat": (10, 22), "lon": (97, 110)},

    # Australia interior
    {"lat": (-38, -15), "lon": (118, 150)},

    # Greenland interior
    {"lat": (62, 82), "lon": (-60, -20)},
]

# --- Ocean bodies / passages that MUST remain open ---
# These carve-outs are generous to ensure connectivity.
OCEAN_CARVEOUTS = [
    # All oceans and major seas
    {"name": "Mediterranean", "lat": (30, 46), "lon": (-6, 37)},
    {"name": "Black_Sea", "lat": (40, 47), "lon": (27, 42)},
    {"name": "Red_Sea", "lat": (12, 30), "lon": (32, 44)},
    {"name": "Persian_Gulf", "lat": (23, 31), "lon": (47, 57)},
    {"name": "Baltic", "lat": (53, 66), "lon": (9, 31)},
    {"name": "North_Sea", "lat": (50, 62), "lon": (-5, 10)},
    {"name": "English_Channel", "lat": (48, 52), "lon": (-6, 3)},
    {"name": "Irish_Sea", "lat": (51, 56), "lon": (-7, -3)},
    {"name": "Bay_of_Biscay", "lat": (43, 49), "lon": (-10, 0)},
    {"name": "Norwegian_Sea", "lat": (62, 72), "lon": (-5, 15)},

    # Gulf of Mexico & Caribbean
    {"name": "Gulf_of_Mexico", "lat": (18, 31), "lon": (-98, -80)},
    {"name": "Caribbean", "lat": (8, 25), "lon": (-90, -58)},
    {"name": "Florida_Strait", "lat": (23, 28), "lon": (-84, -78)},

    # US & Canadian coasts (generous water strip)
    {"name": "US_East_Coast", "lat": (25, 46), "lon": (-82, -63)},
    {"name": "Canadian_Atlantic", "lat": (42, 55), "lon": (-70, -50)},
    {"name": "US_West_Coast", "lat": (30, 50), "lon": (-130, -115)},
    {"name": "Gulf_of_Alaska", "lat": (50, 62), "lon": (-170, -130)},

    # South American coasts
    {"name": "SA_East_Coast", "lat": (-55, 10), "lon": (-55, -28)},
    {"name": "SA_West_Coast", "lat": (-55, 5), "lon": (-85, -68)},

    # African coasts
    {"name": "West_Africa", "lat": (-35, 35), "lon": (-20, -5)},
    {"name": "East_Africa", "lat": (-35, 15), "lon": (35, 55)},
    {"name": "Mozambique_Channel", "lat": (-28, -10), "lon": (33, 50)},

    # Asian waters
    {"name": "Arabian_Sea", "lat": (5, 28), "lon": (50, 78)},
    {"name": "Bay_of_Bengal", "lat": (5, 23), "lon": (78, 95)},
    {"name": "Andaman_Sea", "lat": (5, 18), "lon": (92, 100)},
    {"name": "South_China_Sea", "lat": (-5, 25), "lon": (100, 122)},
    {"name": "East_China_Sea", "lat": (23, 35), "lon": (118, 132)},
    {"name": "Sea_of_Japan", "lat": (33, 52), "lon": (127, 142)},
    {"name": "Yellow_Sea", "lat": (30, 40), "lon": (118, 127)},
    {"name": "Philippine_Sea", "lat": (5, 30), "lon": (122, 140)},
    {"name": "Malacca_Strait", "lat": (-2, 8), "lon": (95, 105)},
    {"name": "Java_Sea", "lat": (-8, 0), "lon": (105, 120)},

    # Indonesian waters
    {"name": "Indonesia_passages", "lat": (-12, 5), "lon": (95, 140)},

    # Australian coasts
    {"name": "AU_East_Coast", "lat": (-42, -10), "lon": (148, 160)},
    {"name": "AU_West_Coast", "lat": (-38, -10), "lon": (108, 120)},
    {"name": "AU_North_Coast", "lat": (-18, -8), "lon": (120, 150)},
    {"name": "Bass_Strait", "lat": (-42, -37), "lon": (143, 150)},
    {"name": "Tasman_Sea", "lat": (-48, -28), "lon": (150, 175)},

    # Oceania
    {"name": "NZ_waters", "lat": (-50, -30), "lon": (165, 180)},

    # Hudson Bay
    {"name": "Hudson_Bay", "lat": (50, 65), "lon": (-96, -75)},

    # Bering Sea
    {"name": "Bering_Sea", "lat": (50, 66), "lon": (165, 180)},
    {"name": "Bering_Sea_E", "lat": (50, 66), "lon": (-180, -160)},

    # Ocean corridors near Japan
    {"name": "Japan_East", "lat": (30, 46), "lon": (138, 155)},
    {"name": "Japan_West", "lat": (30, 42), "lon": (125, 138)},

    # Suez approach
    {"name": "Suez_approach", "lat": (28, 32), "lon": (32, 35)},

    # Panama approach
    {"name": "Panama_Pacific", "lat": (5, 12), "lon": (-85, -77)},
    {"name": "Panama_Atlantic", "lat": (7, 12), "lon": (-82, -75)},
]


def generate_land_mask() -> np.ndarray:
    """
    Generate a 2D boolean array where True = land, False = ocean.
    """
    lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
    lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)
    n_lat = len(lats)
    n_lon = len(lons)

    # Start: everything is ocean
    mask = np.zeros((n_lat, n_lon), dtype=bool)

    # Step 1: Mark continental interiors as land
    for region in LAND_REGIONS:
        lat_range = region["lat"]
        lon_range = region["lon"]
        lat_mask = (lats >= lat_range[0]) & (lats <= lat_range[1])
        lon_mask = (lons >= lon_range[0]) & (lons <= lon_range[1])
        mask[np.ix_(lat_mask, lon_mask)] = True

    # Step 2: Carve out all ocean bodies and passages
    for passage in OCEAN_CARVEOUTS:
        lat_range = passage["lat"]
        lon_range = passage["lon"]
        lat_mask = (lats >= lat_range[0]) & (lats <= lat_range[1])
        lon_mask = (lons >= lon_range[0]) & (lons <= lon_range[1])
        mask[np.ix_(lat_mask, lon_mask)] = False

    return mask


def get_land_mask() -> np.ndarray:
    """Load or generate the land mask. Caches to disk as a numpy file."""
    if os.path.exists(LAND_MASK_PATH):
        mask = np.load(LAND_MASK_PATH)
        expected_shape = (
            len(np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)),
            len(np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)),
        )
        if mask.shape == expected_shape:
            return mask

    os.makedirs(os.path.dirname(LAND_MASK_PATH), exist_ok=True)
    mask = generate_land_mask()
    np.save(LAND_MASK_PATH, mask)
    return mask


def lat_to_index(lat: float) -> int:
    """Convert latitude to grid array index."""
    return int(round((lat - LAT_MIN) / GRID_RESOLUTION))


def lon_to_index(lon: float) -> int:
    """Convert longitude to grid array index."""
    return int(round((lon - LON_MIN) / GRID_RESOLUTION))


def index_to_lat(idx: int) -> float:
    """Convert grid array index to latitude."""
    return LAT_MIN + idx * GRID_RESOLUTION


def index_to_lon(idx: int) -> float:
    """Convert grid array index to longitude."""
    return LON_MIN + idx * GRID_RESOLUTION
