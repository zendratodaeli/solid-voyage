"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Fuel, 
  DollarSign, 
  TrendingUp,
  Anchor,
  Ship,
  MapPin,
  AlertTriangle,
  Flame,
  Leaf,
  ShieldCheck
} from "lucide-react";
import { formatNumber, getPnlColor } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import type { VoyageCalculation, FreightRateUnit } from "@prisma/client";
import { FREIGHT_RATE_UNIT_LABELS } from "@/types";
import { CiiRatingBadge } from "@/components/route-planner/CiiRatingBadge";
import type { CiiRating } from "@/lib/calculations/cii-calculator";

interface VoyageCalculationCardProps {
  calculation: VoyageCalculation;
  freightRateUsd?: number | null;
  freightRateUnit?: FreightRateUnit;
  dailyOpex?: number;
  pdaCosts?: number;
  lubOilCosts?: number;
  // Cargo intake analysis
  vesselDwt?: number;
  vesselConstant?: number;
  cargoQuantityMt?: number;
  stowageFactor?: number;
  grainCapacity?: number;
  baleCapacity?: number;
  // LNG boil-off
  boilOffRate?: number;
  cargoTankCapacityCbm?: number;
}

export function VoyageCalculationCard({ 
  calculation, freightRateUsd, freightRateUnit = "PER_MT",
  dailyOpex = 0, pdaCosts = 0, lubOilCosts = 0,
  vesselDwt, vesselConstant, cargoQuantityMt,
  stowageFactor, grainCapacity, baleCapacity,
  boilOffRate, cargoTankCapacityCbm,
}: VoyageCalculationCardProps) {
  const isBreakEvenMode = freightRateUsd === null || freightRateUsd === undefined;
  const isProfitable = (calculation.voyagePnl ?? 0) > 0;
  const tcePositive = calculation.tce > 0;
  const { formatMoney, formatTce, formatFreight } = useCurrency();

  // ─── Cargo Intake Analysis ─────────────────────────────────────
  const cargoIntakeWarnings: string[] = [];
  let actualCargoIntake: number | null = null;
  let utilizationPercent: number | null = null;

  if (vesselDwt && vesselDwt > 0 && cargoQuantityMt) {
    const constant = vesselConstant ?? 0;
    actualCargoIntake = Math.max(0, vesselDwt - constant - calculation.totalBunkerMt);
    utilizationPercent = Math.min(100, (cargoQuantityMt / actualCargoIntake) * 100);

    if (cargoQuantityMt > actualCargoIntake) {
      cargoIntakeWarnings.push(
        `Cargo ${formatNumber(cargoQuantityMt)} MT exceeds available intake of ${formatNumber(Math.round(actualCargoIntake))} MT (DWT ${formatNumber(vesselDwt)} − constant ${constant} − bunkers ${formatNumber(Math.round(calculation.totalBunkerMt))})`
      );
    }

    if (stowageFactor && stowageFactor > 0) {
      const cargoVolume = cargoQuantityMt * stowageFactor;
      const volumeCapacity = grainCapacity || baleCapacity;
      if (volumeCapacity && cargoVolume > volumeCapacity) {
        const maxWeight = Math.floor(volumeCapacity / stowageFactor);
        cargoIntakeWarnings.push(
          `Volume-limited: ${formatNumber(Math.round(cargoVolume))} cbm exceeds ${formatNumber(volumeCapacity)} cbm capacity. Max cargo at SF ${stowageFactor}: ${formatNumber(maxWeight)} MT`
        );
      }
    }
  }

  // LNG boil-off info
  const hasBoilOff = boilOffRate && boilOffRate > 0 && cargoTankCapacityCbm && cargoTankCapacityCbm > 0;
  const boilOffAsFuelMt = hasBoilOff
    ? cargoTankCapacityCbm * (boilOffRate / 100) * 0.45 * calculation.ladenSeaDays
    : 0;

  // Freight unit label for break-even subtext
  const breakEvenUnit = freightRateUnit === "PER_TEU" ? "USD/TEU"
    : freightRateUnit === "PER_CBM" ? "USD/CBM"
    : freightRateUnit === "LUMP_SUM" ? "USD (total)"
    : freightRateUnit === "WORLDSCALE" ? "WS"
    : "USD/MT";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Duration Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-blue-400" />
            Duration Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DurationItem
              icon={<Ship className="h-4 w-4" />}
              label="Ballast Sea Days"
              value={`${calculation.ballastSeaDays.toFixed(1)} days`}
            />
            <DurationItem
              icon={<Ship className="h-4 w-4" />}
              label="Laden Sea Days"
              value={`${calculation.ladenSeaDays.toFixed(1)} days`}
            />
            <DurationItem
              icon={<Anchor className="h-4 w-4" />}
              label="Total Port Days"
              value={`${calculation.totalPortDays.toFixed(1)} days`}
            />
            <DurationItem
              icon={<Clock className="h-4 w-4" />}
              label="Total Voyage"
              value={`${calculation.totalVoyageDays.toFixed(1)} days`}
              highlight
            />
          </div>

          {/* Duration Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Sea Time</span>
              <span>Port Time</span>
            </div>
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-blue-500"
                style={{ 
                  width: `${(calculation.totalSeaDays / calculation.totalVoyageDays) * 100}%` 
                }}
              />
              <div
                className="h-full bg-amber-500"
                style={{ 
                  width: `${(calculation.totalPortDays / calculation.totalVoyageDays) * 100}%` 
                }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-blue-400">{calculation.totalSeaDays.toFixed(1)} days</span>
              <span className="text-amber-400">{calculation.totalPortDays.toFixed(1)} days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bunker Consumption */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Fuel className="h-5 w-5 text-orange-400" />
            Bunker Consumption
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <BunkerItem
              label="Ballast"
              value={`${formatNumber(calculation.ballastBunkerMt)} MT`}
            />
            <BunkerItem
              label="Laden"
              value={`${formatNumber(calculation.ladenBunkerMt)} MT`}
            />
            <BunkerItem
              label="Port"
              value={`${formatNumber(calculation.portBunkerMt)} MT`}
            />
            <BunkerItem
              label="Total"
              value={`${formatNumber(calculation.totalBunkerMt)} MT`}
              highlight
            />
          </div>

          {/* LNG Boil-Off as Fuel */}
          {hasBoilOff && boilOffAsFuelMt > 0 && (
            <div className="pt-2 border-t border-cyan-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Flame className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-cyan-400">LNG Boil-Off as Fuel</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">BOG burned during laden leg</span>
                <span className="text-sm font-medium text-cyan-400">
                  ~{formatNumber(Math.round(boilOffAsFuelMt * 100) / 100)} MT saved
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                BOR {boilOffRate}%/day × {formatNumber(cargoTankCapacityCbm!)} cbm × {calculation.ladenSeaDays.toFixed(1)} days
              </p>
            </div>
          )}

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Bunker Cost</span>
              <span className="text-lg font-bold text-orange-400">
                {formatMoney(calculation.totalBunkerCost)}
              </span>
            </div>
            {lubOilCosts > 0 && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-muted-foreground">Lubricating Oil & CLO</span>
                <span className="text-sm font-medium text-amber-400">
                  {formatMoney(lubOilCosts)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-red-400" />
            Cost Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <CostItem 
              label="Bunker Cost" 
              value={calculation.totalBunkerCost}
              total={calculation.totalVoyageCost}
              color="bg-orange-500"
            />
            <CostItem 
              label="OPEX Cost" 
              value={calculation.opexCost}
              total={calculation.totalVoyageCost}
              color="bg-blue-500"
            />
            <CostItem 
              label="Canal Tolls" 
              value={calculation.canalCost}
              total={calculation.totalVoyageCost}
              color="bg-purple-500"
            />
            <CostItem 
              label="Brokerage" 
              value={calculation.brokerageCost}
              total={calculation.totalVoyageCost}
              color="bg-pink-500"
            />
            <CostItem 
              label="Commission" 
              value={calculation.commissionCost}
              total={calculation.totalVoyageCost}
              color="bg-cyan-500"
            />
            {calculation.additionalCost > 0 && (
              <CostItem 
                label="Additional" 
                value={calculation.additionalCost}
                total={calculation.totalVoyageCost}
                color="bg-gray-500"
              />
            )}
            {pdaCosts > 0 && (
              <CostItem 
                label="PDA" 
                value={pdaCosts}
                total={calculation.totalVoyageCost}
                color="bg-teal-500"
              />
            )}
            {(calculation.euEtsCost ?? 0) > 0 && (
              <CostItem 
                label="EU ETS Carbon Tax" 
                value={calculation.euEtsCost ?? 0}
                total={calculation.totalVoyageCost + (calculation.euEtsCost ?? 0)}
                color="bg-green-500"
              />
            )}
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Voyage Cost</span>
              <span className="text-lg font-bold text-red-400">
                {formatMoney(calculation.totalVoyageCost)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profitability Metrics */}
      <Card className={isBreakEvenMode ? "border-amber-500/30 bg-amber-500/5" : isProfitable ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className={`h-5 w-5 ${isBreakEvenMode ? "text-amber-400" : isProfitable ? "text-green-400" : "text-red-400"}`} />
            Profitability
            {isBreakEvenMode && (
              <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-400 border-amber-500/30">
                Break-Even Mode
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <MetricItem
              label={isBreakEvenMode ? "Suggested Floor Rate" : "Break-Even Freight"}
              value={formatFreight(calculation.breakEvenFreight)}
              subtext={breakEvenUnit}
              highlight={isBreakEvenMode}
              positive={isBreakEvenMode}
            />
            <MetricItem
              label="TCE"
              value={formatTce(isBreakEvenMode ? dailyOpex : calculation.tce)}
              subtext={isBreakEvenMode ? "(= Daily OPEX)" : "USD/day"}
              highlight
              positive={isBreakEvenMode ? true : tcePositive}
            />
            {/* TC-In Hire: Show Gross vs Net TCE */}
            {(calculation.tcHireCost ?? 0) > 0 && (
              <>
                <MetricItem
                  label="Gross TCE (before hire)"
                  value={formatTce(calculation.grossTce ?? calculation.tce)}
                  subtext="USD/day"
                  positive={(calculation.grossTce ?? calculation.tce) > 0}
                />
                <MetricItem
                  label="Net TCE (after hire)"
                  value={formatTce(calculation.netTce ?? 0)}
                  subtext={`Hire: ${formatMoney(calculation.tcHireCost ?? 0)}`}
                  highlight
                  positive={(calculation.netTce ?? 0) > 0}
                />
              </>
            )}
            {calculation.grossRevenue && (
              <MetricItem
                label="Gross Revenue"
                value={formatMoney(calculation.grossRevenue)}
              />
            )}
            {calculation.voyagePnl !== null && (
              <MetricItem
                label="Voyage P&L"
                value={formatMoney(calculation.voyagePnl)}
                highlight
                positive={calculation.voyagePnl > 0}
              />
            )}
          </div>

          {isBreakEvenMode ? (
            <div className="pt-3 border-t">
              <Badge 
                variant="outline" 
                className="w-full justify-center py-2 text-base bg-amber-500/10 text-amber-400 border-amber-500/30"
              >
                NO FREIGHT RATE ENTERED — SHOWING BREAK-EVEN ANALYSIS
              </Badge>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Enter a freight rate to see actual profit/loss calculation
              </p>
            </div>
          ) : calculation.voyagePnl !== null && (
            <div className="pt-3 border-t">
              <Badge 
                variant="outline" 
                className={`w-full justify-center py-2 text-base ${
                  calculation.voyagePnl > 0 
                    ? "bg-green-500/10 text-green-400 border-green-500/30" 
                    : "bg-red-500/10 text-red-400 border-red-500/30"
                }`}
              >
                {calculation.voyagePnl > 0 ? "PROFITABLE" : "LOSS-MAKING"} VOYAGE
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cargo Intake Analysis Warnings */}
      {cargoIntakeWarnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Cargo Intake Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cargoIntakeWarnings.map((warning, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-amber-300">{warning}</span>
                </div>
              ))}
            </div>
            {actualCargoIntake !== null && utilizationPercent !== null && (
              <div className="mt-4 pt-3 border-t border-amber-500/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Available Cargo Intake</span>
                  <span className="font-medium">{formatNumber(Math.round(actualCargoIntake))} MT</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Utilization</span>
                  <span className={`font-medium ${utilizationPercent > 100 ? 'text-red-400' : utilizationPercent > 95 ? 'text-amber-400' : 'text-green-400'}`}>
                    {utilizationPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Environmental Impact — EU ETS + CII */}
      {((calculation.totalCO2Mt ?? 0) > 0 || calculation.ciiRating) && (
        <Card className="border-green-500/20 bg-green-500/5 md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Leaf className="h-5 w-5 text-green-400" />
              Environmental Impact
              {calculation.ciiRating && (
                <CiiRatingBadge 
                  rating={calculation.ciiRating as CiiRating}
                  attainedCII={calculation.ciiAttained ?? undefined}
                  requiredCII={calculation.ciiRequired ?? undefined}
                  size="md"
                />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total CO₂ Emissions</p>
                <p className="text-lg font-bold text-green-400">
                  {formatNumber(Math.round(calculation.totalCO2Mt ?? 0))} MT
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">EU ETS Status</p>
                <p className="text-sm font-medium">
                  {(calculation.euEtsPercentage ?? 0) > 0 
                    ? <span className="text-green-400">🇪🇺 {calculation.euEtsPercentage}% Taxable</span>
                    : <span className="text-muted-foreground">Not Applicable</span>
                  }
                </p>
              </div>
              {(calculation.euEtsCost ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Carbon Tax Cost</p>
                  <p className="text-lg font-bold text-amber-400">
                    {formatMoney(calculation.euEtsCost ?? 0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">EUA @ €75/tCO₂</p>
                </div>
              )}
              {calculation.ciiRating && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">CII Rating</p>
                  <div className="flex items-center gap-2">
                    <CiiRatingBadge 
                      rating={calculation.ciiRating as CiiRating}
                      attainedCII={calculation.ciiAttained ?? undefined}
                      requiredCII={calculation.ciiRequired ?? undefined}
                      size="md"
                    />
                    <div>
                      <p className="text-xs font-medium">
                        {calculation.ciiAttained?.toFixed(2)} gCO₂/(dwt·nm)
                      </p>
                      {calculation.ciiRequired && (
                        <p className="text-[10px] text-muted-foreground">
                          Required: {calculation.ciiRequired.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {calculation.ciiRating && (calculation.ciiRating === "D" || calculation.ciiRating === "E") && (
              <div className="mt-3 p-2 rounded-md bg-red-500/10 border border-red-500/30 text-sm text-red-400 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>IMO requires corrective action plan for vessels rated D or E. Consider speed reduction or fuel optimization.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DurationItem({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`text-sm font-medium ${highlight ? "text-blue-400" : ""}`}>{value}</p>
    </div>
  );
}

function BunkerItem({
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
      <p className={`text-sm font-medium ${highlight ? "text-orange-400" : ""}`}>{value}</p>
    </div>
  );
}

function CostItem({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const { formatMoney } = useCurrency();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{formatMoney(value)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function MetricItem({
  label,
  value,
  subtext,
  highlight = false,
  positive,
}: {
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  const colorClass = highlight 
    ? positive 
      ? "text-green-400" 
      : "text-red-400"
    : "";

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
      {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}
