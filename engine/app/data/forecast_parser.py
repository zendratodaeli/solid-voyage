"""
Forecast Store — In-memory store for multi-step NOAA forecast time series.

Parses multi-step GFS and WW3 GRIB files into numpy arrays indexed by:
  [forecast_step, lat_idx, lon_idx]

Provides fast coordinate-based lookups for the /forecast-series API endpoint.
Each variable is stored as a 3D array with shape:
  (n_steps, n_lat, n_lon)

Memory estimate for 0.25° global grid, 57 steps, 10 variables:
  57 × 624 × 1440 × 10 × 4 bytes ≈ 2.0 GB → fits in 24 GB RAM
"""
import os
import logging
import numpy as np
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from app.config import (
    FORECAST_RESOLUTION, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX,
    FORECAST_HOURS, FORECAST_DOWNLOAD_THREADS, GFS_RESOLUTION,
    WW3_RESOLUTION, FORECAST_DIR, OISST_DIR,
)

logger = logging.getLogger(__name__)


class ForecastStore:
    """
    In-memory store for multi-step NOAA forecast data.

    Stores 7-day forecast time series at 0.25° resolution for:
      - Wind speed & direction (GFS)
      - Wave height, period, direction (WW3)
      - Swell height, wind wave height (WW3)
      - Barometric pressure (GFS)
      - Visibility (GFS)
      - Sea surface temperature (OISST + RTOFS)
    """

    def __init__(self):
        n_lat = len(np.arange(LAT_MIN, LAT_MAX, FORECAST_RESOLUTION))
        n_lon = len(np.arange(LON_MIN, LON_MAX, FORECAST_RESOLUTION))
        n_steps = len(FORECAST_HOURS)

        self.n_lat = n_lat
        self.n_lon = n_lon
        self.n_steps = n_steps
        self.is_ready = False

        # Metadata
        self.cycle_date: str = ""         # e.g. "20260419"
        self.cycle_run: str = ""          # e.g. "00"
        self.cycle_timestamp: Optional[datetime] = None
        self.timestamps: list[str] = []   # ISO timestamps for each step
        self.sources: dict[str, str] = {} # Data provenance

        # GFS atmospheric variables — shape: (n_steps, n_lat, n_lon)
        self.wind_u: Optional[np.ndarray] = None       # m/s
        self.wind_v: Optional[np.ndarray] = None       # m/s
        self.pressure: Optional[np.ndarray] = None     # Pa → converted to hPa
        self.visibility: Optional[np.ndarray] = None   # meters

        # WW3 wave variables — shape: (n_steps, n_lat, n_lon)
        self.wave_height: Optional[np.ndarray] = None      # meters (HTSGW)
        self.wave_period: Optional[np.ndarray] = None      # seconds (PERPW)
        self.wave_direction: Optional[np.ndarray] = None   # degrees (DIRPW)
        self.swell_height: Optional[np.ndarray] = None     # meters (SWELL component)
        self.wind_wave_height: Optional[np.ndarray] = None # meters (WVHGT)

        # SST — shape: (n_lat, n_lon) — single snapshot (daily, not per-step)
        self.sst_oisst: Optional[np.ndarray] = None   # NOAA OISST (satellite-verified)
        self.sst_rtofs: Optional[np.ndarray] = None   # RTOFS forecast SST

        logger.info(
            f"ForecastStore initialized: {n_steps} steps × {n_lat}×{n_lon} grid "
            f"({n_steps * n_lat * n_lon * 4 * 10 / 1e9:.1f} GB estimated)"
        )

    def _coord_to_idx(self, lat: float, lon: float) -> tuple[int, int]:
        """Convert lat/lon to grid indices, clamped to valid range."""
        lat_idx = int(round((lat - LAT_MIN) / FORECAST_RESOLUTION))
        lon_idx = int(round((lon - LON_MIN) / FORECAST_RESOLUTION))
        lat_idx = max(0, min(lat_idx, self.n_lat - 1))
        lon_idx = max(0, min(lon_idx, self.n_lon - 1))
        return lat_idx, lon_idx

    def build_timestamps(self, cycle_date: str, cycle_run: str):
        """Generate ISO timestamps for each forecast step."""
        self.cycle_date = cycle_date
        self.cycle_run = cycle_run
        base = datetime.strptime(f"{cycle_date}{cycle_run}", "%Y%m%d%H").replace(tzinfo=timezone.utc)
        self.cycle_timestamp = base
        self.timestamps = [
            (base + timedelta(hours=h)).isoformat()
            for h in FORECAST_HOURS
        ]

    def get_timeseries(self, lat: float, lon: float) -> dict:
        """
        Extract full 7-day forecast time series at a specific coordinate.

        Returns a dict matching the Open-Meteo marine API format so the
        frontend can switch sources with minimal changes.
        """
        if not self.is_ready:
            return {"error": "Forecast store not ready"}

        lat_idx, lon_idx = self._coord_to_idx(lat, lon)

        def _sanitize(v):
            """Convert numpy value to JSON-safe float."""
            f = float(v)
            if np.isnan(f) or np.isinf(f):
                return 0.0
            return round(f, 2)

        def safe_extract(arr: Optional[np.ndarray]) -> list:
            """Extract time series at coordinate, return empty list if array is None."""
            if arr is None:
                return []
            try:
                return [_sanitize(v) for v in arr[:, lat_idx, lon_idx]]
            except (IndexError, ValueError):
                return []

        def safe_extract_2d(arr: Optional[np.ndarray]) -> Optional[float]:
            """Extract single value from 2D array (SST)."""
            if arr is None:
                return None
            try:
                return _sanitize(arr[lat_idx, lon_idx])
            except (IndexError, ValueError):
                return None

        # Compute wind speed and direction from U/V components
        wind_speed = []
        wind_direction = []
        if self.wind_u is not None and self.wind_v is not None:
            u_series = self.wind_u[:, lat_idx, lon_idx]
            v_series = self.wind_v[:, lat_idx, lon_idx]
            for u, v in zip(u_series, v_series):
                u_f, v_f = float(u), float(v)
                if np.isnan(u_f) or np.isnan(v_f):
                    wind_speed.append(0.0)
                    wind_direction.append(0.0)
                    continue
                speed_ms = float(np.sqrt(u_f**2 + v_f**2))
                speed_kn = speed_ms * 1.94384  # m/s to knots
                direction = float((np.degrees(np.arctan2(-u_f, -v_f)) + 360) % 360)
                wind_speed.append(round(speed_kn, 1))
                wind_direction.append(round(direction, 0))

        # Compute Beaufort scale from wind speed
        beaufort = [self._knots_to_beaufort(ws) for ws in wind_speed] if wind_speed else []

        # Pressure: convert Pa to hPa
        pressure_series = []
        if self.pressure is not None:
            raw = self.pressure[:, lat_idx, lon_idx]
            for p in raw:
                pf = float(p)
                if np.isnan(pf) or np.isinf(pf):
                    pressure_series.append(0.0)
                else:
                    pressure_series.append(round(pf / 100 if pf > 10000 else pf, 1))

        # Visibility: convert meters to nautical miles
        visibility_series = []
        if self.visibility is not None:
            raw = self.visibility[:, lat_idx, lon_idx]
            for v in raw:
                vf = float(v)
                if np.isnan(vf) or np.isinf(vf):
                    visibility_series.append(0.0)
                else:
                    visibility_series.append(round(vf / 1852, 1))

        # Daily aggregation (max wave, max wind, min pressure)
        daily = self._compute_daily_summary(
            safe_extract(self.wave_height),
            wind_speed,
            pressure_series,
        )

        # Weather windows (periods where wave < 2m AND wind < 20kn for 12h+)
        weather_windows = self._find_weather_windows(
            safe_extract(self.wave_height),
            wind_speed,
        )

        return {
            "success": True,
            "lat": lat,
            "lon": lon,
            "source": "NOAA_GFS_WW3_0p25",
            "cycle": self.cycle_timestamp.isoformat() if self.cycle_timestamp else None,
            "grid_resolution": f"{FORECAST_RESOLUTION}°",
            "hourly": {
                "time": self.timestamps,
                "wave_height": safe_extract(self.wave_height),
                "wave_direction": safe_extract(self.wave_direction),
                "wave_period": safe_extract(self.wave_period),
                "swell_wave_height": safe_extract(self.swell_height),
                "wind_wave_height": safe_extract(self.wind_wave_height),
                "wind_speed_knots": wind_speed,
                "wind_direction": wind_direction,
                "beaufort": beaufort,
                "pressure_hpa": pressure_series,
                "visibility_nm": visibility_series,
                "sea_surface_temperature": safe_extract_2d(self.sst_oisst),
                "sea_surface_temperature_forecast": safe_extract_2d(self.sst_rtofs),
            },
            "daily": daily,
            "weather_windows": weather_windows,
        }

    def get_at_time(self, lat: float, lon: float, target_time: datetime) -> dict:
        """
        Extract weather at a specific coordinate AND specific future time.

        Instead of returning a full time series, this finds the two nearest
        forecast steps bracketing `target_time` and linearly interpolates
        all variables between them.

        This is the key differentiator for route forecasting: if a vessel
        will arrive at a waypoint in 48 hours, we extract the forecast
        at t+48h, not at t+0.

        Returns a single-point weather snapshot dict.
        """
        if not self.is_ready or not self.cycle_timestamp:
            return {"error": "Forecast store not ready"}

        lat_idx, lon_idx = self._coord_to_idx(lat, lon)

        # Find the forecast step index closest to target_time
        hours_from_cycle = (target_time - self.cycle_timestamp).total_seconds() / 3600
        from app.config import FORECAST_HOURS

        # Clamp to available forecast range
        if hours_from_cycle < FORECAST_HOURS[0]:
            step_idx = 0
            weight = 0.0
            step_idx_next = 0
        elif hours_from_cycle >= FORECAST_HOURS[-1]:
            step_idx = len(FORECAST_HOURS) - 1
            weight = 0.0
            step_idx_next = step_idx
        else:
            # Find bracketing steps
            step_idx = 0
            for i, h in enumerate(FORECAST_HOURS):
                if h <= hours_from_cycle:
                    step_idx = i
                else:
                    break
            step_idx_next = min(step_idx + 1, len(FORECAST_HOURS) - 1)

            if step_idx_next == step_idx:
                weight = 0.0
            else:
                span = FORECAST_HOURS[step_idx_next] - FORECAST_HOURS[step_idx]
                weight = (hours_from_cycle - FORECAST_HOURS[step_idx]) / span if span > 0 else 0.0

        def _sanitize(v):
            f = float(v)
            if np.isnan(f) or np.isinf(f):
                return 0.0
            return round(f, 2)

        def _interp(arr: np.ndarray) -> float:
            """Interpolate between two steps at the grid cell."""
            if arr is None:
                return 0.0
            try:
                v0 = float(arr[step_idx, lat_idx, lon_idx])
                v1 = float(arr[step_idx_next, lat_idx, lon_idx])
                if np.isnan(v0) or np.isinf(v0): v0 = 0.0
                if np.isnan(v1) or np.isinf(v1): v1 = 0.0
                return round(v0 * (1 - weight) + v1 * weight, 2)
            except (IndexError, TypeError):
                return 0.0

        # Extract interpolated values
        wave_height = _interp(self.wave_height) if self.wave_height is not None else 0.0
        wave_period = _interp(self.wave_period) if self.wave_period is not None else 0.0
        wave_direction = _interp(self.wave_direction) if self.wave_direction is not None else 0.0
        swell_height = _interp(self.swell_height) if self.swell_height is not None else 0.0
        wind_wave_height = _interp(self.wind_wave_height) if self.wind_wave_height is not None else 0.0

        # Wind from U/V components
        wind_speed_kn = 0.0
        wind_direction_deg = 0.0
        if self.wind_u is not None and self.wind_v is not None:
            u = _interp(self.wind_u)
            v = _interp(self.wind_v)
            speed_ms = float(np.sqrt(u**2 + v**2))
            wind_speed_kn = round(speed_ms * 1.94384, 1)
            wind_direction_deg = round(float((np.degrees(np.arctan2(-u, -v)) + 360) % 360), 0)

        # Pressure
        pressure_hpa = 0.0
        if self.pressure is not None:
            p = _interp(self.pressure)
            pressure_hpa = round(p / 100 if p > 10000 else p, 1)

        # Visibility
        visibility_nm = 0.0
        if self.visibility is not None:
            vis_m = _interp(self.visibility)
            visibility_nm = round(vis_m / 1852, 1)

        # SST (2D — no time interpolation needed)
        sst = None
        if self.sst_rtofs is not None:
            try:
                sst = _sanitize(self.sst_rtofs[lat_idx, lon_idx])
            except (IndexError, TypeError):
                pass
        if sst is None and self.sst_oisst is not None:
            try:
                sst = _sanitize(self.sst_oisst[lat_idx, lon_idx])
            except (IndexError, TypeError):
                pass

        beaufort = self._knots_to_beaufort(wind_speed_kn)

        return {
            "wave_height_m": wave_height,
            "wave_period_s": wave_period,
            "wave_direction_deg": wave_direction,
            "swell_height_m": swell_height,
            "wind_wave_height_m": wind_wave_height,
            "wind_speed_knots": wind_speed_kn,
            "wind_direction_deg": wind_direction_deg,
            "pressure_hpa": pressure_hpa,
            "visibility_nm": visibility_nm,
            "beaufort": beaufort,
            "sea_surface_temperature": sst,
            "forecast_step_hours": round(hours_from_cycle, 1),
        }

    def _compute_daily_summary(
        self,
        wave_heights: list,
        wind_speeds: list,
        pressures: list,
    ) -> dict:
        """Aggregate hourly data into daily max/min summaries."""
        steps_per_day = 8  # 24h / 3h = 8 steps per day
        n_days = min(7, len(self.timestamps) // steps_per_day)

        dates = []
        wave_max = []
        wind_max = []
        pressure_min = []

        for d in range(n_days):
            start = d * steps_per_day
            end = start + steps_per_day

            if self.cycle_timestamp:
                day = self.cycle_timestamp + timedelta(days=d)
                dates.append(day.strftime("%Y-%m-%d"))

            if wave_heights and end <= len(wave_heights):
                wave_max.append(round(max(wave_heights[start:end]), 1))
            if wind_speeds and end <= len(wind_speeds):
                wind_max.append(round(max(wind_speeds[start:end]), 1))
            if pressures and end <= len(pressures):
                pressure_min.append(round(min(pressures[start:end]), 1))

        return {
            "date": dates,
            "wave_height_max": wave_max,
            "wind_speed_max_knots": wind_max,
            "pressure_min_hpa": pressure_min,
        }

    def _find_weather_windows(
        self,
        wave_heights: list,
        wind_speeds: list,
        wave_threshold: float = 2.0,
        wind_threshold: float = 20.0,
        min_duration_hours: int = 12,
    ) -> list[dict]:
        """
        Find weather windows — periods where conditions are operationally safe.

        A weather window is a continuous period where:
          - Wave height < 2.0m
          - Wind speed < 20 knots

        Minimum duration: 12 hours (4 steps × 3h)

        Returns list of {start, end, duration_hours} dicts.
        """
        if not wave_heights or not wind_speeds:
            return []

        min_steps = min_duration_hours // 3
        windows = []
        window_start = None

        for i in range(min(len(wave_heights), len(wind_speeds))):
            is_ok = wave_heights[i] < wave_threshold and wind_speeds[i] < wind_threshold

            if is_ok and window_start is None:
                window_start = i
            elif not is_ok and window_start is not None:
                duration_steps = i - window_start
                if duration_steps >= min_steps:
                    windows.append({
                        "start": self.timestamps[window_start] if window_start < len(self.timestamps) else None,
                        "end": self.timestamps[i] if i < len(self.timestamps) else None,
                        "duration_hours": duration_steps * 3,
                    })
                window_start = None

        # Close trailing window
        if window_start is not None:
            duration_steps = len(wave_heights) - window_start
            if duration_steps >= min_steps:
                windows.append({
                    "start": self.timestamps[window_start] if window_start < len(self.timestamps) else None,
                    "end": self.timestamps[-1] if self.timestamps else None,
                    "duration_hours": duration_steps * 3,
                })

        return windows

    @staticmethod
    def _knots_to_beaufort(knots: float) -> int:
        """Convert wind speed in knots to Beaufort scale."""
        thresholds = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63]
        for bf, threshold in enumerate(thresholds):
            if knots < threshold:
                return bf
        return 12


def parse_multistep_grib(
    file_paths: dict[int, str],
    variable: str,
    n_lat: int,
    n_lon: int,
) -> Optional[np.ndarray]:
    """
    Parse multiple single-step GRIB files into a 3D time series array.

    Args:
        file_paths: dict mapping forecast hour → GRIB file path
        variable: GRIB variable name (for logging)
        n_lat, n_lon: expected grid dimensions

    Returns:
        3D numpy array of shape (n_steps, n_lat, n_lon), or None on failure
    """
    try:
        import xarray as xr
    except ImportError:
        logger.error("xarray/cfgrib not available — cannot parse GRIB forecast data")
        return None

    n_steps = len(FORECAST_HOURS)
    result = np.full((n_steps, n_lat, n_lon), np.nan, dtype=np.float32)

    parsed_count = 0
    for step_idx, hour in enumerate(FORECAST_HOURS):
        path = file_paths.get(hour)
        if not path or not os.path.exists(path):
            continue

        try:
            ds = xr.open_dataset(path, engine="cfgrib")
            var_name = list(ds.data_vars)[0]
            data = ds[var_name].values.astype(np.float32)
            ds.close()

            # Resample to engine grid if needed
            if data.shape != (n_lat, n_lon):
                from scipy.ndimage import zoom
                lat_ratio = n_lat / data.shape[0]
                lon_ratio = n_lon / data.shape[1]
                data = zoom(data, (lat_ratio, lon_ratio), order=1).astype(np.float32)

            # Replace NaN with 0 (land/missing)
            data = np.nan_to_num(data, nan=0.0)
            result[step_idx] = data
            parsed_count += 1

        except Exception as e:
            logger.debug(f"Failed to parse {variable} f{hour:03d}: {e}")
            continue

    if parsed_count == 0:
        logger.warning(f"No forecast steps parsed for {variable}")
        return None

    # Interpolate missing steps (linear between available)
    if parsed_count < n_steps:
        result = _interpolate_missing_steps(result)

    logger.info(f"Parsed {variable} forecast: {parsed_count}/{n_steps} steps loaded")
    return result


def _interpolate_missing_steps(data: np.ndarray) -> np.ndarray:
    """Fill gaps in the time series by linear interpolation between available steps."""
    n_steps = data.shape[0]

    # Find which steps have data (not all NaN)
    valid = np.array([not np.all(np.isnan(data[i])) for i in range(n_steps)])

    if valid.sum() < 2:
        # Not enough data to interpolate — fill with mean
        mean_val = np.nanmean(data)
        data = np.nan_to_num(data, nan=mean_val if np.isfinite(mean_val) else 0.0)
        return data

    valid_indices = np.where(valid)[0]

    for i in range(n_steps):
        if not valid[i]:
            # Find nearest earlier and later valid step
            earlier = valid_indices[valid_indices < i]
            later = valid_indices[valid_indices > i]

            if len(earlier) > 0 and len(later) > 0:
                i0, i1 = earlier[-1], later[0]
                weight = (i - i0) / (i1 - i0)
                data[i] = data[i0] * (1 - weight) + data[i1] * weight
            elif len(earlier) > 0:
                data[i] = data[earlier[-1]]
            elif len(later) > 0:
                data[i] = data[later[0]]

    data = np.nan_to_num(data, nan=0.0)
    return data
