declare module "searoute-js" {
  interface GeoJSONPoint {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: {
      type: "Point";
      coordinates: [number, number]; // [longitude, latitude]
    };
  }

  interface SearouteResult {
    type: "Feature";
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
    properties: {
      length: number;  // Distance in nautical miles by default
      units?: string;
    };
  }

  // searoute-js accepts GeoJSON Point Features, not coordinate arrays
  export default function searoute(
    origin: GeoJSONPoint,
    destination: GeoJSONPoint,
    units?: "kilometers" | "miles" | "degrees" | "radians"
  ): SearouteResult;
}
