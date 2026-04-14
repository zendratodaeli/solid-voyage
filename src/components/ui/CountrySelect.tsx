"use client";

/**
 * CountrySelect — searchable country dropdown with flag emojis
 * 
 * Features:
 * - Searchable by country name or code
 * - Shows EU ETS badge for EU/EEA countries
 * - Flag emojis for visual identification
 * - Compact design for inline use next to port fields
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronsUpDown, X, Leaf } from "lucide-react";
import { COUNTRIES, type Country } from "@/data/countries";

interface CountrySelectProps {
  value: string;  // ISO country code
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;  // Use compact mode for inline display
}

export function CountrySelect({
  value,
  onChange,
  placeholder = "Country",
  className = "",
  compact = false,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => COUNTRIES.find(c => c.code === value),
    [value]
  );

  const filtered = useMemo(() => {
    if (!search) return COUNTRIES;
    const q = search.toLowerCase();
    return COUNTRIES.filter(
      c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [search]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSelect = (country: Country) => {
    onChange(country.code);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-1.5 w-full rounded-md border bg-background
          text-left transition-colors hover:bg-muted/50
          ${compact ? "h-8 px-2 text-xs" : "h-9 px-3 text-sm"}
          ${open ? "ring-2 ring-ring" : "border-input"}
        `}
      >
        {selected ? (
          <>
            <span className="text-base leading-none">{selected.flag}</span>
            <span className="truncate flex-1">
              {compact ? selected.code : `${selected.flag} ${selected.name}`}
            </span>
            {selected.euEts && (
              <Leaf className="h-3 w-3 text-green-500 shrink-0" />
            )}
            <X
              className="h-3 w-3 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              onClick={handleClear}
            />
          </>
        ) : (
          <>
            <span className="text-muted-foreground truncate flex-1">{placeholder}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95">
          {/* Search input */}
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country..."
              className="w-full h-8 px-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Country list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No countries found</p>
            ) : (
              filtered.map(country => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleSelect(country)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left
                    hover:bg-muted transition-colors
                    ${value === country.code ? "bg-muted font-medium" : ""}
                  `}
                >
                  <span className="text-base leading-none">{country.flag}</span>
                  <span className="truncate flex-1">{country.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{country.code}</span>
                  {country.euEts && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/15 text-green-500 font-medium">EU</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
