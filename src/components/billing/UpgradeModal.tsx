"use client";

/**
 * Upgrade Modal
 * 
 * Triggered when a free org hits the daily calculation limit.
 * Shows Clerk's PricingTable so users can upgrade immediately.
 */

import { PricingTable } from "@clerk/nextjs";
import { X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 bg-background rounded-xl border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-20"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Header */}
        <div className="p-6 pb-2 text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium">
            <Zap className="h-4 w-4" />
            Daily Limit Reached
          </div>
          <h2 className="text-2xl font-bold">
            Upgrade for Unlimited Access
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            You&apos;ve used all 3 free route calculations for today.
            Start a 3-day free trial of <span className="font-semibold text-foreground">Solid Starter</span> for
            unlimited calculations and premium features.
          </p>
        </div>

        {/* Pricing Table */}
        <div className="p-6 pt-2">
          <PricingTable
            for="organization"
            newSubscriptionRedirectUrl="/route-planner"
          />
        </div>
      </div>
    </div>
  );
}
