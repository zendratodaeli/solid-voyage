/**
 * Routing & Compliance Tools for AI Copilot
 *
 * Wraps NavAPI sea routing, port search, and compliance engine
 * as AI-callable tools. Compatible with AI SDK v6.
 */

import { tool } from "ai";
import { z } from "zod";
import { searchPorts, calculateSingleRoute } from "@/lib/navapi-client";
import { checkEUETS } from "@/lib/calculations/compliance-engine";

// Define schemas separately for proper type inference
const searchPortSchema = z.object({
  query: z.string().describe("Port name or UNLOCODE to search for"),
});

const calculateRouteSchema = z.object({
  startPortName: z.string().optional().describe("Display name of the origin port (e.g., 'Singapore')"),
  startPortCode: z.string().optional().describe("Start port code (e.g., 'SGSIN')"),
  startLat: z.number().optional().describe("Start latitude (for AIS position or coordinate-based routing)"),
  startLon: z.number().optional().describe("Start longitude (for AIS position or coordinate-based routing)"),
  endPortName: z.string().optional().describe("Display name of the destination port (e.g., 'Hamburg')"),
  endPortCode: z.string().optional().describe("End port code (e.g., 'DEHAM')"),
  endLat: z.number().optional().describe("End latitude"),
  endLon: z.number().optional().describe("End longitude"),
  draft: z.number().optional().describe("Vessel summer draft in meters"),
});

const checkEUETSSchema = z.object({
  originCountryCode: z.string().describe("Origin port ISO country code (e.g., 'NL', 'DE')"),
  destinationCountryCode: z.string().describe("Destination port ISO country code (e.g., 'SG', 'CN')"),
});

export const routingTools = {
  searchPort: tool({
    description:
      "Search for a maritime port by name or UN/LOCODE. " +
      "Returns port code, coordinates, and country.",
    inputSchema: searchPortSchema,
    execute: async (input: z.infer<typeof searchPortSchema>) => {
      const ports = await searchPorts(input.query);
      return {
        count: ports.length,
        ports: ports.slice(0, 5).map((p: any) => ({
          name: p.displayName,
          portCode: p.portCode,
          country: p.country,
          latitude: p.latitude,
          longitude: p.longitude,
        })),
      };
    },
  }),

  calculateRoute: tool({
    description:
      "Calculate sea route distance between exactly TWO ports or coordinates. " +
      "For multi-port voyages (3+ ports), use calculateMultiLegRoute instead. " +
      "ALWAYS include startPortName and endPortName for display. " +
      "Returns total distance, SECA/ECA distance, canal distance, waypoints, and draft warnings.",
    inputSchema: calculateRouteSchema,
    execute: async (input: z.infer<typeof calculateRouteSchema>) => {
      const result = await calculateSingleRoute({
        startPortCode: input.startPortCode,
        startLat: input.startLat,
        startLon: input.startLon,
        endPortCode: input.endPortCode,
        endLat: input.endLat,
        endLon: input.endLon,
        draft: input.draft,
      });

      if (!result.success) {
        return { error: result.error || "Route calculation failed" };
      }

      return {
        // Port identity for display
        originPort: input.startPortName || input.startPortCode || "Origin",
        destinationPort: input.endPortName || input.endPortCode || "Destination",
        originCode: input.startPortCode || null,
        destinationCode: input.endPortCode || null,
        // Distance breakdown
        totalDistanceNm: result.totalDistance,
        secaDistanceNm: result.secaDistance,
        canalDistanceNm: result.canalDistance,
        nonSecaDistanceNm: result.nonSecaDistance,
        // Navigation data
        draftWarning: result.draftWarning || null,
        waypoints: result.waypoints,
        waypointCount: result.waypoints.length,
      };
    },
  }),

  calculateMultiLegRoute: tool({
    description:
      "Calculate a complete multi-leg sea route with 3 or more ports in a SINGLE call. " +
      "This is the PREFERRED tool for voyage route planning — use this instead of calling calculateRoute multiple times. " +
      "Takes an ordered array of waypoints (starting point, loading ports, discharge ports). " +
      "Returns ONE unified result with all legs, combined waypoints for a single map, and total distances.",
    inputSchema: z.object({
      waypoints: z
        .array(
          z.object({
            portName: z.string().describe("Display name of the port"),
            portCode: z.string().optional().describe("Port UNLOCODE"),
            lat: z.number().optional().describe("Latitude"),
            lon: z.number().optional().describe("Longitude"),
            role: z
              .enum(["starting_point", "loading", "discharge", "via"])
              .optional()
              .describe("Role of this waypoint in the voyage"),
          })
        )
        .min(3)
        .describe("Ordered array of waypoints (min 3: starting point, loading, discharge)"),
      draft: z.number().optional().describe("Vessel summer draft in meters"),
    }),
    execute: async (input) => {
      const { draft } = input;

      // Auto-resolve port names → codes/coords if not provided
      const resolvedWaypoints = await Promise.all(
        input.waypoints.map(async (wp) => {
          if (wp.portCode || (wp.lat != null && wp.lon != null)) return wp;
          // Resolve by name
          try {
            const ports = await searchPorts(wp.portName);
            if (ports.length > 0) {
              return {
                ...wp,
                portCode: ports[0].portCode,
                lat: ports[0].latitude,
                lon: ports[0].longitude,
                portName: ports[0].displayName || wp.portName,
              };
            }
          } catch {
            // Fall through
          }
          return wp;
        })
      );

      const waypoints = resolvedWaypoints;
      const legs: any[] = [];
      let allWaypoints: [number, number][] = [];
      let totalDistance = 0;
      let totalSeca = 0;
      let totalCanal = 0;
      let totalNonSeca = 0;
      const warnings: string[] = [];
      const portCodes: string[] = [];

      // Calculate each consecutive leg
      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i];
        const to = waypoints[i + 1];

        const result = await calculateSingleRoute({
          startPortCode: from.portCode,
          startLat: from.lat,
          startLon: from.lon,
          endPortCode: to.portCode,
          endLat: to.lat,
          endLon: to.lon,
          draft,
        });

        if (!result.success) {
          warnings.push(`Leg ${i + 1} (${from.portName} → ${to.portName}): ${result.error || "calculation failed"}`);
          continue;
        }

        const legData = {
          legNumber: i + 1,
          from: from.portName,
          fromCode: from.portCode || null,
          to: to.portName,
          toCode: to.portCode || null,
          role: from.role || (i === 0 ? "starting_point" : "loading"),
          distanceNm: result.totalDistance,
          secaDistanceNm: result.secaDistance,
          canalDistanceNm: result.canalDistance,
          nonSecaDistanceNm: result.nonSecaDistance,
          draftWarning: result.draftWarning || null,
        };
        legs.push(legData);

        // Merge waypoints for unified map (avoid duplicating the junction point)
        const legWaypoints: [number, number][] = (result.waypoints || []).map(
          (wp: any) => [wp.lon ?? wp[0], wp.lat ?? wp[1]] as [number, number]
        );
        if (allWaypoints.length > 0 && legWaypoints.length > 0) {
          // Skip first point of subsequent legs (same as last point of previous leg)
          allWaypoints = [...allWaypoints, ...legWaypoints.slice(1)];
        } else {
          allWaypoints = [...allWaypoints, ...legWaypoints];
        }

        totalDistance += result.totalDistance;
        totalSeca += result.secaDistance;
        totalCanal += result.canalDistance;
        totalNonSeca += result.nonSecaDistance;

        if (result.draftWarning) warnings.push(result.draftWarning);
      }

      // Collect port codes for deep-linking
      waypoints.forEach((wp) => {
        if (wp.portCode) portCodes.push(wp.portCode);
      });

      // Build port name chain for display (e.g., "Singapore → Tanjung Priok → Hamburg")
      const routeLabel = waypoints.map((wp) => wp.portName).join(" → ");

      return {
        // Display info
        routeLabel,
        originPort: waypoints[0]?.portName || "Origin",
        destinationPort: waypoints[waypoints.length - 1]?.portName || "Destination",
        originCode: waypoints[0]?.portCode || null,
        destinationCode: waypoints[waypoints.length - 1]?.portCode || null,
        portCodes,
        // Totals
        totalDistanceNm: totalDistance,
        secaDistanceNm: totalSeca,
        canalDistanceNm: totalCanal,
        nonSecaDistanceNm: totalNonSeca,
        // Legs breakdown
        legs,
        legCount: legs.length,
        // Unified map data
        waypoints: allWaypoints,
        waypointCount: allWaypoints.length,
        // Warnings
        warnings: warnings.length > 0 ? warnings : null,
      };
    },
  }),

  checkEUETSApplicability: tool({
    description:
      "Check if EU Emissions Trading System (ETS) applies to a voyage. " +
      "Returns whether 0%, 50%, or 100% of emissions are taxable.",
    inputSchema: checkEUETSSchema,
    execute: async (input: z.infer<typeof checkEUETSSchema>) => {
      const result = checkEUETS(input.originCountryCode, input.destinationCountryCode);
      return {
        applicable: result.applicable,
        percentage: result.percentage,
        reason: result.reason,
      };
    },
  }),
};
