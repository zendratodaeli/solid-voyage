"use client";

import {
  Ship,
  Anchor,
  MapPin,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Gauge,
  Navigation,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Fuel,
  Scale,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Rich Renderers ──
import { SingleVesselCard, FleetMapCard } from "./renderers/VesselTrackingCard";
import { WeatherResultCard } from "./renderers/WeatherCard";
import { RouteMapCard } from "./renderers/RouteMapCard";
import { VoyageDashboardCard } from "./renderers/VoyageDashboardCard";
import { LaytimeDashboardCard } from "./renderers/LaytimeCard";
import { ScenarioDashboardCard } from "./renderers/ScenarioCard";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface ToolInvocation {
  toolName: string;
  args: Record<string, any>;
  result: any;
  state: "call" | "result" | "partial-call";
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatUSD(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function KPI({
  label,
  value,
  icon: Icon,
  color = "text-muted-foreground",
}: {
  label: string;
  value: string;
  icon?: any;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />}
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold ml-auto">{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 mt-3 first:mt-0">
      {children}
    </h4>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RENDERERS
// ═══════════════════════════════════════════════════════════════════

function VoyageResultCard({ result }: { result: any }) {
  if (result.error) return <ErrorCard error={result.error} />;
  const prof = result.profitability;
  const dur = result.duration;
  const pnl = prof?.voyagePnl ?? 0;
  const isProfitable = pnl >= 0;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <Ship className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-semibold">{result.vesselName}</span>
        {result.vesselDwt && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatNumber(result.vesselDwt)} DWT
          </span>
        )}
      </div>

      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg mb-2",
          isProfitable
            ? "bg-emerald-500/10 border border-emerald-500/20"
            : "bg-red-500/10 border border-red-500/20"
        )}
      >
        {isProfitable ? (
          <TrendingUp className="h-4 w-4 text-emerald-400" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-400" />
        )}
        <span className="text-sm font-bold">
          P&L: {formatUSD(pnl)}
        </span>
        {prof?.tce != null && (
          <span className="text-xs text-muted-foreground ml-auto">
            TCE: {formatUSD(prof.tce)}/day
          </span>
        )}
      </div>

      <SectionTitle>Duration</SectionTitle>
      <KPI label="Sea Days" value={formatNumber(dur?.totalSeaDays, 1)} icon={Navigation} color="text-blue-400" />
      <KPI label="Port Days" value={formatNumber(dur?.totalPortDays, 1)} icon={Anchor} color="text-amber-400" />
      <KPI label="Total Voyage" value={`${formatNumber(dur?.totalVoyageDays, 1)} days`} icon={Clock} color="text-cyan-400" />

      <SectionTitle>Costs</SectionTitle>
      <KPI label="Bunker Cost" value={formatUSD(result.costs?.bunkerCost)} icon={Fuel} color="text-orange-400" />
      <KPI label="Total Voyage Cost" value={formatUSD(result.costs?.totalVoyageCost)} icon={DollarSign} color="text-red-400" />
      
      {prof?.breakEvenFreight != null && (
        <KPI label="Break-Even Freight" value={`${formatUSD(prof.breakEvenFreight)}/MT`} icon={Scale} color="text-purple-400" />
      )}
    </div>
  );
}

function VesselListCard({ result }: { result: any }) {
  if (result.error) return <ErrorCard error={result.error} />;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Anchor className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-semibold">{result.count} Vessel{result.count !== 1 ? "s" : ""} Found</span>
      </div>
      <div className="space-y-1.5">
        {result.vessels?.slice(0, 8).map((v: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/30 last:border-0">
            <Ship className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{v.name}</span>
            {v.dwt && <span className="text-muted-foreground ml-auto">{formatNumber(v.dwt)} DWT</span>}
            {v.type && <span className="text-[10px] text-muted-foreground/60">{v.type}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FleetPositionsCard({ result }: { result: any }) {
  if (result.error) return <ErrorCard error={result.error} />;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-semibold">{result.vesselCount ?? result.positions?.length ?? 0} Fleet Positions</span>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {(result.positions || result.data || []).slice(0, 10).map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/30 last:border-0">
            <Navigation className="h-3 w-3 text-emerald-400" />
            <span className="font-medium">{p.shipName}</span>
            <span className="text-muted-foreground ml-auto">
              {p.speed != null ? `${p.speed} kn` : "—"}
            </span>
            {p.destination && (
              <span className="text-[10px] text-muted-foreground/60">→ {p.destination}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteResultCard({ result }: { result: any }) {
  if (result.error) return <ErrorCard error={result.error} />;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-semibold">Route Calculated</span>
      </div>
      <KPI label="Total Distance" value={`${formatNumber(result.totalDistanceNm)} NM`} icon={Navigation} color="text-blue-400" />
      <KPI label="SECA Distance" value={`${formatNumber(result.secaDistanceNm)} NM`} icon={AlertTriangle} color="text-amber-400" />
      {result.canalDistanceNm > 0 && (
        <KPI label="Canal Distance" value={`${formatNumber(result.canalDistanceNm)} NM`} icon={MapPin} color="text-purple-400" />
      )}
      {result.draftWarning && (
        <div className="flex items-center gap-2 mt-2 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
          <AlertTriangle className="h-3.5 w-3.5" />
          {result.draftWarning}
        </div>
      )}
    </div>
  );
}

function AnalyticsCard({ result }: { result: any }) {
  if (result.error) return <ErrorCard error={result.error} />;
  const kpis = result.kpis;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-semibold">Fleet Analytics</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <KPI label="Avg TCE" value={`${formatUSD(kpis?.avgTce)}/d`} icon={TrendingUp} color="text-emerald-400" />
        <KPI label="Total P&L" value={formatUSD(kpis?.totalPnl)} icon={DollarSign} color="text-blue-400" />
        <KPI label="Total Voyages" value={formatNumber(kpis?.totalVoyages)} icon={Ship} color="text-purple-400" />
        <KPI label="Utilization" value={`${formatNumber(kpis?.fleetUtilization, 1)}%`} icon={Gauge} color="text-amber-400" />
      </div>
      {result.insights?.length > 0 && (
        <>
          <SectionTitle>AI Insights</SectionTitle>
          <div className="space-y-1">
            {result.insights.slice(0, 3).map((insight: any, i: number) => (
              <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                <span>{typeof insight === "string" ? insight : insight.message || insight.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LaytimeResultCard({ result }: { result: any }) {
  if (result.error) return <ErrorCard error={result.error} />;
  const isDemurrage = result.result === "DEMURRAGE";
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-orange-400" />
        <span className="text-sm font-semibold">Laytime Calculation</span>
      </div>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg mb-2",
          isDemurrage
            ? "bg-red-500/10 border border-red-500/20"
            : "bg-emerald-500/10 border border-emerald-500/20"
        )}
      >
        {isDemurrage ? (
          <TrendingDown className="h-4 w-4 text-red-400" />
        ) : (
          <TrendingUp className="h-4 w-4 text-emerald-400" />
        )}
        <span className="text-sm font-bold">
          {isDemurrage ? "Demurrage" : "Despatch"}:{" "}
          {formatUSD(isDemurrage ? result.demurrageAmount : result.despatchAmount)}
        </span>
      </div>
      <KPI label="Allowed" value={result.allowedLaytime || `${formatNumber(result.allowedHours, 1)}h`} icon={Clock} color="text-blue-400" />
      <KPI label="Used" value={result.timeUsed || `${formatNumber(result.countedHours, 1)}h`} icon={Clock} color="text-amber-400" />
      <KPI label="Excluded" value={result.timeExcluded || `${formatNumber(result.excludedHours, 1)}h`} icon={Clock} color="text-muted-foreground" />
    </div>
  );
}

function PortSearchCard({ result }: { result: any }) {
  if (result.error) return <ErrorCard error={result.error} />;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-semibold">{result.count} Port{result.count !== 1 ? "s" : ""} Found</span>
      </div>
      <div className="space-y-1.5">
        {result.ports?.slice(0, 5).map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/30 last:border-0">
            <MapPin className="h-3 w-3 text-purple-400" />
            <span className="font-medium">{p.name}</span>
            {p.portCode && <span className="text-muted-foreground ml-auto">{p.portCode}</span>}
            {p.country && <span className="text-[10px] text-muted-foreground/60">{p.country}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function OptimizerCard({ result }: { result: any }) {
  if (result.error) return <ErrorCard error={result.error} />;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Gauge className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-semibold">Speed Optimization — {result.vesselName}</span>
      </div>
      <div className="space-y-1.5">
        {result.top5?.slice(0, 5).map((r: any, i: number) => (
          <div key={i} className={cn(
            "flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg",
            i === 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "border-b border-border/30 last:border-0"
          )}>
            <span className="font-bold text-muted-foreground w-4">#{r.rank}</span>
            <span className="font-medium">{r.speed}</span>
            <span className="text-muted-foreground">{r.mode}</span>
            <span className="ml-auto font-semibold">{formatUSD(r.tce)}/d</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericResultCard({ toolName, result }: { toolName: string; result: any }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-semibold capitalize">
          {toolName.replace(/([A-Z])/g, " $1").trim()}
        </span>
      </div>
      <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap overflow-hidden max-h-40">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function ErrorCard({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 text-red-400" />
      <span className="text-xs text-red-400">{error}</span>
    </div>
  );
}

function ToolCallPending({ toolName }: { toolName: string }) {
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex items-center gap-2 animate-pulse">
      <Gauge className="h-4 w-4 text-blue-400 animate-spin" />
      <span className="text-xs text-blue-400">
        Running {toolName.replace(/([A-Z])/g, " $1").trim()}...
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN RENDERER
// ═══════════════════════════════════════════════════════════════════

const TOOL_RENDERERS: Record<string, (result: any) => React.ReactNode> = {
  // ── AIS Tracking (Rich maps) ──
  searchVesselByName: (r) => <SingleVesselCard result={r} />,
  getVesselPosition: (r) => <SingleVesselCard result={r} />,
  getFleetPositions: (r) => <FleetMapCard result={r} />,
  findVesselsNearPort: (r) => <FleetMapCard result={{ positions: r.vessels, vesselCount: r.vesselCount }} />,
  findVesselsByDestination: (r) => <FleetMapCard result={{ positions: r.vessels, vesselCount: r.vesselCount }} />,
  // ── Voyage (Rich dashboard) ──
  calculateVoyageProfitability: (r) => <VoyageDashboardCard result={r} />,
  findVessels: (r) => <VesselListCard result={r} />,
  getVesselDetails: (r) => <VesselListCard result={{ count: 1, vessels: [r] }} />,
  // ── Route (Rich map) ──
  calculateRoute: (r) => <RouteMapCard result={r} />,
  searchPort: (r) => <PortSearchCard result={r} />,
  // ── Analytics ──
  checkEUETSApplicability: (r) => <GenericResultCard toolName="EU ETS Check" result={r} />,
  getFleetAnalytics: (r) => <AnalyticsCard result={r} />,
  getVoyageHistory: (r) => <GenericResultCard toolName="Voyage History" result={r} />,
  // ── Laytime (Rich dashboard) ──
  calculateLaytimeDemurrage: (r) => <LaytimeDashboardCard result={r} />,
  getLaytimeHistory: (r) => <GenericResultCard toolName="Laytime History" result={r} />,
  // ── Optimizer / Scenarios (Rich dashboard) ──
  optimizeVoyageSpeed: (r) => <OptimizerCard result={r} />,
  analyzeBunkerSensitivity: (r) => <GenericResultCard toolName="Bunker Sensitivity" result={r} />,
  generateScenarios: (r) => <ScenarioDashboardCard result={r} />,
  // ── Other ──
  extractCargoDetails: (r) => <GenericResultCard toolName="Cargo Extraction" result={r} />,
  // ── Weather (Rich dashboard) ──
  getWeatherAtPort: (r) => <WeatherResultCard result={r} />,
  getWeatherAtLocation: (r) => <WeatherResultCard result={r} />,
};

// Renderers that also need access to the tool call args (for extra context)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ARGS_AWARE_RENDERERS: Record<string, (result: any, args: any) => any> = {
  calculateRoute: (r, args) => (
    <RouteMapCard
      result={{
        ...r,
        // Merge port names from args if not in result (AI may omit)
        originPort: r.originPort || args?.startPortName || args?.startPortCode || r.from || "",
        destinationPort: r.destinationPort || args?.endPortName || args?.endPortCode || r.to || "",
        originCode: r.originCode || args?.startPortCode || null,
        destinationCode: r.destinationCode || args?.endPortCode || null,
      }}
    />
  ),
  calculateMultiLegRoute: (r, args) => (
    <RouteMapCard
      result={{
        ...r,
        // Multi-leg: use routeLabel for subtitle (e.g., "Singapore → Tanjung Priok → Hamburg")
        originPort: r.routeLabel || r.originPort || "",
        destinationPort: "", // routeLabel already contains the full chain
        originCode: r.originCode || null,
        destinationCode: r.destinationCode || null,
      }}
    />
  ),
};

export function ToolResultRenderer({ part }: { part: any }) {
  // SDK v6: toolName is directly on the part, or extract from type "tool-{name}"
  const toolName = part.toolName || part.type?.replace(/^tool-/, "") || "";
  const state = part.state || "output-available";

  // Pending states
  if (state === "call" || state === "partial-call" || state === "streaming") {
    return <ToolCallPending toolName={toolName} />;
  }

  // Error state
  if (state === "output-error") {
    return <ErrorCard error={part.errorText || "Tool execution failed"} />;
  }

  // SDK v6 uses "output", v5 used "result"
  const result = part.output ?? part.result ?? part.toolInvocation?.result;
  if (!result) return null;

  // Args-aware renderers get access to tool call arguments for extra context
  const argsRenderer = ARGS_AWARE_RENDERERS[toolName];
  if (argsRenderer) {
    const args = part.args ?? part.toolInvocation?.args ?? {};
    return <>{argsRenderer(result, args)}</>;
  }

  const renderer = TOOL_RENDERERS[toolName];
  if (renderer) return <>{renderer(result)}</>;

  return <GenericResultCard toolName={toolName} result={result} />;
}

export default ToolResultRenderer;
