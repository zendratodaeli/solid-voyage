"use client";

/**
 * CurrencyInput
 * 
 * A number input with an inline currency toggle.
 * Defaults to the org's display currency, but allows per-field override.
 * 
 * Usage:
 *   <CurrencyInput
 *     value={price}
 *     onChange={setPrice}
 *     currency={fieldCurrency}
 *     onCurrencyChange={setFieldCurrency}
 *     placeholder="500"
 *   />
 */

import { useState, useRef, useEffect } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { useCurrency } from "@/hooks/useCurrency";
import {
  CURRENCY_LIST,
  type CurrencyCode,
} from "@/lib/currency";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  /** Numeric string value */
  value: string;
  /** Called when the numeric value changes */
  onChange: (value: string) => void;
  /** Currently selected currency for this field */
  currency?: CurrencyCode;
  /** Called when the user changes the field's currency */
  onCurrencyChange?: (currency: CurrencyCode) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Number of decimal places */
  decimals?: number;
  /** Additional className for the wrapper */
  className?: string;
  /** Whether this field is required */
  required?: boolean;
  /** Suffix label like "/MT" or "/day" */
  suffix?: string;
}

export function CurrencyInput({
  value,
  onChange,
  currency: controlledCurrency,
  onCurrencyChange,
  placeholder,
  decimals,
  className,
  required,
  suffix,
}: CurrencyInputProps) {
  const { currency: orgCurrency, symbol: orgSymbol } = useCurrency();
  const activeCurrency = controlledCurrency ?? orgCurrency;
  const activeConfig = CURRENCY_LIST.find(c => c.code === activeCurrency) ?? CURRENCY_LIST[0];
  
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className={cn("relative flex items-center", className)}>
      {/* Currency badge */}
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-0.5 h-9 px-2 rounded-l-md border border-r-0 bg-muted/50",
            "text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted",
            "transition-colors cursor-pointer select-none shrink-0",
            activeCurrency !== orgCurrency && "text-amber-400 border-amber-500/30 bg-amber-500/10"
          )}
          title={`Currency: ${activeConfig.name}. Click to change.`}
        >
          <span className="text-sm">{activeConfig.flag}</span>
          <span>{activeConfig.symbol}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
        
        {isOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg py-1 min-w-[180px]">
            {CURRENCY_LIST.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onCurrencyChange?.(c.code);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-muted transition-colors text-left",
                  c.code === activeCurrency && "bg-muted font-medium"
                )}
              >
                <span>{c.flag}</span>
                <span className="font-medium">{c.code}</span>
                <span className="text-muted-foreground text-xs">— {c.name}</span>
              </button>
            ))}
            {activeCurrency !== orgCurrency && (
              <div className="border-t mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onCurrencyChange?.(orgCurrency);
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  ↩ Reset to org default ({orgCurrency})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Number input */}
      <NumberInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        decimals={decimals}
        required={required}
        className="rounded-l-none flex-1"
      />
      
      {/* Optional suffix */}
      {suffix && (
        <span className="px-2 h-9 flex items-center text-xs text-muted-foreground bg-muted/30 border border-l-0 rounded-r-md">
          {suffix}
        </span>
      )}
    </div>
  );
}
