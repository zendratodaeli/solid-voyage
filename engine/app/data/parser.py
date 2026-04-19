"""
GRIB file parser — extracts weather variables into numpy arrays.

For Phase 1, we use a simplified parser that works WITHOUT the cfgrib/eccodes
C library dependency (which is complex to install on Windows). Instead, we
use a lightweight approach:

1. If xarray+cfgrib is available: full GRIB parsing (production)
2. Fallback: Generate synthetic weather data based on climatological patterns
   (development/testing)

The synthetic data models:
- Wind patterns: Trade winds, Westerlies, Doldrums
- Gulf Stream and Kuroshio Current
- Typical wave height distributions

This allows us to build and test the full routing engine immediately,
then swap in real GRIB data when the dependency is resolved.
"""
import numpy as np
import logging
from app.config import GRID_RESOLUTION, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX

logger = logging.getLogger(__name__)


def parse_grib_file(file_path: str, variable: str) -> np.ndarray | None:
    """
    Attempt to parse a GRIB2 file using xarray + cfgrib.

    Returns:
        2D numpy array indexed [lat_idx, lon_idx], or None if parsing fails.
    """
    try:
        import xarray as xr
        ds = xr.open_dataset(file_path, engine="cfgrib")
        # Extract the first data variable
        var_name = list(ds.data_vars)[0]
        data = ds[var_name].values
        ds.close()
        logger.info(f"Parsed GRIB {variable} from {file_path}: shape {data.shape}")
        return data
    except ImportError:
        logger.warning("cfgrib not available — using synthetic weather data")
        return None
    except Exception as e:
        logger.warning(f"GRIB parsing failed for {file_path}: {e}")
        return None


def generate_synthetic_wind() -> tuple[np.ndarray, np.ndarray]:
    """
    Generate climatologically realistic wind patterns.

    Models the three major wind belts:
    - Trade Winds (0-30°): Easterly (negative U), weak V
    - Westerlies (30-60°): Strong westerly (positive U)
    - Polar Easterlies (60-90°): Weak easterly

    Returns:
        (wind_u, wind_v): Arrays of shape [n_lat, n_lon] in m/s
    """
    lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
    lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)
    n_lat, n_lon = len(lats), len(lons)

    wind_u = np.zeros((n_lat, n_lon), dtype=np.float32)
    wind_v = np.zeros((n_lat, n_lon), dtype=np.float32)

    for i, lat in enumerate(lats):
        abs_lat = abs(lat)

        if abs_lat < 5:
            # ITCZ / Doldrums — weak, variable winds
            u_base = -1.0
            v_base = 0.5
        elif abs_lat < 30:
            # Trade Winds — easterly
            strength = 5.0 + (abs_lat - 5) * 0.3  # 5-12 m/s
            u_base = -strength if lat > 0 else -strength  # Easterly in both hemispheres
            v_base = -2.0 if lat > 0 else 2.0  # Slight equatorward component
        elif abs_lat < 60:
            # Westerlies — strongest at ~45°
            peak_factor = 1.0 - abs((abs_lat - 45) / 15)
            strength = 6.0 + peak_factor * 8.0  # 6-14 m/s
            u_base = strength  # Westerly (positive U = from west)
            v_base = 1.0 if lat > 0 else -1.0  # Slight poleward
        else:
            # Polar easterlies — weak
            u_base = -3.0
            v_base = 0.0

        # Add longitude-dependent variation (simulates weather systems)
        for j, lon in enumerate(lons):
            # Sinusoidal variation to simulate pressure systems
            lon_var = np.sin(np.radians(lon) * 3) * 2.0

            wind_u[i, j] = u_base + lon_var
            wind_v[i, j] = v_base + np.cos(np.radians(lon) * 2) * 1.5

    # Add random perturbation for realism
    rng = np.random.default_rng(42)
    wind_u += rng.normal(0, 1.5, wind_u.shape).astype(np.float32)
    wind_v += rng.normal(0, 1.0, wind_v.shape).astype(np.float32)

    logger.info(f"Generated synthetic wind data: shape {wind_u.shape}")
    return wind_u, wind_v


def generate_synthetic_waves() -> np.ndarray:
    """
    Generate synthetic significant wave height based on wind patterns.
    Wave height roughly correlates with wind speed (fully developed seas).

    Returns:
        wave_height: Array of shape [n_lat, n_lon] in meters
    """
    lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
    lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)
    n_lat, n_lon = len(lats), len(lons)

    wave_height = np.zeros((n_lat, n_lon), dtype=np.float32)

    for i, lat in enumerate(lats):
        abs_lat = abs(lat)

        if abs_lat < 10:
            # Tropics — low waves
            base_height = 0.8
        elif abs_lat < 30:
            # Trade wind belt — moderate
            base_height = 1.0 + (abs_lat - 10) * 0.03
        elif abs_lat < 55:
            # Westerlies — moderate
            base_height = 1.5 + (abs_lat - 30) * 0.06
        else:
            # High latitudes — heavier but still navigable
            base_height = 2.5 + (abs_lat - 55) * 0.08

        for j, lon in enumerate(lons):
            # Southern Ocean enhancement (the "Roaring Forties")
            # Moderate increase — creates routing preference but doesn't block
            if lat < -40 and lat > -65:
                southern_factor = 1.3
            else:
                southern_factor = 1.0

            wave_height[i, j] = base_height * southern_factor

    # Add spatial variation (low noise to prevent fragmentation)
    rng = np.random.default_rng(123)
    wave_height += rng.normal(0, 0.3, wave_height.shape).astype(np.float32)
    wave_height = np.clip(wave_height, 0.3, 5.5)  # Keep below 6m safety wall

    logger.info(f"Generated synthetic wave data: shape {wave_height.shape}")
    return wave_height


def generate_synthetic_currents() -> tuple[np.ndarray, np.ndarray]:
    """
    Generate synthetic ocean current patterns.
    Models major current systems:
    - Gulf Stream (NW Atlantic, northeastward ~2 knots)
    - Kuroshio (NW Pacific, northeastward ~1.5 knots)
    - Agulhas (SE Africa, southwestward ~1.5 knots)
    - Antarctic Circumpolar (eastward, ~0.5 knots)
    - Equatorial Counter-current (eastward, ~0.5 knots)
    - Trade wind drift (westward, ~0.3 knots)

    Returns:
        (current_u, current_v): Arrays of shape [n_lat, n_lon] in m/s
    """
    lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
    lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)
    n_lat, n_lon = len(lats), len(lons)

    current_u = np.zeros((n_lat, n_lon), dtype=np.float32)
    current_v = np.zeros((n_lat, n_lon), dtype=np.float32)

    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            u, v = 0.0, 0.0

            # --- Gulf Stream ---
            # Runs from ~25°N to ~45°N, along ~80°W to ~40°W
            if 25 <= lat <= 45 and -82 <= lon <= -35:
                # Gaussian intensity based on distance from core
                gs_lat_core = 30 + (lon + 80) * 0.35  # Core shifts north as it goes east
                gs_dist = abs(lat - gs_lat_core)
                if gs_dist < 8:
                    gs_strength = 1.0 * np.exp(-(gs_dist**2) / 18)  # ~1 m/s = ~2 knots peak
                    u += gs_strength * 0.8   # Mostly eastward
                    v += gs_strength * 0.4   # Slightly northward

            # --- Kuroshio Current ---
            # Runs from ~20°N to ~40°N, along ~120°E to ~160°E
            if 20 <= lat <= 40 and 120 <= lon <= 165:
                kc_lat_core = 25 + (lon - 120) * 0.25
                kc_dist = abs(lat - kc_lat_core)
                if kc_dist < 6:
                    kc_strength = 0.75 * np.exp(-(kc_dist**2) / 12)
                    u += kc_strength * 0.8
                    v += kc_strength * 0.3

            # --- Agulhas Current ---
            # Runs southwestward along SE Africa coast
            if -40 <= lat <= -25 and 25 <= lon <= 40:
                ag_strength = 0.8 * np.exp(-((lon - 32)**2) / 30)
                u -= ag_strength * 0.3  # Westward
                v -= ag_strength * 0.7  # Southward

            # --- Antarctic Circumpolar Current ---
            if -65 <= lat <= -45:
                acc_strength = 0.25  # ~0.5 knots
                u += acc_strength  # Eastward

            # --- Trade wind drift (background) ---
            if -25 <= lat <= 25:
                u -= 0.15  # Westward drift

            # --- Equatorial counter-current ---
            if -5 <= lat <= 5:
                u += 0.25  # Eastward

            current_u[i, j] = u
            current_v[i, j] = v

    logger.info(f"Generated synthetic current data: shape {current_u.shape}")
    return current_u, current_v


def _resample_to_grid(data: np.ndarray) -> np.ndarray:
    """
    Resample a GRIB/NetCDF array to match the engine's grid dimensions.

    NOAA products come at various resolutions (0.25°, 0.5°, irregular).
    We resample to our grid using scipy zoom so the graph builder
    can index directly by [lat_idx, lon_idx].
    """
    expected_lat = len(np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION))
    expected_lon = len(np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION))

    if data.shape == (expected_lat, expected_lon):
        return data  # Already correct size

    try:
        from scipy.ndimage import zoom
        lat_ratio = expected_lat / data.shape[0]
        lon_ratio = expected_lon / data.shape[1]
        resampled = zoom(data, (lat_ratio, lon_ratio), order=1)  # bilinear
        logger.info(f"Resampled {data.shape} → {resampled.shape}")
        return resampled.astype(np.float32)
    except Exception as e:
        logger.warning(f"Resampling failed ({e}) — using synthetic fallback")
        return None


def parse_rtofs_netcdf(nc_path: str) -> tuple[np.ndarray, np.ndarray] | None:
    """
    Parse RTOFS NetCDF file to extract surface ocean current U and V.

    RTOFS uses a tripolar grid (not regular lat/lon), so we must extract
    the native 2D lat/lon coordinates and regrid onto our regular grid
    using scipy.interpolate.griddata.

    Returns:
        (current_u, current_v) as numpy arrays on the engine's regular grid,
        or None if parsing fails.
    """
    try:
        import xarray as xr
        from scipy.interpolate import griddata

        ds = xr.open_dataset(nc_path)

        # RTOFS variable names for surface currents
        u_var = None
        v_var = None
        for name in ds.data_vars:
            name_lower = name.lower()
            if "u_velocity" in name_lower or "u_barotropic" in name_lower or name == "u":
                u_var = name
            elif "v_velocity" in name_lower or "v_barotropic" in name_lower or name == "v":
                v_var = name

        if u_var is None or v_var is None:
            # Try common RTOFS diagnostic variable names
            for u_try, v_try in [
                ("u_velocity", "v_velocity"),
                ("water_u", "water_v"),
                ("ssu", "ssv"),
            ]:
                if u_try in ds.data_vars and v_try in ds.data_vars:
                    u_var, v_var = u_try, v_try
                    break

        if u_var is None or v_var is None:
            logger.warning(f"RTOFS variables not found. Available: {list(ds.data_vars)}")
            ds.close()
            return None

        # Extract surface layer (first time step, first depth)
        u_data = ds[u_var]
        v_data = ds[v_var]

        # Squeeze out single-valued dimensions (time, depth)
        if u_data.ndim > 2:
            u_data = u_data.isel({dim: 0 for dim in u_data.dims if dim not in ['lat', 'latitude', 'Latitude', 'Y', 'y', 'lon', 'longitude', 'Longitude', 'X', 'x']})
        if v_data.ndim > 2:
            v_data = v_data.isel({dim: 0 for dim in v_data.dims if dim not in ['lat', 'latitude', 'Latitude', 'Y', 'y', 'lon', 'longitude', 'Longitude', 'X', 'x']})

        u_raw = u_data.values.astype(np.float32)
        v_raw = v_data.values.astype(np.float32)

        # ── Extract native RTOFS 2D coordinate arrays ──
        # RTOFS tripolar grid has 2D lat/lon (not 1D axes)
        lat_2d = None
        lon_2d = None

        # Try to find 2D coordinate arrays
        for coord_name in ['Latitude', 'latitude', 'lat', 'TLAT', 'ULAT', 'nav_lat']:
            if coord_name in ds.coords or coord_name in ds.data_vars:
                arr = ds[coord_name].values
                if arr.ndim == 2:
                    lat_2d = arr
                    break
        for coord_name in ['Longitude', 'longitude', 'lon', 'TLON', 'ULON', 'nav_lon']:
            if coord_name in ds.coords or coord_name in ds.data_vars:
                arr = ds[coord_name].values
                if arr.ndim == 2:
                    lon_2d = arr
                    break

        ds.close()

        if lat_2d is not None and lon_2d is not None:
            logger.info(f"RTOFS tripolar grid detected: {lat_2d.shape}, regridding to regular grid...")

            # Build target regular grid
            target_lats = np.arange(LAT_MIN, LAT_MAX, GRID_RESOLUTION)
            target_lons = np.arange(LON_MIN, LON_MAX, GRID_RESOLUTION)
            target_lon_grid, target_lat_grid = np.meshgrid(target_lons, target_lats)

            # Flatten source coordinates and data (skip NaN)
            flat_lat = lat_2d.ravel()
            flat_lon = lon_2d.ravel()
            flat_u = np.nan_to_num(u_raw.ravel(), nan=0.0)
            flat_v = np.nan_to_num(v_raw.ravel(), nan=0.0)

            # Normalize longitudes to [-180, 180]
            flat_lon = np.where(flat_lon > 180, flat_lon - 360, flat_lon)

            # Filter valid points (skip fill values and extreme values)
            valid = (np.abs(flat_lat) <= 90) & (np.abs(flat_lon) <= 180) & np.isfinite(flat_lat) & np.isfinite(flat_lon)
            src_points = np.column_stack([flat_lat[valid], flat_lon[valid]])

            # Subsample to keep memory manageable (every 4th point)
            step = 4
            src_sub = src_points[::step]
            u_sub = flat_u[valid][::step]
            v_sub = flat_v[valid][::step]

            logger.info(f"Regridding {len(src_sub)} source points → {target_lat_grid.shape} target grid")

            target_points = np.column_stack([target_lat_grid.ravel(), target_lon_grid.ravel()])

            current_u = griddata(src_sub, u_sub, target_points, method='nearest', fill_value=0.0)
            current_v = griddata(src_sub, v_sub, target_points, method='nearest', fill_value=0.0)

            current_u = current_u.reshape(target_lat_grid.shape).astype(np.float32)
            current_v = current_v.reshape(target_lat_grid.shape).astype(np.float32)

            logger.info(f"RTOFS regridded to {current_u.shape} — max current: {np.sqrt(current_u**2 + current_v**2).max():.2f} m/s")
            return current_u, current_v

        else:
            # Fallback: assume regular grid and use simple resampling
            logger.info("RTOFS appears to be on a regular grid, using zoom resampling")
            current_u = np.nan_to_num(u_raw, nan=0.0)
            current_v = np.nan_to_num(v_raw, nan=0.0)
            logger.info(f"Parsed RTOFS currents: shape {current_u.shape}")
            return current_u, current_v

    except ImportError:
        logger.warning("xarray not available for RTOFS parsing")
        return None
    except Exception as e:
        logger.warning(f"RTOFS NetCDF parsing failed: {e}")
        return None


def load_weather_data(grib_paths: dict = None) -> dict:
    """
    Load weather data from GRIB/NetCDF files or generate synthetic data.

    Tries real NOAA data first for each source (wind, waves, currents).
    Falls back to synthetic data for any source that fails.

    Args:
        grib_paths: Dict with paths to downloaded files (from downloader)

    Returns:
        dict with 'wind_u', 'wind_v', 'wave_height', 'current_u', 'current_v'
              as numpy arrays of shape [n_lat, n_lon]
    """
    result = {}
    sources = {}

    # ── WIND (GFS) ──────────────────────────────────────────────────
    grib_wind_loaded = False
    if grib_paths and "gfs" in grib_paths:
        gfs = grib_paths["gfs"]
        if "wind_u_path" in gfs and "wind_v_path" in gfs:
            wind_u = parse_grib_file(gfs["wind_u_path"], "UGRD")
            wind_v = parse_grib_file(gfs["wind_v_path"], "VGRD")
            if wind_u is not None and wind_v is not None:
                # Resample to engine grid if needed
                wind_u = _resample_to_grid(wind_u)
                wind_v = _resample_to_grid(wind_v)
                if wind_u is not None and wind_v is not None:
                    result["wind_u"] = wind_u
                    result["wind_v"] = wind_v
                    grib_wind_loaded = True

    if not grib_wind_loaded:
        logger.info("Using synthetic wind data (GRIB not available)")
        wind_u, wind_v = generate_synthetic_wind()
        result["wind_u"] = wind_u
        result["wind_v"] = wind_v
    sources["Wind"] = "NOAA GFS" if grib_wind_loaded else "synthetic"

    # ── WAVES (WW3) ─────────────────────────────────────────────────
    grib_waves_loaded = False
    if grib_paths and "ww3" in grib_paths:
        ww3 = grib_paths["ww3"]
        if "wave_height_path" in ww3:
            wave_h = parse_grib_file(ww3["wave_height_path"], "HTSGW")
            if wave_h is not None:
                wave_h = _resample_to_grid(wave_h)
                if wave_h is not None:
                    # Replace NaN (land cells) with 0
                    wave_h = np.nan_to_num(wave_h, nan=0.0)
                    result["wave_height"] = wave_h
                    grib_waves_loaded = True

    if not grib_waves_loaded:
        logger.info("Using synthetic wave data (WW3 GRIB not available)")
        result["wave_height"] = generate_synthetic_waves()
    sources["Waves"] = "NOAA WW3" if grib_waves_loaded else "synthetic"

    # ── CURRENTS (RTOFS) ────────────────────────────────────────────
    rtofs_loaded = False
    if grib_paths and "rtofs" in grib_paths:
        rtofs = grib_paths["rtofs"]
        if "rtofs_nc_path" in rtofs:
            parsed = parse_rtofs_netcdf(rtofs["rtofs_nc_path"])
            if parsed is not None:
                current_u, current_v = parsed
                current_u = _resample_to_grid(current_u)
                current_v = _resample_to_grid(current_v)
                if current_u is not None and current_v is not None:
                    result["current_u"] = current_u
                    result["current_v"] = current_v
                    rtofs_loaded = True

    if not rtofs_loaded:
        logger.info("Using synthetic current data (RTOFS not available)")
        current_u, current_v = generate_synthetic_currents()
        result["current_u"] = current_u
        result["current_v"] = current_v
    sources["Currents"] = "NOAA RTOFS" if rtofs_loaded else "synthetic"

    # ── Log summary ─────────────────────────────────────────────────
    source_str = ", ".join(f"{k}: {v}" for k, v in sources.items())
    logger.info(f"Weather data loaded — {source_str}")

    return result
