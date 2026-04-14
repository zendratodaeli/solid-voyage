"use client";

import { useState, useEffect, use } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LaytimeCalculator } from "@/components/laytime/LaytimeCalculator";
import { AuditHistory } from "@/components/shared/AuditHistory";

export default function EditLaytimePage() {
  const routeParams = useParams();
  const id = routeParams.id as string;
  const [calcData, setCalcData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/laytime/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setCalcData(json.data);
        } else {
          setError(json.error || "Not found");
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LaytimeCalculator existingCalc={calcData} />
      <AuditHistory entityType="voyage" entityId={id} />
    </div>
  );
}
