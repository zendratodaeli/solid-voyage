"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Target, 
  AlertTriangle, 
  Info,
  TrendingUp,
  TrendingDown,
  Scale,
  Gauge
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import type { RiskLevel, RecommendationAction } from "@prisma/client";

interface FreightRecommendationData {
  id: string;
  breakEvenFreight: number;
  targetFreight: number;
  minMarketFreight: number;
  maxMarketFreight: number;
  recommendedFreight: number;
  targetMarginPercent: number;
  targetMarginUsd: number;
  overallRisk: RiskLevel;
  bunkerVolatilityRisk: RiskLevel;
  weatherRisk: RiskLevel;
  marketAlignmentRisk: RiskLevel;
  confidenceScore: number;
  explanation: string;
  recommendation: RecommendationAction;
}

interface FreightRecommendationCardProps {
  recommendation: FreightRecommendationData;
  offeredFreight: number | null;
  cargoQuantity: number;
}

const recommendationConfig: Record<RecommendationAction, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}> = {
  STRONG_ACCEPT: {
    label: "Strong Accept",
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    borderColor: "border-green-500/30",
    icon: <TrendingUp className="h-5 w-5" />,
  },
  ACCEPT: {
    label: "Accept",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    icon: <TrendingUp className="h-5 w-5" />,
  },
  NEGOTIATE: {
    label: "Negotiate",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
    borderColor: "border-yellow-500/30",
    icon: <Scale className="h-5 w-5" />,
  },
  REJECT: {
    label: "Reject",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    icon: <TrendingDown className="h-5 w-5" />,
  },
  STRONG_REJECT: {
    label: "Strong Reject",
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    borderColor: "border-red-500/30",
    icon: <TrendingDown className="h-5 w-5" />,
  },
};

const riskColors: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  LOW: { bg: "bg-green-500", text: "text-green-400", label: "Low" },
  MEDIUM: { bg: "bg-yellow-500", text: "text-yellow-400", label: "Medium" },
  HIGH: { bg: "bg-red-500", text: "text-red-400", label: "High" },
};

export function FreightRecommendationCard({ 
  recommendation, 
  offeredFreight,
  cargoQuantity 
}: FreightRecommendationCardProps) {
  const config = recommendationConfig[recommendation.recommendation];
  const { formatMoney, formatFreight } = useCurrency();
  
  // Calculate freight comparison range for visualization
  const freightMin = recommendation.breakEvenFreight * 0.9;
  const freightMax = Math.max(
    recommendation.maxMarketFreight,
    recommendation.targetFreight,
    offeredFreight || recommendation.recommendedFreight
  ) * 1.1;
  const freightRange = freightMax - freightMin;

  const getPosition = (value: number) => {
    return ((value - freightMin) / freightRange) * 100;
  };

  // Calculate potential P&L if we have offered freight
  const potentialRevenue = offeredFreight ? offeredFreight * cargoQuantity : null;
  const breakEvenRevenue = recommendation.breakEvenFreight * cargoQuantity;
  const margin = potentialRevenue ? potentialRevenue - breakEvenRevenue : null;

  return (
    <Card className={`${config.bgColor} ${config.borderColor}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${config.bgColor} ${config.color}`}>
              {config.icon}
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Freight Recommendation
              </CardTitle>
              <CardDescription className="mt-1">
                AI-powered analysis based on voyage economics
              </CardDescription>
            </div>
          </div>
          <Badge 
            variant="outline" 
            className={`text-lg px-4 py-2 ${config.color} ${config.bgColor} ${config.borderColor}`}
          >
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Freight Levels Visualization */}
        {(() => {
          // Build sorted marker array
          const markers: Array<{
            key: string;
            label: string;
            value: number;
            position: number;
            dotColor: string;
            textColor: string;
          }> = [
            {
              key: "breakeven",
              label: "Break-even",
              value: recommendation.breakEvenFreight,
              position: getPosition(recommendation.breakEvenFreight),
              dotColor: "bg-red-500",
              textColor: "text-red-400",
            },
            {
              key: "recommended",
              label: "Recommended",
              value: recommendation.recommendedFreight,
              position: getPosition(recommendation.recommendedFreight),
              dotColor: "bg-green-500",
              textColor: "text-green-400",
            },
            {
              key: "target",
              label: `Target (+${recommendation.targetMarginPercent}%)`,
              value: recommendation.targetFreight,
              position: getPosition(recommendation.targetFreight),
              dotColor: "bg-yellow-500",
              textColor: "text-yellow-400",
            },
          ];
          if (offeredFreight) {
            markers.push({
              key: "offered",
              label: "Offered",
              value: offeredFreight,
              position: getPosition(offeredFreight),
              dotColor: "bg-blue-500",
              textColor: "text-blue-400",
            });
          }
          // Sort left-to-right by position
          markers.sort((a, b) => a.position - b.position);

          return (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Freight Rate Comparison</h4>
              
              {/* Labeled rows — one per marker, each with a dot on the bar */}
              <div className="space-y-2.5">
                {markers.map((m) => (
                  <div key={m.key}>
                    {/* Label row: name + value on opposite ends */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1 h-3 rounded-full ${m.dotColor} flex-shrink-0`} />
                        <span className={`text-xs font-medium ${m.textColor}`}>{m.label}</span>
                      </div>
                      <span className={`text-sm font-bold ${m.textColor} tabular-nums`}>
                        {formatFreight(m.value)}
                      </span>
                    </div>
                    {/* Bar with dot positioned at the marker's location */}
                    <div className="relative h-2 w-full rounded-full bg-muted/40">
                      {/* Filled portion up to this marker */}
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${m.dotColor} opacity-20`}
                        style={{ width: `${Math.min(100, Math.max(0, m.position))}%` }}
                      />
                      {/* Dot on the bar */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full ${m.dotColor} border-2 border-background shadow-md`}
                        style={{
                          left: `${Math.min(97, Math.max(1, m.position))}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Min/Max scale reference */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 px-0.5">
                <span>{formatFreight(freightMin)}</span>
                <span className="text-center opacity-60">Market Range: {formatFreight(recommendation.minMarketFreight)} – {formatFreight(recommendation.maxMarketFreight)}</span>
                <span>{formatFreight(freightMax)}</span>
              </div>
            </div>
          );
        })()}

        {/* Margin Analysis (if offered freight exists) */}
        {margin !== null && offeredFreight && (
          <div className={`p-4 rounded-lg ${margin > 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expected Margin at Offered Rate</p>
                <p className={`text-2xl font-bold ${margin > 0 ? "text-green-400" : "text-red-400"}`}>
                  {formatMoney(margin)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Per MT</p>
                <p className={`text-lg font-bold ${margin > 0 ? "text-green-400" : "text-red-400"}`}>
                  ${((offeredFreight - recommendation.breakEvenFreight)).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Risk Assessment Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Risk Assessment
            </h4>
            <Badge variant="outline" className={riskColors[recommendation.overallRisk].text}>
              Overall: {riskColors[recommendation.overallRisk].label}
            </Badge>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <RiskItem
              label="Bunker Volatility"
              level={recommendation.bunkerVolatilityRisk}
            />
            <RiskItem
              label="Weather Risk"
              level={recommendation.weatherRisk}
            />
            <RiskItem
              label="Market Alignment"
              level={recommendation.marketAlignmentRisk}
            />
          </div>
        </div>

        {/* Confidence Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Confidence Score
            </h4>
            <span className="text-sm font-medium">{recommendation.confidenceScore.toFixed(0)}%</span>
          </div>
          <Progress value={recommendation.confidenceScore} className="h-2" />
        </div>

        {/* Explanation */}
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex gap-2">
            <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              {recommendation.explanation}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FreightValue({
  label,
  value,
  color,
  highlight = false,
}: {
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`space-y-1 ${highlight ? "p-2 rounded-lg bg-muted/50" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function RiskItem({
  label,
  level,
}: {
  label: string;
  level: RiskLevel;
}) {
  const { bg, text, label: levelLabel } = riskColors[level];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${bg}`} />
        <span className={`text-sm font-medium ${text}`}>{levelLabel}</span>
      </div>
    </div>
  );
}
