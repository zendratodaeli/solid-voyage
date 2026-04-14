"use client";

import { useState, useOptimistic, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePusher } from "@/hooks/use-pusher";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Calculator, 
  Loader2, 
  FileCheck,
  XCircle,
  FlagTriangleRight,
  FileDown,
  ChevronDown,
  MoreHorizontal,
  Undo2,
} from "lucide-react";
import { ScenarioCreator } from "@/components/voyages/ScenarioCreator";

interface VoyageDetailClientProps {
  voyageId: string;
  status: string;
  hasCalculation: boolean;
  permission: string;
  isLocked?: boolean;
  baseValues?: {
    bunkerPriceUsd: number;
    freightRateUsd: number | null;
    ladenSpeed: number;
    loadPortDays: number;
    dischargePortDays: number;
  };
}

// ─── Status visual config ────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; bgColor: string; textColor: string }> = {
  DRAFT: {
    label: "Draft",
    dotColor: "bg-zinc-400",
    bgColor: "bg-zinc-500/10 border-zinc-500/20",
    textColor: "text-zinc-300",
  },
  NEW: {
    label: "New-Evaluating",
    dotColor: "bg-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    textColor: "text-blue-300",
  },
  OFFERED: {
    label: "Offered-Negotiating",
    dotColor: "bg-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
    textColor: "text-purple-300",
  },
  FIXED: {
    label: "Fixed",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    textColor: "text-emerald-300",
  },
  COMPLETED: {
    label: "Completed",
    dotColor: "bg-teal-400",
    bgColor: "bg-teal-500/10 border-teal-500/20",
    textColor: "text-teal-300",
  },
  REJECTED: {
    label: "Rejected",
    dotColor: "bg-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    textColor: "text-red-300",
  },
  LOST: {
    label: "Lost",
    dotColor: "bg-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    textColor: "text-red-300",
  },
  EXPIRED: {
    label: "Expired",
    dotColor: "bg-gray-400",
    bgColor: "bg-gray-500/10 border-gray-500/20",
    textColor: "text-gray-300",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    dotColor: "bg-slate-400",
    bgColor: "bg-slate-500/10 border-slate-500/20",
    textColor: "text-slate-300",
  },
};

export function VoyageDetailClient({ 
  voyageId, 
  status, 
  hasCalculation: initialHasCalculation,
  permission,
  isLocked = false,
  baseValues
}: VoyageDetailClientProps) {
  const router = useRouter();
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [statusDialog, setStatusDialog] = useState<"fix" | "unfix" | "complete" | "reject" | null>(null);
  const [hasCalculation, setHasCalculation] = useState(initialHasCalculation);

  // Optimistic status — instant UI update, auto-rollback on failure
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    status,
    (_current: string, newStatus: string) => newStatus
  );
  const [, startTransition] = useTransition();

  // ── Real-time: refresh when this voyage is updated from elsewhere ──
  usePusher({
    onVoyageUpdated: useCallback((data: { voyageId: string }) => {
      if (data.voyageId === voyageId) {
        router.refresh();
      }
    }, [voyageId, router]),
    onCargoUpdated: useCallback((data: { voyageId: string | null }) => {
      if (data.voyageId === voyageId) {
        router.refresh();
      }
    }, [voyageId, router]),
  });

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const { generateVoyagePdf } = await import("@/lib/pdf/voyage-pdf");
      await generateVoyagePdf(null);
      toast.success("Report generated successfully!");
    } catch (error) {
      console.error("PDF download error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate report");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleCalculate = useCallback(async () => {
    setIsCalculating(true);

    // Optimistic: show "evaluating" status immediately
    startTransition(() => {
      setOptimisticStatus("NEW");
    });

    try {
      const response = await fetch(`/api/voyages/${voyageId}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Calculation failed");
      }

      // Optimistic: update status to the one returned by the server
      const newStatus = result.data?.status || "NEW";
      startTransition(() => {
        setOptimisticStatus(newStatus);
      });
      setHasCalculation(true);
      
      toast.success("Calculation complete", { description: "✅ Voyage evaluated — review the recommendation badge" });

      // Background refresh to hydrate server-rendered cards
      router.refresh();
    } catch (error) {
      console.error("Calculation error:", error);
      toast.error(error instanceof Error ? error.message : "Calculation failed");
    } finally {
      setIsCalculating(false);
    }
  }, [voyageId, router, startTransition, setOptimisticStatus]);

  const statusLabels: Record<string, string> = {
    FIXED: "Voyage marked as Fixed",
    OFFERED: "Voyage reverted to Offered-Negotiating",
    COMPLETED: "Voyage marked as Completed",
    REJECTED: "Voyage rejected",
  };

  const handleStatusUpdate = async (newStatus: string) => {
    setStatusDialog(null);

    startTransition(async () => {
      setOptimisticStatus(newStatus);

      try {
        const response = await fetch(`/api/voyages/${voyageId}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!response.ok) {
          throw new Error("Status update failed");
        }

        toast.success(statusLabels[newStatus] || "Status updated");
        router.refresh();
      } catch (error) {
        console.error("Status update error:", error);
        toast.error("Failed to update status — reverted");
      }
    });
  };

  const isOwnerOrAdmin = permission === "owner" || permission === "admin";
  const showFix = isOwnerOrAdmin && (optimisticStatus === "OFFERED" || optimisticStatus === "NEW") && hasCalculation;
  const canCalculate = !isLocked && (optimisticStatus === "DRAFT" || optimisticStatus === "OFFERED" || optimisticStatus === "NEW" || optimisticStatus === "REJECTED");
  const showUnfix = isOwnerOrAdmin && optimisticStatus === "FIXED";
  const showMarkCompleted = isOwnerOrAdmin && optimisticStatus === "FIXED";
  const showReject = isOwnerOrAdmin && (optimisticStatus === "NEW" || optimisticStatus === "OFFERED");

  const sc = STATUS_CONFIG[optimisticStatus] || STATUS_CONFIG.DRAFT;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* ── Status Chip ── */}
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${sc.bgColor} ${sc.textColor} transition-all duration-300`}>
          <span className={`h-2 w-2 rounded-full ${sc.dotColor}`} />
          {sc.label}
        </div>

        {/* ── Primary Action ── */}
        {canCalculate && (
          <Button 
            onClick={handleCalculate} 
            disabled={isCalculating}
            size="sm"
            className="gap-1.5"
          >
            {isCalculating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Calculator className="h-3.5 w-3.5" />
            )}
            {hasCalculation ? "Recalculate" : "Calculate"}
          </Button>
        )}

        {/* ── Workflow Action (contextual) ── */}
        {showFix && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusDialog("fix")}
            className="gap-1.5 border-purple-500/30 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
          >
            <FileCheck className="h-3.5 w-3.5" />
            Mark as Fixed
          </Button>
        )}

        {showReject && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusDialog("reject")}
            className="gap-1.5 border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject
          </Button>
        )}

        {showUnfix && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusDialog("unfix")}
            className="gap-1.5 border-amber-500/30 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Unfixed
          </Button>
        )}

        {showMarkCompleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusDialog("complete")}
            className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
          >
            <FlagTriangleRight className="h-3.5 w-3.5" />
            Mark Completed
          </Button>
        )}

        {/* ── Secondary Actions (collapsed into dropdown) ── */}
        {hasCalculation && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {baseValues && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    // ScenarioCreator needs its own dialog — handled below
                  }}
                  className="gap-2"
                  disabled
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Scenarios below
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={handleDownloadPdf}
                disabled={isDownloadingPdf}
                className="gap-2"
              >
                {isDownloadingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                Generate Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Scenario Creator (stays as inline trigger — it has its own dialog) */}
        {hasCalculation && baseValues && (
          <ScenarioCreator voyageId={voyageId} baseValues={baseValues} />
        )}
      </div>

      {/* ── Confirmation Dialogs ── */}
      <AlertDialog open={statusDialog === "fix"} onOpenChange={() => setStatusDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Fixed</AlertDialogTitle>
            <AlertDialogDescription>
              Mark this voyage as fixed (concluded)? This indicates the voyage has been 
              successfully negotiated and contracted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleStatusUpdate("FIXED")}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Mark as Fixed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={statusDialog === "unfix"} onOpenChange={() => setStatusDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Offered-Negotiating</AlertDialogTitle>
            <AlertDialogDescription>
              Revert this voyage from Fixed to Offered-Negotiating? This will also move the
              linked cargo inquiry back to Offered-Negotiating on the pipeline board.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleStatusUpdate("OFFERED")}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Revert to Offered-Negotiating
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={statusDialog === "reject"} onOpenChange={() => setStatusDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Voyage</AlertDialogTitle>
            <AlertDialogDescription>
              Reject this voyage? This indicates the numbers don&apos;t work and the deal
              should not be pursued. The linked cargo inquiry will also be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleStatusUpdate("REJECTED")}
              className="bg-red-600 hover:bg-red-700"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={statusDialog === "complete"} onOpenChange={() => setStatusDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Completed</AlertDialogTitle>
            <AlertDialogDescription>
              Mark this voyage as completed? Ensure all actual data has been entered — this 
              will lock in the actuals for performance analytics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleStatusUpdate("COMPLETED")}
              className="bg-teal-600 hover:bg-teal-700"
            >
              Mark Completed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
