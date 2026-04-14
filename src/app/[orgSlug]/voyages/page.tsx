import Link from "next/link";
import { Plus, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { formatRoute } from "@/lib/utils";
import { VOYAGE_STATUS_LABELS } from "@/types";
import type { VoyageStatus, RecommendationAction } from "@prisma/client";
import { buildVoyageListFilter, type AuthUser } from "@/lib/permissions";
import { VoyagesDataTable, type VoyageRow } from "@/components/voyages/VoyagesDataTable";

async function getVoyages(user: AuthUser, status?: string) {
  const baseFilter = await buildVoyageListFilter(user);
  const where: Record<string, unknown> = { ...baseFilter };
  
  if (status && status !== "all") {
    where.status = status.toUpperCase();
  }
  
  return prisma.voyage.findMany({
    where,
    include: {
      vessel: true,
      user: true,
      calculations: true,
      recommendations: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export default async function VoyagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgSlug } = await params;
  const user = await requireUser() as AuthUser;
  const resolvedSearchParams = await searchParams;
  const status = resolvedSearchParams.status || "all";
  const voyages = await getVoyages(user, status);

  const statusTabs = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "new", label: "New-Evaluating" },
    { value: "offered", label: "Offered-Negotiating" },
    { value: "fixed", label: "Fixed" },
    { value: "completed", label: "Completed" },
    { value: "rejected", label: "Rejected" },
  ];

  // Serialize for client component
  const voyageRows: VoyageRow[] = voyages.map((v) => {
    const statusInfo = VOYAGE_STATUS_LABELS[v.status as VoyageStatus];
    return {
      id: v.id,
      route: formatRoute(v.loadPort, v.dischargePort),
      vesselName: v.vessel.name,
      loadPort: v.loadPort ?? "",
      dischargePort: v.dischargePort ?? "",
      status: v.status,
      statusLabel: statusInfo?.label ?? v.status,
      tce: v.calculations?.tce ?? 0,
      voyagePnl: v.calculations?.voyagePnl ?? null,
      breakEvenFreight: v.calculations?.breakEvenFreight ?? 0,
      offeredFreight: v.freightRateUsd ?? null,
      recommendation: (v.recommendations?.recommendation as RecommendationAction) ?? null,
      updatedAt: v.updatedAt.toISOString(),
      createdAt: v.createdAt.toISOString(),
      creatorName: v.user?.name ?? "Unknown",
      isOwner: v.userId === user.id,
      laycanStart: v.laycanStart?.toISOString() ?? null,
      laycanEnd: v.laycanEnd?.toISOString() ?? null,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Voyages</h1>
          <p className="text-muted-foreground mt-1">
            Manage voyage calculations and freight recommendations
          </p>
        </div>
        <Link href={`/${orgSlug}/voyages/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Voyage
          </Button>
        </Link>
      </div>

      {/* Status Tabs */}
      <Tabs defaultValue={status} className="w-full">
        <TabsList>
          {statusTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} asChild>
              <Link href={`/${orgSlug}/voyages?status=${tab.value}`}>
                {tab.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Content */}
      {voyages.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Ship className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {status === "all" ? "No voyages yet" : `No ${status} voyages`}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {status === "all" 
                ? "Create your first voyage to calculate profitability and get freight recommendations."
                : "No voyages match this filter."}
            </p>
            {status === "all" && (
              <Link href={`/${orgSlug}/voyages/new`}>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create First Voyage
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <VoyagesDataTable voyages={voyageRows} />
      )}
    </div>
  );
}
