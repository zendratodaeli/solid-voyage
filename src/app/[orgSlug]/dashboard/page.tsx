import { requireUser } from "@/lib/clerk";
import prisma from "@/lib/prisma";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { buildOwnerFilter, buildVoyageListFilter, type AuthUser } from "@/lib/permissions";

async function getDashboardData(user: AuthUser) {
  const vesselFilter = buildOwnerFilter(user);
  const voyageFilter = await buildVoyageListFilter(user);
  
  const [vessels, voyages, recentVoyages] = await Promise.all([
    prisma.vessel.count({ where: vesselFilter }),
    prisma.voyage.count({ where: voyageFilter }),
    prisma.voyage.findMany({
      where: voyageFilter,
      include: {
        vessel: true,
        user: true,
        calculations: true,
        recommendations: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
  ]);

  const pendingRecommendations = recentVoyages.filter(
    (v: { status: string }) => v.status === "RECOMMENDED" || v.status === "DRAFT"
  ).length;

  return {
    vesselCount: vessels,
    voyageCount: voyages,
    pendingRecommendations,
    recentVoyages,
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const user = await requireUser() as AuthUser;
  const data = await getDashboardData(user);

  return (
    <DashboardContent
      data={data}
      userName={user.name || "Captain"}
      userId={user.id}
      orgSlug={orgSlug}
      isAdmin={user.orgRole === "org:admin"}
    />
  );
}
