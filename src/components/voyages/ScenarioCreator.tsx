"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, GitCompare, Save } from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface ScenarioCreatorProps {
  voyageId: string;
  baseValues: {
    bunkerPriceUsd: number;
    freightRateUsd: number | null;
    ladenSpeed: number;
    loadPortDays: number;
    dischargePortDays: number;
  };
}

export function ScenarioCreator({ voyageId, baseValues }: ScenarioCreatorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [scenarioName, setScenarioName] = useState("");
  const [description, setDescription] = useState("");
  
  // Override values with percentage changes
  const [bunkerChange, setBunkerChange] = useState(0);
  const [freightChange, setFreightChange] = useState(0);
  const [portDaysChange, setPortDaysChange] = useState(0);

  const calculateOverrides = () => {
    const overrides: Record<string, number> = {};
    
    if (bunkerChange !== 0) {
      overrides.bunkerPriceUsd = baseValues.bunkerPriceUsd * (1 + bunkerChange / 100);
    }
    
    if (freightChange !== 0 && baseValues.freightRateUsd) {
      overrides.freightRateUsd = baseValues.freightRateUsd * (1 + freightChange / 100);
    }
    
    if (portDaysChange !== 0) {
      overrides.loadPortDays = baseValues.loadPortDays + portDaysChange / 2;
      overrides.dischargePortDays = baseValues.dischargePortDays + portDaysChange / 2;
    }
    
    return overrides;
  };

  const handleCreate = async () => {
    if (!scenarioName.trim()) {
      setError("Please enter a scenario name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/voyages/${voyageId}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scenarioName,
          description: description || undefined,
          overrides: calculateOverrides(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create scenario");
      }

      // Reset form and close
      setScenarioName("");
      setDescription("");
      setBunkerChange(0);
      setFreightChange(0);
      setPortDaysChange(0);
      setIsOpen(false);
      
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Create Scenario
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Create Scenario
          </DialogTitle>
          <DialogDescription>
            Adjust variables to see how they affect voyage profitability
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Scenario Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Scenario Name</Label>
            <Input
              id="name"
              placeholder="e.g., High Bunker Price"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="Brief description of this scenario"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Bunker Price Adjustment */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Bunker Price</Label>
              <span className={`text-sm font-medium ${bunkerChange > 0 ? "text-red-400" : bunkerChange < 0 ? "text-green-400" : ""}`}>
                {bunkerChange > 0 ? "+" : ""}{bunkerChange}%
              </span>
            </div>
            <Slider
              value={[bunkerChange]}
              onValueChange={([v]) => setBunkerChange(v)}
              min={-30}
              max={30}
              step={5}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>${formatNumber(baseValues.bunkerPriceUsd * 0.7)}</span>
              <span className="font-medium">${formatNumber(baseValues.bunkerPriceUsd)}</span>
              <span>${formatNumber(baseValues.bunkerPriceUsd * 1.3)}</span>
            </div>
          </div>

          {/* Freight Rate Adjustment */}
          {baseValues.freightRateUsd && (
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Freight Rate</Label>
                <span className={`text-sm font-medium ${freightChange > 0 ? "text-green-400" : freightChange < 0 ? "text-red-400" : ""}`}>
                  {freightChange > 0 ? "+" : ""}{freightChange}%
                </span>
              </div>
              <Slider
                value={[freightChange]}
                onValueChange={([v]) => setFreightChange(v)}
                min={-30}
                max={30}
                step={5}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>${formatNumber(baseValues.freightRateUsd * 0.7)}</span>
                <span className="font-medium">${formatNumber(baseValues.freightRateUsd)}</span>
                <span>${formatNumber(baseValues.freightRateUsd * 1.3)}</span>
              </div>
            </div>
          )}

          {/* Port Days Adjustment */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Additional Port Days</Label>
              <span className={`text-sm font-medium ${portDaysChange > 0 ? "text-red-400" : portDaysChange < 0 ? "text-green-400" : ""}`}>
                {portDaysChange > 0 ? "+" : ""}{portDaysChange} days
              </span>
            </div>
            <Slider
              value={[portDaysChange]}
              onValueChange={([v]) => setPortDaysChange(v)}
              min={-4}
              max={10}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-4 days</span>
              <span className="font-medium">Base</span>
              <span>+10 days</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Create & Calculate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
