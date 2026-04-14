import Link from "next/link";
import { ArrowLeft, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/clerk";
import { VesselForm } from "@/components/vessels/VesselForm";

export default async function NewVesselPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireUser();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${orgSlug}/vessels`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add Vessel</h1>
          <p className="text-muted-foreground mt-1">
            Register a new vessel for voyage calculations
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Anchor className="h-5 w-5" />
            Vessel Specifications
          </CardTitle>
          <CardDescription>
            Enter vessel details for accurate voyage calculations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VesselForm />
        </CardContent>
      </Card>
    </div>
  );
}
