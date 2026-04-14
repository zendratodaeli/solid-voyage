import { Metadata } from "next";
import { NavApiMultiRoutePlanner } from "@/components/route-planner/NavApiMultiRoutePlanner";

export const metadata: Metadata = {
  title: "Route Planner | Solid Voyage",
  description: "Plan multi-port voyages with ECA zone detection and distance calculations",
};

export default function RoutePlannerPage() {
  return <NavApiMultiRoutePlanner className="h-full w-full" />;
}
