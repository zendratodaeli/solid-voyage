# Solid Vision — Weather Routing Engine (Production)
# With eccodes C library for real NOAA GRIB/NetCDF parsing

FROM python:3.12-slim

# Install eccodes C library + HDF5/NetCDF support
# libeccodes-dev  — ECMWF GRIB parser (required by cfgrib)
# libhdf5-dev     — HDF5 support (required by netcdf4 for RTOFS)
# libgeos-dev     — Geometry engine (required by shapely/geopandas for ice shapefiles)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libeccodes-dev \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ app/

# Create data directories for all NOAA sources
RUN mkdir -p data/gfs data/ww3 data/rtofs data/ice data/icebergs

# Environment
ENV PYTHONUNBUFFERED=1
ENV API_HOST=0.0.0.0
ENV API_PORT=8001
ENV REBUILD_INTERVAL_HOURS=6
ENV GRID_RESOLUTION=0.5

# Health check — probes the /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

EXPOSE 8001

# Run with uvicorn (single worker — graph is in-memory)
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
