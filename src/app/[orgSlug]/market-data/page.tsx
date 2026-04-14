"use client";

/**
 * Market Data Manager - Organization Page
 * 
 * Allows updating org-specific fuel benchmarks for voyage cost estimation.
 * Seeded from system defaults on first access.
 * Route: /market-data
 */

import { useState, useEffect } from "react";
import { Save, RefreshCw, TrendingUp, Droplets, Flame, Wind, Scale, Leaf } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface SystemPricing {
  id: string;
  // Fuel Prices
  globalLSMGOAverage: number;
  globalVLSFOAverage: number;
  globalIFO380Average: number;
  globalIFO180Average: number;
  globalLNGAverage: number;
  globalEUAPrice: number;
  // Carbon Factors
  carbonFactorVLSFO: number;
  carbonFactorLSMGO: number;
  carbonFactorIFO380: number;
  carbonFactorIFO180: number;
  carbonFactorLNG: number;
  carbonFactorMETHANOL: number;
  carbonFactorAMMONIA: number;
  lastUpdatedAt: string;
  updatedBy: string | null;
}

export default function MarketDataPage() {
  const [pricing, setPricing] = useState<SystemPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state - use strings for better input handling
  const [formData, setFormData] = useState({
    // Fuel Prices
    globalLSMGOAverage: "",
    globalVLSFOAverage: "",
    globalIFO380Average: "",
    globalIFO180Average: "",
    globalLNGAverage: "",
    globalEUAPrice: "75",
    // Carbon Factors
    carbonFactorVLSFO: "3.114",
    carbonFactorLSMGO: "3.206",
    carbonFactorIFO380: "3.114",
    carbonFactorIFO180: "3.114",
    carbonFactorLNG: "3.160",
    carbonFactorMETHANOL: "1.375",
    carbonFactorAMMONIA: "0.050",
  });

  // Fetch current pricing
  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/market-data");
      if (!res.ok) throw new Error("Failed to fetch pricing");
      const data = await res.json();
      setPricing(data);
      setFormData({
        // Fuel Prices
        globalLSMGOAverage: String(data.globalLSMGOAverage ?? 0),
        globalVLSFOAverage: String(data.globalVLSFOAverage ?? 0),
        globalIFO380Average: String(data.globalIFO380Average ?? 0),
        globalIFO180Average: String(data.globalIFO180Average ?? 0),
        globalLNGAverage: String(data.globalLNGAverage ?? 0),
        globalEUAPrice: String(data.globalEUAPrice ?? 75),
        // Carbon Factors
        carbonFactorVLSFO: String(data.carbonFactorVLSFO ?? 3.114),
        carbonFactorLSMGO: String(data.carbonFactorLSMGO ?? 3.206),
        carbonFactorIFO380: String(data.carbonFactorIFO380 ?? 3.114),
        carbonFactorIFO180: String(data.carbonFactorIFO180 ?? 3.114),
        carbonFactorLNG: String(data.carbonFactorLNG ?? 3.160),
        carbonFactorMETHANOL: String(data.carbonFactorMETHANOL ?? 1.375),
        carbonFactorAMMONIA: String(data.carbonFactorAMMONIA ?? 0.050),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      // Convert string values to numbers for API
      const numericData = {
        // Fuel Prices
        globalLSMGOAverage: parseFloat(formData.globalLSMGOAverage) || 0,
        globalVLSFOAverage: parseFloat(formData.globalVLSFOAverage) || 0,
        globalIFO380Average: parseFloat(formData.globalIFO380Average) || 0,
        globalIFO180Average: parseFloat(formData.globalIFO180Average) || 0,
        globalLNGAverage: parseFloat(formData.globalLNGAverage) || 0,
        globalEUAPrice: parseFloat(formData.globalEUAPrice) || 75,
        // Carbon Factors
        carbonFactorVLSFO: parseFloat(formData.carbonFactorVLSFO) || 3.114,
        carbonFactorLSMGO: parseFloat(formData.carbonFactorLSMGO) || 3.206,
        carbonFactorIFO380: parseFloat(formData.carbonFactorIFO380) || 3.114,
        carbonFactorIFO180: parseFloat(formData.carbonFactorIFO180) || 3.114,
        carbonFactorLNG: parseFloat(formData.carbonFactorLNG) || 3.160,
        carbonFactorMETHANOL: parseFloat(formData.carbonFactorMETHANOL) || 1.375,
        carbonFactorAMMONIA: parseFloat(formData.carbonFactorAMMONIA) || 0.050,
      };

      const res = await fetch("/api/market-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(numericData),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update pricing");
      }
      
      const data = await res.json();
      setPricing(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pricing");
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    // Keep as string to allow proper editing (empty string, decimals, etc.)
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-primary" />
          Market Data & Benchmarks
        </h1>
        <p className="text-muted-foreground mt-2">
          Update global fuel price benchmarks for voyage cost estimation.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600">
          ✓ Market rates updated successfully
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Distillates Section */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              Distillates (ECA Compliant)
            </CardTitle>
            <CardDescription>
              Low sulfur fuels required in Emission Control Areas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lsmgo">Global LSMGO Price ($/MT)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="lsmgo"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.globalLSMGOAverage}
                    onChange={(e) => handleInputChange("globalLSMGOAverage", e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Low Sulfur Marine Gas Oil (0.1% S) - ECA Compliant
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Residuals Section */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              Residuals (Main Engine Fuels)
            </CardTitle>
            <CardDescription>
              Standard fuels for open sea navigation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="vlsfo">Global VLSFO Price ($/MT)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="vlsfo"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.globalVLSFOAverage}
                    onChange={(e) => handleInputChange("globalVLSFOAverage", e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Very Low Sulfur Fuel Oil (0.5% S)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ifo380">Global IFO380 Price ($/MT)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="ifo380"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.globalIFO380Average}
                    onChange={(e) => handleInputChange("globalIFO380Average", e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Heavy Fuel Oil (Requires Scrubber)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ifo180">Global IFO180 Price ($/MT)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="ifo180"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.globalIFO180Average}
                    onChange={(e) => handleInputChange("globalIFO180Average", e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Intermediate Fuel Oil (High Sulfur)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alternative Fuels Section */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wind className="h-5 w-5 text-green-500" />
              Alternative Fuels
            </CardTitle>
            <CardDescription>
              Low-carbon fuel options
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lng">Global LNG Price ($/MT)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="lng"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.globalLNGAverage}
                    onChange={(e) => handleInputChange("globalLNGAverage", e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Liquefied Natural Gas (Low Carbon)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Regulatory Costs Section */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-purple-500" />
              Regulatory Costs
            </CardTitle>
            <CardDescription>
              Carbon pricing for EU ETS compliance calculations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="eua">EU ETS Carbon Price ($/MT CO₂)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="eua"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.globalEUAPrice}
                    onChange={(e) => handleInputChange("globalEUAPrice", e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Source: Trading Economics (EU Carbon Permits). Convert EUR to USD before entering.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Carbon Emission Factors Section */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Leaf className="h-5 w-5 text-emerald-500" />
              Carbon Emission Factors
            </CardTitle>
            <CardDescription>
              IMO MEPC.308 carbon factors (MT CO₂ per MT Fuel). These values are used for EU ETS calculations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cf-vlsfo">VLSFO</Label>
                <Input
                  id="cf-vlsfo"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.carbonFactorVLSFO}
                  onChange={(e) => handleInputChange("carbonFactorVLSFO", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Very Low Sulfur Fuel Oil</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-lsmgo">LSMGO</Label>
                <Input
                  id="cf-lsmgo"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.carbonFactorLSMGO}
                  onChange={(e) => handleInputChange("carbonFactorLSMGO", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Low Sulfur Marine Gas Oil</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-ifo380">IFO380</Label>
                <Input
                  id="cf-ifo380"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.carbonFactorIFO380}
                  onChange={(e) => handleInputChange("carbonFactorIFO380", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Heavy Fuel Oil</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-ifo180">IFO180</Label>
                <Input
                  id="cf-ifo180"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.carbonFactorIFO180}
                  onChange={(e) => handleInputChange("carbonFactorIFO180", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Intermediate Fuel Oil</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-lng">LNG</Label>
                <Input
                  id="cf-lng"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.carbonFactorLNG}
                  onChange={(e) => handleInputChange("carbonFactorLNG", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Liquefied Natural Gas</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-methanol">Methanol</Label>
                <Input
                  id="cf-methanol"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.carbonFactorMETHANOL}
                  onChange={(e) => handleInputChange("carbonFactorMETHANOL", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Alternative Fuel</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-ammonia">Ammonia</Label>
                <Input
                  id="cf-ammonia"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.carbonFactorAMMONIA}
                  onChange={(e) => handleInputChange("carbonFactorAMMONIA", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Very Low Carbon</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            💡 Update weekly using Ship & Bunker Global 20 Ports Average. Do not use web scrapers.
          </p>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Update Market Rates
              </>
            )}
          </Button>
        </div>

        {/* Last Updated */}
        {pricing?.lastUpdatedAt && (
          <p className="text-xs text-muted-foreground text-right">
            Last updated: {new Date(pricing.lastUpdatedAt).toLocaleString()}
          </p>
        )}
      </form>
    </div>
  );
}
