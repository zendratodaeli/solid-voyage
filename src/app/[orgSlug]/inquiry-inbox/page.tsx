import { requireUser } from "@/lib/clerk";
import type { AuthUser } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { InquiryInbox } from "@/components/inquiry-inbox/InquiryInbox";
import { buildOwnerFilter } from "@/lib/permissions";

export const metadata = {
  title: "Inquiry Inbox | Solid Voyage",
  description: "Inbound email triage — classify, parse, and convert cargo offers into inquiries",
};

async function getVessels(user: AuthUser) {
  return prisma.vessel.findMany({
    where: buildOwnerFilter(user),
    select: {
      id: true,
      name: true,
      vesselType: true,
      dwt: true,
      ballastFuelType: true,
      ladenFuelType: true,
      portFuelType: true,
      fuelTypes: true,
      mmsiNumber: true,
      ladenSpeed: true,
      ballastSpeed: true,
      ladenConsumption: true,
      ballastConsumption: true,
      summerDraft: true,
    },
    orderBy: { name: "asc" },
  });
}

export default async function InquiryInboxPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const user = (await requireUser()) as AuthUser;
  const vessels = await getVessels(user);

  return <InquiryInbox orgSlug={orgSlug} vessels={vessels as any} />;
}
