"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ScenarioDeleteButtonProps {
  voyageId: string;
  scenarioId: string;
  scenarioName: string;
  /** Optimistic callback — called immediately after confirm for instant removal */
  onOptimisticDelete?: (scenarioId: string) => void;
}

export function ScenarioDeleteButton({
  voyageId,
  scenarioId,
  scenarioName,
  onOptimisticDelete,
}: ScenarioDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    // Optimistic: remove from parent list instantly
    if (onOptimisticDelete) {
      onOptimisticDelete(scenarioId);
    }

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/voyages/${voyageId}/scenarios?scenarioId=${scenarioId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success("Scenario deleted");
        if (!onOptimisticDelete) {
          router.refresh();
        }
      } else {
        throw new Error("Delete failed");
      }
    } catch (err) {
      console.error("Failed to delete scenario:", err);
      toast.error("Failed to delete scenario — please refresh");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Scenario</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{scenarioName}&quot;? This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

