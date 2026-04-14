# Solid Vision — Weather Routing Engine
# Lightweight Python image optimized for FastAPI + NetworkX

FROM python:3.12-slim

# System dependencies for numpy/scipy (pre-compiled wheels on slim)
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ app/

# Create data directory
RUN mkdir -p data

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
