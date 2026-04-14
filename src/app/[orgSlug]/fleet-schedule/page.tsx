import { requireUser } from "@/lib/clerk";
import { FleetSchedule } from "@/components/fleet-schedule/FleetSchedule";
import type { AuthUser } from "@/lib/permissions";

export const metadata = {
  title: "Fleet Schedule | Solid Voyage",
  description: "Fleet deployment timeline — visualize vessel availability, voyage schedules, and open positions",
};

export default async function FleetSchedulePage() {
  // Auth gate
  await requireUser() as AuthUser;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fleet Schedule</h1>
        <p className="text-muted-foreground mt-1">
          Fleet deployment timeline — vessel availability, voyage schedules, and open positions
        </p>
      </div>

      <FleetSchedule />
    </div>
  );
}
