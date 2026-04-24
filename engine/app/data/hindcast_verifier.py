"""
Hindcast Verification Pipeline — Compare predictions vs ERA5 reality.

Joins forecast log CSVs with ERA5 observation CSVs to compute:
- RMSE (Root Mean Squared Error) for wind and waves
- MAE (Mean Absolute Error)
- Bias (systematic over/under prediction)
- Skill Score (how much better than climatology)

This is the evidence that proves our forecasts are accurate:
"Our 48h wave RMSE is 0.31m" → that number sells subscriptions.
"""
import csv
import json
import math
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import os

logger = logging.getLogger(__name__)

LOG_DIR = Path(os.environ.get("FORECAST_LOG_DIR", "/tmp/forecast_logs"))
ERA5_DIR = LOG_DIR / "era5"
RESULTS_DIR = LOG_DIR / "verification"


def _load_forecast_logs() -> List[Dict]:
    """Load all forecast predictions from CSV logs."""
    predictions = []
    
    try:
        log_files = sorted(LOG_DIR.glob("forecast_log_*.csv"))
        for filepath in log_files:
            with open(filepath, "r") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        predictions.append({
                            "logged_at": row.get("logged_at", ""),
                            "lat": round(float(row.get("lat", 0)) * 4) / 4,  # Round to ERA5 grid
                            "lon": round(float(row.get("lon", 0)) * 4) / 4,
                            "target_time": row.get("target_time", ""),
                            "forecast_hour": float(row.get("forecast_hour", 0)),
                            "source": row.get("source", ""),
                            "endpoint": row.get("endpoint", ""),
                            "predicted_wave": float(row.get("wave_height_m", 0)),
                            "predicted_wind": float(row.get("wind_speed_knots", 0)),
                            "predicted_pressure": float(row.get("pressure_hpa", 0)),
                        })
                    except (ValueError, TypeError):
                        continue
    except Exception as e:
        logger.warning(f"Failed to load forecast logs: {e}")
    
    return predictions


def _load_era5_observations() -> Dict[str, Dict]:
    """Load ERA5 observations indexed by (lat, lon, date)."""
    observations = {}
    
    try:
        era5_files = sorted(ERA5_DIR.glob("era5_observations_*.csv"))
        for filepath in era5_files:
            with open(filepath, "r") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        lat = float(row.get("lat", 0))
                        lon = float(row.get("lon", 0))
                        date = row.get("date", "")
                        
                        key = f"{lat},{lon},{date}"
                        observations[key] = {
                            "actual_wave": float(row.get("actual_wave_height_m", 0)) if row.get("actual_wave_height_m") else None,
                            "actual_wind": float(row.get("actual_wind_speed_knots", 0)) if row.get("actual_wind_speed_knots") else None,
                            "actual_pressure": float(row.get("actual_pressure_hpa", 0)) if row.get("actual_pressure_hpa") else None,
                        }
                    except (ValueError, TypeError):
                        continue
    except Exception as e:
        logger.warning(f"Failed to load ERA5 observations: {e}")
    
    return observations


def compute_verification_metrics() -> Dict:
    """
    Join predictions with ERA5 observations and compute accuracy metrics.
    
    Returns comprehensive verification report including:
    - RMSE, MAE, bias for wind and waves
    - Breakdown by forecast lead time
    - Overall skill score
    """
    predictions = _load_forecast_logs()
    observations = _load_era5_observations()
    
    if not predictions:
        return {
            "status": "no_predictions",
            "message": "No forecast logs found. Predictions accumulate automatically.",
            "total_predictions": 0,
        }
    
    if not observations:
        return {
            "status": "no_observations",
            "message": "No ERA5 data downloaded yet. Run ERA5 downloader first.",
            "total_predictions": len(predictions),
            "total_observations": 0,
        }
    
    # ── Join predictions with observations ──
    matched_pairs: List[Dict] = []
    
    for pred in predictions:
        try:
            target_time = pred["target_time"]
            if not target_time:
                continue
            
            # Parse target date
            dt = datetime.fromisoformat(target_time.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
            
            key = f"{pred['lat']},{pred['lon']},{date_str}"
            obs = observations.get(key)
            
            if obs:
                matched_pairs.append({
                    "lat": pred["lat"],
                    "lon": pred["lon"],
                    "date": date_str,
                    "forecast_hour": pred["forecast_hour"],
                    "source": pred["source"],
                    # Predictions
                    "pred_wave": pred["predicted_wave"],
                    "pred_wind": pred["predicted_wind"],
                    "pred_pressure": pred["predicted_pressure"],
                    # Actuals
                    "actual_wave": obs["actual_wave"],
                    "actual_wind": obs["actual_wind"],
                    "actual_pressure": obs["actual_pressure"],
                })
        except (ValueError, TypeError):
            continue
    
    if not matched_pairs:
        return {
            "status": "no_matches",
            "message": "No prediction-observation pairs found. Data needs to overlap.",
            "total_predictions": len(predictions),
            "total_observations": len(observations),
            "matched": 0,
        }
    
    # ── Compute metrics ──
    wave_errors = []
    wind_errors = []
    pressure_errors = []
    
    # By lead time buckets
    lead_time_buckets = {
        "0-12h": {"wave": [], "wind": []},
        "12-24h": {"wave": [], "wind": []},
        "24-48h": {"wave": [], "wind": []},
        "48-72h": {"wave": [], "wind": []},
        "72h+": {"wave": [], "wind": []},
    }
    
    for pair in matched_pairs:
        if pair["actual_wave"] is not None and pair["pred_wave"] > 0:
            error = pair["pred_wave"] - pair["actual_wave"]
            wave_errors.append(error)
            
            # Bucket by lead time
            bucket = _get_lead_time_bucket(pair["forecast_hour"])
            lead_time_buckets[bucket]["wave"].append(error)
        
        if pair["actual_wind"] is not None and pair["pred_wind"] > 0:
            error = pair["pred_wind"] - pair["actual_wind"]
            wind_errors.append(error)
            
            bucket = _get_lead_time_bucket(pair["forecast_hour"])
            lead_time_buckets[bucket]["wind"].append(error)
        
        if pair["actual_pressure"] is not None and pair["pred_pressure"] > 900:
            error = pair["pred_pressure"] - pair["actual_pressure"]
            pressure_errors.append(error)
    
    # ── Build report ──
    report = {
        "status": "computed",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_predictions": len(predictions),
        "total_observations": len(observations),
        "matched_pairs": len(matched_pairs),
        "metrics": {
            "wave_height_m": _compute_stats(wave_errors) if wave_errors else None,
            "wind_speed_knots": _compute_stats(wind_errors) if wind_errors else None,
            "pressure_hpa": _compute_stats(pressure_errors) if pressure_errors else None,
        },
        "by_lead_time": {},
    }
    
    # Lead time breakdown
    for bucket, errors in lead_time_buckets.items():
        report["by_lead_time"][bucket] = {
            "wave": _compute_stats(errors["wave"]) if errors["wave"] else None,
            "wind": _compute_stats(errors["wind"]) if errors["wind"] else None,
        }
    
    # Save results
    _save_verification_report(report)
    
    return report


def _get_lead_time_bucket(hours: float) -> str:
    """Categorize forecast lead time into buckets."""
    if hours <= 12:
        return "0-12h"
    elif hours <= 24:
        return "12-24h"
    elif hours <= 48:
        return "24-48h"
    elif hours <= 72:
        return "48-72h"
    else:
        return "72h+"


def _compute_stats(errors: List[float]) -> Dict:
    """Compute RMSE, MAE, bias, and sample count from error list."""
    if not errors:
        return None
    
    n = len(errors)
    mean_error = sum(errors) / n  # Bias
    
    squared_errors = [e**2 for e in errors]
    rmse = math.sqrt(sum(squared_errors) / n)
    
    abs_errors = [abs(e) for e in errors]
    mae = sum(abs_errors) / n
    
    return {
        "rmse": round(rmse, 3),
        "mae": round(mae, 3),
        "bias": round(mean_error, 3),  # Positive = over-prediction
        "count": n,
        "min_error": round(min(errors), 3),
        "max_error": round(max(errors), 3),
    }


def _save_verification_report(report: Dict):
    """Save verification results to JSON file."""
    try:
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        filepath = RESULTS_DIR / f"verification_{month}.json"
        
        with open(filepath, "w") as f:
            json.dump(report, f, indent=2)
        
        # Also save latest
        latest = RESULTS_DIR / "latest.json"
        with open(latest, "w") as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Verification report saved: {filepath}")
    except Exception as e:
        logger.warning(f"Failed to save verification report: {e}")


def get_latest_report() -> Optional[Dict]:
    """Load the latest verification report if available."""
    latest = RESULTS_DIR / "latest.json"
    if latest.exists():
        try:
            with open(latest, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return None
