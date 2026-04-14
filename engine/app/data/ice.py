"""
Ice data provider — manages sea ice concentration data for route safety.

Strategy:
For Phase 2, we use a two-tier approach:
1. **Synthetic ice data**: Conservative bounding-box definition of seasonal
   ice zones (Arctic, Antarctic, Baltic) for immediate use.
2. **USNIC/NIC shapefiles**: When available, download and rasterize official
   National Ice Center shapefiles onto the ocean grid.

The ice layer integrates with the graph builder by providing an ice concentration
grid [0.0 - 1.0] that the cost function uses to penalize or block edges.

Ice concentration semantics:
- 0.0: Open water (no ice)
- 0.0 - 0.3: Light ice (navigable, slight penalty)
- 0.3 - 0.7: Moderate ice (heavy penalty, ice-class vessels only)
- 0.7+: Severe ice (blocked — no routing)
"""
import os
import logging
import numpy as np
from datetime import datetime, timezone

from app.config import (
    GRID_RESOLUTION, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX,
    ICE_DIR,
)

logger = logging.getLogger(__name__)

# --- Ice concentration thresholds ---
ICE_BLOCK_THRESHOLD = 0.7     # Block routing above this concentration
ICE_PENALTY_THRESHOLD = 0.1   # Start penalizing above this
ICE_PENALTY_FACTOR = 3.0      # Cost multiplier at 50% concentration

# --- Cached ice grid ---
ICE_CACHE_PATH = os.path.join(ICE_DIR, "ice_concentration.npy")


def _get_current_month() -> int:
    """Get current UTC month for seasonal ice patterns."""
    return datetime.now(timezone.utc).month


def generate_synthetic_ice(month: int = None) -> np.ndarray:
    """
    Generate seasonal ice concentration grid based on climatological patterns.

    Models:
    - Arctic: Maximum ice in February-March, minimum in September
    - Antarctic: Maximum in September-October, minimum in February
    - Baltic: Light seasonal ice November-April
    - Bering Sea: Seasonal ice December-May
    - Sea of Okhotsk: Seasonal ice December-May
    - Hudson Bay: Seasonal ice November-June

    Args:
        month: Month (1-12). Defaults to current month.

    Returns:
        2D numpy array [n_lat, n_lon] of ice concentrations [0-1]
    """
    if month is None:
        month = _get_current_month()

    lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
    lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)
    n_lat = len(lats)
    n_lon = len(lons)

    ice = np.zeros((n_lat, n_lon), dtype=np.float32)

    # --- Seasonal factors ---
    # Northern hemisphere: peak ice = Feb-Mar (month 2-3), minimum = Sep (month 9)
    # Southern hemisphere: peak ice = Sep-Oct (month 9-10), minimum = Feb (month 2)
    nh_factor = _seasonal_factor(month, peak_month=2.5, width=4.0)
    sh_factor = _seasonal_factor(month, peak_month=9.5, width=4.0)

    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            conc = 0.0

            # --- ARCTIC ---
            if lat > 65:
                # Permanent polar ice cap starts at ~80°N year-round
                if lat > 80:
                    conc = max(conc, 0.95)
                elif lat > 75:
                    # Seasonal variation
                    polar_conc = 0.3 + 0.65 * nh_factor
                    conc = max(conc, polar_conc)
                else:
                    # 65°-75°N: seasonal marginal ice zone
                    marginal_conc = max(0, 0.1 + 0.5 * nh_factor * ((lat - 65) / 10))
                    conc = max(conc, marginal_conc)

            # --- ANTARCTIC ---
            if lat < -60:
                if lat < -75:
                    conc = max(conc, 0.9)
                elif lat < -65:
                    polar_conc = 0.2 + 0.7 * sh_factor
                    conc = max(conc, polar_conc)
                else:
                    marginal_conc = max(0, 0.1 + 0.5 * sh_factor * ((abs(lat) - 60) / 5))
                    conc = max(conc, marginal_conc)

            # --- BALTIC SEA (seasonal light ice) ---
            if 58 <= lat <= 66 and 16 <= lon <= 30:
                baltic_factor = _seasonal_factor(month, peak_month=2, width=3.0)
                baltic_conc = 0.15 * baltic_factor
                if lat > 63:  # Gulf of Bothnia
                    baltic_conc = 0.35 * baltic_factor
                conc = max(conc, baltic_conc)

            # --- BERING SEA ---
            if 55 <= lat <= 66:
                if (-180 <= lon <= -160) or (165 <= lon <= 180):
                    bering_factor = _seasonal_factor(month, peak_month=2, width=3.5)
                    bering_conc = 0.2 * bering_factor * ((lat - 55) / 11)
                    conc = max(conc, bering_conc)

            # --- SEA OF OKHOTSK ---
            if 45 <= lat <= 60 and 135 <= lon <= 160:
                okhotsk_factor = _seasonal_factor(month, peak_month=2, width=3.0)
                okhotsk_conc = 0.3 * okhotsk_factor * ((lat - 45) / 15)
                conc = max(conc, okhotsk_conc)

            # --- HUDSON BAY ---
            if 50 <= lat <= 65 and -96 <= lon <= -75:
                hudson_factor = _seasonal_factor(month, peak_month=2, width=4.0)
                hudson_conc = 0.4 * hudson_factor
                conc = max(conc, hudson_conc)

            # --- GREENLAND EAST COAST (Drift ice) ---
            if 60 <= lat <= 75 and -45 <= lon <= -15:
                gl_factor = _seasonal_factor(month, peak_month=3, width=3.5)
                gl_conc = 0.25 * gl_factor * ((lat - 60) / 15)
                conc = max(conc, gl_conc)

            ice[i, j] = min(conc, 1.0)

    # Add gentle noise for visual realism
    rng = np.random.default_rng(77)
    noise = rng.normal(0, 0.03, ice.shape).astype(np.float32)
    ice = np.clip(ice + noise, 0.0, 1.0)

    # Zero out any ice-noise in the tropics (physical impossibility)
    tropical_mask = (lats[:, None] > -30) & (lats[:, None] < 30)
    ice[np.broadcast_to(tropical_mask, ice.shape)] = 0.0

    logger.info(
        f"Generated synthetic ice data for month {month}: "
        f"shape {ice.shape}, "
        f"icy cells (>10%): {(ice > 0.1).sum():,}, "
        f"blocked cells (>70%): {(ice > ICE_BLOCK_THRESHOLD).sum():,}"
    )

    return ice


def _seasonal_factor(month: int, peak_month: float, width: float) -> float:
    """
    Cosine-based seasonal factor that peaks at peak_month.

    Returns a value between 0.0 (off-season) and 1.0 (peak).
    """
    # Angular distance from peak (wrapping around 12 months)
    diff = abs(month - peak_month)
    if diff > 6:
        diff = 12 - diff
    # Cosine decay over `width` months
    if diff > width:
        return 0.0
    return max(0.0, 0.5 * (1 + np.cos(np.pi * diff / width)))


def download_usnic_shapefiles() -> str | None:
    """
    Download the latest USNIC (National Ice Center) Arctic ice shapefile.

    Source: https://usicecenter.gov/Products/ArcticData
    Format: ESRI Shapefile (.shp/.shx/.dbf)

    Returns path to the downloaded shapefile, or None if download fails.
    """
    import requests

    # USNIC provides weekly Arctic analysis shapefiles
    USNIC_URL = "https://usicecenter.gov/File/DownloadCurrent"

    os.makedirs(ICE_DIR, exist_ok=True)
    shapefile_path = os.path.join(ICE_DIR, "arctic_ice.zip")

    try:
        logger.info("Downloading USNIC Arctic ice shapefile...")
        response = requests.get(USNIC_URL, timeout=60, stream=True)
        response.raise_for_status()

        with open(shapefile_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        logger.info(f"Downloaded USNIC shapefile: {shapefile_path}")
        return shapefile_path

    except Exception as e:
        logger.warning(f"USNIC download failed (using synthetic data): {e}")
        return None


def rasterize_ice_shapefile(shapefile_path: str) -> np.ndarray | None:
    """
    Rasterize an ice shapefile onto the ocean grid.

    Reads polygons from the shapefile and fills the grid cells they
    intersect with the appropriate ice concentration value.

    Requires: fiona, shapely (already in requirements)
    """
    try:
        import zipfile
        import json
        from shapely.geometry import shape, box

        os.makedirs(ICE_DIR, exist_ok=True)
        extract_dir = os.path.join(ICE_DIR, "extracted")

        # Extract shapefile from zip
        with zipfile.ZipFile(shapefile_path, "r") as zf:
            zf.extractall(extract_dir)

        # Find .geojson or .shp file
        shp_files = []
        for root, dirs, files in os.walk(extract_dir):
            for f in files:
                if f.endswith((".shp", ".geojson", ".json")):
                    shp_files.append(os.path.join(root, f))

        if not shp_files:
            logger.warning("No shapefile found in USNIC archive")
            return None

        logger.info(f"Rasterizing ice from: {shp_files[0]}")

        # Initialize grid
        lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
        lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)
        n_lat, n_lon = len(lats), len(lons)
        ice = np.zeros((n_lat, n_lon), dtype=np.float32)

        # Parse shapefile (using shapely for geometry, manual for attributes)
        # For a production system, use fiona or geopandas
        # For now, we try basic geojson parsing
        if shp_files[0].endswith((".geojson", ".json")):
            with open(shp_files[0], "r") as f:
                geojson = json.load(f)

            for feature in geojson.get("features", []):
                geom = shape(feature["geometry"])
                props = feature.get("properties", {})

                # USNIC uses CT (total concentration) field
                concentration = 0.5  # Default moderate
                for key in ["CT", "CONC", "SIC", "ICE_CONC"]:
                    if key in props:
                        val = props[key]
                        if isinstance(val, (int, float)):
                            concentration = val / 100.0 if val > 1 else val
                        break

                # Rasterize: find grid cells within this polygon
                bounds = geom.bounds  # (minx, miny, maxx, maxy) = (lon, lat, lon, lat)
                for i, lat in enumerate(lats):
                    if lat < bounds[1] - 1 or lat > bounds[3] + 1:
                        continue
                    for j, lon in enumerate(lons):
                        if lon < bounds[0] - 1 or lon > bounds[2] + 1:
                            continue
                        cell = box(
                            lon - GRID_RESOLUTION / 2, lat - GRID_RESOLUTION / 2,
                            lon + GRID_RESOLUTION / 2, lat + GRID_RESOLUTION / 2,
                        )
                        if geom.intersects(cell):
                            ice[i, j] = max(ice[i, j], concentration)

        logger.info(f"Rasterized ice data: {(ice > 0.1).sum():,} icy cells")
        return ice

    except Exception as e:
        logger.warning(f"Ice shapefile rasterization failed: {e}")
        return None


def load_ice_data(month: int = None, try_download: bool = False) -> np.ndarray:
    """
    Load ice concentration data. Tries real data first, falls back to synthetic.

    Args:
        month: Month for seasonal patterns (1-12). Defaults to current month.
        try_download: If True, attempt to download fresh USNIC data.

    Returns:
        2D numpy array [n_lat, n_lon] of ice concentrations [0-1]
    """
    # Try downloading real shapefile
    if try_download:
        shp_path = download_usnic_shapefiles()
        if shp_path:
            ice = rasterize_ice_shapefile(shp_path)
            if ice is not None:
                # Cache for reuse
                os.makedirs(os.path.dirname(ICE_CACHE_PATH), exist_ok=True)
                np.save(ICE_CACHE_PATH, ice)
                return ice

    # Try cached ice data
    if os.path.exists(ICE_CACHE_PATH):
        try:
            ice = np.load(ICE_CACHE_PATH)
            expected_shape = (
                len(np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)),
                len(np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)),
            )
            if ice.shape == expected_shape:
                logger.info(f"Loaded cached ice data: {(ice > 0.1).sum():,} icy cells")
                return ice
        except Exception:
            pass

    # Fall back to synthetic
    return generate_synthetic_ice(month)
