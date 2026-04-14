import Link from "next/link";
import { ArrowLeft, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { VoyageForm } from "@/components/voyages/VoyageForm";
import { buildOwnerFilter, type AuthUser } from "@/lib/permissions";

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

export default async function NewVoyagePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { orgSlug } = await params;
  const { from } = await searchParams;
  const user = await requireUser() as AuthUser;
  const vessels = await getVessels(user);

  // If no vessels, show the vessel-needed message
  if (!vessels || vessels.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/${orgSlug}/voyages`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New Voyage</h1>
            <p className="text-muted-foreground mt-1">
              Calculate voyage profitability and get freight recommendations
            </p>
          </div>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Ship className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No vessels available</h3>
            <p className="text-muted-foreground text-center mb-4">
              You need to add a vessel before creating a voyage.
            </p>
            <Link href={`/${orgSlug}/vessels/new`}>
              <Button>Add First Vessel</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${orgSlug}/voyages`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Voyage</h1>
          <p className="text-muted-foreground mt-1">
            Enter voyage parameters to calculate profitability
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>Voyage Details</CardTitle>
          <CardDescription>
            {from === "optimizer"
              ? "Pre-filled from Smart Voyage Optimizer — complete the remaining fields"
              : "Fill in port details, then use Route Intelligence to auto-calculate distances or enter them manually"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoyageForm vessels={vessels as any} />
        </CardContent>
      </Card>
    </div>
  );
}
