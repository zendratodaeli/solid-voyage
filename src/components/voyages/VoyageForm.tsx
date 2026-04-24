"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import type { Voyage, Vessel as PrismaVessel } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Loader2, AlertCircle, MapPin, Plus, X, Package, Anchor, Clock, DollarSign, Navigation, Truck, Check, Upload, FileText, Sparkles, ClipboardPaste, CalendarClock, Weight } from "lucide-react";
import { FREIGHT_RATE_UNIT_LABELS } from "@/types";
import type { FreightRateUnit } from "@/types";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { isCountryEuEts } from "@/data/countries";
import { Leaf } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseSmartCoordinates } from "./VoyageRoutePanel";
import { useVoyageAutoRoute, type AutoRouteResult, type RouteAlternative } from "@/hooks/useVoyageAutoRoute";
import { VoyageRouteStatus } from "./VoyageRouteStatus";
import { VoyageAdvisorDialog } from "./VoyageAdvisorDialog";
import { NavApiPortSearch, type NavApiPort } from "@/components/route-planner/NavApiPortSearch";
import { getLastPosition } from "@/actions/ais-actions";
import { createCargoInquiryFromVoyageForm } from "@/actions/cargo-inquiry-actions";

type Vessel = {
  id: string;
  name: string;
  vesselType: string;
  dwt: number;
  // Fuel type defaults
  ballastFuelType?: string;
  ladenFuelType?: string;
  portFuelType?: string;
  // Fuel capabilities (all fuel types this vessel can burn)
  fuelTypes?: string[];
  // AIS tracking
  mmsiNumber?: string | null;
  // Speed profiles from vessel
  ladenSpeed: number;
  ballastSpeed: number;
  ladenConsumption?: number | null;
  ballastConsumption?: number | null;
  // Draft
  summerDraft?: number | null;
};

type FuelPriceEntry = {
  fuelType: string;
  price: string;
};

type NamedCostItem = {
  name: string;
  amount: string;
};

type CargoParcel = {
  name: string;
  quantity: string;
  loadPort: string;
  dischargePort: string;
  freightRate: string;
};

interface VoyageFormProps {
  vessels: Vessel[];
  /** Pass an existing voyage to enable edit mode */
  voyage?: Voyage & { vessel: PrismaVessel };
  /**
   * Form mode:
   * - "voyage" (default) — creates a Voyage record
   * - "edit" — updates an existing Voyage
   * - "inquiry" — saves to CargoInquiry with pre-calculated voyageEstimate
   */
  mode?: "inquiry" | "voyage" | "edit";
  /** Callback when inquiry is saved (inquiry mode only) */
  onInquirySaved?: () => void;
  /** Callback to close the form (inquiry mode — slide-over) */
  onClose?: () => void;
}

export function VoyageForm({ vessels, voyage, mode: explicitMode, onInquirySaved, onClose }: VoyageFormProps) {
  const resolvedMode = explicitMode || (voyage ? "edit" : "voyage");
  const isEditMode = resolvedMode === "edit";
  const isInquiryMode = resolvedMode === "inquiry";

  // Extract voyageLegs JSON from existing voyage (for edit mode pre-fill)
  const existingLegs = useMemo(() => {
    if (!voyage) return null;
    const raw = voyage.voyageLegs as Record<string, unknown> | null;
    if (!raw) return null;
    return {
      loadPorts: (raw.loadPorts as string[]) || [],
      dischargePorts: (raw.dischargePorts as string[]) || [],
      cargoParcels: (raw.cargoParcels as { name: string; quantity: number; loadPort: string; dischargePort: string; freightRate: number }[]) || [],
      portDetails: raw.portDetails as { load?: { port: string; days: number; waitingDays: number; idleDays: number; pdaCost: number; useCrane: boolean }[]; discharge?: { port: string; days: number; waitingDays: number; idleDays: number; pdaCost: number; useCrane: boolean }[] } | undefined,
      additionalCosts: (raw.additionalCosts as { name: string; amount: number }[]) || [],
    };
  }, [voyage]);
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const orgSlug = params.orgSlug as string;
  const [isLoading, setIsLoading] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromOptimizer, setFromOptimizer] = useState(false);

  // ── Auto-Route Intelligence State ─────────────────────────────
  const [autoRouteResult, setAutoRouteResult] = useState<AutoRouteResult | null>(null);
  const [openPortNavData, setOpenPortNavData] = useState<NavApiPort | null>(null);

  // ── AI Voyage Advisor State ───────────────────────────────
  const [showAdvisorDialog, setShowAdvisorDialog] = useState(false);
  const [advisorSummary, setAdvisorSummary] = useState<string | null>(null);
  const [isAdvisorLoading, setIsAdvisorLoading] = useState(false);
  const [advisorVoyageUrl, setAdvisorVoyageUrl] = useState<string>("");

  // ── ETD & DWT (moved from VoyageRoutePanel to main form) ──────
  const [etd, setEtd] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [dwt, setDwt] = useState("");

  // ── NGA Port Metadata (enrichment from DB) ──────────────────
  interface PortMetadata { harborSize?: string; waterBody?: string; region?: string; }
  const [loadPortMeta, setLoadPortMeta] = useState<(PortMetadata | null)[]>([]);
  const [dischargePortMeta, setDischargePortMeta] = useState<(PortMetadata | null)[]>([]);

  // ── NavAPI Port Selections (for autocomplete) ──────────────
  const [loadPortNavData, setLoadPortNavData] = useState<(NavApiPort | null)[]>([]);
  const [dischargePortNavData, setDischargePortNavData] = useState<(NavApiPort | null)[]>([]);

  const [formData, setFormData] = useState(() => ({
    vesselId: voyage?.vesselId || "",
    openPort: "",
    loadPortDays: "2",
    dischargePortDays: "2",
    waitingDays: voyage?.waitingDays?.toString() || "0",
    idleDays: voyage?.idleDays?.toString() || "0",
    useCrane: voyage?.useCrane ?? false,
    brokeragePercent: voyage?.brokeragePercent?.toString() || "1.25",
    commissionPercent: voyage?.commissionPercent?.toString() || "3.75",
    additionalCosts: voyage?.additionalCosts?.toString() || "0",
    pdaCosts: (voyage as Record<string, unknown>)?.pdaCosts?.toString() || "0",
    lubOilCosts: (voyage as Record<string, unknown>)?.lubOilCosts?.toString() || "0",
    canalTolls: voyage?.canalTolls?.toString() || "0",
    // Fuel type overrides (from vessel defaults or existing voyage)
    ballastFuelType: (voyage?.ballastFuelType || "VLSFO") as string,
    ladenFuelType: (voyage?.ladenFuelType || "VLSFO") as string,
    portFuelType: (voyage?.portFuelType || "LSMGO") as string,
    // New fields
    cargoType: (voyage?.cargoType || "") as string,
    stowageFactor: ((voyage as Record<string, unknown>)?.stowageFactor?.toString() || "") as string,
    freightRateUnit: ((voyage as Record<string, unknown>)?.freightRateUnit || "PER_MT") as FreightRateUnit,
    useEcoSpeed: voyage?.useEcoSpeed ?? false,
    overrideLadenSpeed: ((voyage as Record<string, unknown>)?.overrideLadenSpeed?.toString() || "") as string,
    overrideBallastSpeed: ((voyage as Record<string, unknown>)?.overrideBallastSpeed?.toString() || "") as string,
    // Laycan
    laycanStart: voyage?.laycanStart ? new Date(voyage.laycanStart).toISOString().split("T")[0] : "",
    laycanEnd: voyage?.laycanEnd ? new Date(voyage.laycanEnd).toISOString().split("T")[0] : "",
  }));
  
  // Dynamic port arrays for multi-port voyages
  const [loadPorts, setLoadPorts] = useState<string[]>(() => {
    if (existingLegs?.loadPorts?.length) return existingLegs.loadPorts;
    if (voyage?.loadPort) return [voyage.loadPort];
    return [""];
  });
  const [dischargePorts, setDischargePorts] = useState<string[]>(() => {
    if (existingLegs?.dischargePorts?.length) return existingLegs.dischargePorts;
    if (voyage?.dischargePort) return [voyage.dischargePort];
    return [""];
  });

  // Country code arrays — one per load/discharge port
  const [loadPortCountries, setLoadPortCountries] = useState<string[]>(() => {
    if (voyage && (voyage as Record<string, unknown>).loadPortCountryCode) {
      return [(voyage as Record<string, unknown>).loadPortCountryCode as string];
    }
    return [""];
  });
  const [dischargePortCountries, setDischargePortCountries] = useState<string[]>(() => {
    if (voyage && (voyage as Record<string, unknown>).dischargePortCountryCode) {
      return [(voyage as Record<string, unknown>).dischargePortCountryCode as string];
    }
    return [""];
  });

  // Auto-compute EU ETS from country codes
  const euEtsStatus = useMemo(() => {
    const firstLoadCountry = loadPortCountries.find(c => c);
    const lastDischargeCountry = [...dischargePortCountries].reverse().find(c => c);
    if (!firstLoadCountry && !lastDischargeCountry) return { applicable: false, percentage: 0, reason: "" };
    const loadInEU = firstLoadCountry ? isCountryEuEts(firstLoadCountry) : false;
    const dischargeInEU = lastDischargeCountry ? isCountryEuEts(lastDischargeCountry) : false;
    if (loadInEU && dischargeInEU) return { applicable: true, percentage: 100, reason: "Both ports in EU/EEA — 100% of emissions taxable" };
    if (loadInEU || dischargeInEU) return { applicable: true, percentage: 50, reason: "One port in EU/EEA — 50% of emissions taxable" };
    return { applicable: false, percentage: 0, reason: "Neither port in EU/EEA — EU ETS does not apply" };
  }, [loadPortCountries, dischargePortCountries]);

  // Dynamic fuel price table - starts empty, populated when vessel is selected
  const [fuelPrices, setFuelPrices] = useState<FuelPriceEntry[]>(() => {
    if (!voyage) return [];
    const fps = voyage.fuelPrices as Record<string, number> | null;
    if (fps && Object.keys(fps).length > 0) {
      return Object.entries(fps).map(([fuelType, price]) => ({ fuelType, price: price.toString() }));
    }
    // Fallback: derive from vessel fuel consumption keys
    const fc = voyage.vessel?.fuelConsumption as Record<string, unknown> | null;
    if (fc) {
      return Object.keys(fc).map(fuelType => ({ fuelType, price: fps?.[fuelType]?.toString() || "" }));
    }
    return [{ fuelType: "VLSFO", price: voyage.bunkerPriceUsd?.toString() || "" }];
  });

  // Generate full voyage legs including positioning/ballast leg
  const legs = (() => {
    const openPort = formData.openPort?.trim();
    const filledLoad = loadPorts.filter(p => p.trim());
    const filledDischarge = dischargePorts.filter(p => p.trim());
    const result: { from: string; to: string; type: string }[] = [];
    
    // Leg 1 (Positioning): Open Position → Load Port 1 (Ballast)
    const firstLoad = filledLoad[0];
    if (firstLoad) {
      result.push({
        from: openPort || "Open Position",
        to: firstLoad,
        type: "ballast",
      });
    }
    
    // Subsequent legs between ports (all Laden)
    const cargoRoute = [...filledLoad, ...filledDischarge];
    for (let i = 0; i < cargoRoute.length - 1; i++) {
      result.push({ from: cargoRoute[i], to: cargoRoute[i + 1], type: "laden" });
    }
    return result;
  })();

  // Cargo Manifest — parcel-based
  const [cargoParcels, setCargoParcels] = useState<CargoParcel[]>(() => {
    if (existingLegs?.cargoParcels?.length) {
      return existingLegs.cargoParcels.map(p => ({
        name: p.name,
        quantity: p.quantity.toString(),
        loadPort: p.loadPort,
        dischargePort: p.dischargePort,
        freightRate: p.freightRate.toString(),
      }));
    }
    return [];
  });

  // Laden legs for cargo display
  const ladenLegs = legs.filter(l => l.type === "laden");

  // Port route order for cargo onboard calculation
  const cargoRoute = [...loadPorts.filter(p => p.trim()), ...dischargePorts.filter(p => p.trim())];

  // Auto-calculate cargo onboard per laden leg
  const legCargoOnboard = ladenLegs.map(leg => {
    const fromIdx = cargoRoute.indexOf(leg.from);
    const toIdx = cargoRoute.indexOf(leg.to);
    return cargoParcels.reduce((total, parcel) => {
      const loadIdx = cargoRoute.indexOf(parcel.loadPort);
      const dischargeIdx = cargoRoute.indexOf(parcel.dischargePort);
      if (loadIdx === -1 || dischargeIdx === -1) return total;
      // Parcel is onboard if: loaded at or before this leg's origin AND discharged at or after this leg's destination
      if (loadIdx <= fromIdx && dischargeIdx >= toIdx) {
        return total + (parseFloat(parcel.quantity) || 0);
      }
      return total;
    }, 0);
  });

  const totalCargoOnboard = Math.max(...legCargoOnboard, 0);

  // Per-leg distance inputs (indexed by full legs array)
  const [legDistances, setLegDistances] = useState<string[]>(() => {
    if (!existingLegs) return [];
    // Re-derive from ballast + laden totals for legacy voyages
    if (voyage) {
      const rawLegs = (voyage.voyageLegs as Record<string, unknown>)?.legs as { distanceNm: number }[] | undefined;
      if (rawLegs?.length) return rawLegs.map(l => l.distanceNm.toString());
      // Fallback to scalar distances
      return [voyage.ballastDistanceNm?.toString() || "0", voyage.ladenDistanceNm?.toString() || "0"];
    }
    return [];
  });

  // Pre-fill per-port state arrays from voyageLegs.portDetails
  const lpd = existingLegs?.portDetails;
  const [portLoadDays, setPortLoadDays] = useState<string[]>(() =>
    lpd?.load?.map(p => p.days.toString()) || (voyage ? [voyage.loadPortDays.toString()] : ["2"]));
  const [portDischargeDays, setPortDischargeDays] = useState<string[]>(() =>
    lpd?.discharge?.map(p => p.days.toString()) || (voyage ? [voyage.dischargePortDays.toString()] : ["2"]));
  const [portLoadWaiting, setPortLoadWaiting] = useState<string[]>(() =>
    lpd?.load?.map(p => p.waitingDays.toString()) || ["0"]);
  const [portDischargeWaiting, setPortDischargeWaiting] = useState<string[]>(() =>
    lpd?.discharge?.map(p => p.waitingDays.toString()) || ["0"]);
  const [portLoadIdle, setPortLoadIdle] = useState<string[]>(() =>
    lpd?.load?.map(p => p.idleDays.toString()) || ["0"]);
  const [portDischargeIdle, setPortDischargeIdle] = useState<string[]>(() =>
    lpd?.discharge?.map(p => p.idleDays.toString()) || ["0"]);
  const [portLoadPda, setPortLoadPda] = useState<string[]>(() =>
    lpd?.load?.map(p => p.pdaCost.toString()) || ["0"]);
  const [portDischargePda, setPortDischargePda] = useState<string[]>(() =>
    lpd?.discharge?.map(p => p.pdaCost.toString()) || ["0"]);
  const [portLoadCrane, setPortLoadCrane] = useState<boolean[]>(() =>
    lpd?.load?.map(p => p.useCrane) || [false]);
  const [portDischargeCrane, setPortDischargeCrane] = useState<boolean[]>(() =>
    lpd?.discharge?.map(p => p.useCrane) || [false]);
  const [namedAdditionalCosts, setNamedAdditionalCosts] = useState<NamedCostItem[]>(() =>
    existingLegs?.additionalCosts?.map(c => ({ name: c.name, amount: c.amount.toString() })) || []);

  // Helper to sync array length to port count
  const syncArray = <T,>(arr: T[], len: number, defaultVal: T): T[] =>
    arr.length === len ? arr : Array.from({ length: len }, (_, i) => arr[i] ?? defaultVal);

  // Sync all per-port arrays when port counts change
  const filledLoadCount = loadPorts.length;
  const filledDischargeCount = dischargePorts.length;

  // (legCargos sync removed — cargo is now auto-calculated from parcels)

  // Sync legDistances to total legs count
  useEffect(() => {
    setLegDistances(prev => syncArray(prev, legs.length, ""));
  }, [legs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill from Smart Voyage Optimizer (sessionStorage)
  useEffect(() => {
    if (searchParams.get("from") !== "optimizer") return;
    
    try {
      const raw = sessionStorage.getItem("voyage-optimizer-data");
      if (!raw) return;
      
      const data = JSON.parse(raw);
      
      // Check data is recent (within 10 minutes)
      if (Date.now() - data.timestamp > 10 * 60 * 1000) {
        sessionStorage.removeItem("voyage-optimizer-data");
        return;
      }
      
      // Auto-select vessel
      if (data.vesselId) {
        const vessel = vessels.find(v => v.id === data.vesselId);
        if (vessel) {
          handleVesselChange(data.vesselId);
        }
      }
      
      // Auto-fill ports
      if (data.openPort) {
        setFormData(prev => ({ ...prev, openPort: data.openPort }));
      }
      if (data.loadPorts?.length > 0) {
        setLoadPorts(data.loadPorts);
      }
      if (data.dischargePorts?.length > 0) {
        setDischargePorts(data.dischargePorts);
      }
      
      // Auto-fill leg distances
      if (data.legDistances?.length > 0) {
        const distances = data.legDistances.map((leg: { distanceNm: number }) => 
          String(Math.round(leg.distanceNm))
        );
        // Small delay to let legs array sync first
        setTimeout(() => {
          setLegDistances(distances);
        }, 100);
      }
      
      // Auto-fill canal tolls
      if (data.canalTolls > 0) {
        setFormData(prev => ({ ...prev, canalTolls: String(data.canalTolls) }));
      }

      // Auto-fill country codes from optimizer (if available)
      if (data.originCountryCode) {
        setLoadPortCountries(prev => {
          const updated = [...prev];
          updated[0] = data.originCountryCode;
          return updated;
        });
      }
      if (data.destinationCountryCode) {
        setDischargePortCountries(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = data.destinationCountryCode;
          return updated;
        });
      }
      
      setFromOptimizer(true);
      
      // Clear sessionStorage after consuming
      sessionStorage.removeItem("voyage-optimizer-data");
      
      toast.success("Pre-filled from Smart Voyage Optimizer!");
    } catch (err) {
      console.warn("Failed to load optimizer data:", err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPortLoadDays(prev => syncArray(prev, filledLoadCount, "2"));
    setPortLoadWaiting(prev => syncArray(prev, filledLoadCount, "0"));
    setPortLoadIdle(prev => syncArray(prev, filledLoadCount, "0"));
    setPortLoadPda(prev => syncArray(prev, filledLoadCount, "0"));
    setPortLoadCrane(prev => syncArray(prev, filledLoadCount, false));
  }, [filledLoadCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPortDischargeDays(prev => syncArray(prev, filledDischargeCount, "2"));
    setPortDischargeWaiting(prev => syncArray(prev, filledDischargeCount, "0"));
    setPortDischargeIdle(prev => syncArray(prev, filledDischargeCount, "0"));
    setPortDischargePda(prev => syncArray(prev, filledDischargeCount, "0"));
    setPortDischargeCrane(prev => syncArray(prev, filledDischargeCount, false));
  }, [filledDischargeCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync country code arrays when port counts change
  useEffect(() => {
    setLoadPortCountries(prev => syncArray(prev, filledLoadCount, ""));
  }, [filledLoadCount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDischargePortCountries(prev => syncArray(prev, filledDischargeCount, ""));
  }, [filledDischargeCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Totals for backward compat
  const sumArr = (arr: string[]) => arr.reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const totalLoadDays = sumArr(portLoadDays);
  const totalDischargeDays = sumArr(portDischargeDays);
  const totalWaitingDays = sumArr(portLoadWaiting) + sumArr(portDischargeWaiting);
  const totalIdleDays = sumArr(portLoadIdle) + sumArr(portDischargeIdle);
  const totalPdaCosts = sumArr(portLoadPda) + sumArr(portDischargePda);
  const totalAdditionalCosts = namedAdditionalCosts.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const hasAnyCrane = portLoadCrane.some(Boolean) || portDischargeCrane.some(Boolean);

  // Distance totals for backward compat
  const totalBallastDistance = legs.reduce((s, l, i) => l.type === "ballast" ? s + (parseFloat(legDistances[i]) || 0) : s, 0);
  const totalLadenDistance = legs.reduce((s, l, i) => l.type === "laden" ? s + (parseFloat(legDistances[i]) || 0) : s, 0);

  // ── Auto-Route Engine ────────────────────────────────────────
  // Automatically calculates route when all required fields are filled.
  const selectedVessel = useMemo(() => vessels.find(v => v.id === formData.vesselId), [vessels, formData.vesselId]);

  const autoRouteCallbacks = useMemo(() => ({
    onDistancesCalculated: (distances: string[]) => {
      setLegDistances(distances);
    },
    onCountryCodesDetected: (origin?: string, destination?: string) => {
      if (origin) {
        setLoadPortCountries(prev => {
          const u = [...prev];
          u[0] = origin;
          return u;
        });
      }
      if (destination) {
        setDischargePortCountries(prev => {
          const u = [...prev];
          u[u.length - 1] = destination;
          return u;
        });
      }
    },
  }), []);

  const autoRouteInput = useMemo(() => ({
    vesselId: formData.vesselId,
    vesselName: selectedVessel?.name || "",
    openPort: formData.openPort,
    loadPorts,
    dischargePorts,
    ballastSpeed: parseFloat(formData.overrideBallastSpeed) || selectedVessel?.ballastSpeed || 14,
    ladenSpeed: parseFloat(formData.overrideLadenSpeed) || selectedVessel?.ladenSpeed || 12,
    ballastConsumption: selectedVessel?.ballastConsumption || 25,
    ladenConsumption: selectedVessel?.ladenConsumption || 25,
    draft: selectedVessel ? (selectedVessel as any).summerDraft || 0 : 0,
    portLoadDays,
    portDischargeDays,
    portLoadWaiting,
    portDischargeWaiting,
    etd,
  }), [formData.vesselId, formData.openPort, formData.overrideBallastSpeed, formData.overrideLadenSpeed,
       selectedVessel, loadPorts, dischargePorts, portLoadDays, portDischargeDays, portLoadWaiting, portDischargeWaiting, etd]);

  const { status: autoRouteStatus, result: autoRouteData, error: autoRouteError, missingFields: autoRouteMissing, isReady: autoRouteIsReady, recalculate: autoRouteRecalculate } = useVoyageAutoRoute(
    autoRouteInput,
    {
      ...autoRouteCallbacks,
      debounceMs: 1500,
      enabled: !isEditMode,
    }
  );

  // Store result for submission
  useEffect(() => {
    if (autoRouteData) {
      setAutoRouteResult(autoRouteData);
    }
  }, [autoRouteData]);

  // Compose autoRouteState for the status strip
  const autoRouteState = useMemo(() => ({
    status: autoRouteStatus,
    result: autoRouteData,
    error: autoRouteError,
    missingFields: autoRouteMissing,
    isReady: autoRouteIsReady,
  }), [autoRouteStatus, autoRouteData, autoRouteError, autoRouteMissing, autoRouteIsReady]);

  // ── Handler: Select alternative route ────────────────────────
  const handleSelectAlternative = useCallback((alt: RouteAlternative) => {
    if (!autoRouteData) return;
    // Re-order alternatives so selected one becomes rank 1
    const reranked = autoRouteData.alternatives.map(a => ({
      ...a,
      rank: a.id === alt.id ? 1 : a.rank >= alt.rank ? a.rank : a.rank + 1,
    })).sort((a, b) => a.rank - b.rank);

    const newResult: AutoRouteResult = {
      ...autoRouteData,
      bestRoute: { ...alt, rank: 1 },
      alternatives: reranked,
      legDistances: alt.legs.map(l => l.distanceNm),
    };
    setAutoRouteResult(newResult);
    setLegDistances(alt.legs.map(l => String(l.distanceNm)));
  }, [autoRouteData]);

  // ── Handler: Open Route Planner in new tab (Deep Dive) ───────
  const handleOpenRoutePlanner = useCallback(() => {
    // Serialize form state to sessionStorage for the Route Planner to consume
    const routePlannerData = {
      vesselId: formData.vesselId,
      openPort: formData.openPort,
      loadPorts: loadPorts.filter(p => p.trim()),
      dischargePorts: dischargePorts.filter(p => p.trim()),
      ballastSpeed: formData.overrideBallastSpeed || selectedVessel?.ballastSpeed?.toString() || "14",
      ladenSpeed: formData.overrideLadenSpeed || selectedVessel?.ladenSpeed?.toString() || "12",
      portTimes: {
        load: loadPorts.map((_, i) => ({
          berthing: parseFloat(portLoadDays[i]) || 0,
          waiting: parseFloat(portLoadWaiting[i]) || 0,
        })),
        discharge: dischargePorts.map((_, i) => ({
          berthing: parseFloat(portDischargeDays[i]) || 0,
          waiting: parseFloat(portDischargeWaiting[i]) || 0,
        })),
      },
      draft: selectedVessel ? (selectedVessel as any).summerDraft || 0 : 0,
      etd,
      dwt,
      timestamp: Date.now(),
    };

    try {
      sessionStorage.setItem("voyage-form-to-route-planner", JSON.stringify(routePlannerData));
    } catch (e) {
      console.warn("[VoyageForm] Failed to store route planner data:", e);
    }

    // Open Route Planner in new tab
    window.open(`/${orgSlug}/route-planner?from=voyage-form`, "_blank");
  }, [formData, loadPorts, dischargePorts, portLoadDays, portLoadWaiting, portDischargeDays, portDischargeWaiting, selectedVessel, etd, dwt, orgSlug]);

  // ── Auto-Save Draft (silent, 5s debounce) ────────────────────
  const [autoSaveDraftId, setAutoSaveDraftId] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveVersionRef = useRef(0);

  // Build a fingerprint of all form fields to detect changes
  const autoSaveFingerprint = useMemo(() => {
    if (!formData.vesselId || isEditMode || isInquiryMode) return null; // Don't auto-save without vessel, in edit mode, or inquiry mode
    return JSON.stringify({
      vesselId: formData.vesselId,
      openPort: formData.openPort,
      loadPorts, dischargePorts,
      portLoadDays, portDischargeDays,
      portLoadWaiting, portDischargeWaiting,
      cargoParcels: cargoParcels.map(p => ({ n: p.name, q: p.quantity, r: p.freightRate })),
      fuelPrices: fuelPrices.map(f => ({ t: f.fuelType, p: f.price })),
      etd, dwt,
      brokerage: formData.brokeragePercent,
      commission: formData.commissionPercent,
    });
  }, [formData.vesselId, formData.openPort, formData.brokeragePercent, formData.commissionPercent,
      loadPorts, dischargePorts, portLoadDays, portDischargeDays, portLoadWaiting, portDischargeWaiting,
      cargoParcels, fuelPrices, etd, dwt, isEditMode]);

  useEffect(() => {
    if (!autoSaveFingerprint) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      const version = ++autoSaveVersionRef.current;
      setAutoSaveStatus("saving");

      try {
        const draftPayload = {
          vesselId: formData.vesselId,
          openPort: formData.openPort || undefined,
          loadPort: loadPorts.find(p => p.trim()) || "",
          dischargePort: dischargePorts.filter(p => p.trim()).pop() || "",
          voyageLegs: {
            loadPorts: loadPorts.filter(p => p.trim()),
            dischargePorts: dischargePorts.filter(p => p.trim()),
            legs: legs.map((leg, i) => ({
              ...leg,
              distanceNm: parseFloat(legDistances[i]) || 0,
            })),
          },
          ballastDistanceNm: totalBallastDistance || 0,
          ladenDistanceNm: totalLadenDistance || 0,
          loadPortDays: totalLoadDays,
          dischargePortDays: totalDischargeDays,
          waitingDays: totalWaitingDays,
          brokeragePercent: parseFloat(formData.brokeragePercent) || 1.25,
          commissionPercent: parseFloat(formData.commissionPercent) || 3.75,
          bunkerPriceUsd: fuelPrices[0]?.price ? parseFloat(fuelPrices[0].price) : 500,
          freightRateUnit: formData.freightRateUnit,
          laycanStart: formData.laycanStart || undefined,
          laycanEnd: formData.laycanEnd || undefined,
          status: "DRAFT",
        };

        const isUpdate = !!autoSaveDraftId;
        const url = isUpdate ? `/api/voyages/${autoSaveDraftId}` : "/api/voyages";
        const method = isUpdate ? "PUT" : "POST";

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftPayload),
        });

        if (response.ok && version === autoSaveVersionRef.current) {
          const result = await response.json();
          if (!isUpdate && result.data?.id) {
            setAutoSaveDraftId(result.data.id);
          }
          setAutoSaveStatus("saved");
          // Reset to idle after 3s
          setTimeout(() => {
            if (autoSaveVersionRef.current === version) setAutoSaveStatus("idle");
          }, 3000);
        } else if (version === autoSaveVersionRef.current) {
          setAutoSaveStatus("error");
        }
      } catch {
        if (version === autoSaveVersionRef.current) {
          setAutoSaveStatus("error");
          console.warn("[VoyageForm] Auto-save draft failed silently");
        }
      }
    }, 5000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveFingerprint]);

  // ── Per-Port ETA Calculation ─────────────────────────────────
  // Cascades: ETD → sailing days to port → port days → next leg
  const portETAs = useMemo(() => {
    if (!etd) return { load: [] as (string | null)[], discharge: [] as (string | null)[] };

    const etdDate = new Date(etd);
    if (isNaN(etdDate.getTime())) return { load: [] as (string | null)[], discharge: [] as (string | null)[] };

    const loadETAs: (string | null)[] = [];
    const dischargeETAs: (string | null)[] = [];

    let cursor = etdDate.getTime(); // running time cursor in ms
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Use route intelligence legs if available for precise sailing times
    const riLegs = autoRouteResult?.bestRoute?.legs || [];

    // Walk through each leg in order: Open→Load1→Load2...→Discharge1→Discharge2...
    const filledLoadPorts = loadPorts.filter(p => p.trim());
    const filledDischargePorts = dischargePorts.filter(p => p.trim());

    let legIdx = 0; // index into autoRoute legs or form legs

    // Leg 0: Open → Load Port 1 (ballast)
    if (filledLoadPorts.length > 0) {
      const sailingHours = riLegs[legIdx]?.sailingHours ||
        ((parseFloat(legDistances[0]) || 0) / (parseFloat(formData.overrideBallastSpeed || "14") || 14));
      cursor += sailingHours * 60 * 60 * 1000;
      loadETAs.push(new Date(cursor).toISOString());

      // Add port days at Load Port 1
      const portDays = parseFloat(portLoadDays[0]) || 0;
      const waitDays = parseFloat(portLoadWaiting[0]) || 0;
      const idleDays = parseFloat(portLoadIdle[0]) || 0;
      cursor += (portDays + waitDays + idleDays) * MS_PER_DAY;
      legIdx++;
    }

    // Subsequent load ports
    for (let i = 1; i < filledLoadPorts.length; i++) {
      const sailingHours = riLegs[legIdx]?.sailingHours ||
        ((parseFloat(legDistances[legIdx]) || 0) / (parseFloat(formData.overrideLadenSpeed || "12") || 12));
      cursor += sailingHours * 60 * 60 * 1000;
      loadETAs.push(new Date(cursor).toISOString());

      const portDays = parseFloat(portLoadDays[i]) || 0;
      const waitDays = parseFloat(portLoadWaiting[i]) || 0;
      const idleDays = parseFloat(portLoadIdle[i]) || 0;
      cursor += (portDays + waitDays + idleDays) * MS_PER_DAY;
      legIdx++;
    }

    // Discharge ports
    for (let i = 0; i < filledDischargePorts.length; i++) {
      const sailingHours = riLegs[legIdx]?.sailingHours ||
        ((parseFloat(legDistances[legIdx]) || 0) / (parseFloat(formData.overrideLadenSpeed || "12") || 12));
      cursor += sailingHours * 60 * 60 * 1000;
      dischargeETAs.push(new Date(cursor).toISOString());

      // Add port days (except after last discharge — voyage complete)
      if (i < filledDischargePorts.length - 1) {
        const portDays = parseFloat(portDischargeDays[i]) || 0;
        const waitDays = parseFloat(portDischargeWaiting[i]) || 0;
        const idleDays = parseFloat(portDischargeIdle[i]) || 0;
        cursor += (portDays + waitDays + idleDays) * MS_PER_DAY;
      }
      legIdx++;
    }

    return { load: loadETAs, discharge: dischargeETAs };
  }, [etd, autoRouteResult, loadPorts, dischargePorts, legDistances, portLoadDays, portLoadWaiting, portLoadIdle, portDischargeDays, portDischargeWaiting, portDischargeIdle, formData.overrideBallastSpeed, formData.overrideLadenSpeed]);

  // Format ETA for display
  const formatETA = (isoStr: string | null) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    const day = d.getDate();
    const month = d.toLocaleString("en-US", { month: "short" });
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${hours}:${mins}`;
  };
  
  // Handle vessel selection - auto-populate fuel defaults from vessel profile
  const handleVesselChange = (vesselId: string) => {
    updateField("vesselId", vesselId);
    const selectedVessel = vessels.find(v => v.id === vesselId);
    if (selectedVessel) {
      // Get fuel types from vessel defaults
      const ballastFuel = selectedVessel.ballastFuelType || "VLSFO";
      const ladenFuel = selectedVessel.ladenFuelType || "VLSFO";
      const portFuel = selectedVessel.portFuelType || "LSMGO";
      
      // ── Auto-fill speeds from vessel profile ──────────────────
      setFormData(prev => ({
        ...prev,
        vesselId,
        ballastFuelType: ballastFuel,
        ladenFuelType: ladenFuel,
        portFuelType: portFuel,
        overrideBallastSpeed: selectedVessel.ballastSpeed?.toString() || prev.overrideBallastSpeed,
        overrideLadenSpeed: selectedVessel.ladenSpeed?.toString() || prev.overrideLadenSpeed,
      }));
      
      // Smart fetch: Use vessel's fuelTypes if available, else derive from defaults
      const vesselFuelTypes = selectedVessel.fuelTypes as string[] | undefined;
      const fuelTypesToUse = vesselFuelTypes && vesselFuelTypes.length > 0
        ? vesselFuelTypes
        : [...new Set([ballastFuel, ladenFuel, portFuel])];
      
      // Generate fuel price rows for ALL the vessel's fuel capabilities
      setFuelPrices(fuelTypesToUse.map(fuel => (
        { fuelType: fuel, price: fuelPrices.find(fp => fp.fuelType === fuel)?.price || "" }
      )));

      // ── Auto-fill DWT from vessel profile ──────────────────────
      if (selectedVessel.dwt && selectedVessel.dwt > 0) {
        setDwt(String(selectedVessel.dwt));
      } else {
        setDwt("");
      }

      // ── Auto-fill Open/Start Position from AIS ────────────────
      // ALWAYS re-fetch when vessel changes — clear old position first
      setOpenPortNavData(null);
      if (selectedVessel.mmsiNumber) {
        // Clear previous position immediately
        setFormData(prev => ({ ...prev, openPort: "" }));
        getLastPosition({ mmsi: selectedVessel.mmsiNumber })
          .then((result) => {
            if (!result.success || !result.data?.length) return;
            const pos = result.data[0];
            const lat = Number(pos.Latitude);
            const lng = Number(pos.Longitude);
            if (!lat && !lng) return;

            // Use AIS NavigationStatus to determine if vessel is at port
            // Status 1 = At Anchor, Status 5 = Moored → vessel is at/near a port
            const navStatus = Number(pos.NavigationStatus);
            const isAtPort = navStatus === 1 || navStatus === 5;

            let locationName: string;
            if (isAtPort && pos.OriginDeclared?.trim()) {
              // Vessel is moored/anchored → use declared origin as port name
              locationName = pos.OriginDeclared.trim();
            } else {
              // Vessel is underway or no declared port → use coordinates
              locationName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }

            setFormData((prev) => ({
              ...prev,
              openPort: locationName,
            }));

            const statusLabel = isAtPort ? "at port" : "underway";
            toast.info(
              `📍 ${selectedVessel.name} is ${statusLabel}: ${locationName}`,
              { duration: 4000 }
            );
          })
          .catch(() => {
            // Silently fail — AIS is optional
          });
      } else {
        // No MMSI — clear position
        setFormData(prev => ({ ...prev, openPort: "" }));
      }
    }
  };

  // ── Port Autocomplete Handlers ──────────────────────────────
  const handlePortSelect = useCallback((
    role: "load" | "discharge",
    index: number,
    port: NavApiPort,
  ) => {
    // Update port name string
    if (role === "load") {
      setLoadPorts(prev => {
        const u = [...prev];
        u[index] = port.displayName;
        return u;
      });
      setLoadPortNavData(prev => {
        const u = [...prev];
        u[index] = port;
        return u;
      });
      // Auto-fill country
      if (port.country) {
        setLoadPortCountries(prev => {
          const u = [...prev];
          u[index] = port.country;
          return u;
        });
      }
    } else {
      setDischargePorts(prev => {
        const u = [...prev];
        u[index] = port.displayName;
        return u;
      });
      setDischargePortNavData(prev => {
        const u = [...prev];
        u[index] = port;
        return u;
      });
      if (port.country) {
        setDischargePortCountries(prev => {
          const u = [...prev];
          u[index] = port.country;
          return u;
        });
      }
    }

    // Trigger NGA enrichment for harbor metadata
    (async () => {
      try {
        const res = await fetch(`/api/admin/ports?search=${encodeURIComponent(port.displayName)}&limit=1`);
        const data = await res.json();
        if (data.ports?.length) {
          const ngaPort = data.ports[0];
          const meta: PortMetadata = {
            harborSize: ngaPort.harborSize || undefined,
            waterBody: ngaPort.waterBody || undefined,
            region: ngaPort.region || undefined,
          };
          if (role === "load") {
            setLoadPortMeta(prev => { const u = [...prev]; u[index] = meta; return u; });
          } else {
            setDischargePortMeta(prev => { const u = [...prev]; u[index] = meta; return u; });
          }
        }
      } catch { /* optional enrichment */ }
    })();
  }, []);

  const handlePortClear = useCallback((
    role: "load" | "discharge",
    index: number,
  ) => {
    if (role === "load") {
      setLoadPorts(prev => { const u = [...prev]; u[index] = ""; return u; });
      setLoadPortNavData(prev => { const u = [...prev]; u[index] = null; return u; });
      setLoadPortCountries(prev => { const u = [...prev]; u[index] = ""; return u; });
      setLoadPortMeta(prev => { const u = [...prev]; u[index] = null; return u; });
    } else {
      setDischargePorts(prev => { const u = [...prev]; u[index] = ""; return u; });
      setDischargePortNavData(prev => { const u = [...prev]; u[index] = null; return u; });
      setDischargePortCountries(prev => { const u = [...prev]; u[index] = ""; return u; });
      setDischargePortMeta(prev => { const u = [...prev]; u[index] = null; return u; });
    }
  }, []);

  // ── Debounced Port Country Auto-Detection + NGA Enrichment ────
  // When a user types a port name, lookup country via NavAPI and
  // fetch NGA metadata (harborSize, waterBody) in parallel.
  const countryLookupTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const lookupPortCountry = useCallback((
    portName: string,
    role: "load" | "discharge",
    index: number,
  ) => {
    const key = `${role}-${index}`;
    // Clear previous timer for this slot
    if (countryLookupTimers.current[key]) {
      clearTimeout(countryLookupTimers.current[key]);
    }
    if (!portName || portName.trim().length < 2) return;

    countryLookupTimers.current[key] = setTimeout(async () => {
      try {
        // Fire both lookups in parallel: NavAPI for country + NGA DB for metadata
        const [navRes, ngaRes] = await Promise.allSettled([
          fetch(`/api/navapi/ports?q=${encodeURIComponent(portName.trim())}`).then(r => r.json()),
          fetch(`/api/admin/ports?search=${encodeURIComponent(portName.trim())}&limit=1`).then(r => r.json()),
        ]);

        // NavAPI country auto-fill
        if (navRes.status === "fulfilled" && navRes.value.ports?.length) {
          const topPort = navRes.value.ports[0];
          const countryCode = topPort.country;
          if (countryCode) {
            if (role === "load") {
              setLoadPortCountries(prev => {
                if (prev[index]) return prev; // Don't override manual selection
                const u = [...prev];
                u[index] = countryCode;
                return u;
              });
            } else {
              setDischargePortCountries(prev => {
                if (prev[index]) return prev;
                const u = [...prev];
                u[index] = countryCode;
                return u;
              });
            }
          }
        }

        // NGA DB metadata enrichment (harborSize, waterBody, region)
        if (ngaRes.status === "fulfilled" && ngaRes.value.ports?.length) {
          const ngaPort = ngaRes.value.ports[0];
          const meta: PortMetadata = {
            harborSize: ngaPort.harborSize || undefined,
            waterBody: ngaPort.waterBody || undefined,
            region: ngaPort.region || undefined,
          };
          if (role === "load") {
            setLoadPortMeta(prev => {
              const u = [...prev];
              u[index] = meta;
              return u;
            });
          } else {
            setDischargePortMeta(prev => {
              const u = [...prev];
              u[index] = meta;
              return u;
            });
          }
        }
      } catch {
        // Silently fail — country detection and enrichment are optional
      }
    }, 600);
  }, []);

  // ── AI Smart Import State ─────────────────────────────────────
  const [isAIImporting, setIsAIImporting] = useState(false);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  // triggerRecalculate removed — auto-route handles this via useVoyageAutoRoute hook
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── NavAPI Port Resolver (for AI-parsed port names) ───────────
  // When AI parser extracts port names like "Newcastle, Australia", we need to
  // resolve them via NavAPI to get the NavApiPort object (portCode, lat/lng)
  // so that: 1) the NavApiPortSearch field displays the port, and
  //          2) the auto-route hook can calculate distances.
  const resolvePortNavData = useCallback(async (
    portName: string,
    role: "load" | "discharge",
    index: number
  ) => {
    try {
      // Extract just the city name (strip country suffix like "Newcastle, Australia" → "Newcastle")
      const searchTerm = portName.split(",")[0].trim();
      const response = await fetch(`/api/navapi/ports?q=${encodeURIComponent(searchTerm)}&limit=5`);
      const data = await response.json();
      const ports = data.ports;
      if (!ports || ports.length === 0) return;

      // Try to find best match — prefer exact-ish match with the full name
      const fullNameLower = portName.toLowerCase();
      const bestMatch = ports.find((p: NavApiPort) =>
        fullNameLower.includes(p.displayName?.toLowerCase()) ||
        p.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
      ) || ports[0];

      if (bestMatch) {
        handlePortSelect(role, index, bestMatch);
      }
    } catch (e) {
      console.warn(`[VoyageForm] Failed to resolve port "${portName}":`, e);
    }
  }, [handlePortSelect]);

  // AI field mapping: apply parsed data to form
  const applyAIData = useCallback((data: Record<string, unknown>) => {
    const missing: string[] = [];

    // ── Vessel matching ──
    if (data.vesselName) {
      const vesselName = (data.vesselName as string).toLowerCase();
      const matched = vessels.find(v =>
        v.name.toLowerCase().includes(vesselName) ||
        vesselName.includes(v.name.toLowerCase())
      );
      if (matched) {
        handleVesselChange(matched.id);
      } else {
        missing.push(`Vessel "${data.vesselName}" not found in your fleet`);
      }
    } else {
      missing.push("Vessel name");
    }

    // ── Open Port ──
    if (data.openPort) {
      setFormData(prev => ({ ...prev, openPort: data.openPort as string }));
    }

    // ── Load Ports ──
    if (data.loadPorts && Array.isArray(data.loadPorts) && (data.loadPorts as string[]).length > 0) {
      const ports = data.loadPorts as string[];
      setLoadPorts(ports);
      if (data.loadPortCountries && Array.isArray(data.loadPortCountries)) {
        setLoadPortCountries(data.loadPortCountries as string[]);
      } else {
        ports.forEach((p, i) => lookupPortCountry(p, "load", i));
      }
      // Resolve via NavAPI to fill NavApiPortSearch display + coordinates
      ports.forEach((p, i) => resolvePortNavData(p, "load", i));
    } else if (data.loadPort) {
      const port = data.loadPort as string;
      setLoadPorts([port]);
      if (data.loadPortCountry) {
        setLoadPortCountries([data.loadPortCountry as string]);
      } else {
        lookupPortCountry(port, "load", 0);
      }
      resolvePortNavData(port, "load", 0);
    } else {
      missing.push("Load port");
    }

    // ── Discharge Ports ──
    if (data.dischargePorts && Array.isArray(data.dischargePorts) && (data.dischargePorts as string[]).length > 0) {
      const ports = data.dischargePorts as string[];
      setDischargePorts(ports);
      if (data.dischargePortCountries && Array.isArray(data.dischargePortCountries)) {
        setDischargePortCountries(data.dischargePortCountries as string[]);
      } else {
        ports.forEach((p, i) => lookupPortCountry(p, "discharge", i));
      }
      // Resolve via NavAPI to fill NavApiPortSearch display + coordinates
      ports.forEach((p, i) => resolvePortNavData(p, "discharge", i));
    } else if (data.dischargePort) {
      const port = data.dischargePort as string;
      setDischargePorts([port]);
      if (data.dischargePortCountry) {
        setDischargePortCountries([data.dischargePortCountry as string]);
      } else {
        lookupPortCountry(port, "discharge", 0);
      }
      resolvePortNavData(port, "discharge", 0);
    } else {
      missing.push("Discharge port");
    }

    // ── Scalar form fields ──
    setFormData(prev => ({
      ...prev,
      ...(data.cargoType ? { cargoType: data.cargoType as string } : {}),
      ...(data.stowageFactor ? { stowageFactor: String(data.stowageFactor) } : {}),
      ...(data.freightRateUnit ? { freightRateUnit: data.freightRateUnit as FreightRateUnit } : {}),
      ...(data.brokeragePercent ? { brokeragePercent: String(data.brokeragePercent) } : {}),
      ...(data.commissionPercent ? { commissionPercent: String(data.commissionPercent) } : {}),
      ...(data.laycanStart ? { laycanStart: data.laycanStart as string } : {}),
      ...(data.laycanEnd ? { laycanEnd: data.laycanEnd as string } : {}),
      ...(data.loadPortDays ? { loadPortDays: String(data.loadPortDays) } : {}),
      ...(data.dischargePortDays ? { dischargePortDays: String(data.dischargePortDays) } : {}),
      ...(data.waitingDays ? { waitingDays: String(data.waitingDays) } : {}),
    }));

    // ── Cargo quantity (for parcels) ──
    if (data.cargoParcels && Array.isArray(data.cargoParcels)) {
      setCargoParcels((data.cargoParcels as Array<{ name: string; quantity: number; loadPort: string; dischargePort: string; freightRate: number }>).map(p => ({
        name: p.name || "",
        quantity: String(p.quantity || ""),
        loadPort: p.loadPort || "",
        dischargePort: p.dischargePort || "",
        freightRate: String(p.freightRate || ""),
      })));
    } else if (data.cargoQuantityMt) {
      setCargoParcels([{
        name: (data.cargoType as string) || "",
        quantity: String(data.cargoQuantityMt),
        loadPort: (data.loadPorts as string[])?.[0] || (data.loadPort as string) || "",
        dischargePort: (data.dischargePorts as string[])?.[0] || (data.dischargePort as string) || "",
        freightRate: data.freightRateUsd ? String(data.freightRateUsd) : "",
      }]);
    }

    // ── Check for missing critical fields ──
    if (!data.cargoType) missing.push("Cargo type");
    if (!data.cargoQuantityMt && !data.cargoParcels) missing.push("Cargo quantity");
    if (!data.laycanStart) missing.push("Laycan dates");
    if (!data.freightRateUsd && !data.cargoParcels) missing.push("Freight rate");

    return missing;
  }, [vessels, handleVesselChange, lookupPortCountry, resolvePortNavData]);

  // Handle file upload for AI import
  const handleAIImport = useCallback(async (file: File) => {
    setIsAIImporting(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const res = await fetch("/api/voyages/parse-fixture", {
        method: "POST",
        body: formDataUpload,
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Failed to parse document");
        return;
      }

      const missing = applyAIData(result.data);
      const fieldsFound = result.fieldsFound || Object.keys(result.data).length;

      toast.success(`✨ Parsed ${fieldsFound} fields from ${file.name}`, { duration: 4000 });
      // Trigger route recalculation after AI fills ports
      // Auto-route will re-trigger via field change detection (no manual trigger needed)

      if (missing.length > 0) {
        setTimeout(() => {
          toast.warning(
            `⚠️ Missing fields: ${missing.join(", ")}`,
            { duration: 8000, description: "Please fill these manually or re-import with more data." }
          );
        }, 1000);
      }
    } catch (err) {
      toast.error("Failed to process file. Please try again.");
      console.error("AI import error:", err);
    } finally {
      setIsAIImporting(false);
    }
  }, [applyAIData]);

  // Handle clipboard paste import
  const handlePasteImport = useCallback(async () => {
    if (!pasteText.trim()) {
      toast.error("Please paste some text first");
      return;
    }
    setIsAIImporting(true);
    try {
      // Send text as a .txt file
      const blob = new Blob([pasteText], { type: "text/plain" });
      const file = new File([blob], "pasted_email.txt", { type: "text/plain" });
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const res = await fetch("/api/voyages/parse-fixture", {
        method: "POST",
        body: formDataUpload,
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Failed to parse text");
        return;
      }

      const missing = applyAIData(result.data);
      const fieldsFound = result.fieldsFound || Object.keys(result.data).length;

      toast.success(`✨ Parsed ${fieldsFound} fields from pasted text`, { duration: 4000 });
      // Trigger route recalculation after AI fills ports
      // Auto-route will re-trigger via field change detection (no manual trigger needed)
      setPasteText("");
      setShowPasteArea(false);

      if (missing.length > 0) {
        setTimeout(() => {
          toast.warning(
            `⚠️ Missing fields: ${missing.join(", ")}`,
            { duration: 8000, description: "Please fill these manually or re-import with more data." }
          );
        }, 1000);
      }
    } catch (err) {
      toast.error("Failed to process text. Please try again.");
      console.error("AI paste import error:", err);
    } finally {
      setIsAIImporting(false);
    }
  }, [pasteText, applyAIData]);

  // ── Auto-Paste Detection ─────────────────────────────────────
  // When users Ctrl+V multi-line text while not focused on an input,
  // auto-trigger AI parsing immediately — zero clicks required.
  useEffect(() => {
    if (isEditMode) return;

    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Skip if user is focused on any input, textarea, or contenteditable
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const text = e.clipboardData?.getData("text/plain");
      if (!text || text.trim().length < 20) return; // Ignore short pastes

      // Multi-line or long single-line text → treat as fixture data
      const isMultiLine = text.includes("\n") || text.length > 80;
      if (!isMultiLine) return;

      e.preventDefault();
      
      // Auto-trigger AI parsing with the pasted text
      toast.info("📋 Pasted text detected — parsing with AI...", { duration: 2000 });
      
      (async () => {
        setIsAIImporting(true);
        try {
          const blob = new Blob([text], { type: "text/plain" });
          const file = new File([blob], "clipboard_paste.txt", { type: "text/plain" });
          const formDataUpload = new FormData();
          formDataUpload.append("file", file);

          const res = await fetch("/api/voyages/parse-fixture", {
            method: "POST",
            body: formDataUpload,
          });

          const result = await res.json();
          if (!res.ok || !result.success) {
            toast.error(result.error || "Failed to parse pasted text");
            return;
          }

          const missing = applyAIData(result.data);
          const fieldsFound = result.fieldsFound || Object.keys(result.data).length;

          toast.success(`✨ Parsed ${fieldsFound} fields from clipboard`, { duration: 4000 });
          // Trigger route recalculation after AI fills ports
          // Auto-route will re-trigger via field change detection (no manual trigger needed)

          if (missing.length > 0) {
            setTimeout(() => {
              toast.warning(
                `⚠️ Missing fields: ${missing.join(", ")}`,
                { duration: 8000, description: "Please fill these manually or re-import with more data." }
              );
            }, 1000);
          }
        } catch (err) {
          toast.error("Failed to process pasted text. Please try again.");
          console.error("AI auto-paste error:", err);
        } finally {
          setIsAIImporting(false);
        }
      })();
    };

    document.addEventListener("paste", handleGlobalPaste);
    return () => document.removeEventListener("paste", handleGlobalPaste);
  }, [isEditMode, applyAIData]);

  const handleSubmit = async (e: React.FormEvent, asDraft = false) => {
    e.preventDefault();
    if (asDraft) {
      setIsDraftSaving(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Build the shared payload
      const payload = {
        vesselId: formData.vesselId,
        openPort: formData.openPort || undefined,
        // Backward compat: first load port, last discharge port
        loadPort: loadPorts.find(p => p.trim()) || "",
        dischargePort: dischargePorts.filter(p => p.trim()).pop() || "",
        // Multi-port support — always send voyageLegs with portDetails
        voyageLegs: {
          loadPorts: loadPorts.filter(p => p.trim()),
          dischargePorts: dischargePorts.filter(p => p.trim()),
          legs: (() => {
            let ladenIdx = 0;
            return legs.map((leg, i) => ({
              ...leg,
              distanceNm: parseFloat(legDistances[i]) || 0,
              cargoMt: leg.type === "laden"
                ? (legCargoOnboard[ladenIdx++] || 0)
                : 0,
            }));
          })(),
          cargoParcels: cargoParcels.filter(p => p.name.trim() || parseFloat(p.quantity) > 0).map(p => ({
            name: p.name.trim(),
            quantity: parseFloat(p.quantity) || 0,
            loadPort: p.loadPort,
            dischargePort: p.dischargePort,
            freightRate: parseFloat(p.freightRate) || 0,
          })),
          portDetails: {
            load: loadPorts.map((port, i) => ({
              port: port.trim() || `Load Port ${i + 1}`,
              days: parseFloat(portLoadDays[i]) || 0,
              waitingDays: parseFloat(portLoadWaiting[i]) || 0,
              idleDays: parseFloat(portLoadIdle[i]) || 0,
              pdaCost: parseFloat(portLoadPda[i]) || 0,
              useCrane: portLoadCrane[i] || false,
            })),
            discharge: dischargePorts.map((port, i) => ({
              port: port.trim() || `Discharge Port ${i + 1}`,
              days: parseFloat(portDischargeDays[i]) || 0,
              waitingDays: parseFloat(portDischargeWaiting[i]) || 0,
              idleDays: parseFloat(portDischargeIdle[i]) || 0,
              pdaCost: parseFloat(portDischargePda[i]) || 0,
              useCrane: portDischargeCrane[i] || false,
            })),
          },
          additionalCosts: namedAdditionalCosts.filter(c => c.name.trim()).map(c => ({
            name: c.name.trim(),
            amount: parseFloat(c.amount) || 0,
          })),
          // Route Intelligence data (persisted for detail view + map rendering)
          ...(autoRouteResult ? {
            routeIntelligence: {
              calculatedAt: autoRouteResult.calculatedAt,
              totalDistanceNm: autoRouteResult.bestRoute.totalDistanceNm,
              totalEcaDistanceNm: autoRouteResult.bestRoute.totalEcaDistanceNm,
              totalHraDistanceNm: autoRouteResult.bestRoute.totalHraDistanceNm,
              estimatedSeaDays: autoRouteResult.bestRoute.estimatedSeaDays,
              detectedCanals: autoRouteResult.bestRoute.detectedCanals,
              ecaZones: autoRouteResult.bestRoute.ecaZones,
              hraZones: autoRouteResult.bestRoute.hraZones,
              routeLabel: autoRouteResult.bestRoute.label,
              legs: autoRouteResult.bestRoute.legs,
              routeGeometry: autoRouteResult.bestRoute.routeGeometry,
              alternatives: autoRouteResult.alternatives.map(a => ({
                id: a.id,
                label: a.label,
                rank: a.rank,
                totalDistanceNm: a.totalDistanceNm,
                totalEcaDistanceNm: a.totalEcaDistanceNm,
                estimatedSeaDays: a.estimatedSeaDays,
                detectedCanals: a.detectedCanals,
                rankReason: a.rankReason,
              })),
            },
          } : {}),
        },
        // Backward compat totals
        cargoQuantityMt: totalCargoOnboard || 0,
        ballastDistanceNm: totalBallastDistance || 0,
        ladenDistanceNm: totalLadenDistance || 0,
        loadPortDays: totalLoadDays,
        dischargePortDays: totalDischargeDays,
        waitingDays: totalWaitingDays,
        idleDays: totalIdleDays,
        useCrane: hasAnyCrane,
        brokeragePercent: parseFloat(formData.brokeragePercent) || 1.25,
        commissionPercent: parseFloat(formData.commissionPercent) || 3.75,
        additionalCosts: totalAdditionalCosts,
        pdaCosts: totalPdaCosts,
        lubOilCosts: parseFloat(formData.lubOilCosts) || 0,
        canalTolls: parseFloat(formData.canalTolls) || 0,
        // Legacy bunker price: use first fuel price for backward compatibility
        bunkerPriceUsd: fuelPrices[0]?.price ? parseFloat(fuelPrices[0].price) : 500,
        // Multi-fuel support
        fuelPrices: fuelPrices.reduce((acc, fp) => {
          if (fp.price) acc[fp.fuelType] = parseFloat(fp.price);
          return acc;
        }, {} as Record<string, number>),
        ladenFuelType: formData.ladenFuelType,
        ballastFuelType: formData.ballastFuelType,
        portFuelType: formData.portFuelType,
        freightRateUnit: formData.freightRateUnit,
        cargoType: formData.cargoType || undefined,
        stowageFactor: formData.stowageFactor ? parseFloat(formData.stowageFactor) : undefined,
        useEcoSpeed: formData.useEcoSpeed,
        overrideLadenSpeed: formData.overrideLadenSpeed ? parseFloat(formData.overrideLadenSpeed) : undefined,
        overrideBallastSpeed: formData.overrideBallastSpeed ? parseFloat(formData.overrideBallastSpeed) : undefined,
        // EU ETS country codes
        loadPortCountryCode: loadPortCountries.find(c => c) || undefined,
        dischargePortCountryCode: [...dischargePortCountries].reverse().find(c => c) || undefined,
        euEtsApplicable: euEtsStatus.applicable,
        euEtsPercentage: euEtsStatus.percentage,
        freightRateUsd: (() => {
          // Weighted average freight rate from parcels
          const validParcels = cargoParcels.filter(p => (parseFloat(p.quantity) || 0) > 0 && (parseFloat(p.freightRate) || 0) > 0);
          if (validParcels.length === 0) return undefined;
          const totalQty = validParcels.reduce((s, p) => s + (parseFloat(p.quantity) || 0), 0);
          const weightedSum = validParcels.reduce((s, p) => s + (parseFloat(p.quantity) || 0) * (parseFloat(p.freightRate) || 0), 0);
          return totalQty > 0 ? weightedSum / totalQty : undefined;
        })(),
        // Laycan
        laycanStart: formData.laycanStart || undefined,
        laycanEnd: formData.laycanEnd || undefined,
        // Draft mode: set status explicitly
        ...(asDraft ? { status: "DRAFT" } : {}),
      };

      // ── INQUIRY MODE: Save as CargoInquiry instead of Voyage ──
      if (isInquiryMode) {
        const inquiryResult = await createCargoInquiryFromVoyageForm({
          cargoType: formData.cargoType || cargoParcels[0]?.name || "Unknown",
          cargoQuantityMt: totalCargoOnboard || 0,
          stowageFactor: formData.stowageFactor ? parseFloat(formData.stowageFactor) : undefined,
          loadPort: loadPorts.find(p => p.trim()) || "",
          dischargePort: dischargePorts.filter(p => p.trim()).pop() || "",
          loadPortCountryCode: loadPortCountries.find(c => c) || undefined,
          dischargePortCountryCode: [...dischargePortCountries].reverse().find(c => c) || undefined,
          laycanStart: formData.laycanStart || undefined,
          laycanEnd: formData.laycanEnd || undefined,
          freightOffered: payload.freightRateUsd || undefined,
          commissionPercent: parseFloat(formData.commissionPercent) || undefined,
          brokerName: undefined, // Can be added later
          source: undefined,
          notes: undefined,
          status: asDraft ? "DRAFT" : "NEW",
          voyageEstimate: {
            vesselId: formData.vesselId || undefined,
            vesselName: selectedVessel?.name,
            payload, // Full voyage payload for hydration
            autoRouteResult: autoRouteResult ? {
              calculatedAt: autoRouteResult.calculatedAt,
              bestRoute: {
                totalDistanceNm: autoRouteResult.bestRoute.totalDistanceNm,
                totalEcaDistanceNm: autoRouteResult.bestRoute.totalEcaDistanceNm,
                totalHraDistanceNm: autoRouteResult.bestRoute.totalHraDistanceNm,
                estimatedSeaDays: autoRouteResult.bestRoute.estimatedSeaDays,
                detectedCanals: autoRouteResult.bestRoute.detectedCanals,
                ecaZones: autoRouteResult.bestRoute.ecaZones,
                hraZones: autoRouteResult.bestRoute.hraZones,
                label: autoRouteResult.bestRoute.label,
                legs: autoRouteResult.bestRoute.legs,
              },
              alternatives: autoRouteResult.alternatives.map(a => ({
                label: a.label,
                rank: a.rank,
                totalDistanceNm: a.totalDistanceNm,
                estimatedSeaDays: a.estimatedSeaDays,
              })),
            } : undefined,
          },
        });

        if (inquiryResult.success) {
          toast.success(asDraft ? "Inquiry saved as draft!" : "Cargo inquiry created!");
          onInquirySaved?.();
          onClose?.();
        } else {
          throw new Error(inquiryResult.error || "Failed to create inquiry");
        }
        return; // Don't continue to voyage creation
      }

      // Branch: PUT for edit or draft-to-final conversion, POST for fresh create
      const draftId = autoSaveDraftId;
      const url = isEditMode
        ? `/api/voyages/${voyage!.id}`
        : draftId && !asDraft
          ? `/api/voyages/${draftId}` // Convert existing draft to final
          : draftId
            ? `/api/voyages/${draftId}` // Update existing draft
            : "/api/voyages";
      const method = isEditMode || draftId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to ${isEditMode ? "update" : "create"} voyage`);
      }

      const voyageId = isEditMode ? voyage!.id : result.data.id;

      // Auto-trigger calculation only if NOT saving as draft
      if (!asDraft) {
        try {
          await fetch(`/api/voyages/${voyageId}/calculate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        } catch {
          console.warn("Auto-calculation failed");
        }
      }

      toast.success(asDraft ? "Saved as draft!" : (isEditMode ? "Voyage updated successfully!" : "Voyage created successfully!"));

      if (asDraft || isEditMode) {
        // For drafts and edits, navigate directly
        router.refresh();
        router.push(`/${orgSlug}/voyages/${voyageId}`);
      } else {
        // For CREATE: Show blocking AI Advisor dialog
        const voyageUrl = `/${orgSlug}/voyages/${voyageId}`;
        setAdvisorVoyageUrl(voyageUrl);
        setShowAdvisorDialog(true);
        setIsAdvisorLoading(true);
        setAdvisorSummary(null);

        try {
          const aiResponse = await fetch("/api/voyages/ai-advisor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              voyageId,
              vesselName: selectedVessel?.name,
              vesselType: selectedVessel?.vesselType,
              dwt: selectedVessel?.dwt,
              route: {
                openPort: formData.openPort,
                loadPorts: loadPorts.filter(p => p.trim()),
                dischargePorts: dischargePorts.filter(p => p.trim()),
                legDistances: legDistances.map(d => parseFloat(d) || 0),
              },
              cargo: {
                type: formData.cargoType,
                quantity: totalCargoOnboard,
                freightRate: payload.freightRateUsd,
                freightRateUnit: formData.freightRateUnit,
              },
              portDetails: {
                loadPortDays: totalLoadDays,
                dischargePortDays: totalDischargeDays,
                waitingDays: totalWaitingDays,
                idleDays: totalIdleDays,
              },
              financials: {
                bunkerPrice: fuelPrices[0]?.price ? parseFloat(fuelPrices[0].price) : undefined,
                brokeragePercent: parseFloat(formData.brokeragePercent) || undefined,
                commissionPercent: parseFloat(formData.commissionPercent) || undefined,
                canalTolls: parseFloat(formData.canalTolls) || undefined,
                pdaCosts: totalPdaCosts || undefined,
                additionalCosts: totalAdditionalCosts || undefined,
              },
              routeIntelligence: autoRouteResult ? {
                totalDistanceNm: autoRouteResult.bestRoute.totalDistanceNm,
                totalEcaDistanceNm: autoRouteResult.bestRoute.totalEcaDistanceNm,
                totalHraDistanceNm: autoRouteResult.bestRoute.totalHraDistanceNm,
                estimatedSeaDays: autoRouteResult.bestRoute.estimatedSeaDays,
                detectedCanals: autoRouteResult.bestRoute.detectedCanals,
                ecaZones: autoRouteResult.bestRoute.ecaZones,
                hraZones: autoRouteResult.bestRoute.hraZones,
                routeLabel: autoRouteResult.bestRoute.label,
                alternatives: autoRouteResult.alternatives.map(a => ({
                  label: a.label,
                  rank: a.rank,
                  totalDistanceNm: a.totalDistanceNm,
                  totalEcaDistanceNm: a.totalEcaDistanceNm,
                  estimatedSeaDays: a.estimatedSeaDays,
                  detectedCanals: a.detectedCanals,
                  rankReason: a.rankReason,
                })),
              } : undefined,
              euEts: {
                applicable: euEtsStatus.applicable,
                percentage: euEtsStatus.percentage,
                loadCountry: loadPortCountries.find(c => c),
                dischargeCountry: [...dischargePortCountries].reverse().find(c => c),
              },
            }),
          });

          const aiResult = await aiResponse.json();
          setAdvisorSummary(aiResult.summary || null);
        } catch (aiError) {
          console.warn("[VoyageForm] AI Advisor failed:", aiError);
          setAdvisorSummary(null);
        } finally {
          setIsAdvisorLoading(false);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong";
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setIsDraftSaving(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Check for missing data — inquiry mode allows empty vessel list
  const hasVessels = vessels && vessels.length > 0;

  if (!hasVessels && !isInquiryMode) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Vessels Available</h3>
        <p className="text-muted-foreground mb-4">
          You need to add a vessel before creating a voyage.
        </p>
        <Button onClick={() => router.push(`/${orgSlug}/vessels/new`)}>
          Add Vessel
        </Button>
      </div>
    );
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Optimizer pre-fill banner */}
      {fromOptimizer && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-300 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          <span>Pre-filled from <strong>Smart Voyage Optimizer</strong> — complete the remaining fields below (cargo, port days, fuel prices, costs).</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* ── AI Smart Import ─────────────────────────────────────── */}
      {!isEditMode && (
        <div
          className={`rounded-lg border-2 border-dashed p-4 space-y-3 transition-all duration-200 ${
            isDragOver
              ? "border-purple-400 bg-purple-500/15 ring-2 ring-purple-500/20"
              : "border-purple-500/30 bg-purple-500/5"
          }`}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only set false if we're leaving the container (not entering a child)
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDragOver(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) {
              const ext = file.name.split(".").pop()?.toLowerCase() || "";
              const allowed = ["pdf", "csv", "xlsx", "xls", "docx", "doc", "txt", "eml", "msg"];
              if (allowed.includes(ext)) {
                handleAIImport(file);
              } else {
                toast.error(`Unsupported file type: .${ext}. Use PDF, CSV, Excel, Word, or email files.`);
              }
            }
          }}
        >
          {/* Drag overlay message */}
          {isDragOver ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Upload className="h-8 w-8 text-purple-400 animate-bounce" />
              <span className="text-sm font-semibold text-purple-300">Drop file to auto-fill voyage form</span>
              <span className="text-xs text-muted-foreground">PDF, CSV, Excel, Word, Email (.eml/.msg)</span>
            </div>
          ) : (
            <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-semibold text-purple-300">Smart Import</span>
              <span className="text-xs text-muted-foreground">— Drag & drop a file, upload, or paste to auto-fill</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isAIImporting}
                className="h-7 px-3 text-xs border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                onClick={() => setShowPasteArea(!showPasteArea)}
              >
                <ClipboardPaste className="h-3 w-3 mr-1" />
                Paste from Email
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isAIImporting}
                className="h-7 px-3 text-xs border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                onClick={() => fileInputRef.current?.click()}
              >
                {isAIImporting ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3 mr-1" />
                )}
                {isAIImporting ? "Parsing..." : "Upload File"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.csv,.xlsx,.xls,.docx,.doc,.txt,.eml,.msg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleAIImport(file);
                    e.target.value = ""; // Reset to allow re-upload
                  }
                }}
              />
            </div>
          </div>

          {/* Supported formats hint */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <FileText className="h-3 w-3" />
            Drag & drop or upload: PDF, CSV, Excel (.xlsx/.xls), Word (.docx), Email (.eml/.msg), Plain text
          </div>

          {/* Paste from Email area */}
          {showPasteArea && (
            <div className="space-y-2 pt-1">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste fixture recap, broker email, or voyage instructions here...&#10;&#10;Example:&#10;VESSEL: BBC Bergen&#10;CARGO: 25,000 MT Steel Coils&#10;LOAD PORT: Rotterdam, Netherlands&#10;DISCHARGE PORT: Singapore&#10;LAYCAN: 15-20 May 2026&#10;FREIGHT: USD 28.50/MT"
                className="w-full h-32 px-3 py-2 text-sm bg-background/50 border border-border/60 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 placeholder:text-muted-foreground/50"
                disabled={isAIImporting}
              />
              <div className="flex items-center gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => { setShowPasteArea(false); setPasteText(""); }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isAIImporting || !pasteText.trim()}
                  className="h-7 px-3 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={handlePasteImport}
                >
                  {isAIImporting ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  {isAIImporting ? "AI Parsing..." : "Parse with AI"}
                </Button>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {isAIImporting && !showPasteArea && (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
              <span className="text-xs text-purple-300">AI is analyzing your document and extracting voyage details...</span>
            </div>
          )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2">
      {/* Vessel Selection */}
        
        <div className="space-y-2">

        <Label htmlFor="vessel">Vessel</Label>
        <Select
          value={formData.vesselId}
          onValueChange={handleVesselChange}
          >
          <SelectTrigger>
            <SelectValue placeholder="Select vessel" />
          </SelectTrigger>
          <SelectContent>
            {vessels.map((vessel) => (
              <SelectItem key={vessel.id} value={vessel.id}>
                {vessel.name} ({vessel.vesselType})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
          </div>
          
          {/* Open / Start Position */}
      <div className="space-y-2">
        <Label htmlFor="openPort" className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-blue-400" />
          Open / Start Position
        </Label>
        {/* NavApiPortSearch — hidden when text/coords already filled */}
        {!formData.openPort && (
          <NavApiPortSearch
            value={openPortNavData}
            onSelect={(port) => {
              setOpenPortNavData(port);
              updateField("openPort", port.displayName);
            }}
            onClear={() => {
              setOpenPortNavData(null);
              updateField("openPort", "");
            }}
            placeholder="Search port or location..."
          />
        )}
        {/* Coordinate input — hidden when port name or text filled */}
        {!openPortNavData && !formData.openPort && (
          <Input
            id="openPort"
            placeholder="Or paste coordinates: e.g., 51.2345, 3.4567 or Google Maps URL"
            value={formData.openPort}
            onChange={(e) => updateField("openPort", e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              const parsed = parseSmartCoordinates(pasted);
              if (parsed) {
                e.preventDefault();
                const formatted = `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`;
                updateField("openPort", formatted);
                toast.success(`📍 Coordinates parsed: ${formatted}`, { duration: 3000 });
              }
            }}
            className="text-sm"
          />
        )}
        {/* Show resolved NavApiPort + clear button */}
        {openPortNavData && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-emerald-500/8 border border-emerald-500/15">
            <MapPin className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">{openPortNavData.displayName}</span>
            <span className="text-[9px] text-emerald-400/60 uppercase tracking-wider">{openPortNavData.portCode}</span>
            <button
              type="button"
              onClick={() => {
                setOpenPortNavData(null);
                updateField("openPort", "");
              }}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {/* Show current text/coords value + clear button (no NavApiPort) */}
        {formData.openPort && !openPortNavData && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-blue-500/8 border border-blue-500/15">
            <MapPin className="h-3 w-3 text-blue-400 shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">{formData.openPort}</span>
            <button
              type="button"
              onClick={() => {
                updateField("openPort", "");
                setOpenPortNavData(null);
              }}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {openPortNavData
            ? `Port resolved: ${openPortNavData.displayName} [${openPortNavData.portCode}]`
            : formData.openPort
              ? `📍 ${formData.openPort}`
              : "Search a port or paste coordinates (Google Maps URL, DMS, decimal)"}
        </p>
      </div>
      </div>

      {/* ─── ETD & DWT ─── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="etd" className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-violet-400" />
            ETD (Estimated Time of Departure)
          </Label>
          <Input
            id="etd"
            type="datetime-local"
            value={etd}
            onChange={(e) => setEtd(e.target.value)}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Departure from open position — used for ETA calculations at each port
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dwt" className="flex items-center gap-1.5">
            <Weight className="h-3.5 w-3.5 text-cyan-400" />
            DWT (Deadweight Tonnage)
          </Label>
          <Input
            id="dwt"
            type="number"
            placeholder="e.g., 82000"
            value={dwt}
            onChange={(e) => setDwt(e.target.value)}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {dwt && formData.vesselId
              ? `Auto-filled from vessel (${Number(dwt).toLocaleString()} MT)`
              : "Enter vessel DWT for draft-based routing"}
          </p>
        </div>
      </div>

      {/* ─── Laycan (Loading Window) ─── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="laycanStart" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            Laycan Start
          </Label>
          <Input
            id="laycanStart"
            type="date"
            value={formData.laycanStart}
            onChange={(e) => updateField("laycanStart", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="laycanEnd" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            Laycan End
          </Label>
          <Input
            id="laycanEnd"
            type="date"
            value={formData.laycanEnd}
            onChange={(e) => updateField("laycanEnd", e.target.value)}
          />
        </div>
      </div>

      {/* Cargo Type, Stowage Factor & Freight Rate Unit */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="cargoType">Cargo Type</Label>
          <Input id="cargoType" placeholder="e.g., Iron Ore, Crude Oil" value={formData.cargoType} onChange={(e) => updateField("cargoType", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stowageFactor">Stowage Factor <span className="text-muted-foreground font-normal">(cbm/MT)</span></Label>
          <Input id="stowageFactor" type="number" step="0.01" lang="en" placeholder="e.g., 0.45" value={formData.stowageFactor} onChange={(e) => updateField("stowageFactor", e.target.value)} />
          <p className="text-xs text-muted-foreground">Volume per weight — for volume-limited cargo detection</p>
        </div>
        <div className="space-y-2">
          <Label>Freight Rate Unit</Label>
          <Select value={formData.freightRateUnit} onValueChange={(v) => updateField("freightRateUnit", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(FREIGHT_RATE_UNIT_LABELS) as [FreightRateUnit, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Speed is managed per-leg in Route Intelligence — no ambiguity */}
      </div>

      {/* Route - Dynamic multi-port inputs */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Load Ports */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Load Port{loadPorts.length > 1 ? "s" : ""}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300"
              onClick={() => {
                setLoadPorts([...loadPorts, ""]);
                setLoadPortNavData(prev => [...prev, null]);
                setLoadPortMeta(prev => [...prev, null]);
              }}
            >
              <Plus className="h-3 w-3 mr-1" /> Add Port
            </Button>
          </div>
          {loadPorts.map((port, index) => (
            <div key={index} className="space-y-1">
              <div className="flex gap-2 items-center">
                {loadPorts.length > 1 && (
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{index + 1}.</span>
                )}
                <NavApiPortSearch
                  value={loadPortNavData[index] || null}
                  onSelect={(port) => handlePortSelect("load", index, port)}
                  onClear={() => handlePortClear("load", index)}
                  placeholder={index === 0 ? "Search load port..." : "Search port..."}
                  className="flex-1"
                />
                <CountrySelect
                  value={loadPortCountries[index] || ""}
                  onChange={(code) => {
                    const updated = [...loadPortCountries];
                    updated[index] = code;
                    setLoadPortCountries(updated);
                  }}
                  placeholder="Country"
                  compact
                  className="w-24 shrink-0"
                />
                {loadPorts.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-400"
                    onClick={() => {
                      setLoadPorts(loadPorts.filter((_, i) => i !== index));
                      setLoadPortCountries(loadPortCountries.filter((_, i) => i !== index));
                      setLoadPortNavData(prev => prev.filter((_, i) => i !== index));
                      setLoadPortMeta(prev => prev.filter((_, i) => i !== index));
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {/* Inline ETA badge + NGA metadata */}
              <div className="flex items-center gap-1.5 ml-5 flex-wrap">
                {loadPortMeta[index]?.harborSize && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    loadPortMeta[index]!.harborSize === 'L' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                    loadPortMeta[index]!.harborSize === 'M' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                    loadPortMeta[index]!.harborSize === 'S' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                    'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
                  }`}>
                    {loadPortMeta[index]!.harborSize === 'L' ? 'Large' : loadPortMeta[index]!.harborSize === 'M' ? 'Medium' : loadPortMeta[index]!.harborSize === 'S' ? 'Small' : loadPortMeta[index]!.harborSize}
                  </span>
                )}
                {formatETA(portETAs.load[index]) && (
                  <>
                    <CalendarClock className="h-3 w-3 text-violet-400" />
                    <span className="text-[11px] font-medium text-violet-300 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
                      ETA: {formatETA(portETAs.load[index])}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Discharge Ports */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Discharge Port{dischargePorts.length > 1 ? "s" : ""}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300"
              onClick={() => {
                setDischargePorts([...dischargePorts, ""]);
                setDischargePortNavData(prev => [...prev, null]);
                setDischargePortMeta(prev => [...prev, null]);
              }}
            >
              <Plus className="h-3 w-3 mr-1" /> Add Port
            </Button>
          </div>
          {dischargePorts.map((port, index) => (
            <div key={index} className="space-y-1">
              <div className="flex gap-2 items-center">
                {dischargePorts.length > 1 && (
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{index + 1}.</span>
                )}
                <NavApiPortSearch
                  value={dischargePortNavData[index] || null}
                  onSelect={(port) => handlePortSelect("discharge", index, port)}
                  onClear={() => handlePortClear("discharge", index)}
                  placeholder={index === 0 ? "Search discharge port..." : "Search port..."}
                  className="flex-1"
                />
                <CountrySelect
                  value={dischargePortCountries[index] || ""}
                  onChange={(code) => {
                    const updated = [...dischargePortCountries];
                    updated[index] = code;
                    setDischargePortCountries(updated);
                  }}
                  placeholder="Country"
                  compact
                  className="w-24 shrink-0"
                />
                {dischargePorts.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-400"
                    onClick={() => {
                      setDischargePorts(dischargePorts.filter((_, i) => i !== index));
                      setDischargePortCountries(dischargePortCountries.filter((_, i) => i !== index));
                      setDischargePortNavData(prev => prev.filter((_, i) => i !== index));
                      setDischargePortMeta(prev => prev.filter((_, i) => i !== index));
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {/* Inline ETA badge + NGA metadata */}
              <div className="flex items-center gap-1.5 ml-5 flex-wrap">
                {dischargePortMeta[index]?.harborSize && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    dischargePortMeta[index]!.harborSize === 'L' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                    dischargePortMeta[index]!.harborSize === 'M' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                    dischargePortMeta[index]!.harborSize === 'S' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                    'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
                  }`}>
                    {dischargePortMeta[index]!.harborSize === 'L' ? 'Large' : dischargePortMeta[index]!.harborSize === 'M' ? 'Medium' : dischargePortMeta[index]!.harborSize === 'S' ? 'Small' : dischargePortMeta[index]!.harborSize}
                  </span>
                )}
                {formatETA(portETAs.discharge[index]) && (
                  <>
                    <CalendarClock className="h-3 w-3 text-emerald-400" />
                    <span className="text-[11px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      ETA: {formatETA(portETAs.discharge[index])}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Auto-Route Intelligence Strip ─── */}
      <VoyageRouteStatus
        state={autoRouteState}
        onRecalculate={autoRouteRecalculate}
        onSelectAlternative={handleSelectAlternative}
        onOpenRoutePlanner={handleOpenRoutePlanner}
      />

      {/* EU ETS Auto-Detection Badge */}
      {(loadPortCountries.some(c => c) || dischargePortCountries.some(c => c)) && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
          euEtsStatus.applicable
            ? "bg-green-500/10 border-green-500/30 text-green-400"
            : "bg-muted/50 border-border text-muted-foreground"
        }`}>
          <Leaf className={`h-4 w-4 shrink-0 ${euEtsStatus.applicable ? "text-green-500" : "text-muted-foreground"}`} />
          <div className="flex-1">
            <span className="font-medium">
              🇪🇺 EU ETS: {euEtsStatus.applicable ? `${euEtsStatus.percentage}% Taxable` : "Not Applicable"}
            </span>
            {euEtsStatus.reason && (
              <span className="text-xs ml-2 opacity-80">{euEtsStatus.reason}</span>
            )}
          </div>
        </div>
      )}

      {/* Leg Summary (when multiple ports) */}
      {legs.length > 1 && (
        <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-2">Voyage Legs ({legs.length})</p>
          <div className="flex flex-wrap gap-2">
            {legs.map((leg, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-md bg-background border">
                Leg {i + 1}: {leg.from} → {leg.to}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-Leg Distances */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 text-sky-400" />
            Leg Distances (NM)
          </Label>
          {autoRouteResult && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              Auto-filled from Route Engine
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          {autoRouteResult
            ? "Distances auto-calculated via NavAPI sea routing — you can override manually"
            : "Enter the distance for each leg of the voyage"}
        </p>
        <div className="grid gap-3">
          {legs.map((leg, i) => (
            <div key={i} className="flex gap-3 items-center">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                  leg.type === "ballast"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}>
                  {leg.type === "ballast" ? "Ballast" : "Laden"}
                </span>
                <span className="text-sm text-muted-foreground truncate">
                  {leg.from} → {leg.to}
                </span>
              </div>
              <NumberInput
                placeholder="e.g., 1,500"
                value={legDistances[i] || ""}
                onChange={(value) => {
                  const u = [...legDistances]; u[i] = value; setLegDistances(u);
                }}
                className="w-40"
                required
              />
            </div>
          ))}
        </div>
        {legs.length > 1 && (
          <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border/50">
            <span>Ballast: <span className="font-medium text-foreground">{totalBallastDistance.toLocaleString()} NM</span></span>
            <span>Laden: <span className="font-medium text-foreground">{totalLadenDistance.toLocaleString()} NM</span></span>
            <span>Total: <span className="font-medium text-foreground">{(totalBallastDistance + totalLadenDistance).toLocaleString()} NM</span></span>
          </div>
        )}
      </div>

      {/* Cargo Manifest */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-base">
            <Truck className="h-4 w-4 text-emerald-400" />
            Cargo Manifest
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300"
            onClick={() => setCargoParcels([...cargoParcels, { name: "", quantity: "", loadPort: cargoRoute[0] || "", dischargePort: cargoRoute[cargoRoute.length - 1] || "", freightRate: "" }])}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Parcel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">Define cargo parcels — system auto-calculates cargo onboard per leg</p>

        {cargoParcels.length > 0 && (
          <div className="space-y-3">
            {/* Header */}
            <div className="hidden md:grid md:grid-cols-[1fr_120px_1fr_1fr_220px_32px] gap-2 px-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Cargo Name</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Qty (MT)</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Load Port</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Discharge Port</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Rate</span>
              <span></span>
            </div>
            {/* Rows */}
            {cargoParcels.map((parcel, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_120px_1fr_1fr_220px_32px] gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                <Input
                  placeholder="e.g., Bauxite"
                  value={parcel.name}
                  onChange={(e) => { const u = [...cargoParcels]; u[i] = { ...u[i], name: e.target.value }; setCargoParcels(u); }}
                />
                <NumberInput
                  placeholder="MT"
                  value={parcel.quantity}
                  onChange={(value) => { const u = [...cargoParcels]; u[i] = { ...u[i], quantity: value }; setCargoParcels(u); }}
                  required
                />
                <Select value={parcel.loadPort} onValueChange={(val) => { const u = [...cargoParcels]; u[i] = { ...u[i], loadPort: val }; setCargoParcels(u); }}>
                  <SelectTrigger><SelectValue placeholder="Load at..." /></SelectTrigger>
                  <SelectContent>
                    {cargoRoute.map((port, pi) => (
                      <SelectItem key={pi} value={port}>{port}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={parcel.dischargePort} onValueChange={(val) => { const u = [...cargoParcels]; u[i] = { ...u[i], dischargePort: val }; setCargoParcels(u); }}>
                  <SelectTrigger><SelectValue placeholder="Discharge at..." /></SelectTrigger>
                  <SelectContent>
                    {cargoRoute.map((port, pi) => (
                      <SelectItem key={pi} value={port}>{port}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  lang="en"
                  placeholder="Rate ($/MT)"
                  value={parcel.freightRate}
                  onChange={(e) => { const u = [...cargoParcels]; u[i] = { ...u[i], freightRate: e.target.value }; setCargoParcels(u); }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-400"
                  onClick={() => setCargoParcels(cargoParcels.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {cargoParcels.length === 0 && (
          <div className="flex items-center justify-center p-6 rounded-lg border border-dashed border-border/60 text-muted-foreground text-sm">
            No cargo parcels added. Click "+ Add Parcel" to define your cargo.
          </div>
        )}
      </div>

      {/* Auto-Calculated Cargo per Leg (read-only) */}
      {ladenLegs.length > 0 && cargoParcels.length > 0 && (
        <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-amber-400" />
            Cargo Onboard per Leg (auto-calculated)
          </p>
          <div className="grid gap-1.5">
            {ladenLegs.map((leg, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{leg.from} → {leg.to}</span>
                <span className={`font-medium tabular-nums ${legCargoOnboard[i] > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {legCargoOnboard[i] > 0 ? `${legCargoOnboard[i].toLocaleString()} MT` : '—'}
                </span>
              </div>
            ))}
          </div>
          {totalCargoOnboard > 0 && (
            <div className="pt-1 border-t border-border/50">
              <p className="text-xs text-muted-foreground">Max Onboard: <span className="font-medium text-foreground">{totalCargoOnboard.toLocaleString()} MT</span></p>
            </div>
          )}
        </div>
      )}

      {/* Port Days */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Per-Port Days: Load Ports */}
        <div className="space-y-3 md:col-span-1">
          <Label className="flex items-center gap-1.5">
            <Anchor className="h-3.5 w-3.5 text-blue-400" />
            Load Port Days (Berthing)
          </Label>
          {loadPorts.map((port, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs text-muted-foreground">{port.trim() || `Load Port ${i + 1}`}</p>
              <Input
                type="number"
                step="0.5"
                placeholder="2"
                value={portLoadDays[i] || ""}
                onChange={(e) => {
                  const u = [...portLoadDays]; u[i] = e.target.value; setPortLoadDays(u);
                }}
                required
              />
            </div>
          ))}
          {loadPorts.length > 1 && (
            <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
              Total: <span className="font-medium text-foreground">{totalLoadDays} days</span>
            </p>
          )}
        </div>

        {/* Per-Port Days: Discharge Ports */}
        <div className="space-y-3 md:col-span-1">
          <Label className="flex items-center gap-1.5">
            <Anchor className="h-3.5 w-3.5 text-emerald-400" />
            Discharge Port Days (Berthing)
          </Label>
          {dischargePorts.map((port, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs text-muted-foreground">{port.trim() || `Discharge Port ${i + 1}`}</p>
              <Input
                type="number"
                step="0.5"
                placeholder="2"
                value={portDischargeDays[i] || ""}
                onChange={(e) => {
                  const u = [...portDischargeDays]; u[i] = e.target.value; setPortDischargeDays(u);
                }}
                required
              />
            </div>
          ))}
          {dischargePorts.length > 1 && (
            <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
              Total: <span className="font-medium text-foreground">{totalDischargeDays} days</span>
            </p>
          )}
        </div>
      </div>

      {/* Per-Port Waiting & Idle Days */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Waiting Days */}
        <div className="space-y-3">
          <Label className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-yellow-400" />
            Waiting Days
          </Label>
          <p className="text-xs text-muted-foreground -mt-1">Days waiting at anchorage (no crane)</p>
          {loadPorts.map((port, i) => (
            <div key={`wl-${i}`} className="space-y-1">
              <p className="text-xs text-muted-foreground">{port.trim() || `Load Port ${i + 1}`}</p>
              <Input type="number" step="0.5" placeholder="0"
                value={portLoadWaiting[i] || ""}
                onChange={(e) => { const u = [...portLoadWaiting]; u[i] = e.target.value; setPortLoadWaiting(u); }}
              />
            </div>
          ))}
          {dischargePorts.map((port, i) => (
            <div key={`wd-${i}`} className="space-y-1">
              <p className="text-xs text-muted-foreground">{port.trim() || `Discharge Port ${i + 1}`}</p>
              <Input type="number" step="0.5" placeholder="0"
                value={portDischargeWaiting[i] || ""}
                onChange={(e) => { const u = [...portDischargeWaiting]; u[i] = e.target.value; setPortDischargeWaiting(u); }}
              />
            </div>
          ))}
          {(loadPorts.length + dischargePorts.length > 2) && totalWaitingDays > 0 && (
            <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
              Total: <span className="font-medium text-foreground">{totalWaitingDays} days</span>
            </p>
          )}
        </div>

        {/* Idle Days */}
        <div className="space-y-3">
          <Label className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-orange-400" />
            Idle Days
          </Label>
          <p className="text-xs text-muted-foreground -mt-1">Days idle between operations (no crane)</p>
          {loadPorts.map((port, i) => (
            <div key={`il-${i}`} className="space-y-1">
              <p className="text-xs text-muted-foreground">{port.trim() || `Load Port ${i + 1}`}</p>
              <Input type="number" step="0.5" placeholder="0"
                value={portLoadIdle[i] || ""}
                onChange={(e) => { const u = [...portLoadIdle]; u[i] = e.target.value; setPortLoadIdle(u); }}
              />
            </div>
          ))}
          {dischargePorts.map((port, i) => (
            <div key={`id-${i}`} className="space-y-1">
              <p className="text-xs text-muted-foreground">{port.trim() || `Discharge Port ${i + 1}`}</p>
              <Input type="number" step="0.5" placeholder="0"
                value={portDischargeIdle[i] || ""}
                onChange={(e) => { const u = [...portDischargeIdle]; u[i] = e.target.value; setPortDischargeIdle(u); }}
              />
            </div>
          ))}
          {(loadPorts.length + dischargePorts.length > 2) && totalIdleDays > 0 && (
            <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
              Total: <span className="font-medium text-foreground">{totalIdleDays} days</span>
            </p>
          )}
        </div>
      </div>

      {/* Brokerage, Commission & Fixed Costs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="brokerage">Brokerage (%)</Label>
          <Input
            id="brokerage"
            type="number"
            step="0.01"
            lang="en"
            value={formData.brokeragePercent}
            onChange={(e) => updateField("brokeragePercent", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="commission">Commission (%)</Label>
          <Input
            id="commission"
            type="number"
            step="0.01"
            lang="en"
            value={formData.commissionPercent}
            onChange={(e) => updateField("commissionPercent", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lubOilCosts">Lub Oil / CLO <span className="text-muted-foreground font-normal">(USD)</span></Label>
          <Input
            type="number"
            step="0.01"
            lang="en"
            placeholder="0"
            value={formData.lubOilCosts}
            onChange={(e) => updateField("lubOilCosts", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Lubricating & Cylinder Oil</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="canalTolls">Canal Tolls <span className="text-muted-foreground font-normal">(USD)</span></Label>
          <Input
            type="number"
            step="0.01"
            lang="en"
            placeholder="0"
            value={formData.canalTolls}
            onChange={(e) => updateField("canalTolls", e.target.value)}
          />
        </div>
      </div>

      {/* Per-Port PDA Costs */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-green-400" />
            PDA Cost — Load Ports
          </Label>
          <p className="text-xs text-muted-foreground -mt-1">Proforma Disbursement Account</p>
          {loadPorts.map((port, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs text-muted-foreground">{port.trim() || `Load Port ${i + 1}`}</p>
              <Input
                type="number"
                step="0.01"
                lang="en"
                placeholder="0"
                value={portLoadPda[i] || ""}
                onChange={(e) => { const u = [...portLoadPda]; u[i] = e.target.value; setPortLoadPda(u); }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Label className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-green-400" />
            PDA Cost — Discharge Ports
          </Label>
          <p className="text-xs text-muted-foreground -mt-1">Proforma Disbursement Account</p>
          {dischargePorts.map((port, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs text-muted-foreground">{port.trim() || `Discharge Port ${i + 1}`}</p>
              <Input
                type="number"
                step="0.01"
                lang="en"
                placeholder="0"
                value={portDischargePda[i] || ""}
                onChange={(e) => { const u = [...portDischargePda]; u[i] = e.target.value; setPortDischargePda(u); }}
              />
            </div>
          ))}
        </div>
        {(loadPorts.length + dischargePorts.length > 2) && totalPdaCosts > 0 && (
          <p className="text-xs text-muted-foreground md:col-span-2 pt-1 border-t border-border/50">
            Total PDA: <span className="font-medium text-foreground">${totalPdaCosts.toLocaleString()}</span>
          </p>
        )}
      </div>

      {/* Per-Port Crane Usage */}
      <div className="p-4 rounded-lg bg-muted/50 space-y-3">
        <div>
          <Label className="text-base font-medium">Use Vessel Cranes for Cargo Ops</Label>
          <p className="text-sm text-muted-foreground mt-1">Select which ports will use vessel cranes — affects port consumption calculation</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {loadPorts.map((port, i) => (
            <div key={`cl-${i}`} className="flex items-center gap-3 p-2 rounded-md bg-background/50">
              <button
                type="button" role="switch" aria-checked={portLoadCrane[i] || false}
                onClick={() => { const u = [...portLoadCrane]; u[i] = !u[i]; setPortLoadCrane(u); }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  portLoadCrane[i] ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${
                  portLoadCrane[i] ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
              <div>
                <p className="text-sm font-medium">{port.trim() || `Load Port ${i + 1}`}</p>
                <p className="text-xs text-muted-foreground">{portLoadCrane[i] ? "With Crane" : "Without Crane"}</p>
              </div>
            </div>
          ))}
          {dischargePorts.map((port, i) => (
            <div key={`cd-${i}`} className="flex items-center gap-3 p-2 rounded-md bg-background/50">
              <button
                type="button" role="switch" aria-checked={portDischargeCrane[i] || false}
                onClick={() => { const u = [...portDischargeCrane]; u[i] = !u[i]; setPortDischargeCrane(u); }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  portDischargeCrane[i] ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${
                  portDischargeCrane[i] ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
              <div>
                <p className="text-sm font-medium">{port.trim() || `Discharge Port ${i + 1}`}</p>
                <p className="text-xs text-muted-foreground">{portDischargeCrane[i] ? "With Crane" : "Without Crane"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Named Additional Costs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-amber-400" />
            Additional Costs
          </Label>
          <Button
            type="button" variant="ghost" size="sm"
            onClick={() => setNamedAdditionalCosts(prev => [...prev, { name: "", amount: "" }])}
            className="text-xs h-7 text-primary hover:text-primary"
          >
            <Plus className="h-3 w-3 mr-1" /> Add Cost
          </Button>
        </div>
        {namedAdditionalCosts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center border rounded-lg bg-muted/30">
            No additional costs — click “Add Cost” to add items like Fresh Water, Pallets, etc.
          </p>
        ) : (
          <div className="space-y-2">
            {namedAdditionalCosts.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="Cost name (e.g., Fresh Water)"
                  value={item.name}
                  onChange={(e) => {
                    const u = [...namedAdditionalCosts]; u[i] = { ...u[i], name: e.target.value }; setNamedAdditionalCosts(u);
                  }}
                  className="flex-1"
                />
                <Input
                  type="number"
                  step="0.01"
                  lang="en"
                  placeholder="Amount"
                  value={item.amount}
                  onChange={(e) => {
                    const u = [...namedAdditionalCosts]; u[i] = { ...u[i], amount: e.target.value }; setNamedAdditionalCosts(u);
                  }}
                  className="w-48"
                />
                <Button
                  type="button" variant="ghost" size="icon"
                  onClick={() => setNamedAdditionalCosts(prev => prev.filter((_, idx) => idx !== i))}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {totalAdditionalCosts > 0 && (
              <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                Total: <span className="font-medium text-foreground">${totalAdditionalCosts.toLocaleString()}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Fuel Price Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Fuel Prices <span className="text-muted-foreground font-normal">(USD/MT)</span></Label>
        </div>
        {fuelPrices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
            Select a vessel to see its fuel types
          </p>
        ) : (
          <div className="grid gap-3">
            {fuelPrices.map((fp, index) => (
              <div key={fp.fuelType} className="flex gap-2 items-center">
                <div className="w-32 px-3 py-2 rounded-md border bg-muted/50 text-sm font-medium">
                  {fp.fuelType}
                </div>
                <Input
                  type="number"
                  step="0.01"
                  lang="en"
                  placeholder="Price ($/MT)"
                  value={fp.price}
                  onChange={(e) => {
                    const updated = [...fuelPrices];
                    updated[index].price = e.target.value;
                    setFuelPrices(updated);
                  }}
                  className="flex-1"
                />
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Enter prices for each fuel type used on this voyage</p>
      </div>

      {/* Freight Rate moved to Cargo Manifest parcels */}

      {/* Submit */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t">
        {/* Auto-save status indicator */}
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-h-[20px]">
          {!isEditMode && autoSaveStatus === "saving" && (
            <><Loader2 className="h-3 w-3 animate-spin" /> Saving draft...</>
          )}
          {!isEditMode && autoSaveStatus === "saved" && (
            <><Check className="h-3 w-3 text-emerald-400" /> Draft saved</>
          )}
          {!isEditMode && autoSaveStatus === "error" && (
            <><AlertCircle className="h-3 w-3 text-red-400" /> Auto-save failed</>
          )}
        </div>
        <div className="flex gap-3 ml-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => isInquiryMode && onClose ? onClose() : router.back()}
            disabled={isLoading || isDraftSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading || isDraftSaving}
            onClick={(e) => handleSubmit(e as any, true)}
          >
            {isDraftSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isInquiryMode ? "Save Draft" : "Save as Draft"}
          </Button>
          <Button type="submit" disabled={isLoading || isDraftSaving}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isInquiryMode ? "Create Inquiry" : isEditMode ? "Save & Recalculate" : "Create Voyage"}
          </Button>
        </div>
      </div>
    </form>

      {/* AI Voyage Advisor Dialog (shown after Create Voyage) */}
      <VoyageAdvisorDialog
        open={showAdvisorDialog}
        onOpenChange={(open) => {
          setShowAdvisorDialog(open);
          // When dialog closes, navigate to voyage
          if (!open && advisorVoyageUrl) {
            router.refresh();
            router.push(advisorVoyageUrl);
          }
        }}
        summary={advisorSummary}
        isLoading={isAdvisorLoading}
        voyageUrl={advisorVoyageUrl}
      />
    </>
  );
}
