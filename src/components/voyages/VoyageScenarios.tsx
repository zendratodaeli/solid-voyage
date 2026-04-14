"use client";

/**
 * VoyageScenarios — Inline scenario comparison table for voyage detail pages.
 * 
 * Fetches scenarios for a specific voyage and displays them in a compact
 * comparison table with highlighted best values (TCE, P&L).
 * 
 * Replaces the standalone /scenarios page functionality.
 */

import { useState, useEffect, useCallback } from "react";
import { GitCompare, Loader2, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScenarioDeleteButton } from "@/components/scenarios/ScenarioDeleteButton";
import { formatCurrency, formatTceCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface ScenarioResults {
  totalVoyageDays: number;
  totalBunkerCost: number;
  totalVoyageCost: number;
  tce: number;
  voyagePnl: number | null;
  breakEvenFreight: number;
}

interface Scenario {
  id: string;
  name: string;
  description: string | null;
  overrides: Record<string, unknown>;
  results: ScenarioResults;
  createdAt: string;
}

interface VoyageScenariosProps {
  voyageId: string;
}

export function VoyageScenarios({ voyageId }: VoyageScenariosProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScenarios = useCallback(async () => {
    try {
      const res = await fetch(`/api/voyages/${voyageId}/scenarios`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setScenarios(data.data || []);
    } catch {
      setError("Failed to load scenarios");
    } finally {
      setLoading(false);
    }
  }, [voyageId]);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  // Listen for scenario creation events (from ScenarioCreator)
  useEffect(() => {
    const handleScenarioCreated = () => {
      fetchScenarios();
    };
    window.addEventListener("scenario-created", handleScenarioCreated);
    return () => window.removeEventListener("scenario-created", handleScenarioCreated);
  }, [fetchScenarios]);

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading scenarios...</span>
        </CardContent>
      </Card>
    );
  }

  // No scenarios — just don't render anything (ScenarioCreator button is already in VoyageDetailClient)
  if (scenarios.length === 0) {
    return null;
  }

  // Find best values for highlighting
  const bestTce = Math.max(...scenarios.map((s) => s.results.tce));
  const bestPnl = Math.max(
    ...scenarios.filter((s) => s.results.voyagePnl !== null).map((s) => s.results.voyagePnl!)
  );

  const handleOptimisticDelete = useCallback((scenarioId: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitCompare className="h-5 w-5 text-primary" />
            Scenarios
            <span className="text-sm font-normal text-muted-foreground">
              ({scenarios.length})
            </span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground whitespace-nowrap">
                  Scenario
                </th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                  Days
                </th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                  Voyage Cost
                </th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                  TCE
                </th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                  P&L
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {scenarios.map((scenario, idx) => {
                const r = scenario.results;
                const isBestTce = r.tce === bestTce && scenarios.length > 1;
                const isBestPnl = r.voyagePnl !== null && r.voyagePnl === bestPnl && scenarios.length > 1;
                const isProfitable = (r.voyagePnl ?? 0) > 0;
                const isFirst = idx === 0;

                return (
                  <tr
                    key={scenario.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    {/* Name */}
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        {isFirst && (
                          <Star className="h-3.5 w-3.5 text-amber-500 shrink-0 fill-amber-500" />
                        )}
                        <span className="font-medium">{scenario.name}</span>
                      </div>
                      {scenario.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {scenario.description}
                        </p>
                      )}
                    </td>

                    {/* Days */}
                    <td className="text-right py-2.5 px-3 tabular-nums">
                      {r.totalVoyageDays?.toFixed(1)}
                    </td>

                    {/* Cost */}
                    <td className="text-right py-2.5 px-3 tabular-nums">
                      {formatCurrency(r.totalVoyageCost)}
                    </td>

                    {/* TCE */}
                    <td className={cn(
                      "text-right py-2.5 px-3 tabular-nums font-medium",
                      isBestTce && "text-emerald-400",
                      !isBestTce && r.tce > 0 && "text-green-400",
                      r.tce <= 0 && "text-red-400"
                    )}>
                      {formatTceCurrency(r.tce)}
                    </td>

                    {/* P&L */}
                    <td className={cn(
                      "text-right py-2.5 px-3 tabular-nums font-medium",
                      isBestPnl && "text-emerald-400",
                      !isBestPnl && isProfitable && "text-green-400",
                      !isProfitable && "text-red-400"
                    )}>
                      {r.voyagePnl !== null ? formatCurrency(r.voyagePnl) : "—"}
                    </td>

                    {/* Delete */}
                    <td className="py-2.5 pl-1">
                      <ScenarioDeleteButton
                        voyageId={voyageId}
                        scenarioId={scenario.id}
                        scenarioName={scenario.name}
                        onOptimisticDelete={handleOptimisticDelete}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
