/**
 * Utility functions and formatters
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ═══════════════════════════════════════════════════════════════════
// NUMBER FORMATTERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format number as USD currency
 * @deprecated Use `useCurrency().formatMoney()` hook or `formatCurrency()` from `@/lib/currency` instead.
 */
export function formatUsd(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format number with proper number formatting
 */
export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format as percentage
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format freight rate (USD/MT)
 * @deprecated Use `useCurrency().formatFreight()` hook or `formatFreightCurrency()` from `@/lib/currency` instead.
 */
export function formatFreight(value: number): string {
  return `$${value.toFixed(2)}/MT`;
}

/**
 * Format TCE (USD/day)
 * @deprecated Use `useCurrency().formatTce()` hook or `formatTceCurrency()` from `@/lib/currency` instead.
 */
export function formatTce(value: number): string {
  return `${formatUsd(value, 2)}/day`;
}

/**
 * Format days with precision
 */
export function formatDays(value: number): string {
  return `${value.toFixed(1)} days`;
}

/**
 * Format metric tons
 */
export function formatMt(value: number): string {
  return `${formatNumber(value, 2)} MT`;
}

// ═══════════════════════════════════════════════════════════════════
// DISPLAY HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get color class for P&L values
 */
export function getPnlColor(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-muted-foreground";
}

/**
 * Get color class for TCE values
 */
export function getTceColor(value: number): string {
  if (value > 20000) return "text-green-600";
  if (value > 10000) return "text-yellow-600";
  if (value > 0) return "text-orange-600";
  return "text-red-600";
}

/**
 * Format route display (Port A → Port B)
 */
export function formatRoute(loadPort: string, dischargePort: string): string {
  return `${loadPort} → ${dischargePort}`;
}

/**
 * Abbreviate port name
 */
export function abbreviatePort(name: string, maxLength = 12): string {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 1) + ".";
}

// ═══════════════════════════════════════════════════════════════════
// DATE FORMATTERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/**
 * Get relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}
