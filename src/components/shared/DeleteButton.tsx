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

interface DeleteButtonProps {
  id: string;
  type: "vessel" | "voyage";
  name: string;
  variant?: "ghost" | "destructive" | "outline";
  size?: "sm" | "default" | "icon";
  showText?: boolean;
  redirectTo?: string;
  /** Optimistic callback — called immediately on confirm for instant list removal */
  onOptimisticDelete?: (id: string) => void;
}

export function DeleteButton({
  id,
  type,
  name,
  variant = "ghost",
  size = "sm",
  showText = true,
  redirectTo,
  onOptimisticDelete,
}: DeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    // Close dialog immediately — user has already confirmed
    setOpen(false);

    // Optimistic: remove from parent list instantly if callback provided
    if (onOptimisticDelete) {
      onOptimisticDelete(id);
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/${type}s/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Failed to delete ${type}`);
      }

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`);
      if (redirectTo) {
        router.push(redirectTo);
      } else if (!onOptimisticDelete) {
        router.refresh();
      }
    } catch (error) {
      console.error(`Error deleting ${type}:`, error);
      toast.error(`Failed to delete ${type} — please refresh`);
      // If optimistic, the parent would need to re-fetch to restore
      if (!onOptimisticDelete) {
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={variant === "ghost" ? "text-destructive hover:text-destructive" : ""}
        >
          <Trash2 className="h-4 w-4" />
          {showText && <span className="ml-2">Delete</span>}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{name}</strong>
            {type === "vessel" && " and all associated voyages"}.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
