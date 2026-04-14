"use client";

/**
 * Route Comparison Card
 * 
 * Displays side-by-side comparison of canal vs non-canal routes.
 * Allows users to select which route to use for downstream calculations.
 * Canal transit cost is a manual input field.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Ship, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface RouteOption {
  id: string;
  label: string;
  distanceNm: number;
  estimatedDays: number | null;
  ecaDistanceNm: number;
  canalName?: string; // Which canal this option uses
}

interface RouteComparisonCardProps {
  options: RouteOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  canalCost: string;
  onCanalCostChange: (value: string) => void;
}

export function RouteComparisonCard({
  options,
  selectedId,
  onSelect,
  canalCost,
  onCanalCostChange,
}: RouteComparisonCardProps) {
  if (options.length < 2) return null;

  const canalOption = options.find(o => o.canalName);
  const directOption = options.find(o => !o.canalName);

  if (!canalOption || !directOption) return null;

  const distanceDiff = directOption.distanceNm - canalOption.distanceNm;
  const daysDiff = (directOption.estimatedDays || 0) - (canalOption.estimatedDays || 0);

  return (
    <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-purple-400">
          <Ship className="h-4 w-4" />
          Route Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Canal Route Option */}
          <button
            type="button"
            onClick={() => onSelect(canalOption.id)}
            className={cn(
              "relative rounded-lg p-3 text-left transition-all border-2",
              selectedId === canalOption.id
                ? "border-green-500/50 bg-green-500/10"
                : "border-border/50 bg-muted/30 hover:bg-muted/50"
            )}
          >
            {selectedId === canalOption.id && (
              <div className="absolute top-2 right-2">
                <Check className="h-4 w-4 text-green-500" />
              </div>
            )}
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {canalOption.label}
            </div>
            <div className="text-lg font-bold">
              {Math.round(canalOption.distanceNm).toLocaleString()} NM
            </div>
            {canalOption.estimatedDays && (
              <div className="text-sm text-muted-foreground">
                {Math.round(canalOption.estimatedDays * 10) / 10} days
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              ECA: {Math.round(canalOption.ecaDistanceNm).toLocaleString()} NM
            </div>
          </button>

          {/* Direct Route Option */}
          <button
            type="button"
            onClick={() => onSelect(directOption.id)}
            className={cn(
              "relative rounded-lg p-3 text-left transition-all border-2",
              selectedId === directOption.id
                ? "border-green-500/50 bg-green-500/10"
                : "border-border/50 bg-muted/30 hover:bg-muted/50"
            )}
          >
            {selectedId === directOption.id && (
              <div className="absolute top-2 right-2">
                <Check className="h-4 w-4 text-green-500" />
              </div>
            )}
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {directOption.label}
            </div>
            <div className="text-lg font-bold">
              {Math.round(directOption.distanceNm).toLocaleString()} NM
            </div>
            {directOption.estimatedDays && (
              <div className="text-sm text-muted-foreground">
                {Math.round(directOption.estimatedDays * 10) / 10} days
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              ECA: {Math.round(directOption.ecaDistanceNm).toLocaleString()} NM
            </div>
          </button>
        </div>

        {/* Difference Summary */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            Canal route saves <span className="font-medium text-foreground">{Math.abs(Math.round(distanceDiff)).toLocaleString()} NM</span>
            {daysDiff > 0 && (
              <> ({Math.round(daysDiff * 10) / 10} days faster)</>
            )}
          </span>
        </div>

        {/* Canal Transit Cost Input */}
        {selectedId === canalOption.id && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap text-muted-foreground">
                Canal Transit Cost ($)
              </Label>
              <Input
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 500000"
                value={canalCost}
                onChange={(e) => onCanalCostChange(e.target.value)}
                className="h-7 text-xs flex-1"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
