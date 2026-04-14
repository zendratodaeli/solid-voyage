"""
NOAA GRIB data downloader.

Downloads GFS (wind), WaveWatch III (waves), and RTOFS (currents) forecast data.
For Phase 1, we use a simplified approach: download the latest available analysis
(T+0) GFS data as a single snapshot for graph construction.

Uses NOAA's NOMADS HTTP server with byte-range filtering via .idx files
to minimize download size (~20 MB instead of ~300 MB per file).
"""
import os
import re
import logging
import requests
from datetime import datetime, timedelta, timezone
from app.config import GFS_DIR, WW3_DIR, RTOFS_DIR, DATA_DIR

logger = logging.getLogger(__name__)


def get_latest_gfs_cycle() -> tuple[str, str]:
    """
    Determine the latest available GFS cycle.
    GFS runs at 00z, 06z, 12z, 18z. Data is typically available ~4 hours after cycle time.

    Returns:
        (date_str, run_str): e.g., ("20260413", "00")
    """
    now = datetime.now(timezone.utc)

    # Try the most recent cycle first, working backwards
    for hours_ago in [4, 10, 16, 22, 28]:
        cycle_time = now - timedelta(hours=hours_ago)
        run_hour = (cycle_time.hour // 6) * 6
        date_str = cycle_time.strftime("%Y%m%d")
        run_str = f"{run_hour:02d}"

        # Quick check if the data exists
        idx_url = (
            f"https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
            f"gfs.{date_str}/{run_str}/atmos/"
            f"gfs.t{run_str}z.pgrb2.0p50.f000.idx"
        )
        try:
            resp = requests.head(idx_url, timeout=10)
            if resp.status_code == 200:
                logger.info(f"Found GFS cycle: {date_str}/{run_str}z")
                return date_str, run_str
        except requests.RequestException:
            continue

    # Fallback: just use 24 hours ago, 00z
    fallback = now - timedelta(hours=24)
    return fallback.strftime("%Y%m%d"), "00"


def parse_grib_idx(idx_content: str, variable_patterns: list[str]) -> list[tuple[int, int]]:
    """
    Parse a GRIB .idx file to find byte ranges for specific variables.

    Args:
        idx_content: Text content of the .idx file
        variable_patterns: List of patterns to match (e.g., ["UGRD:10 m above ground"])

    Returns:
        List of (start_byte, end_byte) tuples for matching records
    """
    lines = idx_content.strip().split("\n")
    ranges = []

    for i, line in enumerate(lines):
        for pattern in variable_patterns:
            if pattern in line:
                # Extract start byte from this line
                parts = line.split(":")
                start_byte = int(parts[1])

                # End byte is the start of the next record, or EOF
                if i + 1 < len(lines):
                    next_parts = lines[i + 1].split(":")
                    end_byte = int(next_parts[1]) - 1
                else:
                    end_byte = None  # Read to end of file

                ranges.append((start_byte, end_byte))
                break

    return ranges


def download_gfs_wind(date_str: str = None, run_str: str = None) -> dict:
    """
    Download GFS wind U/V components at 10m for the analysis time (f000).

    Uses the 0.50° resolution product for efficiency.
    Downloads only the wind variables via byte-range filtering.

    Returns:
        dict with 'wind_u_path' and 'wind_v_path' file paths, or empty dict on failure
    """
    if date_str is None or run_str is None:
        date_str, run_str = get_latest_gfs_cycle()

    os.makedirs(GFS_DIR, exist_ok=True)

    base_url = (
        f"https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
        f"gfs.{date_str}/{run_str}/atmos"
    )
    grib_filename = f"gfs.t{run_str}z.pgrb2.0p50.f000"
    grib_url = f"{base_url}/{grib_filename}"
    idx_url = f"{grib_url}.idx"

    logger.info(f"Downloading GFS wind from: {grib_url}")

    try:
        # Step 1: Download .idx file to find byte ranges
        idx_resp = requests.get(idx_url, timeout=30)
        idx_resp.raise_for_status()

        # Step 2: Find byte ranges for wind U and V at 10m
        wind_patterns = [
            "UGRD:10 m above ground",
            "VGRD:10 m above ground",
        ]
        ranges = parse_grib_idx(idx_resp.text, wind_patterns)

        if len(ranges) < 2:
            logger.warning("Could not find both wind variables in GFS .idx file. Downloading full file.")
            # Fallback: download the full GRIB file
            return _download_full_gfs(grib_url, grib_filename)

        # Step 3: Download each variable's byte range
        result = {}
        var_names = ["wind_u", "wind_v"]
        for var_name, (start, end) in zip(var_names, ranges):
            range_header = f"bytes={start}-{end}" if end else f"bytes={start}-"
            resp = requests.get(grib_url, headers={"Range": range_header}, timeout=60)

            if resp.status_code in (200, 206):
                out_path = os.path.join(GFS_DIR, f"{var_name}_latest.grib2")
                with open(out_path, "wb") as f:
                    f.write(resp.content)
                result[f"{var_name}_path"] = out_path
                size_kb = len(resp.content) / 1024
                logger.info(f"Downloaded {var_name}: {size_kb:.0f} KB")
            else:
                logger.error(f"Failed to download {var_name}: HTTP {resp.status_code}")

        return result

    except requests.RequestException as e:
        logger.error(f"GFS download failed: {e}")
        return {}


def _download_full_gfs(grib_url: str, filename: str) -> dict:
    """Fallback: download the entire GRIB file if byte-range filtering fails."""
    try:
        resp = requests.get(grib_url, timeout=300, stream=True)
        resp.raise_for_status()

        out_path = os.path.join(GFS_DIR, f"{filename}")
        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        size_mb = os.path.getsize(out_path) / (1024 * 1024)
        logger.info(f"Downloaded full GFS file: {size_mb:.1f} MB")
        return {"full_grib_path": out_path}

    except requests.RequestException as e:
        logger.error(f"Full GFS download failed: {e}")
        return {}


def download_all_data() -> dict:
    """
    Download all required weather data sources.

    Returns:
        dict with paths to downloaded files, keyed by data type
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    results = {}

    # GFS Wind
    gfs_result = download_gfs_wind()
    if gfs_result:
        results["gfs"] = gfs_result
        logger.info("✅ GFS wind data downloaded successfully")
    else:
        logger.warning("⚠️ GFS wind data download failed — graph will be built without wind")

    # WW3 Waves and RTOFS Currents are Phase 1b additions
    # For now, the graph is built with wind data only, which provides
    # the core routing benefit (storm avoidance, wind optimization)
    results["ww3"] = {}  # Placeholder for Phase 1b
    results["rtofs"] = {}  # Placeholder for Phase 1b

    return results
