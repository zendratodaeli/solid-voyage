"use client";

import { Bot, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopilotButtonProps {
  onClick: () => void;
  isOpen: boolean;
  isThinking?: boolean;
}

/**
 * Floating action button to toggle the AI copilot panel.
 * Fixed position, bottom-right corner, accessible from any page.
 */
export function CopilotButton({ onClick, isOpen, isThinking }: CopilotButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "flex items-center justify-center",
        "h-14 w-14 rounded-full",
        "bg-gradient-to-br from-blue-600 to-indigo-700",
        "text-white shadow-lg shadow-blue-500/25",
        "transition-all duration-300 ease-out",
        "hover:scale-110 hover:shadow-xl hover:shadow-blue-500/30",
        "active:scale-95",
        "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-background",
        isOpen && "rotate-0 bg-gradient-to-br from-indigo-600 to-violet-700",
        isThinking && "animate-pulse"
      )}
      title="AI Copilot"
      aria-label="Toggle AI Copilot"
    >
      {isThinking ? (
        <Bot className="h-6 w-6 animate-bounce" />
      ) : (
        <Sparkles className="h-6 w-6" />
      )}

      {/* Glow ring when thinking */}
      {isThinking && (
        <span className="absolute inset-0 rounded-full border-2 border-blue-400/50 animate-ping" />
      )}
    </button>
  );
}
