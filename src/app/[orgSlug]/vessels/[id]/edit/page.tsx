import Link from "next/link";
import { ArrowLeft, Anchor } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { VesselForm } from "@/components/vessels/VesselForm";
import { AuditHistory } from "@/components/shared/AuditHistory";
import { buildOwnerFilter, type AuthUser } from "@/lib/permissions";
import { VesselReportButton } from "./VesselReportButton";

async function getVessel(id: string, user: AuthUser) {
  const vessel = await prisma.vessel.findFirst({
    where: { id, ...buildOwnerFilter(user) },
  });
  return vessel;
}

export default async function EditVesselPage({
  params,
}: {
  params: Promise<{ id: string; orgSlug: string }>;
}) {
  const { id, orgSlug } = await params;
  const user = await requireUser() as AuthUser;
  const vessel = await getVessel(id, user);

  if (!vessel) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${orgSlug}/vessels`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Edit Vessel</h1>
          <p className="text-muted-foreground mt-1">
            Update vessel specifications
          </p>
        </div>
        <VesselReportButton vesselId={id} />
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Anchor className="h-5 w-5" />
            {vessel.name}
          </CardTitle>
          <CardDescription>
            Modify vessel details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VesselForm vessel={vessel as any} mode="edit" />
        </CardContent>
      </Card>

      {/* Audit Trail */}
      <AuditHistory entityType="vessel" entityId={vessel.id} />
    </div>
  );
}
