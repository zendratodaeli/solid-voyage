"use server";

/**
 * Fleet Filter Presets — Server Actions
 *
 * CRUD for saved filter configurations on Fleet Schedule.
 */

import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/clerk";
import type { AuthUser } from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface FilterPresetData {
  sortKey: string;
  hideCompleted: boolean;
  vesselTypeFilter: string[];
  dwtRange: string;
  commercialFilter: string;
  statusFilter: string[];
  openWithin: string;
  portSearch: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterPresetData;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════
// GET PRESETS
// ═══════════════════════════════════════════════════════════════════

export async function getFleetFilterPresets(): Promise<{
  success: boolean;
  data?: FilterPreset[];
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: true, data: [] };

    const presets = await prisma.fleetFilterPreset.findMany({
      where: { orgId: user.activeOrgId },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      data: presets.map((p) => ({
        id: p.id,
        name: p.name,
        filters: p.filters as unknown as FilterPresetData,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("Failed to fetch filter presets:", error);
    return { success: false, error: "Failed to load presets" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// SAVE PRESET
// ═══════════════════════════════════════════════════════════════════

export async function saveFleetFilterPreset(
  name: string,
  filters: FilterPresetData
): Promise<{ success: boolean; data?: FilterPreset; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    // Limit to 10 presets per org
    const count = await prisma.fleetFilterPreset.count({
      where: { orgId: user.activeOrgId },
    });
    if (count >= 10) {
      return { success: false, error: "Maximum 10 presets per organization" };
    }

    const preset = await prisma.fleetFilterPreset.create({
      data: {
        orgId: user.activeOrgId,
        name: name.trim().slice(0, 50),
        filters: filters as object,
        createdBy: user.clerkId,
      },
    });

    return {
      success: true,
      data: {
        id: preset.id,
        name: preset.name,
        filters: preset.filters as unknown as FilterPresetData,
        createdAt: preset.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("Failed to save filter preset:", error);
    return { success: false, error: "Failed to save preset" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// DELETE PRESET
// ═══════════════════════════════════════════════════════════════════

export async function deleteFleetFilterPreset(
  presetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    // Verify ownership
    const preset = await prisma.fleetFilterPreset.findFirst({
      where: { id: presetId, orgId: user.activeOrgId },
    });
    if (!preset) return { success: false, error: "Preset not found" };

    await prisma.fleetFilterPreset.delete({ where: { id: presetId } });
    return { success: true };
  } catch (error) {
    console.error("Failed to delete filter preset:", error);
    return { success: false, error: "Failed to delete preset" };
  }
}
