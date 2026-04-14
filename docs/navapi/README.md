# NavAPI Reference Documentation

Reference files from [NavAPI (Seametrix)](https://www.navapi.com/) for sea routing and AIS vessel tracking integration.

## Structure

### `postman/`
Postman collections for testing NavAPI endpoints:
- **Sea Routing (`srtg`)** — Route calculation, waypoints, SECA/ECA optimization
- **AIS Positioning (`aisp`)** — Vessel tracking, fleet positions, historical tracks

### `demos/`
Interactive HTML demo pages provided by NavAPI:
| File | Feature |
|------|---------|
| `SeaPortSearch_Solideo.html` | Port search autocomplete |
| `FindByDestination.html` | Route finding by destination |
| `FleetPositions.html` | Real-time fleet position tracking |
| `HistoricalTracks.html` | Vessel historical track visualization |
| `LastPosition.html` | Latest vessel position lookup |

## Usage
- Open any `.html` file directly in a browser to test the API interactively
- Import `.postman_collection.json` files into Postman for API exploration
- The actual application integration lives in `src/lib/navapi-client.ts`
