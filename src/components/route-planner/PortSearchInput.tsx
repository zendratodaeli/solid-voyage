"use client";

/**
 * Port Search Input Component
 * 
 * Autocomplete search input for selecting ports from the local database.
 */

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Port {
  id: string;
  name: string;
  locode: string;
  country: string;
  latitude: number;
  longitude: number;
  region?: string;
}

interface PortSearchInputProps {
  value?: Port | null;
  onSelect: (port: Port) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PortSearchInput({
  value,
  onSelect,
  onClear,
  placeholder = "Search ports...",
  disabled = false,
  className,
}: PortSearchInputProps) {
  // Check if this is a passage waypoint (not a real port)
  const isPassageWaypoint = value?.locode === "PASSAGE";
  
  const [query, setQuery] = useState(value?.name || "");
  const [results, setResults] = useState<Port[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search via NavAPI - skip for passage waypoints
  useEffect(() => {
    // Don't search if this is a passage waypoint
    if (isPassageWaypoint) {
      setResults([]);
      return;
    }
    
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        // Use NavAPI port search for accurate port matching
        const response = await fetch(
          `/api/navapi/ports?q=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        if (data.ports && Array.isArray(data.ports)) {
          // Transform NavAPI ParsedPort to local Port interface
          const transformedPorts: Port[] = data.ports.map((p: { displayName: string; portCode: string; country: string; latitude: number; longitude: number }, index: number) => ({
            id: `${p.portCode}-${index}`,
            name: p.displayName,
            locode: p.portCode,
            country: p.country,
            latitude: p.latitude,
            longitude: p.longitude,
          }));
          setResults(transformedPorts);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Port search error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 400); // 400ms debounce for NavAPI

    return () => clearTimeout(timer);
  }, [query, isPassageWaypoint]);

  // Update query when value changes externally
  useEffect(() => {
    setQuery(value?.name || "");
  }, [value?.name]);

  // Handle click outside
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

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (port: Port) => {
    setQuery(port.name);
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

  // Handle clearing the selected port
  const handleClear = () => {
    setQuery("");
    setIsOpen(false);
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={value ? value.name : query}
          onChange={(e) => {
            if (!value) {
              setQuery(e.target.value);
              setSelectedIndex(-1);
            }
          }}
          onFocus={() => {
            // If no value, show dropdown when query is long enough
            if (!value && !isPassageWaypoint && query.length >= 2) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={isPassageWaypoint || !!value}
          className={cn(
            "pl-9 pr-9",
            isPassageWaypoint && "bg-muted/50 cursor-default",
            value && !isPassageWaypoint && "cursor-pointer"
          )}
        />
        
        {/* Clear button when value is selected (not for passage waypoints) */}
        {value && !isPassageWaypoint && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {results.map((port, index) => (
            <button
              key={port.id}
              type="button"
              onClick={() => handleSelect(port)}
              className={cn(
                "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-accent transition-colors",
                index === selectedIndex && "bg-accent"
              )}
            >
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{port.name}</div>
                <div className="text-xs text-muted-foreground">
                  {port.country} • {port.locode}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No Results */}
      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-3 text-center text-sm text-muted-foreground">
          No ports found for &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}
