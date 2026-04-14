"use client";

/**
 * useCurrency Hook
 * 
 * Returns USD-fixed currency formatting functions.
 * All monetary values in the platform are denominated in USD.
 * 
 * Usage:
 *   const { formatMoney, formatTce, formatFreight, symbol } = useCurrency();
 *   <span>{formatMoney(12500)}</span>  // → "$12,500.00"
 */

import { useCallback } from "react";

const USD_SYMBOL = "$";

function fmtUsd(value: number, decimals = 2): string {
  return `${USD_SYMBOL}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function useCurrency() {
  const formatMoney = useCallback(
    (value: number, decimals = 2) => fmtUsd(value, decimals),
    []
  );

  const formatTce = useCallback(
    (value: number, decimals = 2) => `${fmtUsd(value, decimals)}/day`,
    []
  );

  const formatFreight = useCallback(
    (value: number, decimals = 2) => `${fmtUsd(value, decimals)}/MT`,
    []
  );

  return {
    /** Always "USD" */
    currency: "USD" as const,
    /** Always "$" */
    symbol: USD_SYMBOL,
    /** Format monetary value: formatMoney(12500) → "$12,500.00" */
    formatMoney,
    /** Format TCE: formatTce(8500) → "$8,500.00/day" */
    formatTce,
    /** Format freight rate: formatFreight(12.50) → "$12.50/MT" */
    formatFreight,
  };
}
