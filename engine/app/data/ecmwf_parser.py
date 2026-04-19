"""
ECMWF Open Data Downloader & Parser — using the official ecmwf-opendata package

Downloads ECMWF HRES IFS + WAM forecast data (free, CC-BY 4.0).

HRES step schedule (00Z / 12Z runs):
  - 0 to 144h  at 3h intervals  (48 steps)
  - 144 to 240h at 6h intervals (17 steps)
  - Total: ~65 steps covering 10 days

We use a practical subset at 6h resolution for 0–240h = 41 steps.
This matches our ForecastStore ECMWF grid and is well within availability.

Parameters downloaded:
  IFS atmosphere (stream="oper"):
    10u — 10m U wind component (m/s)
    10v — 10m V wind component (m/s)
    msl — Mean sea level pressure (Pa)

  WAM waves (stream="wave"):
    swh — Significant wave height (m)
    mwp — Mean wave period (s)
    mwd — Mean wave direction (degrees)

Ocean currents and ice remain NOAA-sourced (superior data, no ECMWF equivalent).
"""

import os
import logging
import numpy as np
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ECMWF HRES step schedule at 6h resolution for 0-240h (10 days)
# Avoids the 3h steps (not needed for maritime routing) and stays within HRES limits
ECMWF_STEPS_6H = list(range(0, 241, 6))  # [0, 6, 12, ..., 240] — 41 steps, 10 days


class ECMWFStore:
    """
    In-memory store for ECMWF HRES IFS + WAM forecast data.

    Covers 10 days (0–240h at 6h steps = 41 steps) at 0.25° resolution.
    Loaded using the official ecmwf-opendata Python package (no manual URL building).

    Variables:
        IFS atmosphere:  wind_u, wind_v, pressure
        WAM waves:       wave_height, wave_period, wave_direction
    """

    def __init__(self, n_lat: int, n_lon: int):
        self.n_lat = n_lat
        self.n_lon = n_lon
        self.n_steps = len(ECMWF_STEPS_6H)
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
        self.wave_height: Optional[np.ndarray] = None    # m
        self.wave_period: Optional[np.ndarray] = None    # s
        self.wave_direction: Optional[np.ndarray] = None # degrees
        self.swell_height: Optional[np.ndarray] = None   # Not in ECMWF free tier (only combined SWH)

    def load(self, ecmwf_dir: str) -> bool:
        """
        Download ECMWF HRES data using the ecmwf-opendata package and parse into arrays.

        Downloads two GRIB2 files:
          1. ecmwf_atm.grib2  — IFS: 10u, 10v, msl (all steps, all params in one file)
          2. ecmwf_wave.grib2 — WAM: swh, mwp, mwd (all steps, all params in one file)

        Returns True if at least wind + wave height were loaded.
        """
        try:
            from ecmwf.opendata import Client
        except ImportError:
            logger.warning("ecmwf-opendata package not installed — skipping ECMWF")
            return False

        os.makedirs(ecmwf_dir, exist_ok=True)

        atm_path = os.path.join(ecmwf_dir, "ecmwf_atm_latest.grib2")
        wave_path = os.path.join(ecmwf_dir, "ecmwf_wave_latest.grib2")

        # Use AWS mirror for reliability (ECMWF direct has 500-connection limit)
        client = Client(source="aws", model="ifs", resol="0p25")

        # ── Download IFS atmosphere ──────────────────────────────────────
        logger.info("🌍 Downloading ECMWF HRES atmosphere (IFS: wind + pressure)...")
        atm_ok = False
        try:
            result = client.retrieve(
                type="fc",
                step=ECMWF_STEPS_6H,
                param=["10u", "10v", "msl"],
                target=atm_path,
            )
            cycle_dt = result.datetime if hasattr(result, "datetime") else None
            if cycle_dt:
                self.cycle_timestamp = cycle_dt.replace(tzinfo=timezone.utc) if cycle_dt.tzinfo is None else cycle_dt
                self.cycle_date = self.cycle_timestamp.strftime("%Y%m%d")
                self.cycle_run = self.cycle_timestamp.strftime("%H")

            logger.info(f"  ✅ IFS atmosphere downloaded: {atm_path}")
            atm_ok = True
        except Exception as e:
            logger.warning(f"  ⚠️  IFS atmosphere download failed: {e}")
            # Try removing stale file if it exists
            if os.path.exists(atm_path):
                try:
                    os.remove(atm_path)
                except OSError:
                    pass

        # ── Download WAM waves ──────────────────────────────────────────
        logger.info("🌊 Downloading ECMWF HRES wave model (WAM: swh + period + direction)...")
        wave_ok = False
        try:
            client.retrieve(
                type="fc",
                stream="wave",
                step=ECMWF_STEPS_6H,
                param=["swh", "mwp", "mwd"],
                target=wave_path,
            )
            logger.info(f"  ✅ WAM waves downloaded: {wave_path}")
            wave_ok = True
        except Exception as e:
            logger.warning(f"  ⚠️  WAM wave download failed: {e}")
            if os.path.exists(wave_path):
                try:
                    os.remove(wave_path)
                except OSError:
                    pass

        if not atm_ok and not wave_ok:
            logger.warning("ECMWF: Both atmosphere and wave downloads failed")
            return False

        # ── Build timestamps ─────────────────────────────────────────────
        if self.cycle_timestamp:
            from datetime import timedelta
            self.timestamps = [
                (self.cycle_timestamp + timedelta(hours=h)).isoformat()
                for h in ECMWF_STEPS_6H
            ]
        else:
            # Fallback: use "now" as approximate cycle time
            now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
            self.cycle_timestamp = now
            self.cycle_date = now.strftime("%Y%m%d")
            self.cycle_run = now.strftime("%H")
            from datetime import timedelta
            self.timestamps = [
                (now + timedelta(hours=h)).isoformat()
                for h in ECMWF_STEPS_6H
            ]

        # ── Parse atmosphere GRIB2 ───────────────────────────────────────
        if atm_ok and os.path.exists(atm_path):
            wind_u, wind_v, pressure = self._parse_atmosphere(atm_path)
            if wind_u is not None:
                self.wind_u = wind_u
                self.wind_v = wind_v
                logger.info(f"  ✅ IFS wind parsed: {wind_u.shape}")
            if pressure is not None:
                self.pressure = pressure
                logger.info(f"  ✅ IFS pressure parsed: {pressure.shape}")

        # ── Parse wave GRIB2 ─────────────────────────────────────────────
        if wave_ok and os.path.exists(wave_path):
            swh, mwp, mwd = self._parse_waves(wave_path)
            if swh is not None:
                self.wave_height = swh
                logger.info(f"  ✅ WAM wave height parsed: {swh.shape}")
            if mwp is not None:
                self.wave_period = mwp
            if mwd is not None:
                self.wave_direction = mwd

        # ── Ready check ──────────────────────────────────────────────────
        has_wind = self.wind_u is not None and self.wind_v is not None
        has_waves = self.wave_height is not None

        if has_wind or has_waves:
            self.is_ready = True
            logger.info(
                f"✅ ECMWFStore ready — wind={'✓' if has_wind else '✗'}, "
                f"waves={'✓' if has_waves else '✗'}, "
                f"steps={self.n_steps}, grid={self.n_lat}×{self.n_lon}, "
                f"cycle={self.cycle_date}/{self.cycle_run}Z"
            )
            return True
        else:
            logger.warning("ECMWF: Parsed but got no usable data arrays")
            return False

    def _parse_atmosphere(
        self, grib_path: str
    ) -> tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Parse IFS atmosphere GRIB2 file.
        Returns (wind_u, wind_v, pressure) as (n_steps, n_lat, n_lon) arrays.
        """
        try:
            import xarray as xr

            n_steps = len(ECMWF_STEPS_6H)
            wind_u_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
            wind_v_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
            press_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)

            u_loaded = v_loaded = p_loaded = 0

            for param, short in [("10u", "u10"), ("10v", "v10"), ("msl", "msl")]:
                try:
                    ds = xr.open_dataset(
                        grib_path,
                        engine="cfgrib",
                        indexpath=None,
                        backend_kwargs={"filter_by_keys": {"shortName": param}},
                    )
                    # Dimension: (step, latitude, longitude) or (valid_time, lat, lon)
                    var = list(ds.data_vars)[0]
                    data = ds[var].values.astype(np.float32)
                    ds.close()

                    # Squeeze out singleton dims
                    if data.ndim == 4:
                        data = data.squeeze(axis=0)

                    # data shape: (n_steps_in_file, n_lat_src, n_lon_src)
                    data_steps = data.shape[0] if data.ndim == 3 else 1
                    if data.ndim == 2:
                        data = data[np.newaxis, ...]

                    # Resample spatial grid if needed
                    if data.shape[1] != self.n_lat or data.shape[2] != self.n_lon:
                        from scipy.ndimage import zoom
                        lat_r = self.n_lat / data.shape[1]
                        lon_r = self.n_lon / data.shape[2]
                        resampled = np.zeros((data.shape[0], self.n_lat, self.n_lon), dtype=np.float32)
                        for i in range(data.shape[0]):
                            resampled[i] = zoom(data[i], (lat_r, lon_r), order=1).astype(np.float32)
                        data = resampled

                    # Map ECMWF steps to our step indices
                    steps_to_copy = min(data_steps, n_steps)
                    data = np.nan_to_num(data, nan=0.0)

                    if param == "10u":
                        wind_u_arr[:steps_to_copy] = data[:steps_to_copy]
                        u_loaded = steps_to_copy
                    elif param == "10v":
                        wind_v_arr[:steps_to_copy] = data[:steps_to_copy]
                        v_loaded = steps_to_copy
                    elif param == "msl":
                        press_arr[:steps_to_copy] = data[:steps_to_copy]
                        p_loaded = steps_to_copy

                except Exception as e:
                    logger.debug(f"  IFS {param} parse failed: {e}")

            wind_u = wind_u_arr if u_loaded > 0 else None
            wind_v = wind_v_arr if v_loaded > 0 else None
            pressure = press_arr if p_loaded > 0 else None
            return wind_u, wind_v, pressure

        except Exception as e:
            logger.warning(f"IFS atmosphere parse error: {e}")
            return None, None, None

    def _parse_waves(
        self, grib_path: str
    ) -> tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Parse WAM wave GRIB2 file.
        Returns (swh, mwp, mwd) as (n_steps, n_lat, n_lon) arrays.
        """
        try:
            import xarray as xr

            n_steps = len(ECMWF_STEPS_6H)
            swh_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
            mwp_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)
            mwd_arr = np.zeros((n_steps, self.n_lat, self.n_lon), dtype=np.float32)

            swh_loaded = mwp_loaded = mwd_loaded = 0

            for param in ["swh", "mwp", "mwd"]:
                try:
                    ds = xr.open_dataset(
                        grib_path,
                        engine="cfgrib",
                        indexpath=None,
                        backend_kwargs={"filter_by_keys": {"shortName": param}},
                    )
                    var = list(ds.data_vars)[0]
                    data = ds[var].values.astype(np.float32)
                    ds.close()

                    if data.ndim == 4:
                        data = data.squeeze(axis=0)
                    if data.ndim == 2:
                        data = data[np.newaxis, ...]

                    data_steps = data.shape[0]

                    if data.shape[1] != self.n_lat or data.shape[2] != self.n_lon:
                        from scipy.ndimage import zoom
                        lat_r = self.n_lat / data.shape[1]
                        lon_r = self.n_lon / data.shape[2]
                        resampled = np.zeros((data.shape[0], self.n_lat, self.n_lon), dtype=np.float32)
                        for i in range(data.shape[0]):
                            resampled[i] = zoom(data[i], (lat_r, lon_r), order=1).astype(np.float32)
                        data = resampled

                    steps_to_copy = min(data_steps, n_steps)
                    data = np.nan_to_num(data, nan=0.0)

                    if param == "swh":
                        swh_arr[:steps_to_copy] = data[:steps_to_copy]
                        swh_loaded = steps_to_copy
                    elif param == "mwp":
                        mwp_arr[:steps_to_copy] = data[:steps_to_copy]
                        mwp_loaded = steps_to_copy
                    elif param == "mwd":
                        mwd_arr[:steps_to_copy] = data[:steps_to_copy]
                        mwd_loaded = steps_to_copy

                except Exception as e:
                    logger.debug(f"  WAM {param} parse failed: {e}")

            swh = swh_arr if swh_loaded > 0 else None
            mwp = mwp_arr if mwp_loaded > 0 else None
            mwd = mwd_arr if mwd_loaded > 0 else None
            return swh, mwp, mwd

        except Exception as e:
            logger.warning(f"WAM wave parse error: {e}")
            return None, None, None
