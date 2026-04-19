import numpy as np
import os, sys
sys.path.insert(0, "/app")
from app.config import LAT_MIN, LON_MIN, GRID_RESOLUTION

ice_path = "/app/data/ice/ice_concentration.npy"
if not os.path.exists(ice_path):
    print("No ice cache file found")
    exit(1)

ice = np.load(ice_path)
print(f"Shape: {ice.shape}")
print(f"Max concentration: {ice.max():.3f}")
print(f"Icy cells (>0.1): {(ice > 0.1).sum()}")

# Test Barents Sea 75N, 37E
lat, lon = 75.0, 37.0
lat_idx = int(round((lat - LAT_MIN) / GRID_RESOLUTION))
lon_idx = int(round((lon - LON_MIN) / GRID_RESOLUTION))
print(f"\nBarents Sea ({lat}N, {lon}E):")
print(f"  Grid index: [{lat_idx}, {lon_idx}]")
print(f"  Ice concentration: {ice[lat_idx, lon_idx]:.3f}")

# Check area around Barents Sea
for test_lat in [70, 72, 75, 77]:
    for test_lon in [20, 30, 37, 50]:
        li = int(round((test_lat - LAT_MIN) / GRID_RESOLUTION))
        lo = int(round((test_lon - LON_MIN) / GRID_RESOLUTION))
        if li < ice.shape[0] and lo < ice.shape[1]:
            val = ice[li, lo]
            marker = " <<< ICE" if val > 0 else ""
            print(f"  ({test_lat}N, {test_lon}E) idx=[{li},{lo}] ice={val:.3f}{marker}")

# Where IS the ice?
icy = np.where(ice > 0.1)
if len(icy[0]) > 0:
    lat_indices = icy[0]
    lon_indices = icy[1]
    min_lat = LAT_MIN + lat_indices.min() * GRID_RESOLUTION
    max_lat = LAT_MIN + lat_indices.max() * GRID_RESOLUTION
    min_lon = LON_MIN + lon_indices.min() * GRID_RESOLUTION
    max_lon = LON_MIN + lon_indices.max() * GRID_RESOLUTION
    print(f"\nIce bounding box:")
    print(f"  Lat: {min_lat:.1f} to {max_lat:.1f}")
    print(f"  Lon: {min_lon:.1f} to {max_lon:.1f}")
