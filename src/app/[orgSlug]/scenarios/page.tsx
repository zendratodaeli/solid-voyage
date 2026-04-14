import Link from "next/link";
import { GitCompare, Plus, Ship, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { formatRoute, formatRelativeTime } from "@/lib/utils";
import { formatCurrency, formatTceCurrency } from "@/lib/currency";
import { buildOwnerFilter, type AuthUser } from "@/lib/permissions";
import { ScenarioDeleteButton } from "@/components/scenarios/ScenarioDeleteButton";

interface ScenarioResults {
  totalVoyageDays: number;
  totalBunkerCost: number;
  totalVoyageCost: number;
  tce: number;
  voyagePnl: number | null;
  breakEvenFreight: number;
}

async function getScenarios(user: AuthUser) {
  const ownerFilter = buildOwnerFilter(user);
  const scenarios = await prisma.scenario.findMany({
    where: ownerFilter,
    include: {
      user: true,
      voyage: {
        include: {
          vessel: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return scenarios;
}

async function getRecentVoyages(user: AuthUser) {
  const ownerFilter = buildOwnerFilter(user);
  return prisma.voyage.findMany({
    where: { 
      ...ownerFilter,
      calculations: { isNot: null },
    },
    select: { 
      id: true, 
      loadPort: true, 
      dischargePort: true,
      vessel: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
}

export default async function ScenariosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const user = await requireUser() as AuthUser;
  const [scenarios, recentVoyages] = await Promise.all([
    getScenarios(user),
    getRecentVoyages(user),
  ]);

  type ScenarioWithVoyage = Awaited<ReturnType<typeof getScenarios>>[number];
  type GroupedScenarios = Record<string, { voyage: ScenarioWithVoyage["voyage"]; scenarios: ScenarioWithVoyage[] }>;
  
  // Group scenarios by voyage
  const scenariosByVoyage = scenarios.reduce<GroupedScenarios>((acc, scenario) => {
    const voyageId = scenario.voyageId;
    if (!acc[voyageId]) {
      acc[voyageId] = {
        voyage: scenario.voyage,
        scenarios: [],
      };
    }
    acc[voyageId].scenarios.push(scenario);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scenarios</h1>
          <p className="text-muted-foreground mt-1">
            Compare different voyage scenarios side by side
          </p>
        </div>
      </div>

      {scenarios.length === 0 ? (
        <>
          {/* Empty State */}
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GitCompare className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Scenarios Yet</h3>
              <p className="text-muted-foreground text-center mb-4 max-w-md">
                Create scenarios from voyage detail pages to compare different 
                speed, bunker price, and port time assumptions.
              </p>
            </CardContent>
          </Card>

          {/* Quick Access to Recent Voyages */}
          {recentVoyages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Create Scenarios From</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {recentVoyages.map((voyage) => (
                    <Link 
                      key={voyage.id} 
                      href={`/${orgSlug}/voyages/${voyage.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Ship className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {formatRoute(voyage.loadPort, voyage.dischargePort)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          • {voyage.vessel.name}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* Scenarios by Voyage */
        <div className="space-y-6">
          {Object.entries(scenariosByVoyage).map(([voyageId, { voyage, scenarios }]) => (
            <Card key={voyageId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Ship className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg">
                        <Link href={`/${orgSlug}/voyages/${voyageId}`} className="hover:underline">
                          {formatRoute(voyage.loadPort, voyage.dischargePort)}
                        </Link>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {voyage.vessel.name}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {scenarios.length} scenario{scenarios.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {scenarios.map((scenario) => {
                    const results = scenario.results as unknown as ScenarioResults;
                    const isProfitable = (results.voyagePnl ?? 0) > 0;
                    
                    return (
                      <Card 
                        key={scenario.id} 
                        className={`${isProfitable ? "border-green-500/30" : "border-red-500/30"}`}
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-medium">{scenario.name}</h4>
                              {scenario.description && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {scenario.description}
                                </p>
                              )}
                            </div>
                            {/* Delete button: voyage owner can delete any, others only their own */}
                            {(voyage.userId === user.id || scenario.userId === user.id) && (
                              <ScenarioDeleteButton
                                voyageId={scenario.voyageId}
                                scenarioId={scenario.id}
                                scenarioName={scenario.name}
                              />
                            )}
                          </div>
                          
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Days</span>
                              <span>{results.totalVoyageDays?.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cost</span>
                              <span>{formatCurrency(results.totalVoyageCost)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">TCE</span>
                              <span className={results.tce > 0 ? "text-green-400" : "text-red-400"}>
                                {formatTceCurrency(results.tce)}
                              </span>
                            </div>
                            {results.voyagePnl !== null && (
                              <div className="flex justify-between pt-2 border-t">
                                <span className="text-muted-foreground">P&L</span>
                                <span className={`font-bold ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                                  {formatCurrency(results.voyagePnl)}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          <p className="text-xs text-muted-foreground/70 mt-3">
                            by {scenario.user?.name ?? "Unknown"} · {formatRelativeTime(scenario.createdAt)}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
