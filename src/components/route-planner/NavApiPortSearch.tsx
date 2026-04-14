"use client";

/**
 * NavAPI Port Search Input Component
 * 
 * Port autocomplete using NavAPI (Seametrix) for real-time maritime routing.
 * Features:
 * - Searches NavAPI sea ports database
 * - Expands port aliases (e.g., "Nagoya (Aichi)" from "Nagoya / Tobishima (Aichi)")
 * - Returns UNLOCODE for routing calculations
 */

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Loader2, X, Anchor } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NavApiPort {
  displayName: string;
  portCode: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface NavApiPortSearchProps {
  value?: NavApiPort | null;
  onSelect: (port: NavApiPort) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function NavApiPortSearch({
  value,
  onSelect,
  onClear,
  placeholder = "Search ports...",
  disabled = false,
  className,
}: NavApiPortSearchProps) {
  const [query, setQuery] = useState(value?.displayName || "");
  const [results, setResults] = useState<NavApiPort[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search using NavAPI - skip if port already selected
  useEffect(() => {
    // Don't search if a port is already selected
    if (value) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const abortController = new AbortController();

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/navapi/ports?q=${encodeURIComponent(query)}`,
          { signal: abortController.signal }
        );
        const data = await response.json();
        if (data.ports) {
          setResults(data.ports);
          setIsOpen(true);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("NavAPI port search error:", error);
        }
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [query, value]);

  // Update query when value changes externally
  useEffect(() => {
    setQuery(value?.displayName || "");
  }, [value?.displayName]);

  // Handle click outside - use mouseup to avoid interfering with dropdown clicks
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mouseup", handleClickOutside);
    return () => document.removeEventListener("mouseup", handleClickOutside);
  }, []);

  const handleSelect = (port: NavApiPort) => {
    setQuery(port.displayName);
    setIsOpen(false);
    setSelectedIndex(-1);
    onSelect(port);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleClear = () => {
    setQuery("");
    setIsOpen(false);
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative group">
        <Anchor className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 group-focus-within:text-primary/80 transition-colors" />
        <Input
          ref={inputRef}
          type="text"
          value={value ? value.displayName : query}
          onChange={(e) => {
            if (!value) {
              setQuery(e.target.value);
              setSelectedIndex(-1);
            }
          }}
          onFocus={() => {
            if (!value && query.length >= 2) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={!!value}
          className={cn(
            "pl-8 pr-8 h-8 text-xs border-border/60 bg-background/80",
            "focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
            "transition-all duration-200",
            value && "cursor-pointer bg-primary/5 border-primary/30 font-medium"
          )}
        />
        
        {/* Clear button */}
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        
        {isLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-primary/60" />
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute z-50 w-full mt-1.5 rounded-lg overflow-hidden",
            "bg-popover backdrop-blur-xl",
            "border border-border/80 shadow-xl shadow-black/20",
            "max-h-60 overflow-auto"
          )}
        >
          {results.map((port, index) => (
            <button
              key={`${port.portCode}-${index}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(port);
              }}
              className={cn(
                "w-full px-3 py-2 text-left flex items-center gap-2.5",
                "transition-all duration-150 border-b border-border/10 last:border-0",
                index === selectedIndex
                  ? "bg-primary/15 text-primary-foreground"
                  : "hover:bg-muted/60"
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[9px] font-bold",
                index === selectedIndex
                  ? "bg-primary/25 text-primary"
                  : "bg-muted/80 text-muted-foreground"
              )}>
                <MapPin className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{port.displayName}</p>
                <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                  <span className="inline-flex px-1 py-px rounded bg-muted/60 text-[9px] font-mono">{port.country}</span>
                  <span>•</span>
                  <span className="font-mono">{port.portCode}</span>
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No Results */}
      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute z-50 w-full mt-1.5 bg-popover border border-border/80 rounded-lg shadow-xl p-3 text-center">
          <Search className="h-4 w-4 mx-auto mb-1 text-muted-foreground/40" />
          <p className="text-[11px] text-muted-foreground">
            No ports found for &quot;{query}&quot;
          </p>
        </div>
      )}
    </div>
  );
}

export type { NavApiPort };
