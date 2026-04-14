import { requireUser } from "@/lib/clerk";
import { OperationsMap } from "@/components/operations-map/OperationsMap";
import type { AuthUser } from "@/lib/permissions";

export const metadata = {
  title: "Operations Map | Solid Voyage",
  description: "Unified spatial workspace — AIS tracking, route planning, and maritime weather in one map",
};

export default async function OperationsMapPage() {
  const user = (await requireUser()) as AuthUser;
  const orgId = user.activeOrgId ?? "";

  return <OperationsMap orgId={orgId} />;
}
