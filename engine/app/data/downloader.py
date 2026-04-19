"""
NOAA data downloader — fetches all weather, ocean, and ice data for the routing engine.

Data sources:
  GFS  — Wind U/V at 10m, pressure, visibility (0.25° resolution, every 3h forecast)
  WW3  — Wave height, period, direction, swell, wind waves (0.25°, every 3h forecast)
  RTOFS — Ocean current U/V + SST at surface (global daily forecast)
  OISST — Sea Surface Temperature satellite analysis (daily, 0.25°)
  USNIC — Arctic/Antarctic ice edge shapefiles (weekly)
  IIP   — International Ice Patrol iceberg positions (daily, North Atlantic)

Downloads multi-step GRIB files (57 forecast steps = 7 days) using
NOAA's NOMADS HTTP server with byte-range filtering via .idx files
to minimize download size.

Multi-step downloads use parallel threads for speed (~3 min per cycle).
"""
import os
import io
import csv
import logging
import requests
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.config import (
    GFS_DIR, WW3_DIR, RTOFS_DIR, ICE_DIR, ICEBERG_DIR, DATA_DIR,
    FORECAST_DIR, OISST_DIR,
    USNIC_ICE_URL, IIP_ICEBERG_URL, IIP_BULLETIN_URL,
    FORECAST_HOURS, FORECAST_DOWNLOAD_THREADS,
    GFS_RESOLUTION, WW3_RESOLUTION,
)

logger = logging.getLogger(__name__)

# Shared HTTP session for connection pooling
_session = requests.Session()
_session.headers.update({"User-Agent": "SolidVoyage-WeatherEngine/2.0"})


# ═══════════════════════════════════════════════════════════════════
# SHARED UTILITIES
# ═══════════════════════════════════════════════════════════════════

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

        # Quick check if the data exists (check f000 idx)
        idx_url = (
            f"https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
            f"gfs.{date_str}/{run_str}/atmos/"
            f"gfs.t{run_str}z.pgrb2.{GFS_RESOLUTION}.f000.idx"
        )
        try:
            resp = _session.head(idx_url, timeout=10)
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


def _download_byte_range(grib_url: str, start: int, end: int | None, timeout: int = 60) -> bytes | None:
    """Download a specific byte range from a GRIB file. Follows redirects."""
    range_header = f"bytes={start}-{end}" if end else f"bytes={start}-"
    try:
        # First resolve redirects to get the final URL
        head_resp = _session.head(grib_url, allow_redirects=True, timeout=15)
        final_url = head_resp.url if head_resp.status_code == 200 else grib_url

        resp = _session.get(final_url, headers={"Range": range_header}, timeout=timeout)
        if resp.status_code in (200, 206):
            return resp.content
        logger.error(f"Byte-range download failed: HTTP {resp.status_code}")
        return None
    except requests.RequestException as e:
        logger.error(f"Byte-range download error: {e}")
        return None


def _download_filtered_grib(
    grib_url: str,
    idx_url: str,
    variable_patterns: list[str],
    out_path: str,
    label: str = "",
) -> bool:
    """
    Download specific variables from a GRIB file using byte-range filtering.

    Returns True if successful.
    """
    try:
        # Step 1: Get the .idx file (follow redirects)
        idx_resp = _session.get(idx_url, timeout=30, allow_redirects=True)
        if idx_resp.status_code != 200:
            return False

        # Step 2: Find byte ranges for our variables
        ranges = parse_grib_idx(idx_resp.text, variable_patterns)
        if not ranges:
            return False

        # Step 3: Download all variable byte ranges and concatenate
        grib_data = b""
        for start, end in ranges:
            chunk = _download_byte_range(grib_url, start, end)
            if chunk:
                grib_data += chunk

        if not grib_data:
            return False

        # Step 4: Write to disk
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(grib_data)

        return True

    except Exception as e:
        logger.debug(f"Filtered GRIB download failed ({label}): {e}")
        return False


# ═══════════════════════════════════════════════════════════════════
# GFS MULTI-STEP FORECAST (Wind + Pressure + Visibility)
# ═══════════════════════════════════════════════════════════════════

def _download_single_gfs_step(
    date_str: str,
    run_str: str,
    forecast_hour: int,
    out_dir: str,
) -> tuple[int, bool]:
    """Download a single GFS forecast step using NOMADS CGI filter.
    
    Uses the server-side filter to request only specific variables,
    avoiding the need for byte-range requests (which fail on Akamai CDN).
    Returns (forecast_hour, success).
    """
    fh = f"f{forecast_hour:03d}"
    grib_filename = f"gfs.t{run_str}z.pgrb2.{GFS_RESOLUTION}.{fh}"
    out_path = os.path.join(out_dir, f"gfs_{fh}.grib2")

    # NOMADS CGI filter — server extracts only the variables we need
    filter_url = (
        f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_{GFS_RESOLUTION}.pl?"
        f"file={grib_filename}"
        f"&var_UGRD=on&var_VGRD=on&var_PRMSL=on&var_VIS=on"
        f"&lev_10_m_above_ground=on&lev_mean_sea_level=on&lev_surface=on"
        f"&dir=%2Fgfs.{date_str}%2F{run_str}%2Fatmos"
    )

    try:
        resp = _session.get(filter_url, timeout=60, allow_redirects=True)
        if resp.status_code == 200 and len(resp.content) > 1000:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(resp.content)
            return forecast_hour, True
        return forecast_hour, False
    except requests.RequestException:
        return forecast_hour, False


def download_gfs_multistep(date_str: str = None, run_str: str = None) -> dict:
    """
    Download multi-step GFS forecast (57 steps × 4 variables).

    Uses parallel downloads for speed.

    Returns:
        dict mapping variable name → {forecast_hour: file_path}
    """
    if date_str is None or run_str is None:
        date_str, run_str = get_latest_gfs_cycle()

    out_dir = os.path.join(FORECAST_DIR, "gfs")
    os.makedirs(out_dir, exist_ok=True)

    logger.info(f"Downloading GFS multi-step forecast ({len(FORECAST_HOURS)} steps) from {date_str}/{run_str}z...")

    # Parallel download
    success_count = 0
    file_paths = {}  # forecast_hour → file_path

    with ThreadPoolExecutor(max_workers=FORECAST_DOWNLOAD_THREADS) as executor:
        futures = {
            executor.submit(
                _download_single_gfs_step, date_str, run_str, fh, out_dir
            ): fh
            for fh in FORECAST_HOURS
        }

        for future in as_completed(futures):
            fh, success = future.result()
            if success:
                file_paths[fh] = os.path.join(out_dir, f"gfs_f{fh:03d}.grib2")
                success_count += 1

    logger.info(f"GFS multi-step: {success_count}/{len(FORECAST_HOURS)} steps downloaded")

    return {
        "gfs_forecast_paths": file_paths,
        "cycle_date": date_str,
        "cycle_run": run_str,
        "steps_downloaded": success_count,
    }


# ═══════════════════════════════════════════════════════════════════
# GFS SINGLE-STEP (for routing graph — backward compatible)
# ═══════════════════════════════════════════════════════════════════

def download_gfs_wind(date_str: str = None, run_str: str = None) -> dict:
    """
    Download GFS wind U/V components at 10m for the analysis time (f000).
    Backward compatible with the existing routing graph builder.
    """
    if date_str is None or run_str is None:
        date_str, run_str = get_latest_gfs_cycle()

    os.makedirs(GFS_DIR, exist_ok=True)

    base_url = (
        f"https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
        f"gfs.{date_str}/{run_str}/atmos"
    )
    grib_filename = f"gfs.t{run_str}z.pgrb2.{GFS_RESOLUTION}.f000"
    grib_url = f"{base_url}/{grib_filename}"
    idx_url = f"{grib_url}.idx"

    logger.info(f"Downloading GFS wind from: {grib_url}")

    try:
        idx_resp = _session.get(idx_url, timeout=30)
        idx_resp.raise_for_status()

        wind_patterns = [
            "UGRD:10 m above ground",
            "VGRD:10 m above ground",
        ]
        ranges = parse_grib_idx(idx_resp.text, wind_patterns)

        if len(ranges) < 2:
            logger.warning("Could not find both wind variables in GFS .idx file. Downloading full file.")
            return _download_full_grib(grib_url, grib_filename, GFS_DIR)

        result = {}
        var_names = ["wind_u", "wind_v"]
        for var_name, (start, end) in zip(var_names, ranges):
            data = _download_byte_range(grib_url, start, end)
            if data:
                out_path = os.path.join(GFS_DIR, f"{var_name}_latest.grib2")
                with open(out_path, "wb") as f:
                    f.write(data)
                result[f"{var_name}_path"] = out_path
                logger.info(f"Downloaded GFS {var_name}: {len(data) / 1024:.0f} KB")
            else:
                logger.error(f"Failed to download GFS {var_name}")

        return result

    except requests.RequestException as e:
        logger.error(f"GFS download failed: {e}")
        return {}


# ═══════════════════════════════════════════════════════════════════
# WW3 MULTI-STEP FORECAST (Waves + Swell)
# ═══════════════════════════════════════════════════════════════════

def _download_single_ww3_step(
    date_str: str,
    run_str: str,
    forecast_hour: int,
    out_dir: str,
) -> tuple[int, bool]:
    """Download a single WW3 forecast step using NOMADS CGI wave filter.
    
    Uses the server-side filter to request only wave variables,
    avoiding byte-range issues with Akamai CDN.
    Returns (forecast_hour, success).
    """
    fh = f"f{forecast_hour:03d}"
    grib_filename = f"gfswave.t{run_str}z.global.{WW3_RESOLUTION}.{fh}.grib2"
    out_path = os.path.join(out_dir, f"ww3_{fh}.grib2")

    # NOMADS CGI wave filter
    filter_url = (
        f"https://nomads.ncep.noaa.gov/cgi-bin/filter_wave.pl?"
        f"file={grib_filename}"
        f"&var_HTSGW=on&var_PERPW=on&var_DIRPW=on&var_WVHGT=on&var_SWELL=on"
        f"&dir=%2Fgfs.{date_str}%2F{run_str}%2Fwave%2Fgridded"
    )

    try:
        resp = _session.get(filter_url, timeout=60, allow_redirects=True)
        if resp.status_code == 200 and len(resp.content) > 1000:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(resp.content)
            return forecast_hour, True
        return forecast_hour, False
    except requests.RequestException:
        return forecast_hour, False


def download_ww3_multistep(date_str: str = None, run_str: str = None) -> dict:
    """
    Download multi-step WW3 wave forecast (57 steps × 5 variables).

    Uses parallel downloads for speed.

    Returns:
        dict mapping variable → {forecast_hour: file_path}
    """
    if date_str is None or run_str is None:
        date_str, run_str = get_latest_gfs_cycle()

    out_dir = os.path.join(FORECAST_DIR, "ww3")
    os.makedirs(out_dir, exist_ok=True)

    logger.info(f"Downloading WW3 multi-step forecast ({len(FORECAST_HOURS)} steps) from {date_str}/{run_str}z...")

    success_count = 0
    file_paths = {}

    with ThreadPoolExecutor(max_workers=FORECAST_DOWNLOAD_THREADS) as executor:
        futures = {
            executor.submit(
                _download_single_ww3_step, date_str, run_str, fh, out_dir
            ): fh
            for fh in FORECAST_HOURS
        }

        for future in as_completed(futures):
            fh, success = future.result()
            if success:
                file_paths[fh] = os.path.join(out_dir, f"ww3_f{fh:03d}.grib2")
                success_count += 1

    logger.info(f"WW3 multi-step: {success_count}/{len(FORECAST_HOURS)} steps downloaded")

    return {
        "ww3_forecast_paths": file_paths,
        "steps_downloaded": success_count,
    }


# ═══════════════════════════════════════════════════════════════════
# WW3 SINGLE-STEP (for routing graph — backward compatible)
# ═══════════════════════════════════════════════════════════════════

def download_ww3_waves(date_str: str = None, run_str: str = None) -> dict:
    """
    Download WaveWatch III significant wave height and peak wave period (single step).
    Backward compatible with the existing routing graph builder.
    """
    if date_str is None or run_str is None:
        date_str, run_str = get_latest_gfs_cycle()

    os.makedirs(WW3_DIR, exist_ok=True)

    base_url = (
        f"https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
        f"gfs.{date_str}/{run_str}/wave/gridded"
    )
    grib_filename = f"gfswave.t{run_str}z.global.{WW3_RESOLUTION}.f000.grib2"
    grib_url = f"{base_url}/{grib_filename}"
    idx_url = f"{grib_url}.idx"

    logger.info(f"Downloading WW3 waves from: {grib_url}")

    try:
        idx_resp = _session.get(idx_url, timeout=30)
        idx_resp.raise_for_status()

        wave_patterns = [
            "HTSGW:surface",
            "PERPW:surface",
        ]
        ranges = parse_grib_idx(idx_resp.text, wave_patterns)

        result = {}

        if len(ranges) >= 1:
            data = _download_byte_range(grib_url, ranges[0][0], ranges[0][1])
            if data:
                out_path = os.path.join(WW3_DIR, "wave_height_latest.grib2")
                with open(out_path, "wb") as f:
                    f.write(data)
                result["wave_height_path"] = out_path
                logger.info(f"Downloaded WW3 wave height: {len(data) / 1024:.0f} KB")

        if len(ranges) >= 2:
            data = _download_byte_range(grib_url, ranges[1][0], ranges[1][1])
            if data:
                out_path = os.path.join(WW3_DIR, "wave_period_latest.grib2")
                with open(out_path, "wb") as f:
                    f.write(data)
                result["wave_period_path"] = out_path
                logger.info(f"Downloaded WW3 wave period: {len(data) / 1024:.0f} KB")

        if not result:
            logger.warning("WW3 byte-range filtering failed — trying full file download")
            return _download_full_grib(grib_url, grib_filename, WW3_DIR, key="wave_height_path")

        return result

    except requests.RequestException as e:
        logger.error(f"WW3 download failed: {e}")
        return {}


# ═══════════════════════════════════════════════════════════════════
# RTOFS CURRENTS + SST
# ═══════════════════════════════════════════════════════════════════

def download_rtofs_currents() -> dict:
    """
    Download NOAA RTOFS (Real-Time Ocean Forecast System) surface currents + SST.

    RTOFS runs daily and produces a global ocean forecast.
    We use the nowcast (n024) diagnostic fields at the surface.
    The diagnostic file contains u_velocity, v_velocity, AND sst.

    Returns:
        dict with 'rtofs_nc_path', or empty dict
    """
    os.makedirs(RTOFS_DIR, exist_ok=True)

    now = datetime.now(timezone.utc)
    result = {}

    # Try today and yesterday (RTOFS can be delayed)
    for days_ago in [0, 1, 2]:
        target_date = now - timedelta(days=days_ago)
        date_str = target_date.strftime("%Y%m%d")

        base_url = (
            f"https://nomads.ncep.noaa.gov/pub/data/nccf/com/rtofs/prod/"
            f"rtofs.{date_str}"
        )

        nc_url = f"{base_url}/rtofs_glo_2ds_n024_diag.nc"

        logger.info(f"Downloading RTOFS currents + SST for {date_str}...")

        try:
            resp = _session.head(nc_url, timeout=15)
            if resp.status_code != 200:
                logger.debug(f"RTOFS not available for {date_str}, trying earlier date")
                continue

            resp = _session.get(nc_url, timeout=300, stream=True)
            resp.raise_for_status()

            out_path = os.path.join(RTOFS_DIR, "rtofs_surface_latest.nc")
            total_bytes = 0
            with open(out_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
                    total_bytes += len(chunk)

            size_mb = total_bytes / (1024 * 1024)
            logger.info(f"Downloaded RTOFS surface currents + SST: {size_mb:.1f} MB")

            result["rtofs_nc_path"] = out_path
            result["date"] = date_str
            return result

        except requests.RequestException as e:
            logger.debug(f"RTOFS download attempt for {date_str} failed: {e}")
            continue

    logger.warning("RTOFS download failed for all attempted dates")
    return result


# ═══════════════════════════════════════════════════════════════════
# NOAA OISST (Satellite-Verified Sea Surface Temperature)
# ═══════════════════════════════════════════════════════════════════

def download_oisst() -> dict:
    """
    Download NOAA OISST v2.1 (Optimum Interpolation SST).

    This is the satellite-verified "ground truth" SST — updated daily.
    The data is a NetCDF file on a 0.25° grid covering the global ocean.

    Uses NOAA's THREDDS server with the latest daily AVHRR product.

    Returns:
        dict with 'oisst_nc_path' or empty dict
    """
    os.makedirs(OISST_DIR, exist_ok=True)

    now = datetime.now(timezone.utc)

    # OISST is published with ~1 day lag
    for days_ago in [1, 2, 3]:
        target_date = now - timedelta(days=days_ago)
        year = target_date.strftime("%Y")
        month = target_date.strftime("%m")
        date_str = target_date.strftime("%Y%m%d")

        # OISST v2.1 file naming convention
        nc_filename = f"oisst-avhrr-v02r01.{date_str}.nc"
        nc_url = f"https://www.ncei.noaa.gov/data/sea-surface-temperature-optimum-interpolation/v2.1/access/avhrr/{year}{month}/{nc_filename}"

        logger.info(f"Downloading OISST for {date_str}...")

        try:
            resp = _session.get(nc_url, timeout=120, stream=True)
            if resp.status_code != 200:
                logger.debug(f"OISST not available for {date_str}")
                continue

            out_path = os.path.join(OISST_DIR, "oisst_latest.nc")
            total_bytes = 0
            with open(out_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
                    total_bytes += len(chunk)

            size_mb = total_bytes / (1024 * 1024)
            logger.info(f"Downloaded OISST: {size_mb:.1f} MB")

            return {"oisst_nc_path": out_path, "date": date_str}

        except requests.RequestException as e:
            logger.debug(f"OISST download attempt for {date_str} failed: {e}")
            continue

    logger.warning("OISST download failed for all attempted dates")
    return {}


# ═══════════════════════════════════════════════════════════════════
# USNIC ICE SHAPEFILES
# ═══════════════════════════════════════════════════════════════════

def download_usnic_ice() -> dict:
    """
    Download the latest USNIC (National Ice Center) Arctic ice analysis.

    USNIC publishes weekly ice edge shapefiles covering the Arctic and Antarctic.
    Format: Zipped ESRI Shapefile (.shp/.shx/.dbf/.prj)

    Returns:
        dict with 'shapefile_path' pointing to the zip, or empty dict on failure
    """
    os.makedirs(ICE_DIR, exist_ok=True)

    shapefile_path = os.path.join(ICE_DIR, "arctic_ice_latest.zip")

    logger.info("Downloading USNIC Arctic ice shapefile...")

    try:
        resp = _session.get(
            USNIC_ICE_URL,
            timeout=120,
            stream=True,
            allow_redirects=True,
        )
        resp.raise_for_status()

        total_bytes = 0
        with open(shapefile_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
                total_bytes += len(chunk)

        size_kb = total_bytes / 1024
        logger.info(f"Downloaded USNIC ice shapefile: {size_kb:.0f} KB")
        return {"shapefile_path": shapefile_path}

    except requests.RequestException as e:
        logger.warning(f"USNIC ice download failed (will use synthetic): {e}")
        return {}


# ═══════════════════════════════════════════════════════════════════
# IIP ICEBERGS
# ═══════════════════════════════════════════════════════════════════

def download_iip_icebergs() -> dict:
    """
    Download International Ice Patrol iceberg limit data.

    The IIP (U.S. Coast Guard) publishes daily iceberg limits in the
    North Atlantic — the Grand Banks region off Newfoundland.
    This is the same patrol established after the Titanic disaster.

    Downloads two products:
    1. Shapefile (.zip) — sea ice and iceberg limit polygons for GIS
    2. Bulletin (.txt) — human-readable iceberg situation summary

    Returns:
        dict with 'iceberg_shp_path' and/or 'bulletin_path', or empty dict
    """
    os.makedirs(ICEBERG_DIR, exist_ok=True)
    result = {}

    # --- 1. Download iceberg limit shapefile ---
    shp_path = os.path.join(ICEBERG_DIR, "iip_iceberg_limit_latest.zip")
    logger.info("Downloading IIP iceberg limit shapefile...")

    try:
        resp = _session.get(IIP_ICEBERG_URL, timeout=60, stream=True, allow_redirects=True)
        resp.raise_for_status()

        total_bytes = 0
        with open(shp_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
                total_bytes += len(chunk)

        size_kb = total_bytes / 1024
        logger.info(f"Downloaded IIP iceberg shapefile: {size_kb:.0f} KB")
        result["iceberg_shp_path"] = shp_path

    except requests.RequestException as e:
        logger.info(f"IIP iceberg shapefile not available: {e}")

    # --- 2. Download iceberg bulletin (supplementary) ---
    bulletin_path = os.path.join(ICEBERG_DIR, "IcebergBulletin.txt")

    try:
        resp = _session.get(IIP_BULLETIN_URL, timeout=30)
        resp.raise_for_status()

        with open(bulletin_path, "w", encoding="utf-8") as f:
            f.write(resp.text)

        # Count icebergs mentioned in the bulletin
        iceberg_count = resp.text.lower().count("iceberg")
        result["bulletin_path"] = bulletin_path
        result["iceberg_count"] = iceberg_count
        logger.info(f"Downloaded IIP bulletin ({len(resp.text)} chars)")

    except requests.RequestException as e:
        logger.info(f"IIP bulletin not available: {e}")

    return result

# ═══════════════════════════════════════════════════════════════════
# FULL FILE DOWNLOAD FALLBACK
# ═══════════════════════════════════════════════════════════════════

def _download_full_grib(grib_url: str, filename: str, out_dir: str, key: str = "full_grib_path") -> dict:
    """Fallback: download the entire GRIB file if byte-range filtering fails."""
    try:
        resp = _session.get(grib_url, timeout=300, stream=True)
        resp.raise_for_status()

        out_path = os.path.join(out_dir, filename)
        total_bytes = 0
        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
                total_bytes += len(chunk)

        size_mb = total_bytes / (1024 * 1024)
        logger.info(f"Downloaded full GRIB file: {size_mb:.1f} MB")
        return {key: out_path}

    except requests.RequestException as e:
        logger.error(f"Full GRIB download failed: {e}")
        return {}


# ═══════════════════════════════════════════════════════════════════
# MASTER DOWNLOAD FUNCTIONS
# ═══════════════════════════════════════════════════════════════════

def download_all_data() -> dict:
    """
    Download all required weather, ocean, and ice data sources.

    This is called by the graph builder on startup and every 6 hours.
    Each data source is independent — if one fails, the others still proceed.

    Returns:
        dict with paths to downloaded files, keyed by data type
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    results = {}

    # Determine the GFS cycle once — reuse for GFS and WW3 (same cycle)
    date_str, run_str = get_latest_gfs_cycle()

    # --- 1. GFS Wind (single step for routing graph) ---
    gfs_result = download_gfs_wind(date_str, run_str)
    results["gfs"] = gfs_result
    if gfs_result:
        logger.info("✅ GFS wind data downloaded")
    else:
        logger.warning("⚠️ GFS wind download failed — will use synthetic wind")

    # --- 2. WW3 Waves (single step for routing graph) ---
    ww3_result = download_ww3_waves(date_str, run_str)
    results["ww3"] = ww3_result
    if ww3_result:
        logger.info("✅ WW3 wave data downloaded")
    else:
        logger.warning("⚠️ WW3 wave download failed — will use synthetic waves")

    # --- 3. RTOFS Currents + SST ---
    rtofs_result = download_rtofs_currents()
    results["rtofs"] = rtofs_result
    if rtofs_result:
        logger.info("✅ RTOFS current + SST data downloaded")
    else:
        logger.warning("⚠️ RTOFS current download failed — will use synthetic currents")

    # --- 4. USNIC Ice ---
    ice_result = download_usnic_ice()
    results["ice"] = ice_result
    if ice_result:
        logger.info("✅ USNIC ice data downloaded")
    else:
        logger.info("ℹ️ USNIC ice not available — using seasonal model")

    # --- 5. IIP Icebergs ---
    iceberg_result = download_iip_icebergs()
    results["icebergs"] = iceberg_result
    if iceberg_result:
        logger.info(f"✅ IIP iceberg data downloaded ({iceberg_result.get('iceberg_count', 0)} icebergs)")
    else:
        logger.info("ℹ️ IIP iceberg data not available (may be off-season)")

    # --- 6. Multi-step GFS forecast (parallel) ---
    gfs_forecast = download_gfs_multistep(date_str, run_str)
    results["gfs_forecast"] = gfs_forecast
    logger.info(f"✅ GFS forecast: {gfs_forecast.get('steps_downloaded', 0)}/{len(FORECAST_HOURS)} steps")

    # --- 7. Multi-step WW3 forecast (parallel) ---
    ww3_forecast = download_ww3_multistep(date_str, run_str)
    results["ww3_forecast"] = ww3_forecast
    logger.info(f"✅ WW3 forecast: {ww3_forecast.get('steps_downloaded', 0)}/{len(FORECAST_HOURS)} steps")

    # --- 8. OISST (satellite SST) ---
    oisst_result = download_oisst()
    results["oisst"] = oisst_result
    if oisst_result:
        logger.info("✅ OISST satellite SST downloaded")
    else:
        logger.info("ℹ️ OISST not available — using RTOFS SST only")

    results["cycle_date"] = date_str
    results["cycle_run"] = run_str

    return results
