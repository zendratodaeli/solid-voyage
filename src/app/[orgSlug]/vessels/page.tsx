import Link from "next/link";
import { Plus, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { VESSEL_TYPE_LABELS } from "@/types";
import type { VesselType } from "@prisma/client";
import { buildOwnerFilter, canDeleteVessel, type AuthUser } from "@/lib/permissions";
import { VesselsDataTable, type VesselRow } from "@/components/vessels/VesselsDataTable";

async function getVessels(user: AuthUser) {
  return prisma.vessel.findMany({
    where: buildOwnerFilter(user),
    orderBy: { updatedAt: "desc" },
    include: {
      user: true,
      _count: { select: { voyages: true } },
    },
  });
}

export default async function VesselsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const user = await requireUser() as AuthUser;
  const vessels = await getVessels(user);
  const showDelete = canDeleteVessel(user.orgRole);

  // Serialize for client component
  const vesselRows: VesselRow[] = vessels.map((v) => ({
    id: v.id,
    name: v.name,
    vesselType: v.vesselType,
    vesselTypeLabel: VESSEL_TYPE_LABELS[v.vesselType as VesselType] ?? v.vesselType,
    dwt: v.dwt,
    ladenSpeed: v.ladenSpeed,
    ladenConsumption: v.ladenConsumption,
    dailyOpex: v.dailyOpex,
    commercialControl: v.commercialControl ?? "OWNED_BAREBOAT",
    voyagesCount: v._count.voyages,
    createdByName: v.user?.name ?? v.createdByName ?? null,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vessels</h1>
          <p className="text-muted-foreground mt-1">
            Manage your fleet and vessel specifications
          </p>
        </div>
        <Link href={`/${orgSlug}/vessels/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Vessel
          </Button>
        </Link>
      </div>

      {/* Content */}
      {vessels.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Anchor className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No vessels added</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add your first vessel to start calculating voyage profitability.
            </p>
            <Link href={`/${orgSlug}/vessels/new`}>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add First Vessel
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <VesselsDataTable vessels={vesselRows} showDelete={showDelete} />
      )}
    </div>
  );
}
