"""
ECMWF Open Data Downloader & Parser

Downloads ECMWF IFS + WAM GRIB2 files for the full 15-day forecast window.
Data is free under CC-BY 4.0 (attribution required).

Strategy:
  - Primary atmospheric model: ECMWF IFS (better than GFS beyond day 5)
  - Primary wave model:        ECMWF WAM (forced by IFS winds — more accurate medium-range)
  - Ocean currents:            NOAA RTOFS (no free ECMWF equivalent)
  - Ice:                       USNIC + IIP (no ECMWF equivalent)

ECMWF Open Data provides:
  - Wind: 10m U and V components (10u, 10v)
  - MSLP: Mean sea level pressure (msl)
  - Waves: Significant wave height (swh), mean wave period (mwp), mean wave direction (mwd)
  - Swell: Significant height of swell waves (shts)

Resolution: 0.25° global grid (same as GFS), updated twice daily (00Z, 12Z)

See: https://www.ecmwf.int/en/forecasts/datasets/open-data
"""

import os
import logging
import numpy as np
from datetime import datetime, timedelta, timezone
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

# ECMWF Open Data parameters we need
# IFS atmosphere
ECMWF_ATM_PARAMS = ["10u", "10v", "msl"]  # wind U, wind V, mean sea level pressure
# WAM wave model
ECMWF_WAVE_PARAMS = ["swh", "mwp", "mwd", "shts"]  # sig wave height, period, direction, swell

# ECMWF Open Data step hours (6h resolution, 15 days)
ECMWF_STEPS = list(range(0, 361, 6))  # [0, 6, 12, ..., 360]


def _get_latest_ecmwf_run() -> tuple[str, str]:
    """
    Determine the most recent available ECMWF run.

    ECMWF runs at 00Z and 12Z. Data becomes available ~6h after the run start.
    We conservatively pick the run that was available at least 6 hours ago.

    Returns:
        (date_str, run_str) e.g. ("20260419", "12")
    """
    now = datetime.now(timezone.utc)
    # Check which run is safely available (6h lag)
    available_time = now - timedelta(hours=6)
    run_hour = 12 if available_time.hour >= 12 else 0

    # If we're in the early hours of the day and 12Z from yesterday is safer, use it
    if available_time.hour < 6:
        available_time = available_time - timedelta(days=1)
        run_hour = 12

    date_str = available_time.strftime("%Y%m%d")
    run_str = f"{run_hour:02d}"
    return date_str, run_str


def _build_ecmwf_url(date_str: str, run_str: str, step: int, param: str, stream: str = "oper") -> str:
    """
    Build ECMWF Open Data GRIB2 download URL.

    URL pattern: https://data.ecmwf.int/forecasts/{date}/{run}z/{resolution}/{stream}/{type}/
                 {date}{run}0000-{step}h-{stream}-{type}.grib2

    Args:
        date_str: "20260419"
        run_str:  "00" or "12"
        step:     forecast hour (0, 6, 12, ... 360)
        param:    parameter name ("swh", "10u", etc.)
        stream:   "oper" (atmosphere) or "wave" (WAM)
    """
    # Atmospheric stream uses "fc" type, wave stream uses "fc" as well
    type_str = "fc"
    resolution = "0p25"

    base = f"https://data.ecmwf.int/forecasts/{date_str}/{run_str}z/{resolution}/{stream}/{type_str}"
    filename = f"{date_str}{run_str}0000-{step}h-{stream}-{type_str}.grib2"
    return f"{base}/{filename}"


def download_ecmwf_grib(
    date_str: str,
    run_str: str,
    step: int,
    param: str,
    stream: str,
    output_dir: str,
) -> Optional[str]:
    """
    Download a single ECMWF GRIB2 file for one parameter at one forecast step.
    Uses index files to extract only the needed parameter (saves bandwidth).

    Returns path to downloaded file, or None on failure.
    """
    import requests

    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"ecmwf_{date_str}_{run_str}_{param}_f{step:03d}.grib2")

    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        return out_path  # Already cached

    url = _build_ecmwf_url(date_str, run_str, step, param, stream)

    try:
        resp = requests.get(url, timeout=30, stream=True)
        if resp.status_code == 404:
            logger.debug(f"ECMWF file not found: {url}")
            return None
        resp.raise_for_status()

        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                f.write(chunk)

        return out_path

    except Exception as e:
        logger.debug(f"ECMWF download failed (step={step}, param={param}): {e}")
        # Clean up partial file
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except OSError:
                pass
        return None


def parse_ecmwf_grib_field(file_path: str, param: str, n_lat: int, n_lon: int) -> Optional[np.ndarray]:
    """
    Parse a single ECMWF GRIB2 file and extract the requested parameter
    as a 2D (lat, lon) numpy array resampled to the engine grid.
    """
    try:
        import xarray as xr
        from scipy.ndimage import zoom

        # ECMWF GRIB2 uses cfgrib backend (same as NOAA)
        ds = xr.open_dataset(file_path, engine="cfgrib", errors="ignore")
        if not ds.data_vars:
            ds.close()
            return None

        var_name = list(ds.data_vars)[0]
        data = ds[var_name].values.astype(np.float32)
        ds.close()

        # Handle 2D or squeezed arrays
        if data.ndim > 2:
            data = data.squeeze()
        if data.ndim != 2:
            return None

        # Resample to engine grid if shape differs
        if data.shape != (n_lat, n_lon):
            lat_ratio = n_lat / data.shape[0]
            lon_ratio = n_lon / data.shape[1]
            data = zoom(data, (lat_ratio, lon_ratio), order=1).astype(np.float32)

        data = np.nan_to_num(data, nan=0.0)
        return data

    except Exception as e:
        logger.debug(f"ECMWF parse failed for {param}: {e}")
        return None


class ECMWFStore:
    """
    In-memory store for ECMWF IFS + WAM forecast data.

    Covers 15 days (0–360h at 6h steps = 61 steps) at 0.25° resolution.

    Variables:
        Atmosphere (IFS):
          wind_u, wind_v  — 10m wind U/V components (m/s)
          pressure        — Mean sea level pressure (Pa → hPa)
        Waves (WAM):
          wave_height     — Significant wave height (m)
          wave_period     — Mean wave period (s)
          wave_direction  — Mean wave direction (degrees)
          swell_height    — Significant swell height (m)

    Ocean currents and ice remain NOAA-sourced (better data).
    """

    def __init__(self, n_lat: int, n_lon: int):
        self.n_lat = n_lat
        self.n_lon = n_lon
        self.n_steps = len(ECMWF_STEPS)
        self.is_ready = False

        self.cycle_date: str = ""
        self.cycle_run: str = ""
        self.cycle_timestamp: Optional[datetime] = None
        self.timestamps: list[str] = []

        # Atmosphere (IFS)
        self.wind_u: Optional[np.ndarray] = None    # (n_steps, n_lat, n_lon) m/s
        self.wind_v: Optional[np.ndarray] = None
        self.pressure: Optional[np.ndarray] = None  # Pa

        # Waves (WAM)
        self.wave_height: Optional[np.ndarray] = None    # (n_steps, n_lat, n_lon) m
        self.wave_period: Optional[np.ndarray] = None    # s
        self.wave_direction: Optional[np.ndarray] = None # degrees
        self.swell_height: Optional[np.ndarray] = None   # m

    def build_timestamps(self, date_str: str, run_str: str):
        self.cycle_date = date_str
        self.cycle_run = run_str
        base = datetime.strptime(f"{date_str}{run_str}", "%Y%m%d%H").replace(tzinfo=timezone.utc)
        self.cycle_timestamp = base
        self.timestamps = [
            (base + timedelta(hours=h)).isoformat()
            for h in ECMWF_STEPS
        ]

    def load(self, ecmwf_dir: str, max_workers: int = 6) -> bool:
        """
        Download and parse all ECMWF GRIB files into memory.
        Returns True if at least wave + wind data was loaded successfully.
        """
        date_str, run_str = _get_latest_ecmwf_run()
        self.build_timestamps(date_str, run_str)

        logger.info(f"🌍 Downloading ECMWF Open Data — {date_str}/{run_str}Z (15-day forecast)")

        n_steps = len(ECMWF_STEPS)
        wind_u_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
        wind_v_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
        pressure_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
        wave_h_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
        wave_p_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
        wave_d_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
        swell_h_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)

        # Track which steps loaded successfully
        atm_loaded = set()
        wave_loaded = set()

        def _download_and_parse_step(step_idx: int, step_h: int):
            """Download and parse all parameters for one forecast step."""
            results = {}

            # Atmosphere (IFS stream = "oper")
            for param in ["10u", "10v", "msl"]:
                path = download_ecmwf_grib(date_str, run_str, step_h, param, "oper", ecmwf_dir)
                if path:
                    arr = parse_ecmwf_grib_field(path, param, self.n_lat, self.n_lon)
                    if arr is not None:
                        results[param] = arr

            # Waves (WAM stream = "wave")
            for param in ["swh", "mwp", "mwd", "shts"]:
                path = download_ecmwf_grib(date_str, run_str, step_h, param, "wave", ecmwf_dir)
                if path:
                    arr = parse_ecmwf_grib_field(path, param, self.n_lat, self.n_lon)
                    if arr is not None:
                        results[param] = arr

            return step_idx, step_h, results

        # Parallel download of all 61 steps
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(_download_and_parse_step, idx, h): (idx, h)
                for idx, h in enumerate(ECMWF_STEPS)
            }

            for future in as_completed(futures):
                try:
                    step_idx, step_h, results = future.result()

                    if "10u" in results:
                        wind_u_arr[step_idx] = results["10u"]
                    if "10v" in results:
                        wind_v_arr[step_idx] = results["10v"]
                    if "msl" in results:
                        pressure_arr[step_idx] = results["msl"]
                    if "10u" in results and "10v" in results:
                        atm_loaded.add(step_idx)

                    if "swh" in results:
                        wave_h_arr[step_idx] = results["swh"]
                    if "mwp" in results:
                        wave_p_arr[step_idx] = results["mwp"]
                    if "mwd" in results:
                        wave_d_arr[step_idx] = results["mwd"]
                    if "shts" in results:
                        swell_h_arr[step_idx] = results["shts"]
                    if "swh" in results:
                        wave_loaded.add(step_idx)

                except Exception as e:
                    logger.warning(f"ECMWF step failed: {e}")

        # Accept if we got at least 20 steps with data (sufficient for medium-range)
        if len(atm_loaded) >= 20 and len(wave_loaded) >= 20:
            self.wind_u = wind_u_arr
            self.wind_v = wind_v_arr
            self.pressure = pressure_arr
            self.wave_height = wave_h_arr
            self.wave_period = wave_p_arr
            self.wave_direction = wave_d_arr
            self.swell_height = swell_h_arr
            self.is_ready = True
            logger.info(
                f"✅ ECMWF loaded: {len(atm_loaded)}/{n_steps} atm steps, "
                f"{len(wave_loaded)}/{n_steps} wave steps — "
                f"cycle {date_str}/{run_str}Z"
            )
            return True
        else:
            logger.warning(
                f"⚠️  ECMWF insufficient data: {len(atm_loaded)} atm, {len(wave_loaded)} wave steps. "
                f"Falling back to NOAA GFS/WW3 for full forecast."
            )
            return False

    def get_at_step(self, step_idx: int, lat_idx: int, lon_idx: int) -> dict:
        """
        Return weather values at a specific forecast step and grid cell.
        Used by ForecastStore.blend_with_ecmwf().
        """
        if not self.is_ready or step_idx >= self.n_steps:
            return {}

        def _safe(arr):
            if arr is None:
                return 0.0
            try:
                v = float(arr[step_idx, lat_idx, lon_idx])
                return 0.0 if (np.isnan(v) or np.isinf(v)) else round(v, 3)
            except (IndexError, TypeError):
                return 0.0

        wind_u = _safe(self.wind_u)
        wind_v = _safe(self.wind_v)
        pressure_pa = _safe(self.pressure)

        return {
            "wind_u": wind_u,
            "wind_v": wind_v,
            "pressure_hpa": round(pressure_pa / 100 if pressure_pa > 10000 else pressure_pa, 1),
            "wave_height_m": _safe(self.wave_height),
            "wave_period_s": _safe(self.wave_period),
            "wave_direction_deg": _safe(self.wave_direction),
            "swell_height_m": _safe(self.swell_height),
        }
