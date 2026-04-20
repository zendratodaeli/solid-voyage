"""
Forecast Verification Logger — logs every prediction served for accuracy tracking.

Appends forecast predictions to a monthly CSV file. Later, these predictions
can be compared against ERA5 reanalysis or buoy observations to compute
RMSE, bias, and correlation — proving forecast accuracy.

This is what builds trust: "Our 48h wave forecast RMSE is 0.31m."
"""
import os
import csv
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Log directory — persisted in the engine data volume
LOG_DIR = Path(os.environ.get("FORECAST_LOG_DIR", "/tmp/forecast_logs"))


class ForecastLogger:
    """
    Thread-safe CSV logger for forecast predictions.
    
    Logs: timestamp, lat, lon, forecast_hour, source, predicted values.
    Auto-rotates monthly (one file per month).
    """
    
    _instance: Optional["ForecastLogger"] = None
    
    def __init__(self):
        self._ensure_dir()
        self._count = 0
    
    @classmethod
    def get(cls) -> "ForecastLogger":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = ForecastLogger()
        return cls._instance
    
    def _ensure_dir(self):
        """Create log directory if it doesn't exist."""
        try:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.warning(f"Cannot create forecast log dir {LOG_DIR}: {e}")
    
    def _get_filepath(self) -> Path:
        """Get current month's log file path."""
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        return LOG_DIR / f"forecast_log_{month}.csv"
    
    def _write_header(self, filepath: Path):
        """Write CSV header if file is new."""
        if not filepath.exists() or filepath.stat().st_size == 0:
            try:
                with open(filepath, "w", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow([
                        "logged_at",         # When this prediction was served
                        "lat", "lon",        # Coordinate
                        "target_time",       # What time was being predicted
                        "forecast_hour",     # Hours from cycle start
                        "source",            # ECMWF+NOAA, etc.
                        "endpoint",          # forecast-series | route-forecast | conditions
                        # Predicted values
                        "wave_height_m",
                        "wind_speed_knots",
                        "pressure_hpa",
                        "swell_height_m",
                        "sea_surface_temperature",
                        "current_speed_knots",
                        "ice_concentration_pct",
                        "beaufort",
                        "navigability",
                    ])
            except Exception as e:
                logger.warning(f"Failed to write forecast log header: {e}")
    
    def log_prediction(
        self,
        lat: float,
        lon: float,
        target_time: str,
        forecast_hour: float,
        source: str,
        endpoint: str,
        wave_height_m: float = 0.0,
        wind_speed_knots: float = 0.0,
        pressure_hpa: float = 0.0,
        swell_height_m: float = 0.0,
        sea_surface_temperature: Optional[float] = None,
        current_speed_knots: float = 0.0,
        ice_concentration_pct: float = 0.0,
        beaufort: int = 0,
        navigability: str = "open",
    ):
        """
        Log a single forecast prediction to the monthly CSV.
        
        Called asynchronously after serving a forecast response.
        Failures are silently logged — never blocks the API response.
        """
        try:
            filepath = self._get_filepath()
            self._write_header(filepath)
            
            with open(filepath, "a", newline="") as f:
                writer = csv.writer(f)
                writer.writerow([
                    datetime.now(timezone.utc).isoformat(),
                    round(lat, 4),
                    round(lon, 4),
                    target_time,
                    round(forecast_hour, 1),
                    source,
                    endpoint,
                    round(wave_height_m, 2),
                    round(wind_speed_knots, 1),
                    round(pressure_hpa, 1),
                    round(swell_height_m, 2),
                    round(sea_surface_temperature, 1) if sea_surface_temperature is not None else "",
                    round(current_speed_knots, 2),
                    round(ice_concentration_pct, 1),
                    beaufort,
                    navigability,
                ])
            
            self._count += 1
            if self._count % 100 == 0:
                logger.info(f"Forecast logger: {self._count} predictions logged to {filepath.name}")
                
        except Exception as e:
            # Never let logging failures affect the API
            if self._count % 50 == 0:
                logger.warning(f"Forecast log write failed: {e}")
    
    def get_stats(self) -> dict:
        """
        Compute verification statistics from logged predictions.
        
        Returns basic stats: total predictions, date range, per-variable summaries.
        Full verification against ERA5/buoy data is done separately.
        """
        stats = {
            "total_predictions": 0,
            "log_files": [],
            "date_range": {"earliest": None, "latest": None},
            "variables": {
                "wave_height_m": {"count": 0, "mean": 0, "min": 999, "max": 0},
                "wind_speed_knots": {"count": 0, "mean": 0, "min": 999, "max": 0},
                "pressure_hpa": {"count": 0, "mean": 0, "min": 9999, "max": 0},
            },
            "endpoints": {},
            "navigability_distribution": {},
        }
        
        try:
            if not LOG_DIR.exists():
                return stats
            
            log_files = sorted(LOG_DIR.glob("forecast_log_*.csv"))
            stats["log_files"] = [f.name for f in log_files]
            
            total_wave = 0.0
            total_wind = 0.0
            total_pressure = 0.0
            
            for filepath in log_files:
                try:
                    with open(filepath, "r") as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            stats["total_predictions"] += 1
                            
                            # Date range
                            logged_at = row.get("logged_at", "")
                            if logged_at:
                                if stats["date_range"]["earliest"] is None or logged_at < stats["date_range"]["earliest"]:
                                    stats["date_range"]["earliest"] = logged_at
                                if stats["date_range"]["latest"] is None or logged_at > stats["date_range"]["latest"]:
                                    stats["date_range"]["latest"] = logged_at
                            
                            # Endpoints
                            ep = row.get("endpoint", "unknown")
                            stats["endpoints"][ep] = stats["endpoints"].get(ep, 0) + 1
                            
                            # Wave stats
                            try:
                                wave = float(row.get("wave_height_m", 0))
                                if wave > 0:
                                    stats["variables"]["wave_height_m"]["count"] += 1
                                    total_wave += wave
                                    stats["variables"]["wave_height_m"]["min"] = min(stats["variables"]["wave_height_m"]["min"], wave)
                                    stats["variables"]["wave_height_m"]["max"] = max(stats["variables"]["wave_height_m"]["max"], wave)
                            except (ValueError, TypeError):
                                pass
                            
                            # Wind stats
                            try:
                                wind = float(row.get("wind_speed_knots", 0))
                                if wind > 0:
                                    stats["variables"]["wind_speed_knots"]["count"] += 1
                                    total_wind += wind
                                    stats["variables"]["wind_speed_knots"]["min"] = min(stats["variables"]["wind_speed_knots"]["min"], wind)
                                    stats["variables"]["wind_speed_knots"]["max"] = max(stats["variables"]["wind_speed_knots"]["max"], wind)
                            except (ValueError, TypeError):
                                pass
                            
                            # Pressure stats
                            try:
                                pressure = float(row.get("pressure_hpa", 0))
                                if pressure > 900:
                                    stats["variables"]["pressure_hpa"]["count"] += 1
                                    total_pressure += pressure
                                    stats["variables"]["pressure_hpa"]["min"] = min(stats["variables"]["pressure_hpa"]["min"], pressure)
                                    stats["variables"]["pressure_hpa"]["max"] = max(stats["variables"]["pressure_hpa"]["max"], pressure)
                            except (ValueError, TypeError):
                                pass
                            
                            # Navigability distribution
                            nav = row.get("navigability", "unknown")
                            stats["navigability_distribution"][nav] = stats["navigability_distribution"].get(nav, 0) + 1
                            
                except Exception as e:
                    logger.warning(f"Failed to read forecast log {filepath}: {e}")
            
            # Compute means
            wc = stats["variables"]["wave_height_m"]["count"]
            if wc > 0:
                stats["variables"]["wave_height_m"]["mean"] = round(total_wave / wc, 2)
            else:
                stats["variables"]["wave_height_m"]["min"] = 0
                
            wic = stats["variables"]["wind_speed_knots"]["count"]
            if wic > 0:
                stats["variables"]["wind_speed_knots"]["mean"] = round(total_wind / wic, 1)
            else:
                stats["variables"]["wind_speed_knots"]["min"] = 0
                
            pc = stats["variables"]["pressure_hpa"]["count"]
            if pc > 0:
                stats["variables"]["pressure_hpa"]["mean"] = round(total_pressure / pc, 1)
            else:
                stats["variables"]["pressure_hpa"]["min"] = 0
                
        except Exception as e:
            logger.error(f"Failed to compute forecast stats: {e}")
        
        return stats
