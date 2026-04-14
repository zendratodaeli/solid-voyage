"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { VESSEL_TYPE_LABELS, COMMERCIAL_CONTROL_LABELS } from "@/types";
import type { CommercialControl, VesselType } from "@/types";
import { VesselProfileUploader, type ParsedVesselData, type VesselProfileUploaderRef } from "@/components/vessels/VesselProfileUploader";

const vesselTypes = Object.entries(VESSEL_TYPE_LABELS);

// Grouped vessel types for the select
const VESSEL_TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Bulk Carriers", types: ["CAPESIZE", "PANAMAX", "POST_PANAMAX", "SUPRAMAX", "HANDYMAX", "HANDYSIZE", "BULK_CARRIER"] },
  { label: "Tankers", types: ["VLCC", "SUEZMAX", "AFRAMAX", "MR_TANKER", "LR1_TANKER", "LR2_TANKER", "CHEMICAL_TANKER", "PRODUCT_TANKER"] },
  { label: "Container Ships", types: ["CONTAINER_FEEDER", "CONTAINER_PANAMAX", "CONTAINER_POST_PANAMAX", "CONTAINER_ULCV"] },
  { label: "Gas Carriers", types: ["LNG_CARRIER", "LPG_CARRIER"] },
  { label: "General / Specialized", types: ["GENERAL_CARGO", "MULTI_PURPOSE", "HEAVY_LIFT", "CAR_CARRIER", "RO_RO", "OTHER"] },
];

// Fuel types available for selection
const FUEL_TYPES = [
  { value: "VLSFO", label: "VLSFO" },
  { value: "LSMGO", label: "LSMGO" },
  { value: "HFO", label: "HFO" },
  { value: "HSFO", label: "HSFO" },
  { value: "MGO", label: "MGO" },
  { value: "LNG", label: "LNG" },
];

// Helpers to determine what type-specific sections to show
const isBulkType = (t: string) => ["CAPESIZE", "PANAMAX", "POST_PANAMAX", "SUPRAMAX", "HANDYMAX", "HANDYSIZE", "BULK_CARRIER", "GENERAL_CARGO", "MULTI_PURPOSE", "HEAVY_LIFT"].includes(t);
const isTankerType = (t: string) => ["VLCC", "SUEZMAX", "AFRAMAX", "MR_TANKER", "LR1_TANKER", "LR2_TANKER", "CHEMICAL_TANKER", "PRODUCT_TANKER"].includes(t);
const isContainerType = (t: string) => ["CONTAINER_FEEDER", "CONTAINER_PANAMAX", "CONTAINER_POST_PANAMAX", "CONTAINER_ULCV"].includes(t);
const isGasCarrierType = (t: string) => ["LNG_CARRIER", "LPG_CARRIER"].includes(t);
const hasCranes = (t: string) => ["GENERAL_CARGO", "MULTI_PURPOSE", "HEAVY_LIFT", "BULK_CARRIER", "HANDYSIZE", "HANDYMAX", "SUPRAMAX"].includes(t);

// Type for per-fuel consumption entry
type FuelConsumptionEntry = {
  fuelType: string;
  ladenConsumption: string;
  ballastConsumption: string;
};

interface VesselFormProps {
  vessel?: {
    id: string;
    name: string;
    vesselType: string;
    customVesselType?: string | null;
    dwt: number;
    // Dimensions
    loa?: number | null;
    beam?: number | null;
    summerDraft?: number | null;
    grossTonnage?: number | null;
    netTonnage?: number | null;
    // Identification
    yearBuilt?: number | null;
    flagState?: string | null;
    classificationSociety?: string | null;
    iceClass?: string | null;
    vesselConstant?: number | null;
    // Speed & Consumption
    ladenSpeed: number;
    ballastSpeed: number;
    ecoLadenSpeed?: number | null;
    ecoBallastSpeed?: number | null;
    ladenConsumption: number;
    ballastConsumption: number;
    ecoLadenConsumption?: number | null;
    ecoBallastConsumption?: number | null;
    portConsumptionWithCrane?: number | null;
    portConsumptionWithoutCrane?: number | null;
    dailyOpex?: number | null;
    commercialControl?: string;
    dailyTcHireRate?: number | null;
    tcHireStartDate?: string | null;
    tcHireEndDate?: string | null;
    portFuelType?: string;
    hasScrubber?: boolean;
    imoNumber?: string | null;
    mmsiNumber?: string | null;
    // Per-fuel consumption data
    fuelConsumption?: Record<string, { laden: number; ballast: number }> | null;
    // Bulk/General Cargo
    grainCapacity?: number | null;
    baleCapacity?: number | null;
    numberOfHolds?: number | null;
    numberOfHatches?: number | null;
    grabFitted?: boolean | null;
    craneCount?: number | null;
    craneSWL?: number | null;
    hasTweenDecks?: boolean | null;
    // Container
    teuCapacity?: number | null;
    feuCapacity?: number | null;
    reeferPlugs?: number | null;
    // Tanker
    tankCapacity?: number | null;
    numberOfTanks?: number | null;
    coatedTanks?: boolean | null;
    heatingCoils?: boolean | null;
    pumpingRate?: number | null;
    hasIGS?: boolean | null;
    hasCOW?: boolean | null;
    hasSBT?: boolean | null;
    // LNG/LPG
    cargoTankCapacityCbm?: number | null;
    containmentType?: string | null;
    boilOffRate?: number | null;
    dualFuelEngine?: string | null;
    heelQuantity?: number | null;
  };
  mode?: "create" | "edit";
}

export function VesselForm({ vessel, mode = "create" }: VesselFormProps) {
  const router = useRouter();
  const routeParams = useParams();
  const orgSlug = routeParams.orgSlug as string;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploaderRef = useRef<VesselProfileUploaderRef>(null);

  // Collapsible sections
  const [showDimensions, setShowDimensions] = useState(!!(vessel?.loa || vessel?.beam || vessel?.summerDraft));
  const [showEcoSpeed, setShowEcoSpeed] = useState(!!(vessel?.ecoLadenSpeed || vessel?.ecoBallastSpeed));
  const [showTypeSpecific, setShowTypeSpecific] = useState(true);

  // Check if the vessel type is OTHER and has a custom type
  const hasCustomType = vessel?.vesselType === "OTHER" && vessel?.customVesselType;
  
  // Initialize fuel consumption entries from vessel data or defaults
  const initFuelConsumptions = (): FuelConsumptionEntry[] => {
    if (vessel?.fuelConsumption && Object.keys(vessel.fuelConsumption).length > 0) {
      return Object.entries(vessel.fuelConsumption).map(([fuelType, data]) => ({
        fuelType,
        ladenConsumption: data.laden.toString(),
        ballastConsumption: data.ballast.toString(),
      }));
    }
    // Fallback to legacy single values with default fuel type
    return [{
      fuelType: "VLSFO",
      ladenConsumption: vessel?.ladenConsumption?.toString() || "",
      ballastConsumption: vessel?.ballastConsumption?.toString() || "",
    }];
  };
  
  const [formData, setFormData] = useState({
    name: vessel?.name || "",
    imoNumber: vessel?.imoNumber || "",
    mmsiNumber: vessel?.mmsiNumber || "",
    vesselType: vessel?.vesselType || "",
    customVesselType: hasCustomType ? vessel.customVesselType : "",
    dwt: vessel?.dwt?.toString() || "",
    // Dimensions
    loa: vessel?.loa?.toString() || "",
    beam: vessel?.beam?.toString() || "",
    summerDraft: vessel?.summerDraft?.toString() || "",
    grossTonnage: vessel?.grossTonnage?.toString() || "",
    netTonnage: vessel?.netTonnage?.toString() || "",
    // Identification
    yearBuilt: vessel?.yearBuilt?.toString() || "",
    flagState: vessel?.flagState || "",
    classificationSociety: vessel?.classificationSociety || "",
    iceClass: vessel?.iceClass || "",
    vesselConstant: vessel?.vesselConstant?.toString() || "",
    // Speed
    ladenSpeed: vessel?.ladenSpeed?.toString() || "",
    ballastSpeed: vessel?.ballastSpeed?.toString() || "",
    ecoLadenSpeed: vessel?.ecoLadenSpeed?.toString() || "",
    ecoBallastSpeed: vessel?.ecoBallastSpeed?.toString() || "",
    ecoLadenConsumption: vessel?.ecoLadenConsumption?.toString() || "",
    ecoBallastConsumption: vessel?.ecoBallastConsumption?.toString() || "",
    // Port
    portConsumptionWithCrane: vessel?.portConsumptionWithCrane?.toString() || "",
    portConsumptionWithoutCrane: vessel?.portConsumptionWithoutCrane?.toString() || "",
    dailyOpex: vessel?.dailyOpex?.toString() || "",
    commercialControl: vessel?.commercialControl || "OWNED_BAREBOAT",
    dailyTcHireRate: vessel?.dailyTcHireRate?.toString() || "",
    tcHireStartDate: vessel?.tcHireStartDate ? new Date(vessel.tcHireStartDate).toISOString().slice(0, 10) : "",
    tcHireEndDate: vessel?.tcHireEndDate ? new Date(vessel.tcHireEndDate).toISOString().slice(0, 10) : "",
    portFuelType: vessel?.portFuelType || "LSMGO",
    hasScrubber: vessel?.hasScrubber || false,
    // Bulk / General Cargo
    grainCapacity: vessel?.grainCapacity?.toString() || "",
    baleCapacity: vessel?.baleCapacity?.toString() || "",
    numberOfHolds: vessel?.numberOfHolds?.toString() || "",
    numberOfHatches: vessel?.numberOfHatches?.toString() || "",
    grabFitted: vessel?.grabFitted ?? false,
    craneCount: vessel?.craneCount?.toString() || "",
    craneSWL: vessel?.craneSWL?.toString() || "",
    hasTweenDecks: vessel?.hasTweenDecks ?? false,
    // Container
    teuCapacity: vessel?.teuCapacity?.toString() || "",
    feuCapacity: vessel?.feuCapacity?.toString() || "",
    reeferPlugs: vessel?.reeferPlugs?.toString() || "",
    // Tanker
    tankCapacity: vessel?.tankCapacity?.toString() || "",
    numberOfTanks: vessel?.numberOfTanks?.toString() || "",
    coatedTanks: vessel?.coatedTanks ?? false,
    heatingCoils: vessel?.heatingCoils ?? false,
    pumpingRate: vessel?.pumpingRate?.toString() || "",
    hasIGS: vessel?.hasIGS ?? false,
    hasCOW: vessel?.hasCOW ?? false,
    hasSBT: vessel?.hasSBT ?? false,
    // LNG/LPG
    cargoTankCapacityCbm: vessel?.cargoTankCapacityCbm?.toString() || "",
    containmentType: vessel?.containmentType || "",
    boilOffRate: vessel?.boilOffRate?.toString() || "",
    dualFuelEngine: vessel?.dualFuelEngine || "",
    heelQuantity: vessel?.heelQuantity?.toString() || "",
  });
  
  // Dynamic fuel consumption entries
  const [fuelConsumptions, setFuelConsumptions] = useState<FuelConsumptionEntry[]>(initFuelConsumptions());
  
  // Remove a fuel type
  const removeFuelType = (index: number) => {
    if (fuelConsumptions.length <= 1) {
      toast.error("At least one fuel type is required");
      return;
    }
    setFuelConsumptions(prev => prev.filter((_, i) => i !== index));
  };
  
  // Update fuel consumption value
  const updateFuelConsumption = (index: number, field: 'ladenConsumption' | 'ballastConsumption', value: string) => {
    setFuelConsumptions(prev => prev.map((fc, i) => 
      i === index ? { ...fc, [field]: value } : fc
    ));
  };
  
  // State for new fuel type input
  const [newFuelType, setNewFuelType] = useState("");
  
  // Handle adding custom fuel type
  const handleAddFuelType = () => {
    const fuelType = newFuelType.trim().toUpperCase();
    if (!fuelType) {
      toast.error("Please enter a fuel type name");
      return;
    }
    if (fuelConsumptions.some(fc => fc.fuelType === fuelType)) {
      toast.error(`${fuelType} is already added`);
      return;
    }
    setFuelConsumptions(prev => [...prev, { fuelType, ladenConsumption: "", ballastConsumption: "" }]);
    setNewFuelType("");
  };

  // Helpers
  const optionalFloat = (v: string) => v ? parseFloat(v) : undefined;
  const optionalInt = (v: string) => v ? parseInt(v) : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Build fuelConsumption object from entries
      const fuelConsumptionData: Record<string, { laden: number; ballast: number }> = {};
      for (const fc of fuelConsumptions) {
        if (fc.ladenConsumption && fc.ballastConsumption) {
          fuelConsumptionData[fc.fuelType] = {
            laden: parseFloat(fc.ladenConsumption),
            ballast: parseFloat(fc.ballastConsumption),
          };
        }
      }
      
      // Extract fuelTypes array and first entry for legacy fields
      const fuelTypes = fuelConsumptions.map(fc => fc.fuelType);
      const firstFuel = fuelConsumptions[0];
      
      const endpoint = mode === "edit" 
        ? `/api/vessels/${vessel?.id}` 
        : "/api/vessels";
      
      const response = await fetch(endpoint, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // ─── Identity ─────────────────────────────
          name: formData.name,
          imoNumber: formData.imoNumber || undefined,
          mmsiNumber: formData.mmsiNumber || undefined,
          vesselType: formData.vesselType,
          customVesselType: formData.vesselType === "OTHER" && formData.customVesselType
            ? formData.customVesselType
            : undefined,
          dwt: parseFloat(formData.dwt),
          // ─── Dimensions ───────────────────────────
          loa: optionalFloat(formData.loa),
          beam: optionalFloat(formData.beam),
          summerDraft: optionalFloat(formData.summerDraft),
          grossTonnage: optionalFloat(formData.grossTonnage),
          netTonnage: optionalFloat(formData.netTonnage),
          // ─── Identification ───────────────────────
          yearBuilt: optionalInt(formData.yearBuilt),
          flagState: formData.flagState || undefined,
          classificationSociety: formData.classificationSociety || undefined,
          iceClass: formData.iceClass || undefined,
          vesselConstant: optionalFloat(formData.vesselConstant),
          // ─── Bulk / General Cargo ─────────────────
          ...(isBulkType(formData.vesselType) ? {
            grainCapacity: optionalFloat(formData.grainCapacity),
            baleCapacity: optionalFloat(formData.baleCapacity),
            numberOfHolds: optionalInt(formData.numberOfHolds),
            numberOfHatches: optionalInt(formData.numberOfHatches),
            grabFitted: formData.grabFitted || undefined,
            hasTweenDecks: formData.hasTweenDecks || undefined,
          } : {}),
          // ─── Crane ────────────────────────────────
          ...(hasCranes(formData.vesselType) ? {
            craneCount: optionalInt(formData.craneCount),
            craneSWL: optionalFloat(formData.craneSWL),
          } : {}),
          // ─── Container ────────────────────────────
          ...(isContainerType(formData.vesselType) ? {
            teuCapacity: optionalInt(formData.teuCapacity),
            feuCapacity: optionalInt(formData.feuCapacity),
            reeferPlugs: optionalInt(formData.reeferPlugs),
          } : {}),
          // ─── Tanker ───────────────────────────────
          ...(isTankerType(formData.vesselType) ? {
            tankCapacity: optionalFloat(formData.tankCapacity),
            numberOfTanks: optionalInt(formData.numberOfTanks),
            coatedTanks: formData.coatedTanks || undefined,
            heatingCoils: formData.heatingCoils || undefined,
            pumpingRate: optionalFloat(formData.pumpingRate),
            hasIGS: formData.hasIGS || undefined,
            hasCOW: formData.hasCOW || undefined,
            hasSBT: formData.hasSBT || undefined,
          } : {}),
          // ─── LNG / LPG ───────────────────────────
          ...(isGasCarrierType(formData.vesselType) ? {
            cargoTankCapacityCbm: optionalFloat(formData.cargoTankCapacityCbm),
            containmentType: formData.containmentType || undefined,
            boilOffRate: optionalFloat(formData.boilOffRate),
            dualFuelEngine: formData.dualFuelEngine || undefined,
            heelQuantity: optionalFloat(formData.heelQuantity),
          } : {}),
          // ─── Speed & Consumption ──────────────────
          ladenSpeed: parseFloat(formData.ladenSpeed),
          ballastSpeed: formData.ballastSpeed ? parseFloat(formData.ballastSpeed) : parseFloat(formData.ladenSpeed),
          ecoLadenSpeed: optionalFloat(formData.ecoLadenSpeed),
          ecoBallastSpeed: optionalFloat(formData.ecoBallastSpeed),
          ecoLadenConsumption: optionalFloat(formData.ecoLadenConsumption),
          ecoBallastConsumption: optionalFloat(formData.ecoBallastConsumption),
          // Legacy fields - use first fuel type's values
          ladenConsumption: firstFuel?.ladenConsumption ? parseFloat(firstFuel.ladenConsumption) : null,
          ballastConsumption: firstFuel?.ballastConsumption ? parseFloat(firstFuel.ballastConsumption) : null,
          ballastFuelType: firstFuel?.fuelType || "VLSFO",
          ladenFuelType: firstFuel?.fuelType || "VLSFO",
          portConsumptionWithCrane: formData.portConsumptionWithCrane 
            ? parseFloat(formData.portConsumptionWithCrane) 
            : null,
          portConsumptionWithoutCrane: formData.portConsumptionWithoutCrane 
            ? parseFloat(formData.portConsumptionWithoutCrane) 
            : null,
          dailyOpex: formData.commercialControl === "OWNED_BAREBOAT" && formData.dailyOpex && parseFloat(formData.dailyOpex) > 0 
            ? parseFloat(formData.dailyOpex) 
            : null,
          commercialControl: formData.commercialControl,
          dailyTcHireRate: formData.commercialControl === "TIME_CHARTER" && formData.dailyTcHireRate && parseFloat(formData.dailyTcHireRate) > 0
            ? parseFloat(formData.dailyTcHireRate) : null,
          tcHireStartDate: formData.commercialControl === "TIME_CHARTER" && formData.tcHireStartDate
            ? new Date(formData.tcHireStartDate).toISOString() : null,
          tcHireEndDate: formData.commercialControl === "TIME_CHARTER" && formData.tcHireEndDate
            ? new Date(formData.tcHireEndDate).toISOString() : null,
          portFuelType: formData.portFuelType,
          hasScrubber: formData.hasScrubber,
          // New multi-fuel fields
          fuelTypes,
          fuelConsumption: fuelConsumptionData,
        }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response:", text.substring(0, 200));
        throw new Error("Server error - please try again");
      }

      const result = await response.json();

      if (!response.ok) {
        console.error("API Error Response:", result);
        let errorMsg = result.error || `Failed to ${mode} vessel`;
        if (result.details && result.details.issues) {
          const issues = result.details.issues.map((i: { path: string[]; message: string }) => 
            `${i.path.join('.')}: ${i.message}`
          ).join(', ');
          errorMsg = `Validation failed: ${issues}`;
        }
        throw new Error(errorMsg);
      }

      toast.success(mode === "edit" ? "Vessel updated successfully!" : "Vessel created successfully!");
      router.push(`/${orgSlug}/vessels`);
      router.refresh();
    } catch (err) {
      console.error("Form submission error:", err);
      const errorMessage = err instanceof Error ? err.message : "Something went wrong";
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleField = (field: string) => {
    setFormData((prev) => ({ ...prev, [field]: !(prev as Record<string, unknown>)[field] }));
  };

  // ═══════════════════════════════════════════════════════════════
  // AI PROFILE UPLOAD HANDLER
  // ═══════════════════════════════════════════════════════════════
  const handleProfileParsed = useCallback((data: ParsedVesselData, fieldsCount: number) => {
    // Map string/number fields to formData
    const stringFields = [
      "name", "imoNumber", "mmsiNumber", "vesselType", "customVesselType",
      "flagState", "classificationSociety", "iceClass",
      "containmentType", "dualFuelEngine", "portFuelType",
    ];
    const numberFields = [
      "dwt", "loa", "beam", "summerDraft", "grossTonnage", "netTonnage",
      "yearBuilt", "vesselConstant",
      "ladenSpeed", "ballastSpeed", "ecoLadenSpeed", "ecoBallastSpeed",
      "ecoLadenConsumption", "ecoBallastConsumption",
      "portConsumptionWithCrane", "portConsumptionWithoutCrane",
      "dailyOpex", "dailyTcHireRate",
      "grainCapacity", "baleCapacity", "numberOfHolds", "numberOfHatches",
      "craneCount", "craneSWL",
      "tankCapacity", "numberOfTanks", "pumpingRate",
      "teuCapacity", "feuCapacity", "reeferPlugs",
      "cargoTankCapacityCbm", "boilOffRate", "heelQuantity",
    ];
    const booleanFields = [
      "hasScrubber", "grabFitted", "hasTweenDecks",
      "coatedTanks", "heatingCoils", "hasIGS", "hasCOW", "hasSBT",
    ];

    setFormData(prev => {
      const updated = { ...prev };
      for (const key of stringFields) {
        if (data[key] !== undefined && data[key] !== null) {
          (updated as Record<string, unknown>)[key] = String(data[key]);
        }
      }
      for (const key of numberFields) {
        if (data[key] !== undefined && data[key] !== null) {
          (updated as Record<string, unknown>)[key] = String(data[key]);
        }
      }
      for (const key of booleanFields) {
        if (data[key] !== undefined && data[key] !== null) {
          (updated as Record<string, unknown>)[key] = Boolean(data[key]);
        }
      }
      // Auto-fill ballastSpeed from ladenSpeed if not extracted
      // Many vessel specs only list "service speed" without a separate ballast speed
      if (data.ladenSpeed && !data.ballastSpeed) {
        updated.ballastSpeed = String(data.ladenSpeed);
      }
      return updated;
    });

    // Map fuel consumption entries
    if (data.fuelConsumptions && Array.isArray(data.fuelConsumptions) && data.fuelConsumptions.length > 0) {
      setFuelConsumptions(
        data.fuelConsumptions.map(fc => ({
          fuelType: fc.fuelType || "VLSFO",
          ladenConsumption: fc.ladenConsumption ? String(fc.ladenConsumption) : "",
          ballastConsumption: fc.ballastConsumption ? String(fc.ballastConsumption) : "",
        }))
      );
    }

    // Auto-expand collapsible sections if relevant data was found
    if (data.loa || data.beam || data.summerDraft || data.grossTonnage || data.netTonnage) {
      setShowDimensions(true);
    }
    if (data.ecoLadenSpeed || data.ecoBallastSpeed || data.ecoLadenConsumption || data.ecoBallastConsumption) {
      setShowEcoSpeed(true);
    }
    if (data.vesselType) {
      setShowTypeSpecific(true);
    }
  }, []);

  // Section toggle component
  const SectionToggle = ({ label, open, onToggle, badge }: { label: string; open: boolean; onToggle: () => void; badge?: string }) => (
    <button type="button" onClick={onToggle} className="flex items-center gap-2 w-full text-left group">
      <h4 className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</h4>
      {badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{badge}</span>}
      {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
    </button>
  );

  // Checkbox helper
  const CheckboxField = ({ id, label, description, checked, onChange }: { id: string; label: string; description?: string; checked: boolean; onChange: () => void }) => (
    <div className="flex items-center gap-3">
      <input type="checkbox" id={id} checked={checked} onChange={onChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
      <div>
        <Label htmlFor={id} className="text-sm cursor-pointer">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════
  // GLOBAL PASTE INTERCEPTOR (document-level)
  // Detects bulk-pasted vessel data anywhere on the page and routes
  // to AI parser. Short values (port names, numbers) pass through.
  // Uses document.addEventListener like VoyageForm for reliability.
  // ═════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain");
      if (!text || text.trim().length < 20) return; // Ignore short pastes

      // Multi-line or long single-line text → treat as vessel spec data
      const isMultiLine = text.includes("\n") || text.length > 80;
      if (!isMultiLine) return;

      // Skip if user is focused on the AI paste textarea itself
      const active = document.activeElement as HTMLElement;
      if (active?.id === "vessel-paste-textarea") return;

      // If focused on an input/textarea, the paste is clearly not for that field
      // (nobody pastes a 10-line email into a "DWT" input) — intercept it
      e.preventDefault();

      // Show feedback immediately
      toast.info("📋 Pasted text detected — parsing with AI...", { duration: 2000 });

      // Route to AI parser
      if (uploaderRef.current) {
        uploaderRef.current.parseText(text);
        // Scroll to top so user sees the parsing state
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    document.addEventListener("paste", handleGlobalPaste);
    return () => document.removeEventListener("paste", handleGlobalPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI Profile Uploader */}
      <VesselProfileUploader ref={uploaderRef} onFieldsParsed={handleProfileParsed} />

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          BASIC INFO
         ═══════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Vessel Name</Label>
          <Input id="name" placeholder="e.g., MT Ocean Star" value={formData.name} onChange={(e) => updateField("name", e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Vessel Type</Label>
          <Select value={formData.vesselType} onValueChange={(value) => { updateField("vesselType", value); if (value !== "OTHER") updateField("customVesselType", ""); }}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {VESSEL_TYPE_GROUPS.map(group => (
                <div key={group.label}>
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
                  {group.types.map(t => (
                    <SelectItem key={t} value={t}>{VESSEL_TYPE_LABELS[t as VesselType]}</SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Custom Vessel Type */}
      {formData.vesselType === "OTHER" && (
        <div className="space-y-2">
          <Label htmlFor="customVesselType">Specify Vessel Type</Label>
          <Input id="customVesselType" placeholder="e.g., Chemical Tanker, LPG Carrier" value={formData.customVesselType || ""} onChange={(e) => updateField("customVesselType", e.target.value)} required />
        </div>
      )}

      {/* IMO & MMSI Numbers */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="imoNumber">IMO Number</Label>
          <Input id="imoNumber" placeholder="e.g., 9535175" value={formData.imoNumber} onChange={(e) => updateField("imoNumber", e.target.value)} />
          <p className="text-xs text-muted-foreground">International Maritime Organization number (7 digits)</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mmsiNumber">MMSI Number</Label>
          <Input id="mmsiNumber" placeholder="e.g., 538006960" value={formData.mmsiNumber} onChange={(e) => updateField("mmsiNumber", e.target.value)} />
          <p className="text-xs text-muted-foreground">Maritime Mobile Service Identity — required for AIS tracking</p>
        </div>
      </div>

      {/* Capacity */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="dwt">Deadweight Tonnage (DWT)</Label>
          <NumberInput id="dwt" placeholder="e.g., 300,000" value={formData.dwt} onChange={(value) => updateField("dwt", value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vesselConstant">Vessel Constant <span className="text-muted-foreground font-normal">(MT)</span></Label>
          <Input type="number" step="0.1" id="vesselConstant" placeholder="e.g., 350" value={formData.vesselConstant} onChange={(e) => updateField("vesselConstant", e.target.value)} />
          <p className="text-xs text-muted-foreground">Stores, crew, provisions — deducted from DWT for cargo intake</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="yearBuilt">Year Built</Label>
          <Input type="number" id="yearBuilt" placeholder="e.g., 2018" value={formData.yearBuilt} onChange={(e) => updateField("yearBuilt", e.target.value)} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          VESSEL DIMENSIONS (collapsible)
         ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/50">
        <SectionToggle label="Vessel Dimensions" open={showDimensions} onToggle={() => setShowDimensions(!showDimensions)} badge="Canal/Port Access" />
        {showDimensions && (
          <div className="grid gap-4 md:grid-cols-5 pt-2">
            <div className="space-y-2">
              <Label>LOA <span className="text-muted-foreground font-normal">(m)</span></Label>
              <Input type="number" step="0.01" placeholder="e.g., 229" value={formData.loa} onChange={(e) => updateField("loa", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Beam <span className="text-muted-foreground font-normal">(m)</span></Label>
              <Input type="number" step="0.01" placeholder="e.g., 32" value={formData.beam} onChange={(e) => updateField("beam", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Summer Draft <span className="text-muted-foreground font-normal">(m)</span></Label>
              <Input type="number" step="0.01" placeholder="e.g., 14.5" value={formData.summerDraft} onChange={(e) => updateField("summerDraft", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gross Tonnage</Label>
              <NumberInput placeholder="e.g., 42,000" value={formData.grossTonnage} onChange={(value) => updateField("grossTonnage", value)} />
            </div>
            <div className="space-y-2">
              <Label>Net Tonnage</Label>
              <NumberInput placeholder="e.g., 25,000" value={formData.netTonnage} onChange={(value) => updateField("netTonnage", value)} />
            </div>
          </div>
        )}
        {!showDimensions && (
          <p className="text-xs text-muted-foreground">LOA, Beam, Draft, GT, NT — needed for canal toll calculation and port access validation</p>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          IDENTIFICATION (Flag, Class, Ice)
         ═══════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Flag State</Label>
          <Input placeholder="e.g., Marshall Islands" value={formData.flagState} onChange={(e) => updateField("flagState", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Classification Society</Label>
          <Input placeholder="e.g., DNV" value={formData.classificationSociety} onChange={(e) => updateField("classificationSociety", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Ice Class</Label>
          <Input placeholder="e.g., 1A" value={formData.iceClass} onChange={(e) => updateField("iceClass", e.target.value)} />
          <p className="text-xs text-muted-foreground">For Arctic/Baltic trades</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TYPE-SPECIFIC SECTIONS
         ═══════════════════════════════════════════════════════════ */}
      {formData.vesselType && formData.vesselType !== "OTHER" && (isBulkType(formData.vesselType) || isTankerType(formData.vesselType) || isContainerType(formData.vesselType) || isGasCarrierType(formData.vesselType)) && (
        <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/50">
          <SectionToggle
            label={`${VESSEL_TYPE_LABELS[formData.vesselType as VesselType] || "Type"} — Specific Details`}
            open={showTypeSpecific}
            onToggle={() => setShowTypeSpecific(!showTypeSpecific)}
          />
          {showTypeSpecific && (
            <div className="space-y-4 pt-2">
              {/* ─── Bulk Carrier / General Cargo ───────────────── */}
              {isBulkType(formData.vesselType) && (
                <div className="space-y-3">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Grain Capacity <span className="text-muted-foreground font-normal">(cbm)</span></Label>
                      <NumberInput placeholder="e.g., 72,000" value={formData.grainCapacity} onChange={(v) => updateField("grainCapacity", v)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Bale Capacity <span className="text-muted-foreground font-normal">(cbm)</span></Label>
                      <NumberInput placeholder="e.g., 68,000" value={formData.baleCapacity} onChange={(v) => updateField("baleCapacity", v)} />
                    </div>
                    <div className="space-y-2">
                      <Label>No. of Holds</Label>
                      <Input type="number" placeholder="e.g., 5" value={formData.numberOfHolds} onChange={(e) => updateField("numberOfHolds", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>No. of Hatches</Label>
                      <Input type="number" placeholder="e.g., 5" value={formData.numberOfHatches} onChange={(e) => updateField("numberOfHatches", e.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <CheckboxField id="grabFitted" label="Grab Fitted" description="Self-loading/unloading grabs" checked={formData.grabFitted as boolean} onChange={() => toggleField("grabFitted")} />
                    <CheckboxField id="hasTweenDecks" label="Tween Decks" description="For break-bulk stowage" checked={formData.hasTweenDecks as boolean} onChange={() => toggleField("hasTweenDecks")} />
                  </div>
                  {/* Crane Details */}
                  {hasCranes(formData.vesselType) && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Number of Cranes</Label>
                        <Input type="number" placeholder="e.g., 4" value={formData.craneCount} onChange={(e) => updateField("craneCount", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Crane SWL <span className="text-muted-foreground font-normal">(MT)</span></Label>
                        <Input type="number" step="0.1" placeholder="e.g., 30" value={formData.craneSWL} onChange={(e) => updateField("craneSWL", e.target.value)} />
                        <p className="text-xs text-muted-foreground">Safe Working Load per crane</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Tanker ─────────────────────────────────────── */}
              {isTankerType(formData.vesselType) && (
                <div className="space-y-3">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Tank Capacity <span className="text-muted-foreground font-normal">(cbm)</span></Label>
                      <NumberInput placeholder="e.g., 160,000" value={formData.tankCapacity} onChange={(v) => updateField("tankCapacity", v)} />
                    </div>
                    <div className="space-y-2">
                      <Label>No. of Cargo Tanks</Label>
                      <Input type="number" placeholder="e.g., 12" value={formData.numberOfTanks} onChange={(e) => updateField("numberOfTanks", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Pumping Rate <span className="text-muted-foreground font-normal">(cbm/hr)</span></Label>
                      <Input type="number" step="0.1" placeholder="e.g., 6,000" value={formData.pumpingRate} onChange={(e) => updateField("pumpingRate", e.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <CheckboxField id="coatedTanks" label="Coated Tanks" description="Epoxy/zinc coated" checked={formData.coatedTanks as boolean} onChange={() => toggleField("coatedTanks")} />
                    <CheckboxField id="heatingCoils" label="Heating Coils" description="Viscous cargo capability" checked={formData.heatingCoils as boolean} onChange={() => toggleField("heatingCoils")} />
                    <CheckboxField id="hasIGS" label="Inert Gas System" checked={formData.hasIGS as boolean} onChange={() => toggleField("hasIGS")} />
                    <CheckboxField id="hasCOW" label="COW System" description="Crude Oil Washing" checked={formData.hasCOW as boolean} onChange={() => toggleField("hasCOW")} />
                    <CheckboxField id="hasSBT" label="SBT" description="Segregated Ballast Tanks" checked={formData.hasSBT as boolean} onChange={() => toggleField("hasSBT")} />
                  </div>
                </div>
              )}

              {/* ─── Container Ship ──────────────────────────────── */}
              {isContainerType(formData.vesselType) && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>TEU Capacity</Label>
                    <NumberInput placeholder="e.g., 8,500" value={formData.teuCapacity} onChange={(v) => updateField("teuCapacity", v)} />
                    <p className="text-xs text-muted-foreground">Twenty-foot Equivalent Units</p>
                  </div>
                  <div className="space-y-2">
                    <Label>FEU Capacity</Label>
                    <NumberInput placeholder="e.g., 4,250" value={formData.feuCapacity} onChange={(v) => updateField("feuCapacity", v)} />
                    <p className="text-xs text-muted-foreground">Forty-foot Equivalent Units</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Reefer Plugs</Label>
                    <Input type="number" placeholder="e.g., 500" value={formData.reeferPlugs} onChange={(e) => updateField("reeferPlugs", e.target.value)} />
                    <p className="text-xs text-muted-foreground">Refrigerated container slots</p>
                  </div>
                </div>
              )}

              {/* ─── LNG / LPG Carrier ──────────────────────────── */}
              {isGasCarrierType(formData.vesselType) && (
                <div className="space-y-3">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Cargo Tank Capacity <span className="text-muted-foreground font-normal">(cbm)</span></Label>
                      <NumberInput placeholder="e.g., 174,000" value={formData.cargoTankCapacityCbm} onChange={(v) => updateField("cargoTankCapacityCbm", v)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Containment Type</Label>
                      <Select value={formData.containmentType} onValueChange={(v) => updateField("containmentType", v)}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEMBRANE">Membrane (GTT)</SelectItem>
                          <SelectItem value="MOSS">Moss (Spherical)</SelectItem>
                          <SelectItem value="TYPE_C">Type C (Pressurized)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Boil-Off Rate <span className="text-muted-foreground font-normal">(%/day)</span></Label>
                      <Input type="number" step="0.001" placeholder="e.g., 0.10" value={formData.boilOffRate} onChange={(e) => updateField("boilOffRate", e.target.value)} />
                      <p className="text-xs text-muted-foreground">Daily cargo evaporation rate</p>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Dual-Fuel Engine Type</Label>
                      <Select value={formData.dualFuelEngine} onValueChange={(v) => updateField("dualFuelEngine", v)}>
                        <SelectTrigger><SelectValue placeholder="Select engine type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DFDE">DFDE (Dual Fuel Diesel Electric)</SelectItem>
                          <SelectItem value="ME_GI">ME-GI (MAN)</SelectItem>
                          <SelectItem value="X_DF">X-DF (WinGD)</SelectItem>
                          <SelectItem value="STEAM">Steam Turbine (Legacy)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Heel Quantity <span className="text-muted-foreground font-normal">(cbm)</span></Label>
                      <NumberInput placeholder="e.g., 2,000" value={formData.heelQuantity} onChange={(v) => updateField("heelQuantity", v)} />
                      <p className="text-xs text-muted-foreground">LNG retained on ballast to keep tanks cold</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SPEED PROFILES
         ═══════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ladenSpeed">Laden Speed (knots)</Label>
          <Input id="ladenSpeed" type="number" step="0.1" placeholder="e.g., 12.5" value={formData.ladenSpeed} onChange={(e) => updateField("ladenSpeed", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ballastSpeed">Ballast Speed (knots)</Label>
          <Input id="ballastSpeed" type="number" step="0.1" placeholder="e.g., 13.5" value={formData.ballastSpeed} onChange={(e) => updateField("ballastSpeed", e.target.value)} />
        </div>
      </div>

      {/* Eco Speed (collapsible) */}
      <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/50">
        <SectionToggle label="ECO Speed Profile" open={showEcoSpeed} onToggle={() => setShowEcoSpeed(!showEcoSpeed)} badge="Optional" />
        {showEcoSpeed && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 pt-2">
            <div className="space-y-2">
              <Label>Eco Laden Speed <span className="text-muted-foreground font-normal">(kn)</span></Label>
              <Input type="number" step="0.1" placeholder="e.g., 10.5" value={formData.ecoLadenSpeed} onChange={(e) => updateField("ecoLadenSpeed", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Eco Ballast Speed <span className="text-muted-foreground font-normal">(kn)</span></Label>
              <Input type="number" step="0.1" placeholder="e.g., 11.5" value={formData.ecoBallastSpeed} onChange={(e) => updateField("ecoBallastSpeed", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Eco Laden Consumption <span className="text-muted-foreground font-normal">(MT/day)</span></Label>
              <Input type="number" step="0.1" placeholder="e.g., 22" value={formData.ecoLadenConsumption} onChange={(e) => updateField("ecoLadenConsumption", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Eco Ballast Consumption <span className="text-muted-foreground font-normal">(MT/day)</span></Label>
              <Input type="number" step="0.1" placeholder="e.g., 19" value={formData.ecoBallastConsumption} onChange={(e) => updateField("ecoBallastConsumption", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          FUEL CONSUMPTION PROFILES (unchanged from original)
         ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">Fuel Consumption Profiles</h4>
          <p className="text-xs text-muted-foreground">Click to add common fuel types, or enter a custom type below</p>
        </div>
        
        {/* Predefined fuel type quick-add buttons */}
        <div className="flex flex-wrap gap-2">
          {FUEL_TYPES.filter(ft => !fuelConsumptions.some(fc => fc.fuelType === ft.value)).map((fuel) => (
            <button
              key={fuel.value}
              type="button"
              onClick={() => {
                setFuelConsumptions(prev => [...prev, { fuelType: fuel.value, ladenConsumption: "", ballastConsumption: "" }]);
              }}
              className="px-3 py-1 rounded-full text-sm font-medium border bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              {fuel.label}
            </button>
          ))}
        </div>
        
        {/* Custom fuel type input */}
        <div className="flex gap-2">
          <Input placeholder="Or enter custom fuel type..." value={newFuelType} onChange={(e) => setNewFuelType(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFuelType(); } }} className="flex-1" />
          <Button type="button" variant="outline" onClick={handleAddFuelType}><Plus className="h-4 w-4 mr-2" /> Add Custom</Button>
        </div>
        
        {/* Fuel consumption rows */}
        <div className="space-y-3">
          {fuelConsumptions.map((fc, index) => (
            <div key={fc.fuelType} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="w-20 font-medium text-sm">{fc.fuelType}</div>
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Laden (MT/day)</Label>
                  <Input type="number" step="0.1" placeholder="e.g., 14" value={fc.ladenConsumption} onChange={(e) => updateFuelConsumption(index, 'ladenConsumption', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ballast (MT/day)</Label>
                  <Input type="number" step="0.1" placeholder="e.g., 11" value={fc.ballastConsumption} onChange={(e) => updateFuelConsumption(index, 'ballastConsumption', e.target.value)} />
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeFuelType(index)} disabled={fuelConsumptions.length <= 1} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PORT CONSUMPTION
         ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Port Consumption</h4>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="portConsumptionWithCrane">With Crane (MT/day)</Label>
            <Input id="portConsumptionWithCrane" type="number" step="0.1" placeholder="e.g., 5" value={formData.portConsumptionWithCrane} onChange={(e) => updateField("portConsumptionWithCrane", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portConsumptionWithoutCrane">Without Crane (MT/day)</Label>
            <Input id="portConsumptionWithoutCrane" type="number" step="0.1" placeholder="e.g., 3" value={formData.portConsumptionWithoutCrane} onChange={(e) => updateField("portConsumptionWithoutCrane", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portFuelType">Port Fuel Grade</Label>
            <Select value={formData.portFuelType} onValueChange={(v) => updateField("portFuelType", v)}>
              <SelectTrigger><SelectValue placeholder="Select fuel" /></SelectTrigger>
              <SelectContent>
                {fuelConsumptions.length > 0 ? (
                  fuelConsumptions.map((fc) => (
                    <SelectItem key={fc.fuelType} value={fc.fuelType}>{fc.fuelType}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="VLSFO">VLSFO</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          COMMERCIAL CONTROL & OPERATING COSTS
         ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="commercialControl">Commercial Control</Label>
            <Select value={formData.commercialControl} onValueChange={(value) => updateField("commercialControl", value)}>
              <SelectTrigger><SelectValue placeholder="Select control type" /></SelectTrigger>
              <SelectContent>
                {(Object.entries(COMMERCIAL_CONTROL_LABELS) as [CommercialControl, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formData.commercialControl === "OWNED_BAREBOAT" && (
            <div className="space-y-2">
              <Label htmlFor="dailyOpex">
                Daily OPEX <span className="text-muted-foreground font-normal">(USD/day)</span>
              </Label>
              <NumberInput decimals={2} placeholder="e.g., 12,000" value={formData.dailyOpex} onChange={(val) => updateField("dailyOpex", val)} />
            </div>
          )}
        </div>
        {formData.commercialControl === "VOYAGE_CHARTER" && (
          <p className="text-xs text-muted-foreground">Voyage charterers pay freight only — no daily vessel cost applies.</p>
        )}
        {formData.commercialControl === "TIME_CHARTER" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dailyTcHireRate">
                Daily TC-In Hire Rate <span className="text-muted-foreground font-normal">(USD/day)</span>
              </Label>
              <NumberInput
                decimals={2}
                placeholder="e.g., 15,000"
                value={formData.dailyTcHireRate}
                onChange={(val) => updateField("dailyTcHireRate", val)}
              />
              <p className="text-xs text-muted-foreground">
                Daily hire rate paid to vessel owner. Deducted from TCE in voyage calculations.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tcHireStartDate">Hire Start</Label>
                <Input
                  type="date"
                  id="tcHireStartDate"
                  value={formData.tcHireStartDate}
                  onChange={(e) => updateField("tcHireStartDate", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Charter period commencement date</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tcHireEndDate">Hire End</Label>
                <Input
                  type="date"
                  id="tcHireEndDate"
                  value={formData.tcHireEndDate}
                  onChange={(e) => updateField("tcHireEndDate", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Charter period redelivery date</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          EQUIPMENT
         ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Equipment</h4>
        <CheckboxField
          id="hasScrubber"
          label="Scrubber Fitted (EGCS)?"
          description="Exhaust Gas Cleaning System allows use of HFO/HSFO in ECA zones"
          checked={formData.hasScrubber}
          onChange={() => setFormData(prev => ({ ...prev, hasScrubber: !prev.hasScrubber }))}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === "edit" ? "Update Vessel" : "Create Vessel"}
        </Button>
      </div>
    </form>
  );
}
