"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Fuel, Gauge, Clock, AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";

interface SensitivityPoint {
  value: number;
  pnl: number;
  tce: number;
  breakEven: number;
}

interface SensitivityResult {
  variable: string;
  unit: string;
  baseValue: number;
  points: SensitivityPoint[];
  impactPerUnit: number;
  description: string;
}

interface ScenarioComparison {
  name: string;
  description?: string;
  result: {
    totalVoyageDays: number;
    totalBunkerCost: number;
    totalVoyageCost: number;
    tce: number;
    voyagePnl: number | null;
    breakEvenFreight: number;
  };
  difference: {
    voyageDays: number;
    bunkerCost: number;
    totalCost: number;
    tce: number;
    pnl: number | null;
  };
}

interface SensitivityData {
  bunkerPrice: SensitivityResult;
  freightRate: SensitivityResult;
  speed: SensitivityResult;
  time: SensitivityResult;
  scenarios: ScenarioComparison[];
}

interface SensitivityChartsProps {
  voyageId: string;
}

export function SensitivityCharts({ voyageId }: SensitivityChartsProps) {
  const [data, setData] = useState<SensitivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSensitivity() {
      try {
        const response = await fetch(`/api/voyages/${voyageId}/sensitivity`);
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || "Failed to load sensitivity data");
        }
        
        setData(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    
    fetchSensitivity();
  }, [voyageId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="flex items-center justify-center py-12 gap-2 text-red-400">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Sensitivity Analysis
        </CardTitle>
        <CardDescription>
          Explore how changes in key variables affect voyage profitability
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="bunker" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="bunker" className="gap-1">
              <Fuel className="h-4 w-4" />
              Bunker
            </TabsTrigger>
            <TabsTrigger value="freight" className="gap-1">
              <TrendingUp className="h-4 w-4" />
              Freight
            </TabsTrigger>
            <TabsTrigger value="speed" className="gap-1">
              <Gauge className="h-4 w-4" />
              Speed
            </TabsTrigger>
            <TabsTrigger value="time" className="gap-1">
              <Clock className="h-4 w-4" />
              Time
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="bunker" className="mt-4">
            <SensitivityChart result={data.bunkerPrice} />
          </TabsContent>
          
          <TabsContent value="freight" className="mt-4">
            <SensitivityChart result={data.freightRate} />
          </TabsContent>
          
          <TabsContent value="speed" className="mt-4">
            <SensitivityChart result={data.speed} />
          </TabsContent>
          
          <TabsContent value="time" className="mt-4">
            <SensitivityChart result={data.time} />
          </TabsContent>
        </Tabs>

        {/* Scenario Comparison */}
        {data.scenarios.length > 0 && (
          <div className="mt-8 pt-6 border-t">
            <h4 className="text-sm font-medium mb-4">Scenario Comparison</h4>
            <div className="grid gap-4 md:grid-cols-3">
              {data.scenarios.map((scenario) => (
                <ScenarioCard key={scenario.name} scenario={scenario} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SensitivityChart({ result }: { result: SensitivityResult }) {
  const { formatMoney, formatTce } = useCurrency();
  // Find min and max values for scaling
  const pnlValues = result.points.map(p => p.pnl);
  const minPnl = Math.min(...pnlValues);
  const maxPnl = Math.max(...pnlValues);
  const pnlRange = maxPnl - minPnl || 1;

  // Find break-even point (where P&L crosses zero)
  const breakEvenPoint = result.points.find(p => Math.abs(p.pnl) < Math.abs(result.impactPerUnit * 0.5));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{result.description}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Base value: <span className="font-medium">{formatNumber(result.baseValue)} {result.unit}</span>
          </p>
        </div>
        <Badge variant="outline">
          {formatMoney(Math.abs(result.impactPerUnit))}/unit impact
        </Badge>
      </div>

      {/* Simple bar chart visualization */}
      <div className="space-y-2">
        {result.points.map((point, i) => {
          const isBase = Math.abs(point.value - result.baseValue) < 0.01;
          const barWidth = ((point.pnl - minPnl) / pnlRange) * 100;
          const isPositive = point.pnl > 0;

          return (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className={`w-20 text-right ${isBase ? "font-bold" : ""}`}>
                {formatNumber(point.value)}
              </div>
              <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden relative">
                <div 
                  className={`h-full transition-all ${isPositive ? "bg-green-500/50" : "bg-red-500/50"}`}
                  style={{ width: `${Math.max(5, barWidth)}%` }}
                />
                {isBase && (
                  <div className="absolute inset-0 border-2 border-primary rounded-sm" />
                )}
              </div>
              <div className={`w-24 text-right ${isPositive ? "text-green-400" : "text-red-400"}`}>
                {formatMoney(point.pnl)}
              </div>
              <div className="w-20 text-right text-muted-foreground">
                {formatTce(point.tce)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground pt-2">
        <span>{result.unit}</span>
        <span className="flex items-center gap-4">
          <span>P&L</span>
          <span>TCE</span>
        </span>
      </div>

      {breakEvenPoint && (
        <div className="p-3 rounded-lg bg-muted/50 text-sm">
          <span className="text-muted-foreground">Break-even at approximately </span>
          <span className="font-medium">{formatNumber(breakEvenPoint.value)} {result.unit}</span>
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ScenarioComparison }) {
  const pnl = scenario.result.voyagePnl ?? 0;
  const { formatMoney, formatTce } = useCurrency();
  const isPositive = pnl > 0;
  const isBase = scenario.name === "Base Case";
  
  // Determine status: Break-Even (within $1000 of zero), Profit, or Loss
  const isBreakEven = Math.abs(pnl) < 1000;
  const status = isBreakEven 
    ? { icon: "⚪", label: "Break-Even", color: "text-muted-foreground" }
    : isPositive 
      ? { icon: "🟢", label: "Profit", color: "text-green-400" }
      : { icon: "🔴", label: "Loss", color: "text-red-400" };

  return (
    <Card className={`${isBase ? "border-primary/50" : ""}`}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="font-medium">{scenario.name}</h5>
          <div className="flex items-center gap-2">
            {isBase && <Badge>Base</Badge>}
          </div>
        </div>
        
        {/* Status Indicator */}
        <div className={`flex items-center gap-2 mb-3 text-sm ${status.color}`}>
          <span>{status.icon}</span>
          <span className="font-medium">{status.label}</span>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Voyage Days</span>
            <span>{scenario.result.totalVoyageDays.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Cost</span>
            <span>{formatMoney(scenario.result.totalVoyageCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">TCE</span>
            <span className={scenario.result.tce > 0 ? "text-green-400" : "text-red-400"}>
              {formatTce(scenario.result.tce)}
            </span>
          </div>
          {scenario.result.voyagePnl !== null && (
            <div className="flex justify-between pt-2 border-t">
              <span className="text-muted-foreground">P&L</span>
              <span className={`font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                {formatMoney(scenario.result.voyagePnl)}
              </span>
            </div>
          )}
        </div>

        {!isBase && scenario.difference.pnl !== null && (
          <div className={`mt-3 pt-2 border-t text-xs ${
            scenario.difference.pnl > 0 ? "text-green-400" : "text-red-400"
          }`}>
            {scenario.difference.pnl > 0 ? "+" : ""}{formatMoney(scenario.difference.pnl)} vs Base
          </div>
        )}
      </CardContent>
    </Card>
  );
}
