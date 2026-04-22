import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import LiveTrackingMonitorClient from "./LiveTrackingMonitorClient";

export const metadata: Metadata = {
  title: "Live Voyage Tracking | Solid Voyage",
  description: "Real-time vessel tracking with route adherence monitoring, weather analysis, and nearby traffic radar.",
};

export default async function LiveTrackingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; sessionId: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const { sessionId } = await params;

  // Fetch session with data
  const session = await prisma.liveVoyageSession.findFirst({
    where: { id: sessionId, organizationId: orgId },
    include: {
      trackPoints: {
        orderBy: { timestamp: "asc" },
      },
      nearbyObjects: {
        orderBy: { timestamp: "desc" },
        take: 100,
      },
    },
  });

  if (!session) {
    notFound();
  }

  return (
    <LiveTrackingMonitorClient
      session={JSON.parse(JSON.stringify(session))}
    />
  );
}
