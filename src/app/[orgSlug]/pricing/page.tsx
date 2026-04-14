import { Metadata } from "next";
import { PricingTable } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing | Solid Voyage",
  description: "Choose a plan that fits your maritime operations",
};

export default function PricingPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          Start Your 3-Day Free Trial
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Upgrade Your Organization
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Free accounts get 3 route calculations per day. Upgrade to{" "}
          <span className="font-semibold text-foreground">Solid Starter</span>{" "}
          for unlimited access to the Route Planner and all premium features.
        </p>
      </div>

      {/* Clerk Pricing Table */}
      <div className="rounded-lg border bg-card p-6">
        <PricingTable
          for="organization"
          newSubscriptionRedirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}
