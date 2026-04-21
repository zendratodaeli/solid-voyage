"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Brain, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

interface VoyageAdvisorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The generated AI summary markdown text */
  summary: string | null;
  /** Whether the AI is currently generating */
  isLoading: boolean;
  /** Target URL to navigate to after closing */
  voyageUrl?: string;
}

export function VoyageAdvisorDialog({
  open,
  onOpenChange,
  summary,
  isLoading,
  voyageUrl,
}: VoyageAdvisorDialogProps) {
  // Detect GO/NO-GO from summary content
  const isGo = summary?.toLowerCase().includes("**go**") && !summary?.toLowerCase().includes("**no-go**");
  const isNoGo = summary?.toLowerCase().includes("**no-go**");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-violet-400" />
            AI Voyage Advisor
          </DialogTitle>
          <DialogDescription>
            Automated assessment of route, profitability, safety, and compliance
          </DialogDescription>
        </DialogHeader>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
              <Brain className="h-12 w-12 text-violet-400 relative z-10 animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                🧠 AI analyzing voyage...
              </p>
              <p className="text-xs text-muted-foreground">
                Evaluating route profitability, safety & compliance
              </p>
            </div>
            <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
          </div>
        )}

        {/* Summary Content */}
        {!isLoading && summary && (
          <div className="space-y-4">
            {/* GO / NO-GO Badge */}
            {(isGo || isNoGo) && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                isGo
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-red-500/10 border-red-500/30"
              }`}>
                {isGo ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-400 shrink-0" />
                )}
                <span className={`text-sm font-bold uppercase tracking-wider ${
                  isGo ? "text-emerald-400" : "text-red-400"
                }`}>
                  {isGo ? "GO — Voyage Recommended" : "NO-GO — Proceed with Caution"}
                </span>
              </div>
            )}

            {/* Markdown Rendered Summary */}
            <div className="prose prose-sm prose-invert max-w-none">
              <AdvisorMarkdown content={summary} />
            </div>
          </div>
        )}

        {/* Error State */}
        {!isLoading && !summary && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="text-sm text-muted-foreground">
              AI assessment could not be generated. You can view the voyage details manually.
            </p>
          </div>
        )}

        {/* Footer */}
        {!isLoading && (
          <div className="flex justify-end gap-3 pt-3 border-t border-border/50">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {voyageUrl && (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  window.location.href = voyageUrl;
                }}
              >
                View Voyage Details
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SIMPLE MARKDOWN RENDERER
// ═══════════════════════════════════════════════════════════════════

function AdvisorMarkdown({ content }: { content: string }) {
  // Split by lines and render with basic markdown support
  const lines = content.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // H2: ## header
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="text-sm font-bold text-foreground mt-4 mb-1 flex items-center gap-2">
              {trimmed.slice(3)}
            </h3>
          );
        }

        // Bold text: **text**
        if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
          return (
            <p key={i} className="text-sm font-semibold text-foreground">
              {trimmed.slice(2, -2)}
            </p>
          );
        }

        // Bullet points: - text
        if (trimmed.startsWith("- ")) {
          const bulletContent = trimmed.slice(2);
          const isWarning = bulletContent.includes("⚠️") || bulletContent.toLowerCase().includes("risk") || bulletContent.toLowerCase().includes("warning");
          return (
            <div key={i} className={`flex gap-2 text-xs pl-2 ${
              isWarning ? "text-amber-400" : "text-muted-foreground"
            }`}>
              <span className="shrink-0 mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: formatInlineBold(bulletContent) }} />
            </div>
          );
        }

        // Empty line
        if (!trimmed) return <div key={i} className="h-1" />;

        // Regular paragraph
        return (
          <p key={i} className="text-xs text-muted-foreground leading-relaxed">
            <span dangerouslySetInnerHTML={{ __html: formatInlineBold(trimmed) }} />
          </p>
        );
      })}
    </div>
  );
}

/** Convert **bold** to <strong> tags */
function formatInlineBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
}
