import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Ship,
  Anchor,
  MapPin,
  Calendar,
  Pencil,
  MoreHorizontal,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { formatRoute, formatNumber, formatRelativeTime } from "@/lib/utils";
import { VESSEL_TYPE_LABELS, FREIGHT_RATE_UNIT_LABELS } from "@/types";
import type { FreightRateUnit } from "@prisma/client";
import { DeleteButton } from "@/components/shared/DeleteButton";
import { AuditHistory } from "@/components/shared/AuditHistory";
import { VoyageShareDialog } from "@/components/shared/VoyageShareDialog";
import { VoyageDetailClient } from "@/components/voyages/VoyageDetailClient";
import { VoyageCalculationCard } from "@/components/voyages/VoyageCalculationCard";
import { FreightRecommendationCard } from "@/components/voyages/FreightRecommendationCard";
import { SensitivityCharts } from "@/components/voyages/SensitivityCharts";
import { VoyageActualsForm } from "@/components/voyages/VoyageActualsForm";
import { CommentSection } from "@/components/voyages/CommentSection";
import { EstimateVsActualCard } from "@/components/voyages/EstimateVsActualCard";
import { VoyageScenarios } from "@/components/voyages/VoyageScenarios";
import { getVoyagePermission, canModifyVoyage, canDeleteVoyage, type AuthUser } from "@/lib/permissions";
import type { 
  VesselType,
  RecommendationAction,
  RiskLevel,
} from "@prisma/client";

export default async function VoyageDetailPage({
  params,
}: {
  params: Promise<{ id: string; orgSlug: string }>;
}) {
  const user = await requireUser() as AuthUser;
  const { id, orgSlug } = await params;
  
  // Check per-voyage permission
  const permission = await getVoyagePermission(user, id);
  if (!permission) {
    notFound();
  }
  
  const voyage = await prisma.voyage.findUnique({
    where: { id },
    include: {
      vessel: true,
      calculations: true,
      recommendations: true,
      actuals: true,
    },
  });

  if (!voyage) {
    notFound();
  }

  const routeName = formatRoute(voyage.loadPort, voyage.dischargePort);
  const hasCalculation = !!voyage.calculations;
  const hasRecommendation = !!voyage.recommendations;
  const hasActuals = !!voyage.actuals;
  const canEdit = canModifyVoyage(permission);
  const canDelete = canDeleteVoyage(permission);
  const isOwnerOrAdmin = permission === "owner" || permission === "admin";
  const showActualsForm = (voyage.status === "FIXED" || voyage.status === "COMPLETED") && canEdit;

  // Voyage locking: lock edits once voyage is fixed or beyond
  const lockedStatuses = ["REJECTED", "FIXED", "COMPLETED", "LOST", "EXPIRED", "WITHDRAWN"];
  const isLocked = lockedStatuses.includes(voyage.status);

  return (
    <div id="voyage-pdf-content" className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        {/* Row 1: Navigation + Title */}
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/voyages`} data-pdf-hide="true">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">{routeName}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Anchor className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{voyage.vessel.name} ({VESSEL_TYPE_LABELS[voyage.vessel.vesselType as VesselType]})</span>
            </p>
          </div>
        </div>

        {/* Row 2: Action Bar */}
        <div className="flex items-center gap-2 flex-wrap" data-pdf-hide="true">
          <VoyageDetailClient 
            voyageId={voyage.id} 
            status={voyage.status}
            hasCalculation={hasCalculation}
            permission={permission}
            isLocked={isLocked}
            baseValues={{
              bunkerPriceUsd: voyage.bunkerPriceUsd,
              freightRateUsd: voyage.freightRateUsd,
              ladenSpeed: voyage.vessel.ladenSpeed,
              loadPortDays: voyage.loadPortDays,
              dischargePortDays: voyage.dischargePortDays,
            }}
          />

          {/* Spacer to push management actions to the right */}
          <div className="flex-1" />

          {/* Locked indicator */}
          {canEdit && isLocked && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
              <Lock className="h-3 w-3" />
              <span>Locked</span>
            </div>
          )}

          {/* Share (standalone — has its own Dialog) */}
          {isOwnerOrAdmin && (
            <VoyageShareDialog
              voyageId={voyage.id}
              voyageName={routeName}
            />
          )}

          {/* Management dropdown (Edit / Delete) */}
          {(canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {canEdit && !isLocked && (
                  <DropdownMenuItem asChild>
                    <Link href={`/${orgSlug}/voyages/${voyage.id}/edit`} className="flex items-center gap-2">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Voyage
                    </Link>
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    {canEdit && !isLocked && <DropdownMenuSeparator />}
                    <div className="px-2 py-1.5">
                      <DeleteButton
                        id={voyage.id}
                        type="voyage"
                        name={routeName}
                        variant="ghost"
                        size="sm"
                        showText={true}
                        redirectTo={`/${orgSlug}/voyages`}
                      />
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Voyage Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Voyage Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <OverviewItem
              icon={<MapPin className="h-4 w-4" />}
              label="Route"
              value={(() => {
                const vl = voyage.voyageLegs as { loadPorts?: string[]; dischargePorts?: string[] } | null;
                const allPorts = vl
                  ? [...(vl.loadPorts || []), ...(vl.dischargePorts || [])]
                  : [voyage.loadPort, voyage.dischargePort];
                const prefix = voyage.openPort ? `${voyage.openPort} → ` : "";
                return prefix + allPorts.join(" → ");
              })()}
              subtext={
                voyage.openPort || (voyage.voyageLegs as { loadPorts?: string[] } | null)?.loadPorts?.length
                  ? "Open → Load → Discharge"
                  : undefined
              }
            />
            <OverviewItem
              label="Cargo"
              value={`${formatNumber(voyage.cargoQuantityMt)} MT`}
              subtext={voyage.cargoType || undefined}
            />
            <OverviewItem
              label="Distances"
              value={`${formatNumber(voyage.ballastDistanceNm)} + ${formatNumber(voyage.ladenDistanceNm)} NM`}
              subtext="Ballast + Laden"
            />
            <OverviewItem
              label="Port Days"
              value={`${voyage.loadPortDays} + ${voyage.dischargePortDays} days`}
              subtext="Load + Discharge"
            />
            {/* Laycan */}
            <OverviewItem
              icon={<Calendar className="h-4 w-4" />}
              label="Laycan"
              value={voyage.laycanStart
                ? `${new Date(voyage.laycanStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${voyage.laycanEnd ? ` – ${new Date(voyage.laycanEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`
                : "Not set"}
              subtext={voyage.laycanStart ? (() => {
                const now = new Date();
                const start = new Date(voyage.laycanStart!);
                const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (daysUntil < 0) return "Overdue";
                if (daysUntil <= 3) return "Urgent";
                if (daysUntil <= 7) return "Active";
                return `${daysUntil} days away`;
              })() : undefined}
              subtextColor={voyage.laycanStart ? (() => {
                const now = new Date();
                const start = new Date(voyage.laycanStart!);
                const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (daysUntil < 0) return "text-gray-400";
                if (daysUntil <= 3) return "text-red-400";
                if (daysUntil <= 7) return "text-amber-400";
                return "text-blue-400";
              })() : undefined}
            />
            {/* Fuel Prices - Show all from fuelPrices or fallback to legacy */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Fuel Prices
              </div>
              {voyage.fuelPrices && typeof voyage.fuelPrices === 'object' && Object.keys(voyage.fuelPrices as object).length > 0 ? (
                <div className="space-y-0.5">
                  {Object.entries(voyage.fuelPrices as Record<string, number>).map(([fuelType, price]) => (
                    <p key={fuelType} className="font-medium text-sm">
                      ${formatNumber(price)}/MT <span className="text-xs text-muted-foreground">{fuelType}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <>
                  <p className="font-medium">${formatNumber(voyage.bunkerPriceUsd)}/MT</p>
                  <p className="text-xs text-muted-foreground">{voyage.bunkerFuelType}</p>
                </>
              )}
            </div>
            <OverviewItem
              label="Freight Offered"
              value={voyage.freightRateUsd 
                ? voyage.freightRateUnit === "LUMP_SUM"
                  ? `$${formatNumber(voyage.freightRateUsd)}`
                  : `$${formatNumber(voyage.freightRateUsd)}/${voyage.freightRateUnit === "PER_TEU" ? "TEU" : voyage.freightRateUnit === "PER_CBM" ? "CBM" : "MT"}`
                : "—"}
              subtext={voyage.freightRateUnit 
                ? FREIGHT_RATE_UNIT_LABELS[voyage.freightRateUnit as FreightRateUnit] ?? "USD per MT"
                : "USD per MT"}
            />
            <OverviewItem
              icon={<Calendar className="h-4 w-4" />}
              label="Created"
              value={formatRelativeTime(voyage.createdAt)}
            />
            <OverviewItem
              label="Last Updated"
              value={formatRelativeTime(voyage.updatedAt)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Calculation Results */}
      {hasCalculation && voyage.calculations ? (
        <VoyageCalculationCard 
          calculation={voyage.calculations} 
          freightRateUsd={voyage.freightRateUsd}
          freightRateUnit={(voyage.freightRateUnit as FreightRateUnit) ?? "PER_MT"}
          dailyOpex={voyage.vessel.dailyOpex ?? 0}
          pdaCosts={voyage.pdaCosts}
          lubOilCosts={voyage.lubOilCosts}
          vesselDwt={voyage.vessel.dwt}
          vesselConstant={voyage.vessel.vesselConstant ?? undefined}
          cargoQuantityMt={voyage.cargoQuantityMt}
          stowageFactor={voyage.stowageFactor ?? undefined}
          grainCapacity={voyage.vessel.grainCapacity ?? undefined}
          baleCapacity={voyage.vessel.baleCapacity ?? undefined}
          boilOffRate={voyage.vessel.boilOffRate ?? undefined}
          cargoTankCapacityCbm={voyage.vessel.cargoTankCapacityCbm ?? undefined}
        />
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Ship className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Calculation Yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Click "Calculate" to compute voyage profitability and get freight recommendations.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Freight Recommendation */}
      {hasRecommendation && voyage.recommendations ? (
        <FreightRecommendationCard 
          recommendation={{
            ...voyage.recommendations,
            recommendation: voyage.recommendations.recommendation as RecommendationAction,
            overallRisk: voyage.recommendations.overallRisk as RiskLevel,
            bunkerVolatilityRisk: voyage.recommendations.bunkerVolatilityRisk as RiskLevel,
            weatherRisk: voyage.recommendations.weatherRisk as RiskLevel,
            marketAlignmentRisk: voyage.recommendations.marketAlignmentRisk as RiskLevel,
          }}
          offeredFreight={voyage.freightRateUsd}
          cargoQuantity={voyage.cargoQuantityMt}
        />
      ) : hasCalculation ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-muted-foreground">
              Recommendation will be generated with the next calculation.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Sensitivity Analysis & Scenarios */}
      {hasCalculation && (
        <SensitivityCharts voyageId={voyage.id} />
      )}

      {/* Inline Scenario Comparison (replaces standalone /scenarios page) */}
      {hasCalculation && (
        <VoyageScenarios voyageId={voyage.id} />
      )}

      {/* Discussion / Comments — placed after all analysis sections */}
      {hasCalculation && (
        <CommentSection
          voyageId={voyage.id}
          currentUserId={user.clerkId}
          currentUserName={user.name || user.email || "Unknown"}
          permission={permission}
        />
      )}

      {/* Voyage Actuals Form */}
      {showActualsForm && hasCalculation && voyage.calculations && (
        <VoyageActualsForm
          voyageId={voyage.id}
          estimates={{
            ballastSeaDays: voyage.calculations.ballastSeaDays,
            ladenSeaDays: voyage.calculations.ladenSeaDays,
            totalSeaDays: voyage.calculations.totalSeaDays,
            totalPortDays: voyage.calculations.totalPortDays,
            totalVoyageDays: voyage.calculations.totalVoyageDays,
            totalBunkerMt: voyage.calculations.totalBunkerMt,
            totalBunkerCost: voyage.calculations.totalBunkerCost,
            totalVoyageCost: voyage.calculations.totalVoyageCost,
            grossRevenue: voyage.calculations.grossRevenue,
            voyagePnl: voyage.calculations.voyagePnl,
            tce: voyage.calculations.tce,
          }}
          existingActuals={voyage.actuals ? {
            ballastSeaDays: voyage.actuals.ballastSeaDays,
            ladenSeaDays: voyage.actuals.ladenSeaDays,
            totalSeaDays: voyage.actuals.totalSeaDays,
            totalPortDays: voyage.actuals.totalPortDays,
            totalVoyageDays: voyage.actuals.totalVoyageDays,
            totalBunkerMt: voyage.actuals.totalBunkerMt,
            totalBunkerCost: voyage.actuals.totalBunkerCost,
            totalVoyageCost: voyage.actuals.totalVoyageCost,
            grossRevenue: voyage.actuals.grossRevenue,
            voyagePnl: voyage.actuals.voyagePnl,
            tce: voyage.actuals.tce,
            notes: voyage.actuals.notes,
          } : null}
        />
      )}

      {/* Estimate vs Actual Comparison */}
      {hasActuals && hasCalculation && voyage.calculations && voyage.actuals && (
        <EstimateVsActualCard
          calculation={{
            ballastSeaDays: voyage.calculations.ballastSeaDays,
            ladenSeaDays: voyage.calculations.ladenSeaDays,
            totalSeaDays: voyage.calculations.totalSeaDays,
            totalPortDays: voyage.calculations.totalPortDays,
            totalVoyageDays: voyage.calculations.totalVoyageDays,
            totalBunkerMt: voyage.calculations.totalBunkerMt,
            totalBunkerCost: voyage.calculations.totalBunkerCost,
            totalVoyageCost: voyage.calculations.totalVoyageCost,
            grossRevenue: voyage.calculations.grossRevenue,
            voyagePnl: voyage.calculations.voyagePnl,
            tce: voyage.calculations.tce,
          }}
          actuals={{
            ballastSeaDays: voyage.actuals.ballastSeaDays,
            ladenSeaDays: voyage.actuals.ladenSeaDays,
            totalSeaDays: voyage.actuals.totalSeaDays,
            totalPortDays: voyage.actuals.totalPortDays,
            totalVoyageDays: voyage.actuals.totalVoyageDays,
            totalBunkerMt: voyage.actuals.totalBunkerMt,
            totalBunkerCost: voyage.actuals.totalBunkerCost,
            totalVoyageCost: voyage.actuals.totalVoyageCost,
            grossRevenue: voyage.actuals.grossRevenue,
            voyagePnl: voyage.actuals.voyagePnl,
            tce: voyage.actuals.tce,
          }}
        />
      )}

      {/* Audit Trail */}
      <div data-pdf-hide="true">
        <AuditHistory entityType="voyage" entityId={voyage.id} />
      </div>
    </div>
  );
}

function OverviewItem({
  icon,
  label,
  value,
  subtext,
  subtextColor,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  subtextColor?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="font-medium">{value}</p>
      {subtext && <p className={`text-xs ${subtextColor || "text-muted-foreground"}`}>{subtext}</p>}
    </div>
  );
}
