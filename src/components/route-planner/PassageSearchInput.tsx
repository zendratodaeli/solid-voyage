"use client";

/**
 * Passage Search Input Component
 * 
 * Autocomplete search for strategic passages (canals and straits).
 * Shows draft restrictions and toll indicators.
 */

import { useState, useEffect, useRef } from "react";
import { Ship, AlertTriangle, DollarSign, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface StrategicPassage {
  id: string;
  name: string;
  displayName: string;
  type: string;
  region: string;
  entryLat: number;
  entryLng: number;
  entryName: string;
  exitLat: number;
  exitLng: number;
  exitName: string;
  maxDraft: number | null;
  restriction: string | null;
  hasToll: boolean;
  polyline?: [number, number][] | null; // Pre-traced canal path [lat, lng][]
  distanceNm?: number; // Accurate canal distance
}

interface PassageSearchInputProps {
  onSelect: (passage: StrategicPassage) => void;
  vesselDraft?: number; // For draft safety check
  placeholder?: string;
  disabled?: boolean;
}

export function PassageSearchInput({
  onSelect,
  vesselDraft = 12, // Default safe draft
  placeholder = "Search canal or strait...",
  disabled = false,
}: PassageSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StrategicPassage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch passages on query change
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/passages?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        setResults(data);
        setIsOpen(true);
        setSelectedIndex(0);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [query]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check if draft exceeds passage limit
  const isDraftExceeded = (passage: StrategicPassage) => {
    return passage.maxDraft !== null && vesselDraft > passage.maxDraft;
  };

  // Get alternative recommendation for blocked passages
  const getAlternative = (passage: StrategicPassage) => {
    if (passage.name === "Sunda Strait") return "Lombok Strait";
    if (passage.name === "Malacca Strait") return "Lombok Strait";
    if (passage.name === "Suez Canal") return "Cape of Good Hope";
    if (passage.name === "Panama Canal") return "Cape Horn";
    return null;
  };

  const handleSelect = (passage: StrategicPassage) => {
    if (isDraftExceeded(passage)) {
      const alt = getAlternative(passage);
      alert(
        `⚠️ DRAFT WARNING: ${passage.name} limit is ${passage.maxDraft}m. Your draft is ${vesselDraft}m.${
          alt ? `\n\nRecommendation: Use ${alt}.` : ""
        }`
      );
      return;
    }
    onSelect(passage);
    setQuery("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Ship className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9"
        />
      </div>

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-64 overflow-auto">
          {results.map((passage, index) => {
            const blocked = isDraftExceeded(passage);
            return (
              <button
                key={passage.id}
                type="button"
                onClick={() => handleSelect(passage)}
                className={cn(
                  "w-full px-3 py-2 text-left flex items-center gap-3 hover:bg-accent transition-colors",
                  index === selectedIndex && "bg-accent",
                  blocked && "opacity-60"
                )}
              >
                {/* Icon */}
                <div className="shrink-0">
                  {passage.type === "canal" ? (
                    <Ship className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Ship className="h-4 w-4 text-cyan-500" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{passage.displayName}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{passage.entryName} → {passage.exitName}</span>
                  </div>
                </div>

                {/* Indicators */}
                <div className="shrink-0 flex items-center gap-1">
                  {passage.hasToll && (
                    <span title="Toll required" className="text-amber-500">
                      <DollarSign className="h-4 w-4" />
                    </span>
                  )}
                  {passage.maxDraft && (
                    <span
                      title={`Max draft: ${passage.maxDraft}m`}
                      className={cn(
                        "text-xs px-1 rounded",
                        blocked
                          ? "bg-red-500/20 text-red-500"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {passage.maxDraft}m
                    </span>
                  )}
                  {blocked && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
