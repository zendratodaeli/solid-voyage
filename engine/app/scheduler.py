"""
Graph rebuild scheduler — periodically refreshes the ocean graph with fresh data.

Runs as a background thread within the FastAPI process. Every REBUILD_INTERVAL_HOURS,
it downloads fresh NOAA GRIB data and rebuilds the graph atomically. The old graph
continues serving requests until the new one is ready.

Also exposes a manual rebuild endpoint for operational triggers (e.g., after
a sudden weather change or AIS position update).
"""
import logging
import threading
import time
from datetime import datetime, timezone
from app.config import REBUILD_INTERVAL_HOURS

logger = logging.getLogger(__name__)


class GraphScheduler:
    """
    Background scheduler that periodically rebuilds the ocean graph.
    """

    def __init__(self, ocean_router):
        self.ocean_router = ocean_router
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self.last_rebuild: str | None = None
        self.next_rebuild: str | None = None
        self.rebuild_count = 0

    def start(self):
        """Start the background rebuild scheduler."""
        if self._thread and self._thread.is_alive():
            logger.warning("Scheduler already running")
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info(
            f"📅 Graph rebuild scheduler started — "
            f"interval: every {REBUILD_INTERVAL_HOURS} hours"
        )

    def stop(self):
        """Stop the scheduler gracefully."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Scheduler stopped")

    def _run_loop(self):
        """Main scheduler loop — sleeps between rebuilds."""
        interval_seconds = REBUILD_INTERVAL_HOURS * 3600

        while not self._stop_event.is_set():
            # Wait for the interval (or until stopped)
            self._stop_event.wait(interval_seconds)

            if self._stop_event.is_set():
                break

            self._do_rebuild()

    def _do_rebuild(self):
        """Execute a single graph rebuild cycle."""
        logger.info("🔄 Scheduled graph rebuild starting...")
        rebuild_start = time.time()

        try:
            # The build() method handles weather + ice data loading
            # and performs an atomic swap of the graph
            self.ocean_router.build()

            elapsed = time.time() - rebuild_start
            self.last_rebuild = datetime.now(timezone.utc).isoformat()
            self.rebuild_count += 1

            logger.info(
                f"✅ Scheduled rebuild #{self.rebuild_count} complete in {elapsed:.1f}s"
            )

        except Exception as e:
            logger.error(f"❌ Scheduled rebuild failed: {e}")

    def trigger_rebuild(self) -> dict:
        """
        Manually trigger an immediate graph rebuild.
        Used by the /rebuild endpoint for operational triggers.

        Returns status dict for the API response.
        """
        if self.ocean_router._building:
            return {
                "status": "already_building",
                "message": "A graph rebuild is already in progress",
            }

        # Run in a new thread to not block the API
        thread = threading.Thread(target=self._do_rebuild, daemon=True)
        thread.start()

        return {
            "status": "triggered",
            "message": "Graph rebuild triggered — will complete in ~90 seconds",
            "rebuild_count": self.rebuild_count + 1,
        }

    @property
    def status(self) -> dict:
        """Get scheduler status for the health endpoint."""
        return {
            "scheduler_active": self._thread is not None and self._thread.is_alive(),
            "interval_hours": REBUILD_INTERVAL_HOURS,
            "last_rebuild": self.last_rebuild,
            "rebuild_count": self.rebuild_count,
            "is_building": self.ocean_router._building,
        }
