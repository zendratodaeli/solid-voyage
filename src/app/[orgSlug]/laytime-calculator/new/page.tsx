import { LaytimeCalculator } from "@/components/laytime/LaytimeCalculator";

export const metadata = {
  title: "New Laytime Calculation | Solid Voyage",
  description: "Create a new laytime & demurrage calculation",
};

export default function NewLaytimePage() {
  return <LaytimeCalculator />;
}
