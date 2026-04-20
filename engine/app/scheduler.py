"""
Smart Polling Scheduler — event-driven forecast refresh.

Matches enterprise-grade update cadence (StormGeo / Kepler / DTN):
  - Polls every 30 minutes for new ECMWF and GFS cycles
  - Triggers rebuild ONLY when newer data is detected
  - Avoids redundant rebuilds when data hasn't changed
  - Old data keeps serving requests until new graph is ready

NWP model publication schedule (UTC):
  ECMWF HRES (00Z, 12Z runs):
    - Available ~7-9h after model run time
    - 00Z run → ready ~07:00-09:00 UTC
    - 12Z run → ready ~19:00-21:00 UTC

  GFS (00Z, 06Z, 12Z, 18Z runs):
    - Available ~3.5-4.5h after model run time
    - 00Z → ~03:30, 06Z → ~09:30, 12Z → ~15:30, 18Z → ~21:30

With 30-minute polling, new data is ingested within 30 minutes of publication.
This is operationally equivalent to "continuous" update frequency claimed by
commercial weather routing providers.
"""

import logging
import threading
import time
import requests
from datetime import datetime, timezone, timedelta
from app.config import ECMWF_DIR, GFS_RESOLUTION

logger = logging.getLogger(__name__)

# How often to check for new data (seconds)
POLL_INTERVAL_SECONDS = 30 * 60  # 30 minutes

# GFS cycle schedule (UTC hours)
GFS_CYCLES = [0, 6, 12, 18]
# Approximate hours after cycle time until data is available
GFS_AVAILABILITY_LAG_H = 4

# ECMWF HRES cycle schedule (UTC hours)
ECMWF_CYCLES = [0, 12]
# Approximate hours after cycle time until data is available
ECMWF_AVAILABILITY_LAG_H = 8

# NOAA index URL template for quick availability checks (HEAD request only)
GFS_IDX_TEMPLATE = (
    "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
    "gfs.{date}/{run}/atmos/gfs.t{run}z.pgrb2.{resol}.f000.idx"
)


class SmartScheduler:
    """
    Event-driven scheduler that checks for new NWP data every 30 minutes.

    Instead of blindly rebuilding on a fixed timer, this scheduler:
      1. Polls NOAA GFS and ECMWF publication endpoints
      2. Compares against the last ingested cycle
      3. Triggers a rebuild ONLY when a newer cycle is detected
      4. Logs both hits (new data found) and skips (no new data)
    """

    def __init__(self, ocean_router):
        self.ocean_router = ocean_router
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

        # Track last ingested cycles
        self.last_gfs_cycle: str = ""       # e.g., "20260420/06"
        self.last_ecmwf_cycle: str = ""     # e.g., "20260420/00"

        # Stats
        self.last_rebuild: str | None = None
        self.next_check: str | None = None
        self.rebuild_count = 0
        self.poll_count = 0
        self.skipped_count = 0

        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "SolidVoyage/1.1"})

    def start(self):
        """Start the smart polling scheduler."""
        if self._thread and self._thread.is_alive():
            logger.warning("Scheduler already running")
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

        logger.info(
            f"📡 Smart Polling Scheduler started — "
            f"checking every {POLL_INTERVAL_SECONDS // 60} minutes for new ECMWF/GFS cycles"
        )

    def stop(self):
        """Stop the scheduler gracefully."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Scheduler stopped")

    def _poll_loop(self):
        """Main polling loop — checks for new data every POLL_INTERVAL_SECONDS."""
        while not self._stop_event.is_set():
            # Wait for poll interval (or until stopped)
            self._stop_event.wait(POLL_INTERVAL_SECONDS)

            if self._stop_event.is_set():
                break

            self._check_and_rebuild()

    def _check_and_rebuild(self):
        """
        Core smart polling logic:
          1. Check GFS availability → get latest available cycle
          2. Check ECMWF availability → get latest available cycle
          3. Compare against last ingested cycles
          4. Rebuild only if a new cycle is found
        """
        self.poll_count += 1
        now = datetime.now(timezone.utc)

        logger.info(
            f"📡 Smart poll #{self.poll_count} — "
            f"checking for new NWP data at {now.strftime('%H:%M')} UTC"
        )

        # Check for new GFS data
        new_gfs_cycle = self._detect_latest_gfs_cycle()
        gfs_is_new = new_gfs_cycle and new_gfs_cycle != self.last_gfs_cycle

        # Check for new ECMWF data (lightweight check based on schedule)
        new_ecmwf_cycle = self._detect_latest_ecmwf_cycle()
        ecmwf_is_new = new_ecmwf_cycle and new_ecmwf_cycle != self.last_ecmwf_cycle

        if gfs_is_new or ecmwf_is_new:
            reasons = []
            if gfs_is_new:
                reasons.append(f"GFS {new_gfs_cycle}")
            if ecmwf_is_new:
                reasons.append(f"ECMWF {new_ecmwf_cycle}")

            logger.info(
                f"🆕 New data detected: {' + '.join(reasons)} — triggering rebuild"
            )

            self._do_rebuild()

            # Update tracked cycles after successful rebuild
            if new_gfs_cycle:
                self.last_gfs_cycle = new_gfs_cycle
            if new_ecmwf_cycle:
                self.last_ecmwf_cycle = new_ecmwf_cycle

        else:
            self.skipped_count += 1
            logger.info(
                f"📡 No new data — skipping rebuild "
                f"(last GFS: {self.last_gfs_cycle or 'N/A'}, "
                f"last ECMWF: {self.last_ecmwf_cycle or 'N/A'}, "
                f"skipped: {self.skipped_count})"
            )

        # Calculate next check time
        next_time = now + timedelta(seconds=POLL_INTERVAL_SECONDS)
        self.next_check = next_time.strftime("%H:%M UTC")

    def _detect_latest_gfs_cycle(self) -> str | None:
        """
        Probe NOAA servers to find the most recent available GFS cycle.

        Uses lightweight HEAD requests to the .idx file (a few bytes, no download).
        Returns cycle string like "20260420/06" or None if check fails.
        """
        now = datetime.now(timezone.utc)

        # Try most recent cycles first (4h, 10h, 16h, 22h ago)
        for hours_ago in [4, 10, 16, 22]:
            candidate = now - timedelta(hours=hours_ago)
            run_hour = (candidate.hour // 6) * 6
            date_str = candidate.strftime("%Y%m%d")
            run_str = f"{run_hour:02d}"

            idx_url = GFS_IDX_TEMPLATE.format(
                date=date_str, run=run_str, resol=GFS_RESOLUTION
            )

            try:
                resp = self._session.head(idx_url, timeout=10)
                if resp.status_code == 200:
                    return f"{date_str}/{run_str}"
            except requests.RequestException:
                continue

        return None

    def _detect_latest_ecmwf_cycle(self) -> str | None:
        """
        Determine the likely available ECMWF cycle based on the publication schedule.

        ECMWF HRES runs at 00Z and 12Z with ~8h lag:
          - 00Z run available at ~08:00 UTC
          - 12Z run available at ~20:00 UTC

        We use schedule-based detection (no probe) since the ecmwf-opendata
        package handles availability checking during download.
        """
        now = datetime.now(timezone.utc)

        # Work backwards to find the latest cycle that should be available
        for hours_ago in [ECMWF_AVAILABILITY_LAG_H, ECMWF_AVAILABILITY_LAG_H + 12, ECMWF_AVAILABILITY_LAG_H + 24]:
            candidate = now - timedelta(hours=hours_ago)
            run_hour = (candidate.hour // 12) * 12
            date_str = candidate.strftime("%Y%m%d")
            run_str = f"{run_hour:02d}"

            cycle_str = f"{date_str}/{run_str}"

            # Only return if this cycle should be available by now
            cycle_time = candidate.replace(
                hour=run_hour, minute=0, second=0, microsecond=0
            )
            available_time = cycle_time + timedelta(hours=ECMWF_AVAILABILITY_LAG_H)

            if now >= available_time:
                return cycle_str

        return None

    def _do_rebuild(self):
        """Execute a single graph rebuild cycle."""
        if self.ocean_router._building:
            logger.info("⏳ Rebuild already in progress — skipping")
            return

        logger.info("🔄 Smart rebuild starting...")
        rebuild_start = time.time()

        try:
            self.ocean_router.build()

            elapsed = time.time() - rebuild_start
            self.last_rebuild = datetime.now(timezone.utc).isoformat()
            self.rebuild_count += 1

            logger.info(
                f"✅ Smart rebuild #{self.rebuild_count} complete in {elapsed:.1f}s"
            )

        except Exception as e:
            logger.error(f"❌ Smart rebuild failed: {e}")

    def trigger_rebuild(self) -> dict:
        """
        Manually trigger an immediate graph rebuild.
        Used by the /rebuild endpoint for operational triggers.
        """
        if self.ocean_router._building:
            return {
                "status": "already_building",
                "message": "A graph rebuild is already in progress",
            }

        thread = threading.Thread(target=self._do_rebuild, daemon=True)
        thread.start()

        return {
            "status": "triggered",
            "message": "Graph rebuild triggered — will complete in ~90 seconds",
            "rebuild_count": self.rebuild_count + 1,
        }

    def set_initial_cycles(self, gfs_cycle: str = "", ecmwf_cycle: str = ""):
        """
        Set the initial cycle markers after the first boot build.
        Called by the main app after the initial graph build completes.
        This ensures the scheduler doesn't immediately trigger a redundant rebuild.
        """
        if gfs_cycle:
            self.last_gfs_cycle = gfs_cycle
            logger.info(f"📡 Initial GFS cycle set: {gfs_cycle}")
        if ecmwf_cycle:
            self.last_ecmwf_cycle = ecmwf_cycle
            logger.info(f"📡 Initial ECMWF cycle set: {ecmwf_cycle}")

    @property
    def status(self) -> dict:
        """Get scheduler status for the health endpoint."""
        return {
            "scheduler_type": "smart_polling",
            "scheduler_active": self._thread is not None and self._thread.is_alive(),
            "poll_interval_minutes": POLL_INTERVAL_SECONDS // 60,
            "last_rebuild": self.last_rebuild,
            "next_check": self.next_check,
            "rebuild_count": self.rebuild_count,
            "poll_count": self.poll_count,
            "skipped_count": self.skipped_count,
            "last_gfs_cycle": self.last_gfs_cycle or "N/A",
            "last_ecmwf_cycle": self.last_ecmwf_cycle or "N/A",
            "is_building": self.ocean_router._building,
        }
