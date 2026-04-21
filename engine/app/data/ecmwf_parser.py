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


# ═══════════════════════════════════════════════════════════════════
#  ECMWF ENSEMBLE (ENS) — 51 members → P10/P50/P90 percentiles
# ═══════════════════════════════════════════════════════════════════

# ENS step schedule — coarser than HRES to keep download manageable
# 0-144h at 6h, 144-240h at 12h = 29 steps (vs 41 for HRES)
ENS_STEPS = list(range(0, 145, 6)) + list(range(156, 241, 12))  # 29 steps


class ECMWFEnsembleStore:
    """
    ECMWF Ensemble (ENS) — 51 perturbed members for uncertainty estimation.
    
    Downloads wave height (swh) and wind (10u, 10v) from all 51 ENS members.
    Computes P10, P50, P90 percentiles for each grid cell at each forecast step.
    
    This is what separates "weather display" from "weather intelligence":
    "Wave height will be 2-4m (most likely 3m)" vs just "3m"
    
    Data size: ~500MB per cycle (wave + wind, 51 members, 29 steps, 0.25°)
    """
    
    def __init__(self, n_lat: int, n_lon: int):
        self.n_lat = n_lat
        self.n_lon = n_lon
        self.n_steps = len(ENS_STEPS)
        self.is_ready = False
        
        self.cycle_timestamp: Optional[datetime] = None
        self.timestamps: list[str] = []
        
        # Percentile arrays — shape: (n_steps, n_lat, n_lon)
        self.wave_height_p10: Optional[np.ndarray] = None
        self.wave_height_p50: Optional[np.ndarray] = None
        self.wave_height_p90: Optional[np.ndarray] = None
        
        self.wind_speed_p10: Optional[np.ndarray] = None
        self.wind_speed_p50: Optional[np.ndarray] = None
        self.wind_speed_p90: Optional[np.ndarray] = None
    
    def load(self, ecmwf_dir: str, cycle_timestamp: Optional[datetime] = None) -> bool:
        """
        Download ECMWF ENS data and compute percentiles.
        
        Downloads 51 perturbed forecast members for:
          - swh (significant wave height) from ENS wave stream
          - 10u/10v (wind) from ENS atmospheric stream
        
        Then computes P10, P50, P90 across all 51 members.
        
        Returns True if at least wave percentiles were computed.
        """
        try:
            from ecmwf.opendata import Client
        except ImportError:
            logger.warning("ecmwf-opendata package not installed — skipping ENS")
            return False
        
        os.makedirs(ecmwf_dir, exist_ok=True)
        
        # Use the same cycle as HRES
        if cycle_timestamp:
            self.cycle_timestamp = cycle_timestamp
        
        client = Client(source="aws", model="ifs", resol="0p25")
        
        # ── Download ENS wave (51 members × swh) ──
        ens_wave_path = os.path.join(ecmwf_dir, "ecmwf_ens_wave.grib2")
        wave_ok = False
        logger.info("🌊 Downloading ECMWF ENS wave (51 members × swh)...")
        try:
            client.retrieve(
                type="pf",           # perturbed forecast (ensemble)
                stream="wave",
                step=ENS_STEPS,
                param=["swh"],
                target=ens_wave_path,
            )
            logger.info(f"  ✅ ENS wave downloaded: {ens_wave_path}")
            wave_ok = True
        except Exception as e:
            logger.warning(f"  ⚠️  ENS wave download failed: {e}")
        
        # ── Download ENS wind (51 members × 10u, 10v) ──
        ens_wind_path = os.path.join(ecmwf_dir, "ecmwf_ens_wind.grib2")
        wind_ok = False
        logger.info("💨 Downloading ECMWF ENS wind (51 members × 10u, 10v)...")
        try:
            client.retrieve(
                type="pf",           # perturbed forecast (ensemble)
                step=ENS_STEPS,
                param=["10u", "10v"],
                target=ens_wind_path,
            )
            logger.info(f"  ✅ ENS wind downloaded: {ens_wind_path}")
            wind_ok = True
        except Exception as e:
            logger.warning(f"  ⚠️  ENS wind download failed: {e}")
        
        if not wave_ok and not wind_ok:
            logger.warning("ENS: Both wave and wind downloads failed")
            return False
        
        # ── Build timestamps ──
        if self.cycle_timestamp:
            from datetime import timedelta
            self.timestamps = [
                (self.cycle_timestamp + timedelta(hours=h)).isoformat()
                for h in ENS_STEPS
            ]
        
        # ── Parse and compute percentiles ──
        if wave_ok and os.path.exists(ens_wave_path):
            try:
                p10, p50, p90 = self._compute_percentiles_wave(ens_wave_path)
                if p10 is not None:
                    self.wave_height_p10 = p10
                    self.wave_height_p50 = p50
                    self.wave_height_p90 = p90
                    logger.info(f"  ✅ ENS wave percentiles computed: {p10.shape}")
            except Exception as e:
                logger.warning(f"  ENS wave percentile computation failed: {e}")
        
        if wind_ok and os.path.exists(ens_wind_path):
            try:
                p10, p50, p90 = self._compute_percentiles_wind(ens_wind_path)
                if p10 is not None:
                    self.wind_speed_p10 = p10
                    self.wind_speed_p50 = p50
                    self.wind_speed_p90 = p90
                    logger.info(f"  ✅ ENS wind percentiles computed: {p10.shape}")
            except Exception as e:
                logger.warning(f"  ENS wind percentile computation failed: {e}")
        
        has_wave_ens = self.wave_height_p10 is not None
        has_wind_ens = self.wind_speed_p10 is not None
        
        if has_wave_ens or has_wind_ens:
            self.is_ready = True
            logger.info(
                f"✅ ENS ready — wave_ens={'✓' if has_wave_ens else '✗'}, "
                f"wind_ens={'✓' if has_wind_ens else '✗'}, "
                f"steps={self.n_steps}"
            )
            return True
        
        return False
    
    def _compute_percentiles_wave(
        self, grib_path: str
    ) -> tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Parse ENS wave GRIB and compute P10/P50/P90 across all 51 members.
        
        GRIB structure: (number[51], step[29], latitude, longitude)
        """
        try:
            import xarray as xr
            
            ds = xr.open_dataset(
                grib_path,
                engine="cfgrib",
                indexpath=None,
                backend_kwargs={"filter_by_keys": {"shortName": "swh"}},
            )
            
            var = list(ds.data_vars)[0]
            data = ds[var].values.astype(np.float32)
            ds.close()
            
            data = np.nan_to_num(data, nan=0.0)
            
            # Expected shape: (n_members, n_steps, n_lat, n_lon) or (n_steps, n_lat, n_lon) if squeezed
            if data.ndim == 3:
                # Single member or squeezed — no ensemble available
                logger.warning("ENS wave: got 3D data (no ensemble dimension)")
                return None, None, None
            
            if data.ndim == 4:
                # (n_members, n_steps, n_lat_src, n_lon_src)
                n_members = data.shape[0]
                logger.info(f"  ENS wave: {n_members} members × {data.shape[1]} steps × {data.shape[2]}×{data.shape[3]}")
                
                # Resample spatial grid if needed
                if data.shape[2] != self.n_lat or data.shape[3] != self.n_lon:
                    from scipy.ndimage import zoom
                    lat_r = self.n_lat / data.shape[2]
                    lon_r = self.n_lon / data.shape[3]
                    resampled = np.zeros((n_members, data.shape[1], self.n_lat, self.n_lon), dtype=np.float32)
                    for m in range(n_members):
                        for s in range(data.shape[1]):
                            resampled[m, s] = zoom(data[m, s], (lat_r, lon_r), order=1).astype(np.float32)
                    data = resampled
                
                # Compute percentiles across member axis (axis=0)
                n_steps_actual = min(data.shape[1], self.n_steps)
                p10 = np.percentile(data[:, :n_steps_actual], 10, axis=0).astype(np.float32)
                p50 = np.percentile(data[:, :n_steps_actual], 50, axis=0).astype(np.float32)
                p90 = np.percentile(data[:, :n_steps_actual], 90, axis=0).astype(np.float32)
                
                return p10, p50, p90
            
            return None, None, None
            
        except Exception as e:
            logger.warning(f"ENS wave percentile error: {e}")
            return None, None, None
    
    def _compute_percentiles_wind(
        self, grib_path: str
    ) -> tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Parse ENS wind GRIB and compute wind SPEED P10/P50/P90.
        
        Downloads U and V components, computes speed = sqrt(u² + v²),
        then takes percentiles across 51 members.
        """
        try:
            import xarray as xr
            
            # Parse U component
            ds_u = xr.open_dataset(
                grib_path,
                engine="cfgrib",
                indexpath=None,
                backend_kwargs={"filter_by_keys": {"shortName": "10u"}},
            )
            u_data = ds_u[list(ds_u.data_vars)[0]].values.astype(np.float32)
            ds_u.close()
            
            # Parse V component
            ds_v = xr.open_dataset(
                grib_path,
                engine="cfgrib",
                indexpath=None,
                backend_kwargs={"filter_by_keys": {"shortName": "10v"}},
            )
            v_data = ds_v[list(ds_v.data_vars)[0]].values.astype(np.float32)
            ds_v.close()
            
            u_data = np.nan_to_num(u_data, nan=0.0)
            v_data = np.nan_to_num(v_data, nan=0.0)
            
            if u_data.ndim != 4 or v_data.ndim != 4:
                logger.warning(f"ENS wind: unexpected dims u={u_data.ndim}, v={v_data.ndim}")
                return None, None, None
            
            # Compute wind speed (m/s → knots) per member
            speed_data = np.sqrt(u_data**2 + v_data**2) * 1.94384  # knots
            
            n_members = speed_data.shape[0]
            logger.info(f"  ENS wind: {n_members} members × {speed_data.shape[1]} steps")
            
            # Resample spatial grid if needed
            if speed_data.shape[2] != self.n_lat or speed_data.shape[3] != self.n_lon:
                from scipy.ndimage import zoom
                lat_r = self.n_lat / speed_data.shape[2]
                lon_r = self.n_lon / speed_data.shape[3]
                resampled = np.zeros((n_members, speed_data.shape[1], self.n_lat, self.n_lon), dtype=np.float32)
                for m in range(n_members):
                    for s in range(speed_data.shape[1]):
                        resampled[m, s] = zoom(speed_data[m, s], (lat_r, lon_r), order=1).astype(np.float32)
                speed_data = resampled
            
            # Compute percentiles across member axis
            n_steps_actual = min(speed_data.shape[1], self.n_steps)
            p10 = np.percentile(speed_data[:, :n_steps_actual], 10, axis=0).astype(np.float32)
            p50 = np.percentile(speed_data[:, :n_steps_actual], 50, axis=0).astype(np.float32)
            p90 = np.percentile(speed_data[:, :n_steps_actual], 90, axis=0).astype(np.float32)
            
            return p10, p50, p90
            
        except Exception as e:
            logger.warning(f"ENS wind percentile error: {e}")
            return None, None, None
    
    def get_percentiles_at(self, lat: float, lon: float) -> dict:
        """
        Extract ensemble percentiles at a specific coordinate.
        
        Returns time series of P10/P50/P90 for wave height and wind speed.
        """
        if not self.is_ready:
            return {"ensemble_available": False}
        
        from app.config import LAT_MIN, LON_MIN, FORECAST_RESOLUTION
        
        lat_idx = int(round((lat - LAT_MIN) / FORECAST_RESOLUTION))
        lon_idx = int(round((lon - LON_MIN) / FORECAST_RESOLUTION))
        lat_idx = max(0, min(lat_idx, self.n_lat - 1))
        lon_idx = max(0, min(lon_idx, self.n_lon - 1))
        
        def _extract(arr):
            if arr is None:
                return []
            try:
                return [round(float(v), 2) for v in arr[:, lat_idx, lon_idx]]
            except (IndexError, ValueError):
                return []
        
        result = {
            "ensemble_available": True,
            "ensemble_members": 51,
            "timestamps": self.timestamps,
        }
        
        if self.wave_height_p10 is not None:
            result["wave_height_p10"] = _extract(self.wave_height_p10)
            result["wave_height_p50"] = _extract(self.wave_height_p50)
            result["wave_height_p90"] = _extract(self.wave_height_p90)
        
        if self.wind_speed_p10 is not None:
            result["wind_speed_p10"] = _extract(self.wind_speed_p10)
            result["wind_speed_p50"] = _extract(self.wind_speed_p50)
            result["wind_speed_p90"] = _extract(self.wind_speed_p90)
        
        return result

