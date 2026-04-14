import { requireUser } from "@/lib/clerk";
import { FleetOperations } from "@/components/fleet-operations/FleetOperations";
import type { AuthUser } from "@/lib/permissions";

export const metadata = {
  title: "Fleet Operations | Solid Voyage",
  description: "Unified fleet command center — deployment timeline and cargo pipeline in one view",
};

export default async function FleetOperationsPage() {
  await requireUser() as AuthUser;

  return <FleetOperations />;
}
