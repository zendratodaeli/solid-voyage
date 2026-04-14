"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  X,
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  RotateCcw,
  Ship,
  Route,
  Calculator,
  Radio,
  BarChart3,
  Mail,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopilotButton } from "./CopilotButton";
import { ToolResultRenderer } from "./ToolResultRenderer";
import { cn } from "@/lib/utils";
import { useOrgPath } from "@/hooks/useOrgPath";
import Link from "next/link";

// ═══════════════════════════════════════════════════════════════════
// QUICK ACTION SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════

const QUICK_ACTIONS = [
  {
    icon: Mail,
    label: "Analyze Cargo Email",
    prompt: "I received a cargo inquiry email. Let me paste it here and you can analyze it.",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15",
  },
  {
    icon: Ship,
    label: "Calculate Voyage",
    prompt: "I want to calculate a voyage. Can you help me estimate the profitability?",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15",
  },
  {
    icon: Radio,
    label: "Fleet Positions",
    prompt: "Where are all our vessels right now? Show me the fleet positions.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15",
  },
  {
    icon: Route,
    label: "Plan a Route",
    prompt: "I need to plan a sea route. Can you calculate the distance and ECA zones?",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/15",
  },
  {
    icon: Calculator,
    label: "Laytime Calculation",
    prompt: "I need to calculate laytime and demurrage for a port operation.",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/15",
  },
  {
    icon: BarChart3,
    label: "Fleet Analytics",
    prompt: "Show me the fleet performance analytics for the last 6 months.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/15",
  },
];

// ═══════════════════════════════════════════════════════════════════
// COPILOT PANEL COMPONENT
// ═══════════════════════════════════════════════════════════════════

const chatTransport = new DefaultChatTransport({ api: "/api/chat" });

export function CopilotPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { orgPath } = useOrgPath();

  const {
    messages,
    status,
    sendMessage,
    setMessages,
  } = useChat({
    id: "copilot-main",
    transport: chatTransport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Handle form submit
  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isLoading) return;
      sendMessage({ parts: [{ type: "text" as const, text: inputValue }] });
      setInputValue("");
    },
    [inputValue, isLoading, sendMessage]
  );

  // Handle quick action click
  const handleQuickAction = useCallback(
    (prompt: string) => {
      sendMessage({ parts: [{ type: "text" as const, text: prompt }] });
    },
    [sendMessage]
  );

  // Handle new chat
  const handleNewChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  // Handle Enter to submit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (inputValue.trim() && !isLoading) {
          sendMessage({ parts: [{ type: "text" as const, text: inputValue }] });
          setInputValue("");
        }
      }
    },
    [inputValue, isLoading, sendMessage]
  );

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <CopilotButton
          onClick={() => setIsOpen(true)}
          isOpen={isOpen}
          isThinking={isLoading}
        />
      )}

      {/* Slide-over Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div
            className={cn(
              "fixed z-50 flex flex-col",
              "bg-background border-l border-border",
              "shadow-2xl shadow-black/20",
              "animate-in slide-in-from-right duration-300",
              // Responsive sizing
              isExpanded
                ? "inset-0 lg:top-0 lg:right-0 lg:bottom-0 lg:left-auto lg:w-[800px]"
                : "top-0 right-0 bottom-0 w-full sm:w-[440px]"
            )}
          >
            {/* ════════ Header ════════ */}
            <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0 bg-background/95 backdrop-blur">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold truncate">AI Copilot</h2>
                  <p className="text-[10px] text-muted-foreground truncate">
                    Maritime Operations Assistant
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={handleNewChat}
                    title="New conversation"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Link href={orgPath("/ai-copilot")}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => setIsOpen(false)}
                    title="Open full page"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setIsOpen(false)}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* ════════ Messages Area ════════ */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Empty state with quick actions */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full space-y-6 py-8">
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold">
                      Solid Voyage AI Copilot
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-[280px]">
                      Your maritime operations assistant. Ask me about voyages,
                      routes, vessels, laytime, or paste a cargo email.
                    </p>
                  </div>

                  <div className="w-full space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                      Quick Actions
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {QUICK_ACTIONS.map((action) => (
                        <button
                          key={action.label}
                          onClick={() => handleQuickAction(action.prompt)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left",
                            "transition-all duration-200",
                            action.bg
                          )}
                        >
                          <action.icon
                            className={cn("h-4 w-4 shrink-0", action.color)}
                          />
                          <span className="text-sm font-medium">
                            {action.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Message bubbles */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "flex items-center justify-center h-8 w-8 rounded-full shrink-0",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30"
                    )}
                  >
                    {msg.role === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4 text-blue-400" />
                    )}
                  </div>

                  {/* Message content */}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/50 border border-border/50 rounded-bl-md"
                    )}
                  >
                    <div className="text-sm whitespace-pre-wrap leading-relaxed space-y-2">
                      {msg.parts?.map((part: any, i: number) => {
                        if (part.type === "text" && part.text) {
                          return <span key={i}>{part.text}</span>;
                        }
                        if (part.type === "step-start") {
                          return null; // skip step markers
                        }
                        if (part.type?.startsWith("tool-")) {
                          return <ToolResultRenderer key={i} part={part} />;
                        }
                        return null;
                      }) || ""}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 shrink-0">
                    <Bot className="h-4 w-4 text-blue-400 animate-pulse" />
                  </div>
                  <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Analyzing...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ════════ Input Area ════════ */}
            <div className="border-t border-border p-3 shrink-0 bg-background/95 backdrop-blur">
              <form
                id="copilot-form"
                onSubmit={handleFormSubmit}
                className="flex items-end gap-2"
              >
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about voyages, routes, vessels, laytime..."
                    rows={1}
                    className={cn(
                      "w-full resize-none rounded-xl border border-border bg-muted/30 px-4 py-3 pr-12",
                      "text-sm placeholder:text-muted-foreground/60",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50",
                      "max-h-32 overflow-y-auto",
                      "transition-all duration-200"
                    )}
                    style={{
                      height: "auto",
                      minHeight: "44px",
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = Math.min(target.scrollHeight, 128) + "px";
                    }}
                    disabled={isLoading}
                  />
                </div>
                <Button
                  type="submit"
                  size="icon"
                  className={cn(
                    "h-11 w-11 rounded-xl shrink-0",
                    "bg-gradient-to-br from-blue-600 to-indigo-700",
                    "hover:from-blue-500 hover:to-indigo-600",
                    "transition-all duration-200",
                    "disabled:opacity-40"
                  )}
                  disabled={!inputValue.trim() || isLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
                AI uses your platform data. All calculations are deterministic.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
