"""
Solid Vision — Maritime Weather Routing Engine

A FastAPI microservice that provides weather-optimized maritime route calculation.
The engine builds a NetworkX graph of the navigable ocean, weighted by wind,
wave, current, and ice conditions, and uses A* search to find fuel-efficient routes.

Features:
- 180K+ ocean node graph with 8-directional edges
- A* pathfinding with haversine heuristic (sub-1s queries)
- Seasonal ice layer (Arctic, Antarctic, Baltic)
- Background graph rebuild scheduler (every 6 hours)
- Atomic graph swap (zero-downtime rebuilds)

Usage:
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
"""
import logging
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router, get_ocean_router, get_scheduler
from app.config import API_HOST, API_PORT

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def _build_graph_background():
    """Build the ocean graph in a background thread so the API starts immediately."""
    logger.info("🌊 Building ocean graph in background thread...")
    try:
        router_instance = get_ocean_router()
        router_instance.build()
        logger.info("🎉 Ocean graph is ready to serve routes!")
    except Exception as e:
        logger.error(f"❌ Background graph build failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle — build the graph on startup, start scheduler.
    The graph is built in a background thread so the API
    and health endpoint are immediately responsive.
    """
    logger.info("=" * 60)
    logger.info("  Solid Vision — Maritime Weather Routing Engine")
    logger.info("=" * 60)

    # Start graph build in background
    build_thread = threading.Thread(target=_build_graph_background, daemon=True)
    build_thread.start()

    # Start the periodic rebuild scheduler
    scheduler = get_scheduler()
    scheduler.start()

    yield

    # Shutdown
    logger.info("Shutting down routing engine...")
    scheduler.stop()


# Create the FastAPI app
app = FastAPI(
    title="Solid Vision Weather Routing Engine",
    description=(
        "Weather-optimized maritime route calculation using NOAA forecast data. "
        "Provides fuel-efficient routes by accounting for ocean currents, wind, "
        "wave conditions, and seasonal ice coverage."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — allow the Next.js frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Next.js dev server
        "http://localhost:3001",
        "https://*.vercel.app",    # Vercel deployments
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )
