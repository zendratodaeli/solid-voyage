import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { formatRoute } from "@/lib/utils";
import { VoyageForm } from "@/components/voyages/VoyageForm";
import { getVoyagePermission, canModifyVoyage, buildOwnerFilter, type AuthUser } from "@/lib/permissions";

async function getVessels(user: AuthUser) {
  return prisma.vessel.findMany({
    where: buildOwnerFilter(user),
    select: { 
      id: true, 
      name: true, 
      vesselType: true, 
      dwt: true,
      // Fuel type fields for voyage form
      ballastFuelType: true,
      ladenFuelType: true,
      portFuelType: true,
      fuelTypes: true,
      fuelConsumption: true,  // Per-fuel consumption profiles contain the fuel types
      // AIS tracking
      mmsiNumber: true,
      // Speed & consumption profiles
      ladenSpeed: true,
      ballastSpeed: true,
      ladenConsumption: true,
      ballastConsumption: true,
    },
    orderBy: { name: "asc" },
  });
}

export default async function EditVoyagePage({
  params,
}: {
  params: Promise<{ id: string; orgSlug: string }>;
}) {
  const user = await requireUser() as AuthUser;
  const { id, orgSlug } = await params;
  
  // Check permission
  const permission = await getVoyagePermission(user, id);
  if (!permission || !canModifyVoyage(permission)) {
    notFound();
  }
  
  const [voyage, vessels] = await Promise.all([
    prisma.voyage.findUnique({
      where: { id },
      include: { vessel: true },
    }),
    getVessels(user),
  ]);

  if (!voyage) {
    notFound();
  }

  // Voyage locking: block edits once voyage is fixed or beyond
  const lockedStatuses = ["REJECTED", "FIXED", "COMPLETED", "LOST", "EXPIRED", "WITHDRAWN"];
  if (lockedStatuses.includes(voyage.status)) {
    redirect(`/${orgSlug}/voyages/${voyage.id}`);
  }

  const routeName = formatRoute(voyage.loadPort, voyage.dischargePort);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${orgSlug}/voyages/${voyage.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Voyage</h1>
          <p className="text-muted-foreground mt-1">
            {routeName} • {voyage.vessel.name}
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Voyage Details
          </CardTitle>
          <CardDescription>
            Update voyage parameters to recalculate profitability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoyageForm voyage={voyage as any} vessels={vessels as any} />
        </CardContent>
      </Card>
    </div>
  );
}

