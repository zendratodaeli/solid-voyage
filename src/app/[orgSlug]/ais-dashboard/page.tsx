import { requireUser } from "@/lib/clerk";
import { AisDashboard } from "@/components/ais/AisDashboard";
import type { AuthUser } from "@/lib/permissions";

export const metadata = {
  title: "AIS Tracker | Solid Voyage",
  description: "Live AIS vessel tracking dashboard with fleet monitoring",
};

export default async function AisDashboardPage() {
  const user = (await requireUser()) as AuthUser;
  const orgId = user.activeOrgId ?? "";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AIS Tracker</h1>
        <p className="text-muted-foreground mt-1">
          Live vessel tracking, fleet monitoring, and destination search powered by NavAPI
        </p>
      </div>

      <AisDashboard orgId={orgId} />
    </div>
  );
}

