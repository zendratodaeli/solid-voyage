"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
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
  Plus,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolResultRenderer } from "@/components/copilot/ToolResultRenderer";
import { cn } from "@/lib/utils";

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
    label: "Laytime & Demurrage",
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
// FULL PAGE COPILOT
// ═══════════════════════════════════════════════════════════════════

const chatTransport = new DefaultChatTransport({ api: "/api/chat" });

export default function AICopilotPage() {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    status,
    sendMessage,
    setMessages,
  } = useChat({
    id: "copilot-fullpage",
    transport: chatTransport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isLoading) return;
      sendMessage({ parts: [{ type: "text" as const, text: inputValue }] });
      setInputValue("");
    },
    [inputValue, isLoading, sendMessage]
  );

  const handleQuickAction = useCallback(
    (prompt: string) => {
      sendMessage({ parts: [{ type: "text" as const, text: prompt }] });
    },
    [sendMessage]
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

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
    <div className="flex h-[calc(100vh-120px)] max-w-5xl mx-auto">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30">
              <Sparkles className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Copilot</h1>
              <p className="text-xs text-muted-foreground">
                Maritime Operations Assistant — Zero-hallucination calculations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                className="gap-2"
              >
                <Plus className="h-3.5 w-3.5" />
                New Chat
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-6 pb-4">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full space-y-8 py-12">
              <div className="text-center space-y-3">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  Solid Voyage AI Copilot
                </h2>
                <p className="text-muted-foreground max-w-md">
                  Your intelligent maritime operations assistant. Ask about voyages,
                  routes, fleet positions, laytime calculations, or paste a cargo email
                  for instant analysis.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.prompt)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border text-left",
                      "transition-all duration-200 hover:scale-[1.02]",
                      action.bg
                    )}
                  >
                    <action.icon className={cn("h-5 w-5 shrink-0", action.color)} />
                    <div>
                      <span className="text-sm font-medium block">{action.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-4",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "flex items-center justify-center h-10 w-10 rounded-xl shrink-0",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30"
                )}
              >
                {msg.role === "user" ? (
                  <User className="h-5 w-5" />
                ) : (
                  <Bot className="h-5 w-5 text-blue-400" />
                )}
              </div>

              {/* Message content */}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-5 py-4",
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

          {/* Loading */}
          {isLoading && (
            <div className="flex gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 shrink-0">
                <Bot className="h-5 w-5 text-blue-400 animate-pulse" />
              </div>
              <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-md px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing with real platform data...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-border pt-4">
          <form onSubmit={handleFormSubmit} className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about voyages, routes, vessels, laytime, or paste a cargo email..."
                rows={1}
                className={cn(
                  "w-full resize-none rounded-xl border border-border bg-muted/30 px-5 py-3.5",
                  "text-sm placeholder:text-muted-foreground/60",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50",
                  "max-h-40 overflow-y-auto",
                  "transition-all duration-200"
                )}
                style={{ height: "auto", minHeight: "52px" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 160) + "px";
                }}
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              size="icon"
              className={cn(
                "h-[52px] w-[52px] rounded-xl shrink-0",
                "bg-gradient-to-br from-blue-600 to-indigo-700",
                "hover:from-blue-500 hover:to-indigo-600",
                "transition-all duration-200",
                "disabled:opacity-40"
              )}
              disabled={!inputValue.trim() || isLoading}
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
          <p className="text-xs text-muted-foreground/50 text-center mt-3">
            All financial calculations are deterministic — zero AI hallucination on numbers.
            AI uses your real platform data.
          </p>
        </div>
      </div>
    </div>
  );
}
