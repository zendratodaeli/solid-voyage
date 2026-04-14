import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Anchor,
  Pencil,
  Ship,
  Gauge,
  Fuel,
  DollarSign,
  Calendar,
  Shield,
  Ruler,
  FileDown,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import { VESSEL_TYPE_LABELS, COMMERCIAL_CONTROL_LABELS, FUEL_TYPE_LABELS } from "@/types";
import { AuditHistory } from "@/components/shared/AuditHistory";
import { VesselReportButton } from "./edit/VesselReportButton";
import { buildOwnerFilter, type AuthUser } from "@/lib/permissions";
import type { VesselType, CommercialControl, FuelType } from "@prisma/client";

// ─── Vessel type category helpers ────────────────────────────────
const BULK_TYPES = ["CAPESIZE","PANAMAX","POST_PANAMAX","SUPRAMAX","HANDYMAX","HANDYSIZE","BULK_CARRIER","GENERAL_CARGO","MULTI_PURPOSE","HEAVY_LIFT"];
const TANKER_TYPES = ["VLCC","SUEZMAX","AFRAMAX","MR_TANKER","LR1_TANKER","LR2_TANKER","CHEMICAL_TANKER","PRODUCT_TANKER"];
const CONTAINER_TYPES = ["CONTAINER_FEEDER","CONTAINER_PANAMAX","CONTAINER_POST_PANAMAX","CONTAINER_ULCV"];
const GAS_TYPES = ["LNG_CARRIER","LPG_CARRIER"];

function getVesselCategory(type: string) {
  if (BULK_TYPES.includes(type)) return "bulk";
  if (TANKER_TYPES.includes(type)) return "tanker";
  if (CONTAINER_TYPES.includes(type)) return "container";
  if (GAS_TYPES.includes(type)) return "gas";
  return "other";
}

export default async function VesselDetailPage({
  params,
}: {
  params: Promise<{ id: string; orgSlug: string }>;
}) {
  const { id, orgSlug } = await params;
  const user = await requireUser() as AuthUser;

  const vessel = await prisma.vessel.findFirst({
    where: { id, ...buildOwnerFilter(user) },
    include: {
      voyages: {
        take: 10,
        orderBy: { updatedAt: "desc" },
        include: { calculations: true },
      },
    },
  });

  if (!vessel) {
    notFound();
  }

  const category = getVesselCategory(vessel.vesselType);
  const vesselTypeLabel = VESSEL_TYPE_LABELS[vessel.vesselType as VesselType] || vessel.vesselType;
  const charterLabel = COMMERCIAL_CONTROL_LABELS[vessel.commercialControl as CommercialControl] || vessel.commercialControl;

  const fmtCurrency = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const fmtFloat = (v: number | null | undefined, unit = "") => v != null ? `${v.toLocaleString("en-US")}${unit}` : "—";

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/${orgSlug}/vessels`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{vessel.name}</h1>
              <Badge variant="secondary">{vesselTypeLabel}</Badge>
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <Anchor className="h-4 w-4" />
              {charterLabel}
              {vessel.imoNumber && <span className="text-xs">• IMO {vessel.imoNumber}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <VesselReportButton vesselId={id} />
          <Link href={`/${orgSlug}/vessels/${id}/edit`}>
            <Button className="gap-2">
              <Pencil className="h-4 w-4" />
              Edit Vessel
            </Button>
          </Link>
        </div>
      </div>

      {/* ═══ Key Specifications ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5" />
            Key Specifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <SpecItem label="DWT" value={`${formatNumber(vessel.dwt)} MT`} />
            <SpecItem label="LOA" value={fmtFloat(vessel.loa, " m")} />
            <SpecItem label="Beam" value={fmtFloat(vessel.beam, " m")} />
            <SpecItem label="Summer Draft" value={fmtFloat(vessel.summerDraft, " m")} />
            <SpecItem label="Gross Tonnage" value={fmtFloat(vessel.grossTonnage)} />
            <SpecItem label="Net Tonnage" value={fmtFloat(vessel.netTonnage)} />
            <SpecItem label="Year Built" value={vessel.yearBuilt?.toString() ?? "—"} />
            <SpecItem label="Flag State" value={vessel.flagState ?? "—"} />
            {vessel.classificationSociety && (
              <SpecItem label="Classification" value={vessel.classificationSociety} />
            )}
            {vessel.iceClass && <SpecItem label="Ice Class" value={vessel.iceClass} />}
            {vessel.vesselConstant != null && (
              <SpecItem label="Vessel Constant" value={`${formatNumber(vessel.vesselConstant)} MT`} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ Speed & Consumption ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Speed & Consumption
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Speed Profiles */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Speed Profiles</h4>
              <div className="grid grid-cols-2 gap-4">
                <SpecItem label="Laden Speed" value={`${vessel.ladenSpeed} kn`} />
                <SpecItem label="Ballast Speed" value={`${vessel.ballastSpeed} kn`} />
                {vessel.ecoLadenSpeed != null && (
                  <SpecItem label="Eco Laden" value={`${vessel.ecoLadenSpeed} kn`} highlight />
                )}
                {vessel.ecoBallastSpeed != null && (
                  <SpecItem label="Eco Ballast" value={`${vessel.ecoBallastSpeed} kn`} highlight />
                )}
              </div>
            </div>

            {/* Consumption Profiles */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Consumption</h4>
              <div className="grid grid-cols-2 gap-4">
                <SpecItem label="Laden" value={fmtFloat(vessel.ladenConsumption, " MT/day")} />
                <SpecItem label="Ballast" value={fmtFloat(vessel.ballastConsumption, " MT/day")} />
                {vessel.ecoLadenConsumption != null && (
                  <SpecItem label="Eco Laden" value={`${vessel.ecoLadenConsumption} MT/day`} highlight />
                )}
                {vessel.ecoBallastConsumption != null && (
                  <SpecItem label="Eco Ballast" value={`${vessel.ecoBallastConsumption} MT/day`} highlight />
                )}
                {vessel.portConsumptionWithCrane != null && (
                  <SpecItem label="Port (Crane)" value={`${vessel.portConsumptionWithCrane} MT/day`} />
                )}
                {vessel.portConsumptionWithoutCrane != null && (
                  <SpecItem label="Port (No Crane)" value={`${vessel.portConsumptionWithoutCrane} MT/day`} />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Fuel & Equipment ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5" />
            Fuel & Equipment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <SpecItem
              label="Laden Fuel"
              value={FUEL_TYPE_LABELS[vessel.ladenFuelType as FuelType] || vessel.ladenFuelType}
            />
            <SpecItem
              label="Ballast Fuel"
              value={FUEL_TYPE_LABELS[vessel.ballastFuelType as FuelType] || vessel.ballastFuelType}
            />
            <SpecItem
              label="Port Fuel"
              value={FUEL_TYPE_LABELS[vessel.portFuelType as FuelType] || vessel.portFuelType}
            />
            <SpecItem
              label="Scrubber"
              value={vessel.hasScrubber ? "Yes — EGCS Fitted" : "No"}
              highlight={vessel.hasScrubber}
            />
          </div>
        </CardContent>
      </Card>

      {/* ═══ Commercial ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Commercial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <SpecItem label="Charter Type" value={charterLabel} />
            {vessel.commercialControl === "OWNED_BAREBOAT" && vessel.dailyOpex != null && (
              <SpecItem label="Daily OPEX" value={fmtCurrency(vessel.dailyOpex) + "/day"} />
            )}
            {vessel.commercialControl === "TIME_CHARTER" && (
              <>
                {vessel.dailyTcHireRate != null && (
                  <SpecItem label="Daily TC Hire" value={fmtCurrency(vessel.dailyTcHireRate) + "/day"} />
                )}
                {vessel.dailyOpex != null && (
                  <SpecItem label="Daily OPEX" value={fmtCurrency(vessel.dailyOpex) + "/day"} />
                )}
                {vessel.tcHireStartDate && (
                  <SpecItem
                    label="Hire Period"
                    value={`${new Date(vessel.tcHireStartDate).toLocaleDateString()} — ${vessel.tcHireEndDate ? new Date(vessel.tcHireEndDate).toLocaleDateString() : "Open"}`}
                  />
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ Type-Specific Specifications ═══ */}
      {category === "bulk" && (vessel.grainCapacity || vessel.baleCapacity || vessel.numberOfHolds || vessel.craneCount) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Bulk / Cargo Specifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {vessel.grainCapacity != null && <SpecItem label="Grain Capacity" value={`${formatNumber(vessel.grainCapacity)} cbm`} />}
              {vessel.baleCapacity != null && <SpecItem label="Bale Capacity" value={`${formatNumber(vessel.baleCapacity)} cbm`} />}
              {vessel.numberOfHolds != null && <SpecItem label="Cargo Holds" value={vessel.numberOfHolds.toString()} />}
              {vessel.numberOfHatches != null && <SpecItem label="Hatches" value={vessel.numberOfHatches.toString()} />}
              {vessel.craneCount != null && (
                <SpecItem label="Cranes" value={`${vessel.craneCount}x ${vessel.craneSWL ? vessel.craneSWL + " MT SWL" : ""}`} />
              )}
              {vessel.grabFitted != null && <SpecItem label="Grab Fitted" value={vessel.grabFitted ? "Yes" : "No"} />}
              {vessel.hasTweenDecks != null && <SpecItem label="Tween Decks" value={vessel.hasTweenDecks ? "Yes" : "No"} />}
            </div>
          </CardContent>
        </Card>
      )}

      {category === "tanker" && (vessel.tankCapacity || vessel.numberOfTanks) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Tanker Specifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {vessel.tankCapacity != null && <SpecItem label="Tank Capacity" value={`${formatNumber(vessel.tankCapacity)} cbm`} />}
              {vessel.numberOfTanks != null && <SpecItem label="Cargo Tanks" value={vessel.numberOfTanks.toString()} />}
              {vessel.coatedTanks != null && <SpecItem label="Coated Tanks" value={vessel.coatedTanks ? "Yes" : "No"} />}
              {vessel.heatingCoils != null && <SpecItem label="Heating Coils" value={vessel.heatingCoils ? "Yes" : "No"} />}
              {vessel.pumpingRate != null && <SpecItem label="Pumping Rate" value={`${formatNumber(vessel.pumpingRate)} cbm/hr`} />}
              {vessel.hasIGS != null && <SpecItem label="IGS" value={vessel.hasIGS ? "Yes" : "No"} />}
              {vessel.hasCOW != null && <SpecItem label="COW" value={vessel.hasCOW ? "Yes" : "No"} />}
              {vessel.hasSBT != null && <SpecItem label="SBT" value={vessel.hasSBT ? "Yes" : "No"} />}
            </div>
          </CardContent>
        </Card>
      )}

      {category === "container" && vessel.teuCapacity && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Container Specifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {vessel.teuCapacity != null && <SpecItem label="TEU Capacity" value={formatNumber(vessel.teuCapacity)} />}
              {vessel.feuCapacity != null && <SpecItem label="FEU Capacity" value={formatNumber(vessel.feuCapacity)} />}
              {vessel.reeferPlugs != null && <SpecItem label="Reefer Plugs" value={vessel.reeferPlugs.toString()} />}
            </div>
          </CardContent>
        </Card>
      )}

      {category === "gas" && (vessel.cargoTankCapacityCbm || vessel.containmentType) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Gas Carrier Specifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {vessel.cargoTankCapacityCbm != null && <SpecItem label="Tank Capacity" value={`${formatNumber(vessel.cargoTankCapacityCbm)} cbm`} />}
              {vessel.containmentType && <SpecItem label="Containment" value={vessel.containmentType} />}
              {vessel.boilOffRate != null && <SpecItem label="Boil-Off Rate" value={`${vessel.boilOffRate}%/day`} />}
              {vessel.dualFuelEngine && <SpecItem label="Engine Type" value={vessel.dualFuelEngine} />}
              {vessel.heelQuantity != null && <SpecItem label="Heel Quantity" value={`${formatNumber(vessel.heelQuantity)} cbm`} />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Linked Voyages ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Recent Voyages
            <Badge variant="secondary" className="ml-auto">
              {vessel.voyages.length} voyage{vessel.voyages.length !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vessel.voyages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Ship className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No voyages yet for this vessel.</p>
              <Link href={`/${orgSlug}/voyages/new?vesselId=${vessel.id}`} className="mt-3">
                <Button variant="outline" size="sm" className="gap-2">
                  <Ship className="h-4 w-4" />
                  Create First Voyage
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {vessel.voyages.map((voyage) => {
                const tce = voyage.calculations?.tce;
                const pnl = voyage.calculations?.voyagePnl;
                return (
                  <Link
                    key={voyage.id}
                    href={`/${orgSlug}/voyages/${voyage.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <p className="font-medium text-sm group-hover:text-primary transition-colors">
                          {voyage.loadPort} → {voyage.dischargePort}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(voyage.updatedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {tce != null && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">TCE</p>
                          <p className={`text-sm font-mono font-medium ${tce >= 0 ? "text-green-400" : "text-red-400"}`}>
                            ${formatNumber(tce)}/day
                          </p>
                        </div>
                      )}
                      {pnl != null && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">P&L</p>
                          <p className={`text-sm font-mono font-medium ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            ${formatNumber(pnl)}
                          </p>
                        </div>
                      )}
                      <Badge
                        variant="secondary"
                        className={
                          voyage.status === "NEW" ? "bg-blue-500/20 text-blue-400" :
                          voyage.status === "OFFERED" ? "bg-purple-500/20 text-purple-400" :
                          voyage.status === "FIXED" ? "bg-emerald-500/20 text-emerald-400" :
                          voyage.status === "COMPLETED" ? "bg-teal-500/20 text-teal-400" :
                          voyage.status === "REJECTED" || voyage.status === "LOST" ? "bg-red-500/20 text-red-400" :
                          voyage.status === "EXPIRED" || voyage.status === "WITHDRAWN" ? "bg-gray-500/20 text-gray-400" :
                          ""
                        }
                      >
                        {voyage.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
              {vessel.voyages.length >= 10 && (
                <div className="text-center pt-2">
                  <Link href={`/${orgSlug}/voyages?vesselId=${vessel.id}`}>
                    <Button variant="ghost" size="sm" className="text-primary">
                      View All Voyages →
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Audit & Timestamps ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
            <SpecItem label="Created" value={formatRelativeTime(vessel.createdAt)} />
            <SpecItem label="Last Updated" value={formatRelativeTime(vessel.updatedAt)} />
            {vessel.createdByName && <SpecItem label="Created By" value={vessel.createdByName} />}
            {vessel.updatedByName && <SpecItem label="Updated By" value={vessel.updatedByName} />}
          </div>
          <AuditHistory entityType="vessel" entityId={vessel.id} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Read-only spec display item ─────────────────────────────────
function SpecItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium text-sm ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
