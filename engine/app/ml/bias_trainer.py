"""
ML Bias Correction Trainer — Replaces static REGIONAL_BIAS table.

Once 6+ months of forecast logs + ERA5 observations are available,
trains a Gradient Boosting model to predict systematic forecast errors
(bias) based on location, season, lead time, and raw forecast values.

The trained model replaces the hardcoded REGIONAL_BIAS lookup table
in the routing engine, providing data-driven correction.

Requires: scikit-learn (already in engine deps)
"""
import os
import csv
import json
import math
import pickle
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np

logger = logging.getLogger(__name__)

LOG_DIR = Path(os.environ.get("FORECAST_LOG_DIR", "/tmp/forecast_logs"))
ERA5_DIR = LOG_DIR / "era5"
MODEL_DIR = LOG_DIR / "ml_models"


class BiasCorrector:
    """
    ML-based bias correction for weather forecasts.
    
    Learns systematic errors (actual - predicted) as a function of:
    - Latitude, Longitude (spatial patterns)
    - Month (seasonal patterns)
    - Forecast lead time (error growth)
    - Raw forecast values (nonlinear correction)
    
    Falls back to static REGIONAL_BIAS if model is not trained.
    """
    
    # Static fallback — hardcoded regional bias (from CTO brief Gap 1)
    REGIONAL_BIAS = {
        "north_atlantic": {"wave": -0.15, "wind": -1.2},
        "north_pacific": {"wave": -0.20, "wind": -1.5},
        "south_atlantic": {"wave": 0.05, "wind": 0.3},
        "south_pacific": {"wave": 0.05, "wind": 0.5},
        "indian_ocean": {"wave": 0.10, "wind": 0.8},
        "mediterranean": {"wave": -0.10, "wind": -0.5},
        "baltic": {"wave": -0.30, "wind": -2.0},
        "caribbean": {"wave": -0.05, "wind": -0.3},
        "arctic": {"wave": 0.30, "wind": 2.0},
        "antarctic": {"wave": 0.25, "wind": 1.5},
        "default": {"wave": 0.0, "wind": 0.0},
    }
    
    def __init__(self):
        self.wave_model = None
        self.wind_model = None
        self._load_model()
    
    def _load_model(self):
        """Load trained models if available."""
        wave_path = MODEL_DIR / "wave_bias_model.pkl"
        wind_path = MODEL_DIR / "wind_bias_model.pkl"
        
        if wave_path.exists() and wind_path.exists():
            try:
                with open(wave_path, "rb") as f:
                    self.wave_model = pickle.load(f)
                with open(wind_path, "rb") as f:
                    self.wind_model = pickle.load(f)
                logger.info("ML bias correction models loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load bias models: {e}")
                self.wave_model = None
                self.wind_model = None
    
    def correct(
        self,
        lat: float,
        lon: float,
        forecast_hour: float,
        raw_wave: float,
        raw_wind: float,
        month: Optional[int] = None,
    ) -> Tuple[float, float]:
        """
        Apply bias correction to raw forecast values.
        
        Returns (corrected_wave, corrected_wind).
        Uses ML model if trained, otherwise falls back to static table.
        """
        if month is None:
            month = datetime.now(timezone.utc).month
        
        # Try ML model first
        if self.wave_model is not None and self.wind_model is not None:
            try:
                features = np.array([[lat, lon, month, forecast_hour, raw_wave, raw_wind]])
                wave_bias = float(self.wave_model.predict(features)[0])
                wind_bias = float(self.wind_model.predict(features)[0])
                
                corrected_wave = max(0, raw_wave - wave_bias)
                corrected_wind = max(0, raw_wind - wind_bias)
                
                return corrected_wave, corrected_wind
            except Exception as e:
                logger.warning(f"ML prediction failed, using static bias: {e}")
        
        # Fallback: static regional bias
        region = self._classify_region(lat, lon)
        bias = self.REGIONAL_BIAS.get(region, self.REGIONAL_BIAS["default"])
        
        corrected_wave = max(0, raw_wave + bias["wave"])
        corrected_wind = max(0, raw_wind + bias["wind"])
        
        return corrected_wave, corrected_wind
    
    @staticmethod
    def _classify_region(lat: float, lon: float) -> str:
        """Classify coordinate into ocean region."""
        if lat > 66.5:
            return "arctic"
        if lat < -60:
            return "antarctic"
        if lat > 30:
            if -80 < lon < 0:
                return "north_atlantic"
            if 100 < lon < 180 or -180 < lon < -100:
                return "north_pacific"
            if 0 < lon < 45:
                return "mediterranean"
            if 9 < lon < 30 and 54 < lat < 66:
                return "baltic"
        if 10 < lat < 30 and -100 < lon < -60:
            return "caribbean"
        if lat < 0 and 20 < lon < 120:
            return "indian_ocean"
        if lat < 0 and -80 < lon < 20:
            return "south_atlantic"
        if lat < 0:
            return "south_pacific"
        return "default"


def train_bias_model(min_samples: int = 100) -> Dict:
    """
    Train bias correction models from verified forecast data.
    
    Joins forecast logs with ERA5 observations to learn:
    bias = actual - predicted
    
    Features: lat, lon, month, forecast_hour, raw_wave, raw_wind
    Target: bias (positive = under-prediction, negative = over-prediction)
    
    Returns training summary.
    """
    from app.data.hindcast_verifier import _load_forecast_logs, _load_era5_observations
    
    predictions = _load_forecast_logs()
    observations = _load_era5_observations()
    
    if not predictions or not observations:
        return {"status": "insufficient_data", "predictions": len(predictions), "observations": len(observations)}
    
    # Build training dataset
    X_list = []
    y_wave_list = []
    y_wind_list = []
    
    for pred in predictions:
        try:
            target_time = pred.get("target_time", "")
            if not target_time:
                continue
            
            dt = datetime.fromisoformat(target_time.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
            key = f"{pred['lat']},{pred['lon']},{date_str}"
            
            obs = observations.get(key)
            if not obs:
                continue
            
            if obs["actual_wave"] is None or obs["actual_wind"] is None:
                continue
            
            features = [
                pred["lat"],
                pred["lon"],
                dt.month,
                pred["forecast_hour"],
                pred["predicted_wave"],
                pred["predicted_wind"],
            ]
            
            wave_bias = pred["predicted_wave"] - obs["actual_wave"]
            wind_bias = pred["predicted_wind"] - obs["actual_wind"]
            
            X_list.append(features)
            y_wave_list.append(wave_bias)
            y_wind_list.append(wind_bias)
        except (ValueError, TypeError, KeyError):
            continue
    
    if len(X_list) < min_samples:
        return {
            "status": "insufficient_samples",
            "samples": len(X_list),
            "min_required": min_samples,
            "message": f"Need {min_samples} matched pairs, have {len(X_list)}. Keep accumulating data.",
        }
    
    X = np.array(X_list)
    y_wave = np.array(y_wave_list)
    y_wind = np.array(y_wind_list)
    
    # Train models
    try:
        from sklearn.ensemble import GradientBoostingRegressor
        from sklearn.model_selection import cross_val_score
    except ImportError:
        return {"status": "missing_dependency", "message": "scikit-learn not installed"}
    
    # Wave bias model
    wave_model = GradientBoostingRegressor(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        min_samples_leaf=10,
        random_state=42,
    )
    wave_model.fit(X, y_wave)
    wave_cv = cross_val_score(wave_model, X, y_wave, cv=min(5, len(X_list)), scoring="neg_mean_squared_error")
    wave_rmse = float(np.sqrt(-wave_cv.mean()))
    
    # Wind bias model
    wind_model = GradientBoostingRegressor(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        min_samples_leaf=10,
        random_state=42,
    )
    wind_model.fit(X, y_wind)
    wind_cv = cross_val_score(wind_model, X, y_wind, cv=min(5, len(X_list)), scoring="neg_mean_squared_error")
    wind_rmse = float(np.sqrt(-wind_cv.mean()))
    
    # Save models
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    
    with open(MODEL_DIR / "wave_bias_model.pkl", "wb") as f:
        pickle.dump(wave_model, f)
    with open(MODEL_DIR / "wind_bias_model.pkl", "wb") as f:
        pickle.dump(wind_model, f)
    
    # Save metadata
    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "samples": len(X_list),
        "wave_bias_rmse": round(wave_rmse, 4),
        "wind_bias_rmse": round(wind_rmse, 4),
        "wave_mean_bias": round(float(y_wave.mean()), 4),
        "wind_mean_bias": round(float(y_wind.mean()), 4),
        "features": ["lat", "lon", "month", "forecast_hour", "raw_wave", "raw_wind"],
    }
    
    with open(MODEL_DIR / "model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"Bias models trained: {len(X_list)} samples, wave RMSE={wave_rmse:.4f}, wind RMSE={wind_rmse:.4f}")
    
    return {
        "status": "trained",
        **metadata,
    }
