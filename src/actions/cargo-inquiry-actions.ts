"use server";

/**
 * Cargo Inquiry Board — Server Actions
 *
 * Full CRUD + analytics for the commercial cargo pipeline.
 */

import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/clerk";
import type { AuthUser } from "@/lib/permissions";
import { triggerVoyageUpdated, triggerCargoUpdated } from "@/lib/pusher-server";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface NegotiationRound {
  round: number;
  theirOffer: number;
  ourCounter: number | null;
  date: string;
  note?: string;
}

export interface InquiryCandidate {
  id: string;
  vesselId: string;
  vesselName: string;
  vesselType: string;
  dwt: number;
  estimatedTce: number | null;
  notes: string | null;
  isSelected: boolean;
  evaluatedAt: string;
}

export interface CargoInquiryItem {
  id: string;
  orgId: string;
  cargoType: string;
  cargoQuantityMt: number;
  stowageFactor: number | null;
  cubicCapacityReq: number | null;
  loadPort: string;
  dischargePort: string;
  loadRegion: string | null;
  dischargeRegion: string | null;
  laycanStart: string | null;
  laycanEnd: string | null;
  freightOffered: number | null;
  freightCountered: number | null;
  commissionPercent: number | null;
  estimatedRevenue: number | null;
  negotiationRounds: NegotiationRound[];
  source: string | null;
  brokerName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  status: string;
  priority: string | null;
  selectedVesselId: string | null;
  voyageId: string | null;
  notes: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdByName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  vesselCandidates: InquiryCandidate[];
  // Computed urgency
  urgency: "URGENT" | "ACTIVE" | "PLANNING" | "OVERDUE" | null;
}

export interface InquiryStats {
  total: number;
  byStatus: Record<string, number>;
  pipelineValue: number; // Weighted revenue
  winRate: number; // WON / (WON + LOST + EXPIRED + WITHDRAWN)
  avgResponseHours: number; // NEW → EVALUATING avg time
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

const PIPELINE_WEIGHTS: Record<string, number> = {
  NEW: 0.10,
  EVALUATING: 0.25,
  OFFERED: 0.50,
  NEGOTIATING: 0.75,
  FIXED: 1.0,
  LOST: 0,
  EXPIRED: 0,
  WITHDRAWN: 0,
};

function computeUrgency(laycanStart: Date | null): "URGENT" | "ACTIVE" | "PLANNING" | "OVERDUE" | null {
  if (!laycanStart) return null;
  const now = new Date();
  const diffMs = laycanStart.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "OVERDUE";
  if (diffDays < 3) return "URGENT";
  if (diffDays < 7) return "ACTIVE";
  return "PLANNING";
}

function mapInquiry(p: any): CargoInquiryItem {
  const urgency = computeUrgency(p.laycanStart);
  return {
    id: p.id,
    orgId: p.orgId,
    cargoType: p.cargoType,
    cargoQuantityMt: p.cargoQuantityMt,
    stowageFactor: p.stowageFactor,
    cubicCapacityReq: p.cubicCapacityReq,
    loadPort: p.loadPort,
    dischargePort: p.dischargePort,
    loadRegion: p.loadRegion,
    dischargeRegion: p.dischargeRegion,
    laycanStart: p.laycanStart?.toISOString() || null,
    laycanEnd: p.laycanEnd?.toISOString() || null,
    freightOffered: p.freightOffered,
    freightCountered: p.freightCountered,
    commissionPercent: p.commissionPercent,
    estimatedRevenue: p.estimatedRevenue,
    negotiationRounds: (p.negotiationRounds as NegotiationRound[]) || [],
    source: p.source,
    brokerName: p.brokerName,
    contactName: p.contactName,
    contactEmail: p.contactEmail,
    status: p.status,
    priority: p.priority,
    selectedVesselId: p.selectedVesselId,
    voyageId: p.voyageId,
    notes: p.notes,
    rejectionReason: p.rejectionReason,
    createdBy: p.createdBy,
    createdByName: p.createdByName,
    assignedTo: p.assignedTo,
    assignedToName: p.assignedToName,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    vesselCandidates: (p.vesselCandidates || []).map((vc: any) => ({
      id: vc.id,
      vesselId: vc.vesselId,
      vesselName: vc.vessel?.name || "Unknown",
      vesselType: vc.vessel?.vesselType || "",
      dwt: vc.vessel?.dwt || 0,
      estimatedTce: vc.estimatedTce,
      notes: vc.notes,
      isSelected: vc.isSelected,
      evaluatedAt: vc.evaluatedAt.toISOString(),
    })),
    urgency,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GET ALL INQUIRIES
// ═══════════════════════════════════════════════════════════════════

export async function getCargoInquiries(statusFilter?: string[]): Promise<{
  success: boolean;
  data?: CargoInquiryItem[];
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: true, data: [] };

    const where: any = { orgId: user.activeOrgId };
    if (statusFilter && statusFilter.length > 0) {
      where.status = { in: statusFilter };
    }

    const inquiries = await prisma.cargoInquiry.findMany({
      where,
      include: {
        vesselCandidates: {
          include: { vessel: { select: { name: true, vesselType: true, dwt: true } } },
          orderBy: { evaluatedAt: "desc" },
        },
      },
      orderBy: [{ laycanStart: "asc" }, { createdAt: "desc" }],
    });

    return {
      success: true,
      data: inquiries.map(mapInquiry),
    };
  } catch (error) {
    console.error("Failed to fetch cargo inquiries:", error);
    return { success: false, error: "Failed to load inquiries" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// CREATE INQUIRY
// ═══════════════════════════════════════════════════════════════════

export async function createCargoInquiry(data: {
  cargoType: string;
  cargoQuantityMt: number;
  loadPort: string;
  dischargePort: string;
  stowageFactor?: number | null;
  loadRegion?: string | null;
  dischargeRegion?: string | null;
  laycanStart?: string | null;
  laycanEnd?: string | null;
  freightOffered?: number | null;
  commissionPercent?: number | null;
  source?: string | null;
  brokerName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  status?: string;
}): Promise<{ success: boolean; data?: CargoInquiryItem; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const cubicCapacityReq = data.stowageFactor
      ? data.cargoQuantityMt * data.stowageFactor
      : null;

    const estimatedRevenue = data.freightOffered
      ? data.freightOffered * data.cargoQuantityMt
      : null;

    const inquiry = await prisma.cargoInquiry.create({
      data: {
        orgId: user.activeOrgId,
        cargoType: data.cargoType,
        cargoQuantityMt: data.cargoQuantityMt,
        stowageFactor: data.stowageFactor || null,
        cubicCapacityReq,
        loadPort: data.loadPort,
        dischargePort: data.dischargePort,
        loadRegion: data.loadRegion || null,
        dischargeRegion: data.dischargeRegion || null,
        laycanStart: data.laycanStart ? new Date(data.laycanStart) : null,
        laycanEnd: data.laycanEnd ? new Date(data.laycanEnd) : null,
        freightOffered: data.freightOffered || null,
        commissionPercent: data.commissionPercent || null,
        estimatedRevenue,
        source: data.source || null,
        brokerName: data.brokerName || null,
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
        notes: data.notes || null,
        status: data.status === "DRAFT" ? "DRAFT" : "NEW",
        priority: data.laycanStart ? computeUrgency(new Date(data.laycanStart)) : null,
        createdBy: user.clerkId,
        createdByName: user.name || user.email,
      },
      include: {
        vesselCandidates: {
          include: { vessel: { select: { name: true, vesselType: true, dwt: true } } },
        },
      },
    });

    return { success: true, data: mapInquiry(inquiry) };
  } catch (error) {
    console.error("Failed to create cargo inquiry:", error);
    return { success: false, error: "Failed to create inquiry" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// UPDATE INQUIRY
// ═══════════════════════════════════════════════════════════════════

export async function updateCargoInquiry(
  id: string,
  data: Partial<{
    cargoType: string;
    cargoQuantityMt: number;
    stowageFactor: number | null;
    loadPort: string;
    dischargePort: string;
    loadRegion: string | null;
    dischargeRegion: string | null;
    laycanStart: string | null;
    laycanEnd: string | null;
    freightOffered: number | null;
    freightCountered: number | null;
    commissionPercent: number | null;
    source: string | null;
    brokerName: string | null;
    contactName: string | null;
    contactEmail: string | null;
    status: string;
    notes: string | null;
    rejectionReason: string | null;
    selectedVesselId: string | null;
    assignedTo: string | null;
    assignedToName: string | null;
    negotiationRounds: NegotiationRound[];
  }>
): Promise<{ success: boolean; data?: CargoInquiryItem; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    // Verify ownership
    const existing = await prisma.cargoInquiry.findFirst({
      where: { id, orgId: user.activeOrgId },
    });
    if (!existing) return { success: false, error: "Inquiry not found" };

    // Recompute derived fields
    const qty = data.cargoQuantityMt ?? existing.cargoQuantityMt;
    const sf = data.stowageFactor !== undefined ? data.stowageFactor : existing.stowageFactor;
    const freight = data.freightOffered !== undefined ? data.freightOffered : existing.freightOffered;

    const updateData: any = { ...data };
    if (sf && qty) updateData.cubicCapacityReq = qty * sf;
    if (freight && qty) updateData.estimatedRevenue = freight * qty;

    // Convert date strings
    if (data.laycanStart !== undefined) {
      updateData.laycanStart = data.laycanStart ? new Date(data.laycanStart) : null;
    }
    if (data.laycanEnd !== undefined) {
      updateData.laycanEnd = data.laycanEnd ? new Date(data.laycanEnd) : null;
    }

    // Update urgency if laycan changed
    const ls = updateData.laycanStart !== undefined ? updateData.laycanStart : existing.laycanStart;
    if (ls) updateData.priority = computeUrgency(ls instanceof Date ? ls : new Date(ls));

    // ── Unified Pipeline: Cargo → Voyage 1:1 Sync ────────────────
    // Any cargo status change syncs the SAME status to the linked voyage.
    if (existing.voyageId) {
      const voyageSyncData: Record<string, unknown> = {};

      // Status sync
      if (data.status && data.status !== existing.status) {
        const voyage = await prisma.voyage.findUnique({ where: { id: existing.voyageId } });
        if (voyage && voyage.status !== data.status) {
          // Validation: FIXED requires the voyage to be in OFFERED or FIXED state
          if (data.status === "FIXED" && voyage.status !== "OFFERED" && voyage.status !== "FIXED" && voyage.status !== "NEW") {
            return {
              success: false,
              error: `Cannot mark as Fixed — voyage must be evaluated first. Current voyage status: ${voyage.status}`,
            };
          }
          voyageSyncData.status = data.status;
        }
      }

      // Laycan sync – keep voyage laycan in sync with cargo inquiry
      if (data.laycanStart !== undefined) {
        voyageSyncData.laycanStart = data.laycanStart ? new Date(data.laycanStart) : null;
      }
      if (data.laycanEnd !== undefined) {
        voyageSyncData.laycanEnd = data.laycanEnd ? new Date(data.laycanEnd) : null;
      }

      if (Object.keys(voyageSyncData).length > 0) {
        await prisma.voyage.update({
          where: { id: existing.voyageId },
          data: voyageSyncData,
        });
      }
    }

    const inquiry = await prisma.cargoInquiry.update({
      where: { id },
      data: updateData,
      include: {
        vesselCandidates: {
          include: { vessel: { select: { name: true, vesselType: true, dwt: true } } },
        },
      },
    });

    // ── Real-time: notify all clients ──────────────────────────
    if (data.status && data.status !== existing.status) {
      triggerCargoUpdated(existing.orgId, {
        inquiryId: id,
        status: data.status,
        previousStatus: existing.status,
        voyageId: existing.voyageId,
      });

      // If a linked voyage was also synced, fire voyage event too
      if (existing.voyageId) {
        triggerVoyageUpdated(existing.orgId, {
          voyageId: existing.voyageId,
          status: data.status,
          previousStatus: existing.status,
        });
      }
    }

    return { success: true, data: mapInquiry(inquiry) };
  } catch (error) {
    console.error("Failed to update cargo inquiry:", error);
    return { success: false, error: "Failed to update inquiry" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// DELETE INQUIRY
// ═══════════════════════════════════════════════════════════════════

export async function deleteCargoInquiry(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const existing = await prisma.cargoInquiry.findFirst({
      where: { id, orgId: user.activeOrgId },
    });
    if (!existing) return { success: false, error: "Inquiry not found" };

    // If the inquiry has a linked voyage, clean it up first
    if (existing.voyageId) {
      // Delete voyage calculation (FK constraint)
      await prisma.voyageCalculation.deleteMany({
        where: { voyageId: existing.voyageId },
      });
      // Delete the voyage itself
      await prisma.voyage.delete({
        where: { id: existing.voyageId },
      }).catch(() => {
        // Voyage may already be deleted or not exist — safe to ignore
      });
    }

    // Delete vessel candidates linked to this inquiry
    await prisma.inquiryVesselCandidate.deleteMany({
      where: { inquiryId: id },
    });

    await prisma.cargoInquiry.delete({ where: { id } });
    return { success: true };
  } catch (error) {
    console.error("Failed to delete cargo inquiry:", error);
    return { success: false, error: "Failed to delete inquiry" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// GET STATS
// ═══════════════════════════════════════════════════════════════════

export async function getInquiryStats(): Promise<{
  success: boolean;
  data?: InquiryStats;
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: true, data: { total: 0, byStatus: {}, pipelineValue: 0, winRate: 0, avgResponseHours: 0 } };

    const inquiries = await prisma.cargoInquiry.findMany({
      where: { orgId: user.activeOrgId },
      select: { status: true, estimatedRevenue: true, createdAt: true, updatedAt: true },
    });

    const total = inquiries.length;
    const byStatus: Record<string, number> = {};
    let pipelineValue = 0;
    let won = 0;
    let closed = 0; // FIXED + LOST + EXPIRED + WITHDRAWN

    for (const inq of inquiries) {
      byStatus[inq.status] = (byStatus[inq.status] || 0) + 1;
      const weight = PIPELINE_WEIGHTS[inq.status] || 0;
      pipelineValue += (inq.estimatedRevenue || 0) * weight;
      if (inq.status === "FIXED") won++;
      if (["FIXED", "LOST", "EXPIRED", "WITHDRAWN"].includes(inq.status)) closed++;
    }

    const winRate = closed > 0 ? (won / closed) * 100 : 0;

    return {
      success: true,
      data: { total, byStatus, pipelineValue, winRate, avgResponseHours: 0 },
    };
  } catch (error) {
    console.error("Failed to get inquiry stats:", error);
    return { success: false, error: "Failed to load stats" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// CONFLICT DETECTION
// ═══════════════════════════════════════════════════════════════════

export interface ConflictWarning {
  type: "vessel_overlap" | "duplicate_inquiry";
  message: string;
  conflictingInquiryId?: string;
  conflictingInquiryLabel?: string;
}

export async function checkConflicts(data: {
  loadPort: string;
  dischargePort: string;
  laycanStart?: string | null;
  laycanEnd?: string | null;
  vesselId?: string | null;
  excludeInquiryId?: string;
}): Promise<{ success: boolean; warnings: ConflictWarning[] }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: true, warnings: [] };

    const warnings: ConflictWarning[] = [];
    const activeStatuses = ["NEW", "EVALUATING", "OFFERED", "NEGOTIATING"];

    // 1. Check duplicate: same load+discharge port with overlapping laycan
    if (data.laycanStart && data.laycanEnd) {
      const start = new Date(data.laycanStart);
      const end = new Date(data.laycanEnd);
      
      const duplicates = await prisma.cargoInquiry.findMany({
        where: {
          orgId: user.activeOrgId,
          status: { in: activeStatuses },
          loadPort: data.loadPort,
          dischargePort: data.dischargePort,
          id: data.excludeInquiryId ? { not: data.excludeInquiryId } : undefined,
          OR: [
            { laycanStart: { lte: end }, laycanEnd: { gte: start } },
          ],
        },
        select: { id: true, cargoType: true, cargoQuantityMt: true, createdByName: true },
        take: 5,
      });

      for (const dup of duplicates) {
        warnings.push({
          type: "duplicate_inquiry",
          message: `Possible duplicate: ${dup.cargoQuantityMt.toLocaleString()} MT ${dup.cargoType} (by ${dup.createdByName || "unknown"})`,
          conflictingInquiryId: dup.id,
          conflictingInquiryLabel: `${dup.cargoQuantityMt.toLocaleString()} MT ${dup.cargoType}`,
        });
      }
    }

    // 2. Check vessel overlap: vessel already linked to another inquiry with overlapping laycan
    if (data.vesselId && data.laycanStart && data.laycanEnd) {
      const start = new Date(data.laycanStart);
      const end = new Date(data.laycanEnd);
      
      const overlaps = await prisma.cargoInquiry.findMany({
        where: {
          orgId: user.activeOrgId,
          status: { in: activeStatuses },
          selectedVesselId: data.vesselId,
          id: data.excludeInquiryId ? { not: data.excludeInquiryId } : undefined,
          OR: [
            { laycanStart: { lte: end }, laycanEnd: { gte: start } },
          ],
        },
        select: { id: true, cargoType: true, loadPort: true, dischargePort: true },
        take: 5,
      });

      for (const ov of overlaps) {
        warnings.push({
          type: "vessel_overlap",
          message: `Vessel already linked to: ${ov.cargoType} ${ov.loadPort} → ${ov.dischargePort}`,
          conflictingInquiryId: ov.id,
        });
      }
    }

    return { success: true, warnings };
  } catch (error) {
    console.error("Failed to check conflicts:", error);
    return { success: true, warnings: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════
// BROKER SCORECARD
// ═══════════════════════════════════════════════════════════════════

export interface BrokerScore {
  brokerName: string;
  totalInquiries: number;
  won: number;
  lost: number;
  winRate: number;
  avgFreight: number;
  totalRevenue: number;
}

export async function getBrokerScorecard(): Promise<{
  success: boolean;
  data?: BrokerScore[];
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: true, data: [] };

    const inquiries = await prisma.cargoInquiry.findMany({
      where: { orgId: user.activeOrgId, brokerName: { not: null } },
      select: { brokerName: true, status: true, freightOffered: true, estimatedRevenue: true },
    });

    const brokerMap = new Map<string, { total: number; won: number; lost: number; freightSum: number; freightCount: number; revenueSum: number }>();

    for (const inq of inquiries) {
      const name = inq.brokerName!;
      const existing = brokerMap.get(name) || { total: 0, won: 0, lost: 0, freightSum: 0, freightCount: 0, revenueSum: 0 };
      existing.total++;
      if (inq.status === "FIXED") { existing.won++; existing.revenueSum += inq.estimatedRevenue || 0; }
      if (["LOST", "EXPIRED", "WITHDRAWN"].includes(inq.status)) existing.lost++;
      if (inq.freightOffered) { existing.freightSum += inq.freightOffered; existing.freightCount++; }
      brokerMap.set(name, existing);
    }

    const scores: BrokerScore[] = [];
    for (const [name, data] of brokerMap) {
      const closed = data.won + data.lost;
      scores.push({
        brokerName: name,
        totalInquiries: data.total,
        won: data.won,
        lost: data.lost,
        winRate: closed > 0 ? (data.won / closed) * 100 : 0,
        avgFreight: data.freightCount > 0 ? data.freightSum / data.freightCount : 0,
        totalRevenue: data.revenueSum,
      });
    }

    scores.sort((a, b) => b.winRate - a.winRate);
    return { success: true, data: scores };
  } catch (error) {
    console.error("Failed to get broker scorecard:", error);
    return { success: false, error: "Failed to load broker scores" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2: FLEET INTEGRATION — VESSEL MATCHING
// ═══════════════════════════════════════════════════════════════════

export interface MatchedVessel {
  id: string;
  name: string;
  vesselType: string;
  dwt: number;
  grainCapacity: number | null;
  baleCapacity: number | null;
  ladenSpeed: number;
  ballastSpeed: number;
  commercialControl: string;
  dailyTcHireRate: number | null;
  tcHireStartDate: string | null;
  tcHireEndDate: string | null;
  matchScore: number; // 0-100 — how well this vessel fits
  matchReasons: string[];
  isAlreadyCandidate: boolean; // already in vesselCandidates for this inquiry
  hasConflict: boolean; // overlapping commitment
  conflictNote: string | null;
}

/**
 * Auto-match vessels to an inquiry based on:
 *  1. DWT — must exceed cargo quantity
 *  2. Grain/Bale capacity — must exceed cubic capacity requirement
 *  3. TC dates — vessel must be available during laycan window
 *  4. No conflicting existing inquiries/voyages during laycan
 */
export async function getMatchingVessels(inquiryId: string): Promise<{
  success: boolean;
  data?: MatchedVessel[];
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: true, data: [] };

    // Get the inquiry
    const inquiry = await prisma.cargoInquiry.findFirst({
      where: { id: inquiryId, orgId: user.activeOrgId },
      include: { vesselCandidates: { select: { vesselId: true } } },
    });
    if (!inquiry) return { success: false, error: "Inquiry not found" };

    const existingCandidateIds = new Set(inquiry.vesselCandidates.map((vc) => vc.vesselId));

    // Get all org vessels (basic data only)
    const vessels = await prisma.vessel.findMany({
      where: { orgId: user.activeOrgId },
    });

    // Get all conflicting inquiry candidates for these vessels in a separate query
    const conflictingCandidates = await prisma.inquiryVesselCandidate.findMany({
      where: {
        vesselId: { in: vessels.map((v) => v.id) },
        inquiry: {
          status: { in: ["OFFERED", "NEGOTIATING", "FIXED"] },
          id: { not: inquiryId },
        },
      },
      include: {
        inquiry: { select: { cargoType: true, loadPort: true, dischargePort: true, laycanStart: true, laycanEnd: true } },
      },
    });

    // Group conflict candidates by vessel
    const conflictsByVessel = new Map<string, typeof conflictingCandidates>();
    for (const cc of conflictingCandidates) {
      const existing = conflictsByVessel.get(cc.vesselId) || [];
      existing.push(cc);
      conflictsByVessel.set(cc.vesselId, existing);
    }

    const matched: MatchedVessel[] = [];

    for (const v of vessels) {
      let score = 0;
      const reasons: string[] = [];
      let hasConflict = false;
      let conflictNote: string | null = null;

      // ─── DWT Check ─────────────────────────────────────
      if (v.dwt >= inquiry.cargoQuantityMt) {
        const dwtRatio = inquiry.cargoQuantityMt / v.dwt;
        if (dwtRatio >= 0.7 && dwtRatio <= 0.95) {
          score += 35; // Sweet spot — well utilized
          reasons.push(`DWT ${v.dwt.toLocaleString()} MT — optimal utilization (${(dwtRatio * 100).toFixed(0)}%)`);
        } else if (dwtRatio >= 0.5) {
          score += 25;
          reasons.push(`DWT ${v.dwt.toLocaleString()} MT — adequate (${(dwtRatio * 100).toFixed(0)}% utilization)`);
        } else {
          score += 10;
          reasons.push(`DWT ${v.dwt.toLocaleString()} MT — vessel oversized`);
        }
      } else {
        reasons.push(`⚠ DWT ${v.dwt.toLocaleString()} MT — insufficient (need ${inquiry.cargoQuantityMt.toLocaleString()} MT)`);
      }

      // ─── Grain/Bale Capacity Check ─────────────────────
      if (inquiry.cubicCapacityReq && inquiry.cubicCapacityReq > 0) {
        const grainOk = v.grainCapacity && v.grainCapacity >= inquiry.cubicCapacityReq;
        const baleOk = v.baleCapacity && v.baleCapacity >= inquiry.cubicCapacityReq;
        if (grainOk) {
          score += 25;
          reasons.push(`Grain capacity ${v.grainCapacity!.toLocaleString()} m³ — sufficient`);
        } else if (baleOk) {
          score += 20;
          reasons.push(`Bale capacity ${v.baleCapacity!.toLocaleString()} m³ — sufficient`);
        } else if (v.grainCapacity) {
          reasons.push(`⚠ Grain capacity ${v.grainCapacity.toLocaleString()} m³ — need ${inquiry.cubicCapacityReq.toLocaleString()} m³`);
        }
      } else {
        // No cubic capacity requirement — give partial credit
        score += 10;
      }

      // ─── TC Availability Check ─────────────────────────
      if (inquiry.laycanStart && inquiry.laycanEnd) {
        const layStart = inquiry.laycanStart.getTime();
        const layEnd = inquiry.laycanEnd.getTime();

        if (v.tcHireStartDate && v.tcHireEndDate) {
          const tcStart = v.tcHireStartDate.getTime();
          const tcEnd = v.tcHireEndDate.getTime();
          if (tcStart <= layStart && tcEnd >= layEnd) {
            score += 20;
            reasons.push(`TC period covers laycan`);
          } else if (tcEnd < layStart) {
            reasons.push(`⚠ TC expires before laycan`);
          } else if (tcStart > layEnd) {
            reasons.push(`⚠ TC starts after laycan`);
          }
        } else if (v.commercialControl === "OWNED_BAREBOAT") {
          score += 20;
          reasons.push(`Owned vessel — always available`);
        } else {
          score += 10; // Unknown TC status
        }
      } else {
        score += 10;
      }

      // ─── Conflict Check — existing commitments ─────────
      if (inquiry.laycanStart && inquiry.laycanEnd) {
        const vesselConflicts = conflictsByVessel.get(v.id) || [];
        for (const ic of vesselConflicts) {
          const existInq = ic.inquiry;
          if (existInq.laycanStart && existInq.laycanEnd) {
            const confStart = existInq.laycanStart.getTime();
            const confEnd = existInq.laycanEnd.getTime();
            const layStart = inquiry.laycanStart!.getTime();
            const layEnd = inquiry.laycanEnd!.getTime();

            if (confStart <= layEnd && confEnd >= layStart) {
              hasConflict = true;
              conflictNote = `Overlaps with ${existInq.cargoType} ${existInq.loadPort} → ${existInq.dischargePort}`;
              score -= 15;
            }
          }
        }
      }

      // ─── Speed Bonus ───────────────────────────────────
      if (v.ladenSpeed >= 12) {
        score += 10;
        reasons.push(`Speed ${v.ladenSpeed} kn laden`);
      }

      matched.push({
        id: v.id,
        name: v.name,
        vesselType: v.vesselType,
        dwt: v.dwt,
        grainCapacity: v.grainCapacity,
        baleCapacity: v.baleCapacity,
        ladenSpeed: v.ladenSpeed,
        ballastSpeed: v.ballastSpeed,
        commercialControl: v.commercialControl,
        dailyTcHireRate: v.dailyTcHireRate,
        tcHireStartDate: v.tcHireStartDate?.toISOString() || null,
        tcHireEndDate: v.tcHireEndDate?.toISOString() || null,
        matchScore: Math.max(0, Math.min(100, score)),
        matchReasons: reasons,
        isAlreadyCandidate: existingCandidateIds.has(v.id),
        hasConflict,
        conflictNote,
      });
    }

    // Sort by match score descending
    matched.sort((a, b) => b.matchScore - a.matchScore);

    return { success: true, data: matched };
  } catch (error) {
    console.error("Failed to match vessels:", error);
    return { success: false, error: "Failed to match vessels" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// VESSEL CANDIDATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

export async function addVesselCandidate(
  inquiryId: string,
  vesselId: string,
  estimatedTce?: number | null,
  notes?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    // Verify inquiry + vessel belong to org
    const [inquiry, vessel] = await Promise.all([
      prisma.cargoInquiry.findFirst({ where: { id: inquiryId, orgId: user.activeOrgId } }),
      prisma.vessel.findFirst({ where: { id: vesselId, orgId: user.activeOrgId } }),
    ]);
    if (!inquiry) return { success: false, error: "Inquiry not found" };
    if (!vessel) return { success: false, error: "Vessel not found" };

    // Upsert to avoid duplicates
    await prisma.inquiryVesselCandidate.upsert({
      where: { inquiryId_vesselId: { inquiryId, vesselId } },
      update: { estimatedTce, notes, evaluatedAt: new Date() },
      create: { inquiryId, vesselId, estimatedTce, notes },
    });

    // Auto-transition to EVALUATING if still NEW
    if (inquiry.status === "NEW") {
      await prisma.cargoInquiry.update({
        where: { id: inquiryId },
        data: { status: "EVALUATING" },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to add vessel candidate:", error);
    return { success: false, error: "Failed to add vessel" };
  }
}

export async function removeVesselCandidate(
  inquiryId: string,
  vesselId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    await prisma.inquiryVesselCandidate.delete({
      where: { inquiryId_vesselId: { inquiryId, vesselId } },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to remove vessel candidate:", error);
    return { success: false, error: "Failed to remove vessel" };
  }
}

export async function selectVesselForInquiry(
  inquiryId: string,
  vesselId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    // Unselect all others, select this one
    await prisma.$transaction([
      prisma.inquiryVesselCandidate.updateMany({
        where: { inquiryId },
        data: { isSelected: false },
      }),
      prisma.inquiryVesselCandidate.update({
        where: { inquiryId_vesselId: { inquiryId, vesselId } },
        data: { isSelected: true },
      }),
      prisma.cargoInquiry.update({
        where: { id: inquiryId },
        data: { selectedVesselId: vesselId },
      }),
    ]);

    return { success: true };
  } catch (error) {
    console.error("Failed to select vessel:", error);
    return { success: false, error: "Failed to select vessel" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// CONVERT INQUIRY → VOYAGE (Pre-fill)
// ═══════════════════════════════════════════════════════════════════

export interface VoyagePrefill {
  vesselId: string;
  vesselName: string;
  loadPort: string;
  dischargePort: string;
  cargoQuantityMt: number;
  cargoType: string;
  stowageFactor: number | null;
  freightRateUsd: number | null;
  commissionPercent: number;
  brokeragePercent: number;
  inquiryId: string;
}

/**
 * Generates a pre-filled Voyage payload from an inquiry.
 * The user opens Route Planner or Voyage form with this data pre-populated.
 */
export async function getVoyagePrefill(inquiryId: string): Promise<{
  success: boolean;
  data?: VoyagePrefill;
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const inquiry = await prisma.cargoInquiry.findFirst({
      where: { id: inquiryId, orgId: user.activeOrgId },
      include: {
        vesselCandidates: {
          where: { isSelected: true },
          include: { vessel: { select: { id: true, name: true } } },
          take: 1,
        },
      },
    });
    if (!inquiry) return { success: false, error: "Inquiry not found" };

    // Require a selected vessel
    const selectedCandidate = inquiry.vesselCandidates[0];
    if (!selectedCandidate) {
      return { success: false, error: "No vessel selected. Select a vessel before creating a voyage." };
    }

    return {
      success: true,
      data: {
        vesselId: selectedCandidate.vesselId,
        vesselName: selectedCandidate.vessel.name,
        loadPort: inquiry.loadPort,
        dischargePort: inquiry.dischargePort,
        cargoQuantityMt: inquiry.cargoQuantityMt,
        cargoType: inquiry.cargoType,
        stowageFactor: inquiry.stowageFactor,
        freightRateUsd: inquiry.freightCountered || inquiry.freightOffered,
        commissionPercent: inquiry.commissionPercent || 3.75,
        brokeragePercent: 1.25,
        inquiryId: inquiry.id,
      },
    };
  } catch (error) {
    console.error("Failed to generate voyage prefill:", error);
    return { success: false, error: "Failed to generate voyage data" };
  }
}

/**
 * Link an inquiry to an existing voyage (does NOT change pipeline status).
 */
export async function linkInquiryToVoyage(
  inquiryId: string,
  voyageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    await prisma.cargoInquiry.update({
      where: { id: inquiryId },
      data: { voyageId },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to link inquiry to voyage:", error);
    return { success: false, error: "Failed to link" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 4: FLEET SCHEDULE INTEGRATION
// ═══════════════════════════════════════════════════════════════════

/** Compact vessel match summary for dock panel cards */
export interface TopVesselMatch {
  id: string;
  name: string;
  matchScore: number;
  dwt: number;
  vesselType: string;
  hasConflict: boolean;
}

export interface FleetInquirySummary {
  id: string;
  cargoType: string;
  cargoQuantityMt: number;
  loadPort: string;
  dischargePort: string;
  laycanStart: string | null;
  laycanEnd: string | null;
  freightOffered: number | null;
  estimatedRevenue: number | null;
  status: string;
  brokerName: string | null;
  urgency: "URGENT" | "ACTIVE" | "PLANNING" | "OVERDUE" | null;
  vesselCandidateCount: number;
  selectedVesselId: string | null;
  topVessels: TopVesselMatch[];
}

// ═══════════════════════════════════════════════════════════════════
// FLEET FIT COUNTS (batch DWT check)
// ═══════════════════════════════════════════════════════════════════

/**
 * Batch-computes how many vessels in the fleet can carry each active inquiry.
 * Lightweight: 2 simple SELECTs + in-memory loop. Sub-100ms for typical fleets.
 */
export async function getFleetFitCounts(): Promise<{
  success: boolean;
  data?: Record<string, number>;
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: true, data: {} };

    const [vessels, inquiries] = await Promise.all([
      prisma.vessel.findMany({
        where: { orgId: user.activeOrgId },
        select: { dwt: true },
      }),
      prisma.cargoInquiry.findMany({
        where: {
          orgId: user.activeOrgId,
          status: { in: ["NEW", "EVALUATING", "OFFERED", "NEGOTIATING", "FIXED"] },
        },
        select: { id: true, cargoQuantityMt: true },
      }),
    ]);

    const fitCounts: Record<string, number> = {};
    for (const inq of inquiries) {
      fitCounts[inq.id] = vessels.filter(v => v.dwt >= inq.cargoQuantityMt).length;
    }

    return { success: true, data: fitCounts };
  } catch (error) {
    console.error("Failed to compute fleet fit counts:", error);
    return { success: false, error: "Failed to compute fit counts" };
  }
}

/**
 * Lightweight fetch of active inquiries for the Fleet Schedule dock panel.
 * Only returns open pipeline inquiries (not FIXED/LOST/EXPIRED/WITHDRAWN).
 */
export async function getActiveInquiriesForFleet(): Promise<{
  success: boolean;
  data?: FleetInquirySummary[];
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const inquiries = await prisma.cargoInquiry.findMany({
      where: {
        orgId: user.activeOrgId,
        status: { in: ["NEW", "EVALUATING", "OFFERED", "NEGOTIATING"] },
        voyageId: null, // Only show unassigned inquiries
      },
      include: {
        _count: { select: { vesselCandidates: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const data: FleetInquirySummary[] = inquiries.map((inq) => {
      let urgency: FleetInquirySummary["urgency"] = null;
      if (inq.laycanStart) {
        const laycan = new Date(inq.laycanStart);
        const daysUntil = Math.ceil(
          (laycan.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntil < 0) urgency = "OVERDUE";
        else if (daysUntil <= 3) urgency = "URGENT";
        else if (daysUntil <= 7) urgency = "ACTIVE";
        else urgency = "PLANNING";
      }

      return {
        id: inq.id,
        cargoType: inq.cargoType,
        cargoQuantityMt: inq.cargoQuantityMt,
        loadPort: inq.loadPort,
        dischargePort: inq.dischargePort,
        laycanStart: inq.laycanStart?.toISOString() || null,
        laycanEnd: inq.laycanEnd?.toISOString() || null,
        freightOffered: inq.freightOffered,
        estimatedRevenue: inq.estimatedRevenue,
        status: inq.status,
        brokerName: inq.brokerName,
        urgency,
        vesselCandidateCount: inq._count.vesselCandidates,
        selectedVesselId: inq.selectedVesselId,
        topVessels: [], // populated below
      };
    });

    // ── Batch-compute top 3 vessels per inquiry ──────────────────
    const orgVessels = await prisma.vessel.findMany({
      where: { orgId: user.activeOrgId },
      select: {
        id: true,
        name: true,
        vesselType: true,
        dwt: true,
        grainCapacity: true,
        baleCapacity: true,
        ladenSpeed: true,
        commercialControl: true,
        tcHireStartDate: true,
        tcHireEndDate: true,
      },
    });

    // Pre-fetch all conflict candidates across the fleet
    const allConflicts = await prisma.inquiryVesselCandidate.findMany({
      where: {
        vesselId: { in: orgVessels.map((v) => v.id) },
        inquiry: {
          status: { in: ["OFFERED", "NEGOTIATING", "FIXED"] },
        },
      },
      include: {
        inquiry: {
          select: { id: true, laycanStart: true, laycanEnd: true },
        },
      },
    });

    const conflictsByVessel = new Map<string, typeof allConflicts>();
    for (const cc of allConflicts) {
      const arr = conflictsByVessel.get(cc.vesselId) || [];
      arr.push(cc);
      conflictsByVessel.set(cc.vesselId, arr);
    }

    // Score each vessel against each inquiry (lightweight in-memory)
    for (const item of data) {
      const inq = inquiries.find((i) => i.id === item.id)!;
      const scored: TopVesselMatch[] = [];

      for (const v of orgVessels) {
        let score = 0;

        // DWT check
        if (v.dwt >= inq.cargoQuantityMt) {
          const ratio = inq.cargoQuantityMt / v.dwt;
          score += ratio >= 0.7 && ratio <= 0.95 ? 35 : ratio >= 0.5 ? 25 : 10;
        } else {
          continue; // Skip vessels that can't carry
        }

        // Cubic capacity check
        const cubicReq = inq.stowageFactor && inq.cargoQuantityMt
          ? inq.cargoQuantityMt * inq.stowageFactor
          : 0;
        if (cubicReq > 0) {
          if (v.grainCapacity && v.grainCapacity >= cubicReq) score += 25;
          else if (v.baleCapacity && v.baleCapacity >= cubicReq) score += 20;
        } else {
          score += 10;
        }

        // TC availability
        if (inq.laycanStart && inq.laycanEnd) {
          const layStart = inq.laycanStart.getTime();
          const layEnd = inq.laycanEnd.getTime();
          if (v.tcHireStartDate && v.tcHireEndDate) {
            if (v.tcHireStartDate.getTime() <= layStart && v.tcHireEndDate.getTime() >= layEnd) {
              score += 20;
            }
          } else if (v.commercialControl === "OWNED_BAREBOAT") {
            score += 20;
          } else {
            score += 10;
          }
        } else {
          score += 10;
        }

        // Speed bonus
        if (v.ladenSpeed >= 12) score += 10;

        // Conflict check
        let hasConflict = false;
        if (inq.laycanStart && inq.laycanEnd) {
          const vesselConflicts = conflictsByVessel.get(v.id) || [];
          for (const ic of vesselConflicts) {
            if (ic.inquiry.id === inq.id) continue;
            if (ic.inquiry.laycanStart && ic.inquiry.laycanEnd) {
              const cStart = ic.inquiry.laycanStart.getTime();
              const cEnd = ic.inquiry.laycanEnd.getTime();
              if (cStart <= inq.laycanEnd!.getTime() && cEnd >= inq.laycanStart!.getTime()) {
                hasConflict = true;
                score -= 15;
              }
            }
          }
        }

        scored.push({
          id: v.id,
          name: v.name,
          matchScore: Math.max(0, Math.min(100, score)),
          dwt: v.dwt,
          vesselType: v.vesselType,
          hasConflict,
        });
      }

      // Top 3 by score
      scored.sort((a, b) => b.matchScore - a.matchScore);
      item.topVessels = scored.slice(0, 3);
    }

    return { success: true, data };
  } catch (error) {
    console.error("Failed to load fleet inquiries:", error);
    return { success: false, error: "Failed to load inquiries" };
  }
}

/**
 * Creates a DRAFT voyage when an inquiry card is dropped onto a vessel row
 * in the Fleet Schedule. Auto-fills vessel defaults, runs the voyage
 * calculation engine, and saves VoyageCalculation so the bar appears
 * immediately on the Gantt timeline.
 */
export async function createDraftVoyageFromDrop(
  inquiryId: string,
  vesselId: string
): Promise<{ success: boolean; voyageId?: string; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    // 1. Fetch inquiry
    const inquiry = await prisma.cargoInquiry.findFirst({
      where: { id: inquiryId, orgId: user.activeOrgId },
    });
    if (!inquiry) return { success: false, error: "Inquiry not found" };

    // 2. Fetch vessel (with all profile data for calculation)
    const vessel = await prisma.vessel.findFirst({
      where: { id: vesselId, orgId: user.activeOrgId },
    });
    if (!vessel) return { success: false, error: "Vessel not found" };

    // ── Safety check: vessel must be able to carry the cargo ──
    if (vessel.dwt < inquiry.cargoQuantityMt) {
      return {
        success: false,
        error: `Vessel ${vessel.name} (DWT ${vessel.dwt.toLocaleString()} MT) cannot carry ${inquiry.cargoQuantityMt.toLocaleString()} MT of ${inquiry.cargoType}. DWT capacity is insufficient.`,
      };
    }

    // 3. Calculate estimated departure/arrival from laycan
    const estimatedDeparture = inquiry.laycanStart || new Date();
    const depDate = estimatedDeparture instanceof Date
      ? estimatedDeparture
      : new Date(estimatedDeparture);

    // Default estimated voyage duration: 21 days if no laycan end
    const estimatedArrival = inquiry.laycanEnd
      ? new Date(inquiry.laycanEnd.getTime() + 14 * 24 * 60 * 60 * 1000)
      : new Date(depDate.getTime() + 21 * 24 * 60 * 60 * 1000);

    // 4. Build voyage data with sensible defaults
    const freightRate = inquiry.freightCountered || inquiry.freightOffered;
    const commission = inquiry.commissionPercent || 3.75;
    const brokerage = 1.25;
    const bunkerPrice = 550; // Default VLSFO market price
    const loadPortDays = 2;
    const dischargePortDays = 2;

    // Distances default to 0 (preliminary). Users can update via Route Planner.
    // For a preliminary TCE estimate, 0 distance = port-cost-only calculation.
    const ballastDistanceNm = 0;
    const ladenDistanceNm = 0;

    const voyage = await prisma.voyage.create({
      data: {
        userId: user.id,
        orgId: user.activeOrgId,
        vesselId: vesselId,
        loadPort: inquiry.loadPort,
        dischargePort: inquiry.dischargePort,
        cargoQuantityMt: inquiry.cargoQuantityMt,
        cargoType: inquiry.cargoType,
        stowageFactor: inquiry.stowageFactor,
        freightRateUsd: freightRate,
        commissionPercent: commission,
        brokeragePercent: brokerage,
        ballastDistanceNm,
        ladenDistanceNm,
        loadPortDays,
        dischargePortDays,
        bunkerPriceUsd: bunkerPrice,
        estimatedDeparture: depDate,
        estimatedArrival: estimatedArrival,
        redeliveryPort: inquiry.dischargePort,
        redeliveryDate: estimatedArrival,
        status: "DRAFT",
      },
    });

    // ─── 5. AUTO-CALCULATE: Run the voyage calculation engine inline ───
    const { calculateVoyage } = await import("@/lib/calculations/voyage");

    // Build vessel profile from DB record
    const portConsumptionWithCrane = vessel.portConsumptionWithCrane ?? 0;
    const portConsumptionWithoutCrane = vessel.portConsumptionWithoutCrane ?? 0;
    const portConsumption = portConsumptionWithoutCrane || portConsumptionWithCrane;

    const vesselProfile = {
      ladenSpeed: vessel.ladenSpeed,
      ballastSpeed: vessel.ballastSpeed,
      ladenConsumption: vessel.ladenConsumption ?? 0,
      ballastConsumption: vessel.ballastConsumption ?? 0,
      portConsumption,
      dailyOpex: vessel.dailyOpex ?? 0,
      ecoLadenSpeed: vessel.ecoLadenSpeed ?? undefined,
      ecoBallastSpeed: vessel.ecoBallastSpeed ?? undefined,
      ecoLadenConsumption: vessel.ecoLadenConsumption ?? undefined,
      ecoBallastConsumption: vessel.ecoBallastConsumption ?? undefined,
      dwt: vessel.dwt,
      vesselConstant: vessel.vesselConstant ?? undefined,
      grainCapacity: vessel.grainCapacity ?? undefined,
      baleCapacity: vessel.baleCapacity ?? undefined,
      teuCapacity: vessel.teuCapacity ?? undefined,
      cargoTankCapacityCbm: vessel.cargoTankCapacityCbm ?? undefined,
      boilOffRate: vessel.boilOffRate ?? undefined,
      heelQuantity: vessel.heelQuantity ?? undefined,
    };

    // Build voyage inputs
    const voyageInputs = {
      ballastDistanceNm,
      ladenDistanceNm,
      loadPortDays,
      dischargePortDays,
      waitingDays: 0,
      idleDays: 0,
      cargoQuantityMt: inquiry.cargoQuantityMt,
      useEcoSpeed: false,
      canalTolls: 0,
      bunkerPriceUsd: bunkerPrice,
      brokeragePercent: brokerage,
      commissionPercent: commission,
      additionalCosts: 0,
      pdaCosts: 0,
      lubOilCosts: 0,
      weatherRiskMultiplier: 1.0,
      freightRateUsd: freightRate ?? undefined,
      stowageFactor: inquiry.stowageFactor ?? undefined,
    };

    // Run calculation engine
    const calculation = calculateVoyage(vesselProfile, voyageInputs);

    // Helper for NaN safety
    const safe = (v: number | null | undefined): number | null => {
      if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return null;
      return v;
    };

    // Save VoyageCalculation — this makes the bar appear on the Gantt
    await prisma.voyageCalculation.upsert({
      where: { voyageId: voyage.id },
      create: {
        voyage: { connect: { id: voyage.id } },
        ballastSeaDays: safe(calculation.duration.ballastSeaDays) ?? 0,
        ladenSeaDays: safe(calculation.duration.ladenSeaDays) ?? 0,
        totalSeaDays: safe(calculation.duration.totalSeaDays) ?? 0,
        totalPortDays: safe(calculation.duration.totalPortDays) ?? 0,
        totalVoyageDays: safe(calculation.duration.totalVoyageDays) ?? 0,
        ballastBunkerMt: safe(calculation.bunker.ballastBunkerMt) ?? 0,
        ladenBunkerMt: safe(calculation.bunker.ladenBunkerMt) ?? 0,
        portBunkerMt: safe(calculation.bunker.portBunkerMt) ?? 0,
        totalBunkerMt: safe(calculation.bunker.totalBunkerMt) ?? 0,
        totalBunkerCost: safe(calculation.bunker.totalBunkerCost) ?? 0,
        opexCost: safe(calculation.costs.opexCost) ?? 0,
        canalCost: safe(calculation.costs.canalCost) ?? 0,
        brokerageCost: safe(calculation.costs.brokerageCost) ?? 0,
        commissionCost: safe(calculation.costs.commissionCost) ?? 0,
        additionalCost: safe(calculation.costs.additionalCost) ?? 0,
        totalVoyageCost: safe(calculation.costs.totalVoyageCost) ?? 0,
        grossRevenue: safe(calculation.profitability.grossRevenue),
        netRevenue: safe(calculation.profitability.netRevenue),
        voyagePnl: safe(calculation.profitability.voyagePnl),
        tce: safe(calculation.profitability.tce) ?? 0,
        breakEvenFreight: safe(calculation.profitability.breakEvenFreight) ?? 0,
      },
      update: {
        ballastSeaDays: safe(calculation.duration.ballastSeaDays) ?? 0,
        ladenSeaDays: safe(calculation.duration.ladenSeaDays) ?? 0,
        totalSeaDays: safe(calculation.duration.totalSeaDays) ?? 0,
        totalPortDays: safe(calculation.duration.totalPortDays) ?? 0,
        totalVoyageDays: safe(calculation.duration.totalVoyageDays) ?? 0,
        ballastBunkerMt: safe(calculation.bunker.ballastBunkerMt) ?? 0,
        ladenBunkerMt: safe(calculation.bunker.ladenBunkerMt) ?? 0,
        portBunkerMt: safe(calculation.bunker.portBunkerMt) ?? 0,
        totalBunkerMt: safe(calculation.bunker.totalBunkerMt) ?? 0,
        totalBunkerCost: safe(calculation.bunker.totalBunkerCost) ?? 0,
        opexCost: safe(calculation.costs.opexCost) ?? 0,
        canalCost: safe(calculation.costs.canalCost) ?? 0,
        brokerageCost: safe(calculation.costs.brokerageCost) ?? 0,
        commissionCost: safe(calculation.costs.commissionCost) ?? 0,
        additionalCost: safe(calculation.costs.additionalCost) ?? 0,
        totalVoyageCost: safe(calculation.costs.totalVoyageCost) ?? 0,
        grossRevenue: safe(calculation.profitability.grossRevenue),
        netRevenue: safe(calculation.profitability.netRevenue),
        voyagePnl: safe(calculation.profitability.voyagePnl),
        tce: safe(calculation.profitability.tce) ?? 0,
        breakEvenFreight: safe(calculation.profitability.breakEvenFreight) ?? 0,
        calculatedAt: new Date(),
      },
    });

    // ─── 6. Update inquiry: link vessel, transition status ─────────
    const existingCandidate = await prisma.inquiryVesselCandidate.findFirst({
      where: { inquiryId: inquiry.id, vesselId },
    });

    if (!existingCandidate) {
      await prisma.inquiryVesselCandidate.create({
        data: {
          inquiryId: inquiry.id,
          vesselId,
          isSelected: true,
        },
      });
    } else {
      await prisma.inquiryVesselCandidate.update({
        where: { id: existingCandidate.id },
        data: { isSelected: true },
      });
    }

    // Deselect other candidates
    await prisma.inquiryVesselCandidate.updateMany({
      where: {
        inquiryId: inquiry.id,
        vesselId: { not: vesselId },
        isSelected: true,
      },
      data: { isSelected: false },
    });

    // Link inquiry to the new voyage and move to Offered-Negotiating phase
    // (vessel assignment = cargo is now being actively offered/negotiated)
    await prisma.cargoInquiry.update({
      where: { id: inquiry.id },
      data: {
        selectedVesselId: vesselId,
        voyageId: voyage.id,
        status: "OFFERED",
      },
    });

    return { success: true, voyageId: voyage.id };
  } catch (error) {
    console.error("Failed to create voyage from drop:", error);
    const message = error instanceof Error ? error.message : "Failed to create voyage";
    return { success: false, error: message };
  }
}

/**
 * Returns active inquiry counts per vessel for badge overlays on Fleet Schedule.
 */
export async function getInquiryBadgesForVessels(): Promise<{
  success: boolean;
  data?: Record<string, { count: number; urgentCount: number }>;
  error?: string;
}> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const candidates = await prisma.inquiryVesselCandidate.findMany({
      where: {
        inquiry: {
          orgId: user.activeOrgId,
          status: { in: ["EVALUATING", "OFFERED", "NEGOTIATING"] },
        },
      },
      include: {
        inquiry: { select: { laycanStart: true } },
      },
    });

    const badges: Record<string, { count: number; urgentCount: number }> = {};
    const now = new Date();

    for (const c of candidates) {
      if (!badges[c.vesselId]) {
        badges[c.vesselId] = { count: 0, urgentCount: 0 };
      }
      badges[c.vesselId].count++;
      if (c.inquiry.laycanStart) {
        const days = Math.ceil(
          (c.inquiry.laycanStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (days <= 3) badges[c.vesselId].urgentCount++;
      }
    }

    return { success: true, data: badges };
  } catch (error) {
    console.error("Failed to load inquiry badges:", error);
    return { success: false, error: "Failed to load badges" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// VOYAGE BAR CONTEXT MENU ACTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Reassign a voyage to a different vessel. Updates the vessel reference,
 * rebuilds the vessel profile, and re-runs the calculation engine so the
 * Gantt bar moves to the new vessel row with updated economics.
 */
export async function reassignVoyageToVessel(
  voyageId: string,
  newVesselId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    // Validate voyage belongs to org
    const voyage = await prisma.voyage.findFirst({
      where: { id: voyageId, orgId: user.activeOrgId },
    });
    if (!voyage) return { success: false, error: "Voyage not found" };

    // Validate new vessel belongs to org
    const newVessel = await prisma.vessel.findFirst({
      where: { id: newVesselId, orgId: user.activeOrgId },
    });
    if (!newVessel) return { success: false, error: "Vessel not found" };

    // 1. Update voyage vessel reference
    await prisma.voyage.update({
      where: { id: voyageId },
      data: { vesselId: newVesselId },
    });

    // 2. Update linked inquiry if exists
    const linkedInquiry = await prisma.cargoInquiry.findFirst({
      where: { voyageId: voyageId, orgId: user.activeOrgId },
    });
    if (linkedInquiry) {
      await prisma.cargoInquiry.update({
        where: { id: linkedInquiry.id },
        data: { selectedVesselId: newVesselId },
      });

      // Update vessel candidate selection
      await prisma.inquiryVesselCandidate.updateMany({
        where: { inquiryId: linkedInquiry.id, isSelected: true },
        data: { isSelected: false },
      });

      const existingCandidate = await prisma.inquiryVesselCandidate.findFirst({
        where: { inquiryId: linkedInquiry.id, vesselId: newVesselId },
      });
      if (existingCandidate) {
        await prisma.inquiryVesselCandidate.update({
          where: { id: existingCandidate.id },
          data: { isSelected: true },
        });
      } else {
        await prisma.inquiryVesselCandidate.create({
          data: { inquiryId: linkedInquiry.id, vesselId: newVesselId, isSelected: true },
        });
      }
    }

    // 3. Re-calculate with new vessel profile
    const { calculateVoyage } = await import("@/lib/calculations/voyage");

    const portConsumptionWithCrane = newVessel.portConsumptionWithCrane ?? 0;
    const portConsumptionWithoutCrane = newVessel.portConsumptionWithoutCrane ?? 0;
    const portConsumption = portConsumptionWithoutCrane || portConsumptionWithCrane;

    const vesselProfile = {
      ladenSpeed: newVessel.ladenSpeed,
      ballastSpeed: newVessel.ballastSpeed,
      ladenConsumption: newVessel.ladenConsumption ?? 0,
      ballastConsumption: newVessel.ballastConsumption ?? 0,
      portConsumption,
      dailyOpex: newVessel.dailyOpex ?? 0,
      ecoLadenSpeed: newVessel.ecoLadenSpeed ?? undefined,
      ecoBallastSpeed: newVessel.ecoBallastSpeed ?? undefined,
      ecoLadenConsumption: newVessel.ecoLadenConsumption ?? undefined,
      ecoBallastConsumption: newVessel.ecoBallastConsumption ?? undefined,
      dwt: newVessel.dwt,
      vesselConstant: newVessel.vesselConstant ?? undefined,
      grainCapacity: newVessel.grainCapacity ?? undefined,
      baleCapacity: newVessel.baleCapacity ?? undefined,
      teuCapacity: newVessel.teuCapacity ?? undefined,
    };

    const voyageInputs = {
      ballastDistanceNm: voyage.ballastDistanceNm,
      ladenDistanceNm: voyage.ladenDistanceNm,
      loadPortDays: voyage.loadPortDays,
      dischargePortDays: voyage.dischargePortDays,
      waitingDays: voyage.waitingDays,
      idleDays: voyage.idleDays,
      cargoQuantityMt: voyage.cargoQuantityMt,
      useEcoSpeed: voyage.useEcoSpeed,
      canalTolls: voyage.canalTolls,
      bunkerPriceUsd: voyage.bunkerPriceUsd,
      brokeragePercent: voyage.brokeragePercent,
      commissionPercent: voyage.commissionPercent,
      additionalCosts: voyage.additionalCosts,
      pdaCosts: voyage.pdaCosts,
      lubOilCosts: voyage.lubOilCosts,
      weatherRiskMultiplier: voyage.weatherRiskMultiplier,
      freightRateUsd: voyage.freightRateUsd ?? undefined,
      stowageFactor: voyage.stowageFactor ?? undefined,
    };

    const calculation = calculateVoyage(vesselProfile, voyageInputs);
    const safe = (v: number | null | undefined): number | null => {
      if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return null;
      return v;
    };

    await prisma.voyageCalculation.upsert({
      where: { voyageId: voyage.id },
      create: {
        voyage: { connect: { id: voyage.id } },
        ballastSeaDays: safe(calculation.duration.ballastSeaDays) ?? 0,
        ladenSeaDays: safe(calculation.duration.ladenSeaDays) ?? 0,
        totalSeaDays: safe(calculation.duration.totalSeaDays) ?? 0,
        totalPortDays: safe(calculation.duration.totalPortDays) ?? 0,
        totalVoyageDays: safe(calculation.duration.totalVoyageDays) ?? 0,
        ballastBunkerMt: safe(calculation.bunker.ballastBunkerMt) ?? 0,
        ladenBunkerMt: safe(calculation.bunker.ladenBunkerMt) ?? 0,
        portBunkerMt: safe(calculation.bunker.portBunkerMt) ?? 0,
        totalBunkerMt: safe(calculation.bunker.totalBunkerMt) ?? 0,
        totalBunkerCost: safe(calculation.bunker.totalBunkerCost) ?? 0,
        opexCost: safe(calculation.costs.opexCost) ?? 0,
        canalCost: safe(calculation.costs.canalCost) ?? 0,
        brokerageCost: safe(calculation.costs.brokerageCost) ?? 0,
        commissionCost: safe(calculation.costs.commissionCost) ?? 0,
        additionalCost: safe(calculation.costs.additionalCost) ?? 0,
        totalVoyageCost: safe(calculation.costs.totalVoyageCost) ?? 0,
        grossRevenue: safe(calculation.profitability.grossRevenue),
        netRevenue: safe(calculation.profitability.netRevenue),
        voyagePnl: safe(calculation.profitability.voyagePnl),
        tce: safe(calculation.profitability.tce) ?? 0,
        breakEvenFreight: safe(calculation.profitability.breakEvenFreight) ?? 0,
      },
      update: {
        ballastSeaDays: safe(calculation.duration.ballastSeaDays) ?? 0,
        ladenSeaDays: safe(calculation.duration.ladenSeaDays) ?? 0,
        totalSeaDays: safe(calculation.duration.totalSeaDays) ?? 0,
        totalPortDays: safe(calculation.duration.totalPortDays) ?? 0,
        totalVoyageDays: safe(calculation.duration.totalVoyageDays) ?? 0,
        ballastBunkerMt: safe(calculation.bunker.ballastBunkerMt) ?? 0,
        ladenBunkerMt: safe(calculation.bunker.ladenBunkerMt) ?? 0,
        portBunkerMt: safe(calculation.bunker.portBunkerMt) ?? 0,
        totalBunkerMt: safe(calculation.bunker.totalBunkerMt) ?? 0,
        totalBunkerCost: safe(calculation.bunker.totalBunkerCost) ?? 0,
        opexCost: safe(calculation.costs.opexCost) ?? 0,
        canalCost: safe(calculation.costs.canalCost) ?? 0,
        brokerageCost: safe(calculation.costs.brokerageCost) ?? 0,
        commissionCost: safe(calculation.costs.commissionCost) ?? 0,
        additionalCost: safe(calculation.costs.additionalCost) ?? 0,
        totalVoyageCost: safe(calculation.costs.totalVoyageCost) ?? 0,
        grossRevenue: safe(calculation.profitability.grossRevenue),
        netRevenue: safe(calculation.profitability.netRevenue),
        voyagePnl: safe(calculation.profitability.voyagePnl),
        tce: safe(calculation.profitability.tce) ?? 0,
        breakEvenFreight: safe(calculation.profitability.breakEvenFreight) ?? 0,
        calculatedAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to reassign voyage:", error);
    const message = error instanceof Error ? error.message : "Failed to reassign";
    return { success: false, error: message };
  }
}

/**
 * Unassign a voyage — deletes the voyage and its calculation, reverts
 * the linked inquiry back to EVALUATING so it reappears in the dock panel.
 */
export async function unassignVoyageToInquiry(
  voyageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const voyage = await prisma.voyage.findFirst({
      where: { id: voyageId, orgId: user.activeOrgId },
    });
    if (!voyage) return { success: false, error: "Voyage not found" };

    // 1. Find linked inquiry and revert its status
    const linkedInquiry = await prisma.cargoInquiry.findFirst({
      where: { voyageId: voyageId, orgId: user.activeOrgId },
    });

    if (linkedInquiry) {
      // Revert status to NEW (New-Evaluating) and unlink voyage
      await prisma.cargoInquiry.update({
        where: { id: linkedInquiry.id },
        data: {
          status: "NEW",
          selectedVesselId: null,
          voyageId: null,
        },
      });

      // Deselect all candidates so user can re-evaluate
      await prisma.inquiryVesselCandidate.updateMany({
        where: { inquiryId: linkedInquiry.id },
        data: { isSelected: false },
      });
    }

    // 2. Delete calculation first (FK constraint)
    await prisma.voyageCalculation.deleteMany({
      where: { voyageId: voyageId },
    });

    // 3. Delete freight recommendation if exists
    await prisma.freightRecommendation.deleteMany({
      where: { voyageId: voyageId },
    });

    // 4. Delete the voyage
    await prisma.voyage.delete({
      where: { id: voyageId },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to unassign voyage:", error);
    const message = error instanceof Error ? error.message : "Failed to unassign";
    return { success: false, error: message };
  }
}

/**
 * Permanently delete a voyage from the schedule. Unlike unassign, this does
 * NOT revert any linked inquiry — the inquiry stays at its current status.
 */
export async function deleteVoyageFromSchedule(
  voyageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = (await requireUser()) as AuthUser;
    if (!user.activeOrgId) return { success: false, error: "No organization" };

    const voyage = await prisma.voyage.findFirst({
      where: { id: voyageId, orgId: user.activeOrgId },
    });
    if (!voyage) return { success: false, error: "Voyage not found" };

    // Unlink inquiry reference (but don't revert status)
    await prisma.cargoInquiry.updateMany({
      where: { voyageId: voyageId, orgId: user.activeOrgId },
      data: { voyageId: null },
    });

    // Delete related records
    await prisma.voyageCalculation.deleteMany({ where: { voyageId } });
    await prisma.freightRecommendation.deleteMany({ where: { voyageId } });

    // Delete the voyage
    await prisma.voyage.delete({ where: { id: voyageId } });

    return { success: true };
  } catch (error) {
    console.error("Failed to delete voyage:", error);
    const message = error instanceof Error ? error.message : "Failed to delete voyage";
    return { success: false, error: message };
  }
}
