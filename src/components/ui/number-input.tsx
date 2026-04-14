"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  decimals?: number;
}

/**
 * Format a number with English-style thousands separators
 * Thousands: comma (,)
 * Decimals: period (.)
 * Example: 75,000.00
 */
function formatWithSeparator(value: string, decimals: number = 0): string {
  // Handle undefined/null values
  if (value === undefined || value === null) return "";
  
  // Remove existing separators and non-numeric chars except decimal point
  const cleanValue = value.replace(/[^\d.]/g, "");
  
  if (!cleanValue) return "";
  
  // Split by decimal point
  const parts = cleanValue.split(".");
  const integerPart = parts[0] || "";
  const decimalPart = decimals > 0 ? (parts[1]?.slice(0, decimals) || "") : "";
  
  // Add thousands separators (commas) to integer part
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  // If user is typing decimals, show them
  if (decimals > 0 && parts.length > 1) {
    return `${formattedInteger}.${decimalPart}`;
  }
  
  return formattedInteger;
}

/**
 * Parse formatted string back to raw number string
 */
function parseToRaw(value: string): string {
  // Remove thousands separators (commas), keep decimal point
  return value.replace(/,/g, "");
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onChange, decimals = 0, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => 
      formatWithSeparator(value, decimals)
    );

    // Update display when external value changes
    React.useEffect(() => {
      setDisplayValue(formatWithSeparator(value, decimals));
    }, [value, decimals]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      
      // Allow only digits, commas, and period for decimals
      const lastChar = inputValue.slice(-1);
      if (inputValue && !/[0-9,.]/.test(lastChar)) {
        return;
      }
      
      // Format for display
      const formatted = formatWithSeparator(inputValue, decimals);
      setDisplayValue(formatted);
      
      // Parse to raw number for form state
      const rawValue = parseToRaw(formatted);
      onChange(rawValue);
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        className={cn(className)}
        value={displayValue}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

NumberInput.displayName = "NumberInput";

export { NumberInput };
