"use client";

import { useState, useCallback, useMemo } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Zap,
  Loader2,
  Crown,
  Medal,
  Award,
  TrendingUp,
  Gauge,
  Fuel,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Check,
  Info,
  CloudRain,
  Waves,
  AlertTriangle,
  Ship,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RouteWeatherSummary, WeatherSeverity } from "@/types/weather";
import { calculateWeatherRisk, type WeatherRiskAssessment } from "@/lib/calculations/weather-risk";
import { estimateCiiFromConfig, RATING_CONFIG, type CiiRating } from "@/lib/calculations/cii-calculator";
import { CiiRatingBadge } from "./CiiRatingBadge";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface OptimizerResult {
  rank: number;
  speed: number;
  mode: "normal" | "eco";
  seaDays: number;
  totalVoyageDays: number;
  bunkerMt: number;
  bunkerCost: number;
  totalVoyageCost: number;
  tce: number;
  voyagePnl: number | null;
  breakEvenFreight: number;
  savingsVsBaseline: number;
  // CII fields
  ciiRating?: CiiRating;
  ciiScore?: number;
  ciiRequired?: number;
}

interface OptimizerMetadata {
  totalCombinations: number;
  timeTakenMs: number;
  optimizeFor: string;
  baselineTce: number;
  baselineCost: number;
}

interface VesselProfile {
  ladenSpeed: number;
  ballastSpeed: number;
  ladenConsumption: number;
  ballastConsumption: number;
  portConsumption: number;
  dailyOpex: number;
  ecoLadenSpeed?: number;
  ecoBallastSpeed?: number;
  ecoLadenConsumption?: number;
  ecoBallastConsumption?: number;
}

interface VoyageOptimizerPanelProps {
  vesselProfile: VesselProfile | null;
  ballastDistanceNm: number;
  ladenDistanceNm: number;
  onApplyConfig?: (speed: number, mode: "normal" | "eco") => void;
  /** Callback to create a voyage with the selected optimized config */
  onCreateVoyageWithConfig?: (config: {
    speed: number;
    mode: "normal" | "eco";
    bunkerCost: number;
    tce: number;
    voyagePnl: number | null;
    seaDays: number;
    totalVoyageDays: number;
    ciiRating?: string;
  }) => void;
  /** Weather data from useWeather hook (Phase 2) */
  weatherData?: RouteWeatherSummary | null;
  /** Vessel DWT for CII calculation (Phase 3) */
  vesselDwt?: number;
  /** Vessel type from DB (Phase 3) */
  vesselType?: string;
  voyageInputs?: {
    loadPortDays: number;
    dischargePortDays: number;
    waitingDays: number;
    idleDays: number;
    canalTolls: number;
    bunkerPriceUsd: number;
    brokeragePercent: number;
    commissionPercent: number;
    additionalCosts: number;
    pdaCosts: number;
    lubOilCosts: number;
    weatherRiskMultiplier: number;
    fuelPrices?: Record<string, number>;
    ballastFuelType?: string;
    ladenFuelType?: string;
    portFuelType?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════
// SEVERITY CONFIG for weather badge
// ═══════════════════════════════════════════════════════════════════

const SEVERITY_BADGE: Record<WeatherSeverity, {
  icon: typeof CloudRain;
  label: string;
  color: string;
  bgColor: string;
}> = {
  calm:     { icon: Waves,     label: "Calm Seas",     color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/20" },
  moderate: { icon: Waves,     label: "Moderate Seas",  color: "text-amber-400",   bgColor: "bg-amber-500/10 border-amber-500/20" },
  rough:    { icon: CloudRain, label: "Rough Seas",     color: "text-orange-400",  bgColor: "bg-orange-500/10 border-orange-500/20" },
  severe:   { icon: AlertTriangle, label: "Severe Weather", color: "text-red-400", bgColor: "bg-red-500/10 border-red-500/20" },
};

const RANK_ICONS = [
  <Crown key="1" className="h-4 w-4 text-amber-400" />,
  <Medal key="2" className="h-4 w-4 text-slate-300" />,
  <Award key="3" className="h-4 w-4 text-amber-600" />,
];

// formatUsd removed — now using useCurrency() hook inside the component

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function VoyageOptimizerPanel({
  vesselProfile,
  ballastDistanceNm,
  ladenDistanceNm,
  onApplyConfig,
  onCreateVoyageWithConfig,
  weatherData,
  vesselDwt = 0,
  vesselType = "Bulk Carrier",
  voyageInputs,
}: VoyageOptimizerPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [results, setResults] = useState<OptimizerResult[]>([]);
  const [metadata, setMetadata] = useState<OptimizerMetadata | null>(null);
  const [appliedRank, setAppliedRank] = useState<number | null>(null);
  const { formatMoney } = useCurrency();
  // Local alias for backward compat with template references
  const formatUsd = (val: number) => formatMoney(val, 0);

  // Form state
  const [optimizeFor, setOptimizeFor] = useState<string>("maxTCE");
  const [freightRate, setFreightRate] = useState("");
  const [cargoQuantity, setCargoQuantity] = useState("");
  const [includeEco, setIncludeEco] = useState(true);

  // Phase 2: compute weather risk from real data
  const weatherRisk: WeatherRiskAssessment = useMemo(
    () => calculateWeatherRisk(weatherData),
    [weatherData]
  );

  const canOptimize =
    vesselProfile &&
    (ballastDistanceNm > 0 || ladenDistanceNm > 0) &&
    parseFloat(cargoQuantity) > 0;

  const handleOptimize = useCallback(async () => {
    if (!canOptimize || !vesselProfile) return;

    setIsOptimizing(true);
    setResults([]);
    setMetadata(null);
    setAppliedRank(null);

    try {
      const res = await fetch("/api/voyage-optimizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel: vesselProfile,
          voyageInputs: {
            ballastDistanceNm,
            ladenDistanceNm,
            loadPortDays: voyageInputs?.loadPortDays ?? 2,
            dischargePortDays: voyageInputs?.dischargePortDays ?? 2,
            waitingDays: voyageInputs?.waitingDays ?? 0,
            idleDays: voyageInputs?.idleDays ?? 0,
            cargoQuantityMt: parseFloat(cargoQuantity),
            useEcoSpeed: false,
            canalTolls: voyageInputs?.canalTolls ?? 0,
            bunkerPriceUsd: voyageInputs?.bunkerPriceUsd ?? 500,
            brokeragePercent: voyageInputs?.brokeragePercent ?? 1.25,
            commissionPercent: voyageInputs?.commissionPercent ?? 3.75,
            additionalCosts: voyageInputs?.additionalCosts ?? 0,
            pdaCosts: voyageInputs?.pdaCosts ?? 0,
            lubOilCosts: voyageInputs?.lubOilCosts ?? 0,
            // Phase 2: use real weather multiplier
            weatherRiskMultiplier: weatherRisk.weatherMultiplier,
            fuelPrices: voyageInputs?.fuelPrices,
            ballastFuelType: voyageInputs?.ballastFuelType,
            ladenFuelType: voyageInputs?.ladenFuelType,
            portFuelType: voyageInputs?.portFuelType,
          },
          optimizeFor,
          includeEco,
          freightRateUsd: freightRate ? parseFloat(freightRate) : undefined,
          cargoQuantityMt: parseFloat(cargoQuantity),
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Phase 3: enrich results with CII ratings
        const enriched = data.data.map((r: OptimizerResult) => {
          const avgConsumption = (vesselProfile.ladenConsumption + vesselProfile.ballastConsumption) / 2;
          const cii = estimateCiiFromConfig(
            r.speed,
            avgConsumption,
            vesselDwt,
            vesselType,
          );
          return {
            ...r,
            ciiRating: cii.rating,
            ciiScore: cii.attainedCII,
            ciiRequired: cii.requiredCII,
          };
        });
        setResults(enriched);
        setMetadata(data.metadata);
      }
    } catch (err) {
      console.error("Optimizer failed:", err);
    } finally {
      setIsOptimizing(false);
    }
  }, [
    canOptimize,
    vesselProfile,
    ballastDistanceNm,
    ladenDistanceNm,
    cargoQuantity,
    optimizeFor,
    includeEco,
    freightRate,
    voyageInputs,
    weatherRisk.weatherMultiplier,
    vesselDwt,
    vesselType,
  ]);

  const handleApply = useCallback(
    (result: OptimizerResult) => {
      setAppliedRank(result.rank);
      onApplyConfig?.(result.speed, result.mode);
      // If parent supports voyage creation, trigger it with this config
      onCreateVoyageWithConfig?.({
        speed: result.speed,
        mode: result.mode,
        bunkerCost: result.bunkerCost,
        tce: result.tce,
        voyagePnl: result.voyagePnl,
        seaDays: result.seaDays,
        totalVoyageDays: result.totalVoyageDays,
        ciiRating: result.ciiRating,
      });
    },
    [onApplyConfig, onCreateVoyageWithConfig]
  );

  if (!vesselProfile || (ballastDistanceNm <= 0 && ladenDistanceNm <= 0)) {
    return null;
  }

  const weatherBadge = SEVERITY_BADGE[weatherRisk.overallSeverity];
  const WeatherIcon = weatherBadge.icon;

  return (
    <Card className="border-violet-500/20 overflow-hidden">
      {/* Gradient bar */}
      <div className="h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500" />

      <CardHeader
        className="cursor-pointer hover:bg-muted/30 transition-colors py-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-400" />
            Smart Voyage Optimizer
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Tests multiple speed and eco mode combinations to find the optimal
                    voyage configuration. Weather-adjusted and CII-rated.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Weather badge (Phase 2) */}
            {weatherData && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${weatherBadge.bgColor} ${weatherBadge.color}`}>
                <WeatherIcon className="h-3 w-3" />
                {weatherBadge.label}
              </span>
            )}
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-0 space-y-4">
          {/* Weather info banner (Phase 2) */}
          {weatherData && weatherRisk.weatherMultiplier > 1.0 && (
            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs border ${weatherBadge.bgColor}`}>
              <WeatherIcon className={`h-4 w-4 ${weatherBadge.color}`} />
              <div className="flex-1">
                <span className={`font-medium ${weatherBadge.color}`}>
                  {weatherBadge.label}
                </span>
                <span className="text-muted-foreground ml-1">
                  — Avg {weatherRisk.avgWaveHeightM.toFixed(1)}m, max {weatherRisk.maxWaveHeightM.toFixed(1)}m waves.
                  Speed penalty: +{((weatherRisk.weatherMultiplier - 1) * 100).toFixed(0)}%,
                  fuel penalty: +{(weatherRisk.fuelPenaltyPercent * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {/* Optimizer Inputs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                Optimize For
              </Label>
              <Select value={optimizeFor} onValueChange={setOptimizeFor}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maxTCE">Max TCE</SelectItem>
                  <SelectItem value="minCost">Min Cost</SelectItem>
                  <SelectItem value="minBunker">Min Bunker</SelectItem>
                  <SelectItem value="minDays">Min Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Freight Rate ($/MT)
              </Label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g., 12.50"
                value={freightRate}
                onChange={(e) => setFreightRate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Fuel className="h-3 w-3" />
                Cargo Quantity (MT)
              </Label>
              <Input
                type="number"
                placeholder="e.g., 50,000"
                value={cargoQuantity}
                onChange={(e) => setCargoQuantity(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Include Eco Mode</Label>
              <Select
                value={includeEco ? "yes" : "no"}
                onValueChange={(v) => setIncludeEco(v === "yes")}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optimize Button */}
          <Button
            onClick={handleOptimize}
            disabled={!canOptimize || isOptimizing}
            className="w-full bg-violet-600 hover:bg-violet-500"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Optimize Voyage
                {weatherData && <span className="ml-1 text-xs opacity-70">(weather-adjusted)</span>}
              </>
            )}
          </Button>

          {/* Loading skeleton */}
          {isOptimizing && (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          )}

          {/* Results table */}
          {results.length > 0 && !isOptimizing && (
            <div className="space-y-3">
              {/* Summary */}
              {metadata && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>
                    Tested <span className="font-medium text-foreground">{metadata.totalCombinations}</span> combinations
                    in <span className="font-medium text-foreground">{metadata.timeTakenMs}ms</span>
                    {weatherData && (
                      <span className="ml-1 text-violet-400">• weather-adjusted</span>
                    )}
                  </span>
                  {results[0] && results[0].savingsVsBaseline > 0 && (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Best saves {formatUsd(results[0].savingsVsBaseline)} vs current
                    </span>
                  )}
                </div>
              )}

              {/* Table */}
              <div className="rounded-lg border overflow-x-auto">
                {/* Header */}
                <div className="grid grid-cols-[36px_64px_52px_64px_76px_76px_76px_40px_64px] gap-1 px-3 py-2 bg-muted/50 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border-b min-w-[550px]">
                  <span>#</span>
                  <span>Speed</span>
                  <span>Mode</span>
                  <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> Days</span>
                  <span className="flex items-center gap-0.5"><Fuel className="h-3 w-3" /> Bunker</span>
                  <span>TCE</span>
                  <span>P&L</span>
                  <span>CII</span>
                  <span></span>
                </div>

                {/* Rows */}
                {results.map((result) => (
                  <div
                    key={result.rank}
                    className={`
                      grid grid-cols-[36px_64px_52px_64px_76px_76px_76px_40px_64px] gap-1 px-3 py-2.5
                      text-sm transition-colors hover:bg-muted/30 min-w-[550px]
                      ${result.rank <= 3 ? "bg-violet-500/5" : ""}
                      ${appliedRank === result.rank ? "bg-emerald-500/10 border-l-2 border-l-emerald-500" : "border-b border-border/50"}
                    `}
                  >
                    {/* Rank */}
                    <span className="flex items-center">
                      {result.rank <= 3 ? RANK_ICONS[result.rank - 1] : (
                        <span className="text-xs text-muted-foreground">{result.rank}</span>
                      )}
                    </span>

                    {/* Speed */}
                    <span className="font-medium tabular-nums">{result.speed} kn</span>

                    {/* Mode */}
                    <span className={`text-xs px-1.5 py-0.5 rounded-md inline-flex items-center w-fit ${
                      result.mode === "eco"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}>
                      {result.mode === "eco" ? "ECO" : "STD"}
                    </span>

                    {/* Days */}
                    <span className="tabular-nums">{result.totalVoyageDays.toFixed(1)}</span>

                    {/* Bunker */}
                    <span className="tabular-nums text-xs">{formatUsd(result.bunkerCost)}</span>

                    {/* TCE */}
                    <span className={`tabular-nums font-medium ${
                      result.tce >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {formatUsd(result.tce)}
                      <span className="text-[10px] text-muted-foreground">/d</span>
                    </span>

                    {/* P&L */}
                    <span className={`tabular-nums text-xs ${
                      result.voyagePnl !== null
                        ? result.voyagePnl >= 0 ? "text-emerald-400" : "text-red-400"
                        : "text-muted-foreground"
                    }`}>
                      {result.voyagePnl !== null ? formatUsd(result.voyagePnl) : "—"}
                    </span>

                    {/* CII Rating (Phase 3) */}
                    <span className="flex items-center">
                      {result.ciiRating ? (
                        <CiiRatingBadge
                          rating={result.ciiRating}
                          attainedCII={result.ciiScore}
                          requiredCII={result.ciiRequired}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </span>

                    {/* Create Voyage with this config */}
                    <span>
                      {appliedRank === result.rank ? (
                        <span className="text-emerald-400 text-xs flex items-center gap-0.5">
                          <Check className="h-3 w-3" />
                          Done
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                          onClick={() => handleApply(result)}
                        >
                          <Ship className="h-3 w-3 mr-0.5" />
                          Use
                        </Button>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* CII warning for D/E results */}
              {results.some(r => r.ciiRating === "D" || r.ciiRating === "E") && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs bg-orange-500/10 border border-orange-500/20">
                  <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-orange-400">CII Warning:</span> Some configurations may push vessel 
                    into D/E territory. IMO requires a corrective action plan for vessels rated D (3 consecutive years) or E (1 year).
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {results.length === 0 && !isOptimizing && metadata && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No valid configurations found. Check your vessel profile and distances.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
