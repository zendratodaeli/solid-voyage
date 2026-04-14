/**
 * AIS Tracking Tools for AI Copilot
 *
 * Wraps the existing AIS server actions as AI-callable tools.
 * Works with both mock data and live NavAPI. Compatible with AI SDK v6.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  searchShips,
  getLastPosition,
  getOrgFleetPositions,
  getWithinRange,
  findByDestination,
} from "@/actions/ais-actions";

// ═══════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════

const searchVesselSchema = z.object({
  vesselName: z.string().describe("Vessel name to search for (e.g. 'BBC Bergen', 'MSC Aurora')"),
});

const vesselPositionSchema = z.object({
  mmsi: z.string().optional().describe("Vessel MMSI number"),
  imo: z.string().optional().describe("Vessel IMO number"),
});

const fleetPositionsSchema = z.object({
  orgId: z.string().describe("The organization's Clerk ID"),
});

const nearPortSchema = z.object({
  latitude: z.number().describe("Center point latitude"),
  longitude: z.number().describe("Center point longitude"),
  radiusKm: z.number().optional().describe("Search radius in kilometers (default: 500)"),
  shipType: z.number().optional().describe("AIS ship type filter (7=cargo, 8=tanker)"),
});

const byDestSchema = z.object({
  destinations: z.array(z.string()).describe("Destination names (e.g., ['ROTTERDAM', 'EUROPOORT'])"),
  etaFrom: z.string().describe("ETA range start (ISO 8601 UTC)"),
  etaUntil: z.string().describe("ETA range end (ISO 8601 UTC)"),
  shipType: z.number().optional().describe("AIS ship type filter"),
});

// ═══════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════

export const aisTools = {
  searchVesselByName: tool({
    description:
      "Search for ANY vessel worldwide by name and get its current AIS position. " +
      "This is the PRIMARY tool for tracking vessels — use when the user says " +
      "'where is BBC Bergen?', 'find BBC Colorado', 'track Ever Given', etc. " +
      "Works for ALL vessels, not just the user's fleet.",
    inputSchema: searchVesselSchema,
    execute: async (input: z.infer<typeof searchVesselSchema>) => {
      // Step 1: Search for the vessel by name
      const searchResult = await searchShips(input.vesselName);
      if (!searchResult.success || !searchResult.data?.length) {
        return {
          error: `No vessel found matching "${input.vesselName}". Try a more specific name.`,
        };
      }

      // Step 2: Get position of the best match
      const match = searchResult.data[0];
      const posResult = await getLastPosition({
        mmsi: match.MmsiNumber,
        imo: match.ImoNumber,
      });

      if (!posResult.success || !posResult.data?.length) {
        return {
          vesselFound: true,
          shipName: match.ShipName,
          imo: match.ImoNumber,
          mmsi: match.MmsiNumber,
          flag: match.ShipFlag,
          positionAvailable: false,
          error: "Vessel found but no recent AIS position data available.",
        };
      }

      const pos = posResult.data[0];
      return {
        shipName: pos.ShipName || match.ShipName,
        imo: match.ImoNumber,
        mmsi: match.MmsiNumber,
        flag: match.ShipFlag,
        latitude: Number(pos.Latitude) || null,
        longitude: Number(pos.Longitude) || null,
        speed: Number(pos.SpeedOverGround) || null,
        heading: Number(pos.TrueHeading) || null,
        course: Number(pos.CourseOverGround) || null,
        destination: pos.DestDeclared,
        origin: pos.OriginDeclared,
        eta: pos.EtaDeclared,
        draft: Number(pos.DraughtDeclared) || null,
        lastUpdated: pos.PositionLastUpdated,
        navigationStatus: pos.NavigationStatus,
        length: Number(pos.Length) || null,
        beam: Number(pos.Beam) || null,
        allMatches: searchResult.data.slice(0, 5).map((s) => ({
          name: s.ShipName,
          imo: s.ImoNumber,
          mmsi: s.MmsiNumber,
          flag: s.ShipFlag,
        })),
      };
    },
  }),

  getVesselPosition: tool({
    description:
      "Get the current AIS position of a specific vessel by MMSI or IMO number. " +
      "Returns coordinates, speed, heading, destination, and last update time.",
    inputSchema: vesselPositionSchema,
    execute: async (input: z.infer<typeof vesselPositionSchema>) => {
      const result = await getLastPosition({ mmsi: input.mmsi, imo: input.imo });
      if (!result.success || !result.data?.length) {
        return { error: result.error || "No position data found" };
      }
      const pos = result.data[0];
      return {
        shipName: pos.ShipName,
        latitude: Number(pos.Latitude) || null,
        longitude: Number(pos.Longitude) || null,
        speed: Number(pos.SpeedOverGround) || null,
        heading: Number(pos.TrueHeading) || null,
        destination: pos.DestDeclared,
        eta: pos.EtaDeclared,
        draft: Number(pos.DraughtDeclared) || null,
        lastUpdated: pos.PositionLastUpdated,
        navigationStatus: pos.NavigationStatus,
      };
    },
  }),

  getFleetPositions: tool({
    description:
      "Get live AIS positions for ALL vessels in the user's organization fleet. " +
      "Use this when the user asks 'where is my fleet?'",
    inputSchema: fleetPositionsSchema,
    execute: async (input: z.infer<typeof fleetPositionsSchema>) => {
      const result = await getOrgFleetPositions(input.orgId);
      if (!result.success) {
        return { error: result.error || "Failed to get fleet positions" };
      }
      return {
        vesselCount: result.data?.length || 0,
        positions: (result.data || []).map((pos: any) => ({
          shipName: pos.ShipName,
          latitude: Number(pos.Latitude) || null,
          longitude: Number(pos.Longitude) || null,
          speed: Number(pos.SpeedOverGround) || null,
          heading: Number(pos.TrueHeading) || null,
          destination: pos.DestDeclared,
          eta: pos.EtaDeclared,
          navigationStatus: pos.NavigationStatus,
          lastUpdated: pos.PositionLastUpdated,
        })),
      };
    },
  }),

  findVesselsNearPort: tool({
    description:
      "Find all vessels within a specified radius of a geographic point. " +
      "Use this to check what vessels are near a load port.",
    inputSchema: nearPortSchema,
    execute: async (input: z.infer<typeof nearPortSchema>) => {
      const result = await getWithinRange({
        latitude: input.latitude,
        longitude: input.longitude,
        km: input.radiusKm ?? 500,
        shipType: input.shipType,
      });
      if (!result.success) {
        return { error: result.error || "Within-range search failed" };
      }
      return {
        vesselCount: result.data?.length || 0,
        vessels: (result.data || []).slice(0, 20).map((v: any) => ({
          shipName: v.ShipName,
          imo: v.ImoNumber,
          mmsi: v.MmsiNumber,
          latitude: Number(v.Latitude) || null,
          longitude: Number(v.Longitude) || null,
          speed: Number(v.SpeedOverGround) || null,
          destination: v.DestDeclared,
          eta: v.EtaDeclared,
        })),
      };
    },
  }),

  findVesselsByDestination: tool({
    description:
      "Find vessels that have declared a specific destination in their AIS data. " +
      "Useful for checking port congestion.",
    inputSchema: byDestSchema,
    execute: async (input: z.infer<typeof byDestSchema>) => {
      const result = await findByDestination({
        destDeclared: input.destinations,
        etaFrom: input.etaFrom,
        etaUntil: input.etaUntil,
        shipType: input.shipType,
      });
      if (!result.success) {
        return { error: result.error || "FindByDestination failed" };
      }
      return {
        vesselCount: result.data?.length || 0,
        vessels: (result.data || []).slice(0, 20).map((v: any) => ({
          shipName: v.ShipName,
          imo: v.ImoNumber,
          latitude: Number(v.Latitude) || null,
          longitude: Number(v.Longitude) || null,
          speed: Number(v.SpeedOverGround) || null,
          destination: v.DestDeclared,
          eta: v.EtaDeclared,
        })),
      };
    },
  }),
};
