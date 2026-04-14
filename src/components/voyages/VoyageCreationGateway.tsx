"use client";

import Link from "next/link";
import {
  Zap,
  FileText,
  Check,
  Info,
  Sparkles,
  Route,
  Gauge,
  Calculator,
  ArrowRight,
  BarChart3,
  Ship,
  Compass,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VoyageCreationGatewayProps {
  orgSlug: string;
}

export function VoyageCreationGateway({ orgSlug }: VoyageCreationGatewayProps) {
  return (
    <div className="space-y-8">
      {/* Header visual treatment */}
      <div className="text-center space-y-3 pt-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium tracking-wide uppercase">
          <Compass className="h-3.5 w-3.5" />
          Choose Your Workflow
        </div>
      </div>

      {/* Gateway cards */}
      <div className="grid gap-6 lg:gap-8 md:grid-cols-2 max-w-4xl mx-auto">
        
        {/* ═══════════ Smart Voyage Card ═══════════ */}
        <Link href={`/${orgSlug}/route-planner?mode=create-voyage`} className="block group">
          <div className="relative h-full rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1">
            {/* Gradient border only — no fill */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/60 via-purple-500/40 to-indigo-600/60 p-[1.5px]" />
            
            {/* Card inner — dark background for readable text */}
            <div className="relative h-full rounded-2xl bg-[hsl(var(--card))] m-[1.5px] p-7 flex flex-col">
              
              {/* Very subtle glow on hover */}
              <div className="absolute inset-0 rounded-2xl bg-violet-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              {/* Recommended badge */}
              <div className="absolute top-4 right-4 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-violet-500/25 to-purple-500/25 text-violet-300 border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  Recommended
                </span>
              </div>

              {/* Icon */}
              <div className="relative mb-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/20 flex items-center justify-center transition-all duration-500 group-hover:shadow-[0_0_30px_rgba(139,92,246,0.2)] group-hover:scale-110">
                  <Zap className="h-7 w-7 text-violet-400" />
                </div>
              </div>

              {/* Title + subtitle */}
              <h3 className="text-xl font-bold tracking-tight mb-1 relative">Smart Voyage</h3>
              <p className="text-xs text-violet-400/80 font-medium tracking-wide uppercase mb-4 relative">
                AI-Powered Route Optimization
              </p>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed mb-6 relative">
                Plan your route on an interactive map, auto-calculate distances, and discover the 
                optimal speed & fuel configuration for maximum profitability.
              </p>

              {/* Features */}
              <div className="space-y-3 mb-7 relative flex-1">
                <FeatureItem
                  icon={<Route className="h-4 w-4" />}
                  text="Auto-calculate distances via NavAPI"
                  accent="violet"
                />
                <FeatureItem
                  icon={<Gauge className="h-4 w-4" />}
                  text="Optimize speed, fuel & eco mode"
                  accent="violet"
                />
                <FeatureItem
                  icon={<BarChart3 className="h-4 w-4" />}
                  text="Compare P&L across configurations"
                  accent="violet"
                />
                <FeatureItem
                  icon={<Ship className="h-4 w-4" />}
                  text="One-click voyage creation"
                  accent="violet"
                />
              </div>

              {/* CTA */}
              <div className="relative">
                <div className="flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold text-sm transition-all duration-300 group-hover:shadow-[0_4px_25px_rgba(139,92,246,0.35)] group-hover:from-violet-500 group-hover:to-purple-500">
                  <Zap className="h-4 w-4" />
                  Start Planning
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </div>
            </div>
          </div>
        </Link>

        {/* ═══════════ Manual Entry Card ═══════════ */}
        <Link href={`/${orgSlug}/voyages/new?mode=manual`} className="block group">
          <div className="relative h-full rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1">
            {/* Subtle border */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-500/30 via-blue-500/20 to-slate-500/30 p-[1px]">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>

            {/* Card inner */}
            <div className="relative h-full rounded-2xl bg-[hsl(var(--card))] m-[1px] p-7 flex flex-col">

              {/* Glow effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/3 via-transparent to-slate-500/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Icon */}
              <div className="relative mb-5 mt-7">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/15 to-slate-500/15 border border-blue-500/15 flex items-center justify-center transition-all duration-500 group-hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] group-hover:scale-110">
                  <FileText className="h-7 w-7 text-blue-400" />
                </div>
              </div>

              {/* Title + subtitle */}
              <h3 className="text-xl font-bold tracking-tight mb-1 relative">Manual Entry</h3>
              <p className="text-xs text-blue-400/80 font-medium tracking-wide uppercase mb-4 relative">
                Traditional Form-Based Voyage
              </p>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed mb-6 relative">
                Enter distances, cargo details, and costs by hand. Best for quick estimates when 
                you already know the route numbers.
              </p>

              {/* Features */}
              <div className="space-y-3 mb-7 relative flex-1">
                <FeatureItem
                  icon={<Check className="h-4 w-4" />}
                  text="Full control over all inputs"
                  accent="blue"
                />
                <FeatureItem
                  icon={<Check className="h-4 w-4" />}
                  text="No route planning required"
                  accent="blue"
                />
                <FeatureItem
                  icon={<Check className="h-4 w-4" />}
                  text="Quick and straightforward"
                  accent="blue"
                />
                <FeatureItem
                  icon={<Calculator className="h-4 w-4" />}
                  text="Same powerful P&L engine"
                  accent="blue"
                />
              </div>

              {/* CTA */}
              <div className="relative">
                <div className="flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl border border-border/60 text-muted-foreground font-semibold text-sm transition-all duration-300 group-hover:border-blue-500/40 group-hover:text-blue-300 group-hover:bg-blue-500/5 group-hover:shadow-[0_4px_25px_rgba(59,130,246,0.1)]">
                  <FileText className="h-4 w-4" />
                  Manual Entry
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Bottom hint */}
      <TooltipProvider>
        <div className="flex items-center justify-center pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors duration-300">
                <Info className="h-3.5 w-3.5" />
                What&apos;s the difference?
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm p-4 rounded-xl">
              <div className="space-y-2.5">
                <p className="text-xs leading-relaxed">
                  <span className="font-semibold text-violet-400">Smart Voyage</span> uses the Route Planner 
                  to calculate distances via NavAPI, then optimizes speed and fuel to find 
                  the most profitable configuration. Results are pre-filled into the voyage form.
                </p>
                <p className="text-xs leading-relaxed">
                  <span className="font-semibold text-blue-400">Manual Entry</span> lets you enter all 
                  distances, speeds and costs by hand — great when you already have the numbers 
                  or just need a quick estimate.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

function FeatureItem({
  icon,
  text,
  accent,
}: {
  icon: React.ReactNode;
  text: string;
  accent: "violet" | "blue";
}) {
  const accentColors = {
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/15",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/15",
  };
  
  return (
    <div className="flex items-center gap-3">
      <div className={`shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center ${accentColors[accent]}`}>
        {icon}
      </div>
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}
