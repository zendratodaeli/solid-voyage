"""
Configuration constants for the Maritime Weather Routing Engine.
"""
import os

# --- Grid Configuration ---
GRID_RESOLUTION = float(os.getenv("GRID_RESOLUTION", "0.5"))  # degrees
LAT_MIN = -78.0  # Skip deep Antarctica
LAT_MAX = 78.0   # Skip deep Arctic (handled by ice layer)
LON_MIN = -180.0
LON_MAX = 180.0

# --- Vessel Defaults ---
DEFAULT_VESSEL_SPEED_KNOTS = 12.5
DEFAULT_DAILY_CONSUMPTION_MT = 28.0

# --- Safety Thresholds ---
WAVE_HEIGHT_LIMIT = 6.0       # meters — hard safety wall (no routing through)
WAVE_PENALTY_THRESHOLD = 2.0  # meters — speed reduction starts above this
WAVE_PENALTY_FACTOR = 0.5     # knots lost per meter of wave above threshold
MIN_EFFECTIVE_SPEED = 2.0     # knots — floor to prevent division by zero
HEAD_WIND_THRESHOLD = 20.0    # knots — above this, apply head wind penalty
HEAD_WIND_PENALTY = 0.95      # 5% speed reduction for strong head winds
HEAD_WIND_SECTOR = 60.0       # degrees — half-angle of "head wind" cone

# --- NOAA Data URLs ---
NOAA_GFS_BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"
NOAA_WW3_BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"
NOAA_RTOFS_BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/rtofs/prod"

# --- Data Storage ---
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
GFS_DIR = os.path.join(DATA_DIR, "gfs")
WW3_DIR = os.path.join(DATA_DIR, "ww3")
RTOFS_DIR = os.path.join(DATA_DIR, "rtofs")
ICE_DIR = os.path.join(DATA_DIR, "ice")
LAND_MASK_PATH = os.path.join(DATA_DIR, "land_mask.npy")

# --- Graph Rebuild ---
REBUILD_INTERVAL_HOURS = int(os.getenv("REBUILD_INTERVAL_HOURS", "6"))

# --- API ---
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8001"))

# --- Legal ---
SOLAS_DISCLAIMER = (
    "ADVISORY ONLY — For Voyage Planning Purposes. "
    "The Master retains sole authority and responsibility for safe navigation "
    "under SOLAS Chapter V, Regulation 34-1. "
    "This system does not replace ECDIS, GMDSS, or bridge team assessments."
)
