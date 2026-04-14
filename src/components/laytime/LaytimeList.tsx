"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrgPath } from "@/hooks/useOrgPath";
import {
  Calculator,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Ship,
  Anchor,
  TrendingUp,
  TrendingDown,
  Loader2,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LaytimeCalc {
  id: string;
  vesselName: string;
  voyageRef: string;
  portName: string;
  operationType: string;
  terms: string;
  allowedHours: number;
  resultType: string | null;
  resultAmount: number | null;
  countedHours: number | null;
  updatedAt: string;
  createdAt: string;
}

function formatDuration(hours: number): string {
  if (!hours || hours < 0) return "—";
  const days = Math.floor(hours / 24);
  const hrs = Math.floor(hours % 24);
  if (days > 0) return `${days}d ${hrs}h`;
  return `${hrs}h`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LaytimeList() {
  const router = useRouter();
  const { orgPath } = useOrgPath();
  const [calcs, setCalcs] = useState<LaytimeCalc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/laytime")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setCalcs(json.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this laytime calculation?")) return;

    // Optimistic: remove from list immediately
    const removedCalc = calcs.find((c) => c.id === id);
    setCalcs((prev) => prev.filter((c) => c.id !== id));
    toast.success("Calculation deleted");

    try {
      const res = await fetch(`/api/laytime/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        // Revert
        if (removedCalc) setCalcs((prev) => [...prev, removedCalc]);
        toast.error("Failed to delete — restored");
      }
    } catch {
      // Revert
      if (removedCalc) setCalcs((prev) => [...prev, removedCalc]);
      toast.error("Failed to delete — restored");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20 border border-primary/30">
              <Calculator className="h-6 w-6 text-primary" />
            </div>
            Laytime & Demurrage
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage saved laytime calculations
          </p>
        </div>
        <Link href={orgPath("/laytime-calculator/new")}>
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            New Calculation
          </Button>
        </Link>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-4 w-14 rounded-full" />
                        <Skeleton className="h-3.5 w-12" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right space-y-1">
                      <Skeleton className="h-5 w-24 rounded-full" />
                      <Skeleton className="h-6 w-28" />
                    </div>
                    <Skeleton className="h-3.5 w-24 hidden md:block" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : calcs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calculator className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-medium mb-2">No calculations yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first laytime & demurrage calculation
            </p>
            <Link href={orgPath("/laytime-calculator/new")}>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                New Calculation
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {calcs.map((calc) => (
            <Card
              key={calc.id}
              className="hover:border-primary/30 transition-colors cursor-pointer group"
              onClick={() => router.push(orgPath(`/laytime-calculator/${calc.id}/edit`))}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={cn(
                      "p-2.5 rounded-lg border shrink-0",
                      calc.resultType === "demurrage"
                        ? "bg-red-500/10 border-red-500/20"
                        : calc.resultType === "despatch"
                        ? "bg-emerald-500/10 border-emerald-500/20"
                        : "bg-muted/50 border-border"
                    )}>
                      {calc.resultType === "demurrage" ? (
                        <TrendingDown className="h-5 w-5 text-red-400" />
                      ) : calc.resultType === "despatch" ? (
                        <TrendingUp className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold truncate">
                          {calc.vesselName || "Unnamed Vessel"}
                        </span>
                        {calc.voyageRef && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {calc.voyageRef}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Anchor className="h-3 w-3" />
                          {calc.portName || "No Port"}
                        </span>
                        <span className="capitalize">{calc.operationType}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {calc.terms}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(calc.allowedHours)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Result & Actions */}
                  <div className="flex items-center gap-4 shrink-0">
                    {calc.resultType && calc.resultAmount != null ? (
                      <div className="text-right">
                        <Badge className={cn(
                          "text-xs px-2 mb-1",
                          calc.resultType === "demurrage"
                            ? "bg-red-500/20 text-red-400 border-red-500/30"
                            : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        )}>
                          {calc.resultType === "demurrage" ? "DEMURRAGE" : "DESPATCH"}
                        </Badge>
                        <div className={cn(
                          "text-lg font-bold tabular-nums",
                          calc.resultType === "demurrage" ? "text-red-400" : "text-emerald-400"
                        )}>
                          ${calc.resultAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Draft</span>
                    )}

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(orgPath(`/laytime-calculator/${calc.id}/edit`));
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(calc.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground text-right ml-2 hidden md:block">
                      {formatDate(calc.updatedAt)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
