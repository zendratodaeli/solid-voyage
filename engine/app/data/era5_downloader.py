"""
ERA5 Reanalysis Downloader — Downloads "what actually happened" weather data.

Uses the CDS API (Climate Data Store) to download ERA5 reanalysis data,
which serves as "ground truth" for validating our weather predictions.

ERA5 data is released with a ~5 day lag. We download data for coordinates
that appear in our forecast logs, then store it for comparison.

Requires: CDS_API_KEY environment variable (free registration at cds.climate.copernicus.eu)
"""
import os
import csv
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Dict, Tuple, Optional

logger = logging.getLogger(__name__)

LOG_DIR = Path(os.environ.get("FORECAST_LOG_DIR", "/tmp/forecast_logs"))
ERA5_DIR = LOG_DIR / "era5"
CDS_API_KEY = os.environ.get("CDS_API_KEY", "")
CDS_API_URL = os.environ.get("CDS_API_URL", "https://cds.climate.copernicus.eu/api")


def is_configured() -> bool:
    """Check if CDS API is configured."""
    return bool(CDS_API_KEY)


def get_forecast_coordinates(days_back: int = 7) -> List[Dict]:
    """
    Read forecast log CSVs and extract unique coordinate+time pairs
    for the last N days. These are the points we need ERA5 data for.
    """
    coordinates = []
    seen = set()
    
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back + 5)  # 5-day ERA5 lag
    
    try:
        log_files = sorted(LOG_DIR.glob("forecast_log_*.csv"))
        for filepath in log_files:
            with open(filepath, "r") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        target_time = row.get("target_time", "")
                        if not target_time:
                            continue
                        
                        lat = float(row.get("lat", 0))
                        lon = float(row.get("lon", 0))
                        
                        # Round to 0.25° grid (ERA5 native resolution)
                        grid_lat = round(lat * 4) / 4
                        grid_lon = round(lon * 4) / 4
                        
                        # Parse target time
                        target_dt = datetime.fromisoformat(target_time.replace("Z", "+00:00"))
                        
                        # Only get data that ERA5 would have (5+ days ago)
                        if target_dt < cutoff:
                            continue
                        
                        era5_available = datetime.now(timezone.utc) - timedelta(days=5)
                        if target_dt > era5_available:
                            continue
                        
                        # Deduplicate by grid cell + date
                        date_str = target_dt.strftime("%Y-%m-%d")
                        key = f"{grid_lat},{grid_lon},{date_str}"
                        if key not in seen:
                            seen.add(key)
                            coordinates.append({
                                "lat": grid_lat,
                                "lon": grid_lon,
                                "date": date_str,
                                "hour": target_dt.hour,
                            })
                    except (ValueError, TypeError):
                        continue
    except Exception as e:
        logger.warning(f"Failed to read forecast logs for ERA5: {e}")
    
    return coordinates


def download_era5_point(lat: float, lon: float, date: str) -> Optional[Dict]:
    """
    Download ERA5 reanalysis data for a single point and date.
    
    Uses the CDS API to fetch:
    - 10m u/v wind components (converted to speed)
    - Significant wave height
    - Mean sea level pressure
    
    Returns dict with actual observed values, or None on failure.
    """
    if not is_configured():
        return None
    
    try:
        import cdsapi
    except ImportError:
        logger.warning("cdsapi not installed. Run: pip install cdsapi")
        return None
    
    try:
        # Configure CDS client
        client = cdsapi.Client(
            url=CDS_API_URL,
            key=CDS_API_KEY,
            quiet=True,
        )
        
        year, month, day = date.split("-")
        
        # Request ERA5 data
        result_file = ERA5_DIR / f"era5_{date}_{lat}_{lon}.grib"
        
        if result_file.exists():
            logger.debug(f"ERA5 data already cached: {result_file}")
        else:
            ERA5_DIR.mkdir(parents=True, exist_ok=True)
            
            client.retrieve(
                "reanalysis-era5-single-levels",
                {
                    "product_type": "reanalysis",
                    "variable": [
                        "10m_u_component_of_wind",
                        "10m_v_component_of_wind",
                        "significant_height_of_combined_wind_waves_and_swell",
                        "mean_sea_level_pressure",
                    ],
                    "year": year,
                    "month": month,
                    "day": day,
                    "time": [f"{h:02d}:00" for h in range(0, 24, 6)],  # 00, 06, 12, 18 UTC
                    "area": [lat + 0.25, lon - 0.25, lat - 0.25, lon + 0.25],  # Small bbox
                    "format": "grib",
                },
                str(result_file),
            )
        
        # Parse GRIB file
        return _parse_era5_grib(result_file, lat, lon)
        
    except Exception as e:
        logger.warning(f"ERA5 download failed for {lat},{lon},{date}: {e}")
        return None


def _parse_era5_grib(filepath: Path, target_lat: float, target_lon: float) -> Optional[Dict]:
    """Parse ERA5 GRIB file and extract values at target coordinates."""
    try:
        import eccodes
    except ImportError:
        # Fallback: try cfgrib/xarray
        try:
            return _parse_era5_netcdf_fallback(filepath, target_lat, target_lon)
        except ImportError:
            logger.warning("Neither eccodes nor cfgrib available for GRIB parsing")
            return None
    
    result = {
        "lat": target_lat,
        "lon": target_lon,
        "wind_u": None,
        "wind_v": None,
        "wave_height_m": None,
        "pressure_hpa": None,
    }
    
    try:
        with open(filepath, "rb") as f:
            while True:
                msgid = eccodes.codes_grib_new_from_file(f)
                if msgid is None:
                    break
                    
                try:
                    shortName = eccodes.codes_get(msgid, "shortName")
                    
                    # Find nearest grid point
                    eccodes.codes_set(msgid, "latitudeOfFirstGridPointInDegrees", target_lat)
                    eccodes.codes_set(msgid, "longitudeOfFirstGridPointInDegrees", target_lon)
                    
                    nearest = eccodes.codes_grib_find_nearest(msgid, target_lat, target_lon)
                    if nearest:
                        value = nearest[0]["value"]
                        
                        if shortName == "10u":
                            result["wind_u"] = value
                        elif shortName == "10v":
                            result["wind_v"] = value
                        elif shortName == "swh":
                            result["wave_height_m"] = value
                        elif shortName == "msl":
                            result["pressure_hpa"] = value / 100.0  # Pa → hPa
                finally:
                    eccodes.codes_release(msgid)
    except Exception as e:
        logger.warning(f"GRIB parsing error: {e}")
    
    # Compute wind speed from u/v components
    if result["wind_u"] is not None and result["wind_v"] is not None:
        import math
        wind_ms = math.sqrt(result["wind_u"]**2 + result["wind_v"]**2)
        result["wind_speed_knots"] = round(wind_ms * 1.94384, 1)  # m/s → knots
    else:
        result["wind_speed_knots"] = None
    
    return result


def _parse_era5_netcdf_fallback(filepath: Path, lat: float, lon: float) -> Optional[Dict]:
    """Fallback parser using cfgrib/xarray if eccodes not available."""
    try:
        import xarray as xr
        ds = xr.open_dataset(str(filepath), engine="cfgrib")
        
        # Select nearest point
        point = ds.sel(latitude=lat, longitude=lon, method="nearest")
        
        result = {
            "lat": lat,
            "lon": lon,
            "wave_height_m": None,
            "wind_speed_knots": None,
            "pressure_hpa": None,
        }
        
        if "swh" in point:
            result["wave_height_m"] = float(point["swh"].values.mean())
        
        if "u10" in point and "v10" in point:
            import math
            u = float(point["u10"].values.mean())
            v = float(point["v10"].values.mean())
            wind_ms = math.sqrt(u**2 + v**2)
            result["wind_speed_knots"] = round(wind_ms * 1.94384, 1)
        
        if "msl" in point:
            result["pressure_hpa"] = round(float(point["msl"].values.mean()) / 100, 1)
        
        return result
    except Exception as e:
        logger.warning(f"ERA5 netCDF fallback failed: {e}")
        return None


def download_batch(max_points: int = 50) -> Dict:
    """
    Download ERA5 data for pending forecast log coordinates.
    Returns summary of what was downloaded.
    """
    if not is_configured():
        return {"status": "not_configured", "message": "CDS_API_KEY not set"}
    
    coordinates = get_forecast_coordinates(days_back=7)
    
    if not coordinates:
        return {"status": "no_data", "message": "No forecast logs to verify"}
    
    # Limit to avoid excess API calls
    to_process = coordinates[:max_points]
    
    results = []
    errors = 0
    
    for coord in to_process:
        era5_data = download_era5_point(coord["lat"], coord["lon"], coord["date"])
        if era5_data:
            # Save to CSV
            _save_era5_result(coord, era5_data)
            results.append(era5_data)
        else:
            errors += 1
    
    return {
        "status": "completed",
        "total_coordinates": len(coordinates),
        "processed": len(to_process),
        "downloaded": len(results),
        "errors": errors,
    }


def _save_era5_result(coord: Dict, era5_data: Dict):
    """Save ERA5 result to CSV for verification pipeline."""
    ERA5_DIR.mkdir(parents=True, exist_ok=True)
    
    month = coord["date"][:7]  # YYYY-MM
    filepath = ERA5_DIR / f"era5_observations_{month}.csv"
    
    # Write header if new file
    if not filepath.exists() or filepath.stat().st_size == 0:
        with open(filepath, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "date", "lat", "lon",
                "actual_wave_height_m", "actual_wind_speed_knots", "actual_pressure_hpa",
            ])
    
    with open(filepath, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            coord["date"],
            coord["lat"],
            coord["lon"],
            era5_data.get("wave_height_m", ""),
            era5_data.get("wind_speed_knots", ""),
            era5_data.get("pressure_hpa", ""),
        ])
