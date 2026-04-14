"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  formatRoute, 
  formatDays,
  formatNumber,
  getPnlColor,
  formatRelativeTime 
} from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import { VOYAGE_STATUS_LABELS } from "@/types";
import { DeleteButton } from "@/components/shared/DeleteButton";
import type { ViewLens } from "@/types";
import type { 
  Voyage, 
  Vessel, 
  User,
  VoyageCalculation, 
  FreightRecommendation,
  VoyageStatus,
  RecommendationAction,
  RiskLevel,
} from "@prisma/client";

type VoyageWithRelations = Voyage & {
  vessel: Vessel;
  user?: User | null;
  calculations: VoyageCalculation | null;
  recommendations: FreightRecommendation | null;
};

const recommendationColors: Record<RecommendationAction, string> = {
  STRONG_ACCEPT: "bg-green-500/20 text-green-400 border-green-500/30",
  ACCEPT: "bg-green-500/10 text-green-400 border-green-500/20",
  NEGOTIATE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  REJECT: "bg-red-500/10 text-red-400 border-red-500/20",
  STRONG_REJECT: "bg-red-500/20 text-red-400 border-red-500/30",
};

const recommendationLabels: Record<RecommendationAction, string> = {
  STRONG_ACCEPT: "Strong Accept",
  ACCEPT: "Accept",
  NEGOTIATE: "Negotiate",
  REJECT: "Reject",
  STRONG_REJECT: "Strong Reject",
};

const riskColors: Record<RiskLevel, string> = {
  LOW: "text-green-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-red-400",
};

export function VoyageSummaryCard({
  voyage,
  isOwner = false,
  orgSlug,
  lens,
}: {
  voyage: VoyageWithRelations;
  isOwner?: boolean;
  orgSlug: string;
  lens?: ViewLens;
}) {
  const { vessel, user, calculations, recommendations } = voyage;
  const { formatMoney, formatTce, formatFreight } = useCurrency();
  const statusInfo = VOYAGE_STATUS_LABELS[voyage.status as VoyageStatus];
  const creatorName = user?.name ?? "Unknown";

  const tce = calculations?.tce ?? 0;
  const voyagePnl = calculations?.voyagePnl ?? null;
  const breakEven = calculations?.breakEvenFreight ?? 0;
  const recommendation = recommendations?.recommendation as RecommendationAction | undefined;

  // Use text-based port fields
  const routeName = formatRoute(voyage.loadPort, voyage.dischargePort);

  return (
    <Card className="transition-all hover:bg-accent/50 hover:border-primary/30 h-full group">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <Link
            href={`/${orgSlug}/voyages/${voyage.id}`}
            className="flex-1 min-w-0"
          >
            <h3 className="font-semibold truncate hover:text-primary">
              {routeName}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {vessel.name}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              by {creatorName} · {formatRelativeTime(voyage.createdAt)}
            </p>
          </Link>
          <div className="flex items-center gap-2 ml-2 shrink-0">
            {recommendation && (
              <Badge
                variant="outline"
                className={recommendationColors[recommendation]}
              >
                {recommendationLabels[recommendation]}
              </Badge>
            )}
            {isOwner && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DeleteButton
                  id={voyage.id}
                  type="voyage"
                  name={routeName}
                  variant="ghost"
                  size="icon"
                  showText={false}
                />
              </div>
            )}
          </div>
        </div>

        {/* Metrics — lens-aware */}
        <Link href={`/${orgSlug}/voyages/${voyage.id}`}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {renderMetrics(lens, { tce, voyagePnl, breakEven, voyage, calculations, recommendations }, formatMoney, formatTce, formatFreight)}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <Badge variant="secondary" className="text-xs">
              {statusInfo.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(voyage.updatedAt)}
            </span>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LENS-SPECIFIC METRICS
// ═══════════════════════════════════════════════════════════════════

interface MetricData {
  tce: number;
  voyagePnl: number | null;
  breakEven: number;
  voyage: VoyageWithRelations;
  calculations: VoyageCalculation | null;
  recommendations: FreightRecommendation | null;
}

function renderMetrics(
  lens: ViewLens | undefined,
  data: MetricData,
  formatMoney: (value: number, decimals?: number) => string,
  formatTce: (value: number) => string,
  formatFreight: (value: number) => string,
) {
  const { tce, voyagePnl, breakEven, voyage, calculations, recommendations } = data;

  switch (lens) {
    case "operator":
      return (
        <>
          <MetricItem
            label="Sea Days"
            value={calculations?.totalSeaDays != null ? formatDays(calculations.totalSeaDays) : "—"}
          />
          <MetricItem
            label="Port Days"
            value={calculations?.totalPortDays != null ? formatDays(calculations.totalPortDays) : "—"}
          />
          <MetricItem
            label="Bunker Cost"
            value={calculations?.totalBunkerCost != null ? formatMoney(calculations.totalBunkerCost, 0) : "—"}
          />
          <MetricItem
            label="Weather Risk"
            value={recommendations?.weatherRisk ?? "—"}
            className={
              recommendations?.weatherRisk
                ? riskColors[recommendations.weatherRisk as RiskLevel]
                : ""
            }
          />
        </>
      );

    case "management":
      return (
        <>
          <MetricItem
            label="Voyage P&L"
            value={voyagePnl !== null ? formatMoney(voyagePnl) : "—"}
            className={getPnlColor(voyagePnl)}
          />
          <MetricItem
            label="TCE"
            value={formatTce(tce)}
            className={tce > 0 ? "text-green-400" : "text-red-400"}
          />
          <MetricItem
            label="Total Cost"
            value={calculations?.totalVoyageCost != null ? formatMoney(calculations.totalVoyageCost, 0) : "—"}
          />
          <MetricItem
            label="Confidence"
            value={
              recommendations?.confidenceScore != null
                ? `${recommendations.confidenceScore.toFixed(0)}%`
                : "—"
            }
            className={
              recommendations?.confidenceScore != null
                ? recommendations.confidenceScore >= 70
                  ? "text-green-400"
                  : recommendations.confidenceScore >= 40
                  ? "text-yellow-400"
                  : "text-red-400"
                : ""
            }
          />
        </>
      );

    // Default / shipbroker lens
    default:
      return (
        <>
          <MetricItem
            label="TCE"
            value={formatTce(tce)}
            className={tce > 0 ? "text-green-400" : "text-red-400"}
          />
          <MetricItem
            label="P&L"
            value={voyagePnl !== null ? formatMoney(voyagePnl) : "—"}
            className={getPnlColor(voyagePnl)}
          />
          <MetricItem label="Break-even" value={formatFreight(breakEven)} />
          <MetricItem
            label="Offered"
            value={
              voyage.freightRateUsd
                ? formatFreight(voyage.freightRateUsd)
                : "—"
            }
          />
        </>
      );
  }
}

function MetricItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${className}`}>{value}</p>
    </div>
  );
}
