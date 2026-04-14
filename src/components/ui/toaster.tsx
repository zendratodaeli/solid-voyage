"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "group toast bg-background text-foreground border-border shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group toast bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
          error: "group toast bg-destructive/10 text-destructive border-destructive/20",
          warning: "group toast bg-amber-500/10 text-amber-500 border-amber-500/20",
          info: "group toast bg-blue-500/10 text-blue-500 border-blue-500/20",
        },
      }}
      richColors
      closeButton
    />
  );
}
