/**
 * Multi-Currency Support
 * 
 * Central currency configuration, formatting, and conversion utilities.
 * All internal calculations remain in USD — this module handles display conversion.
 */

// ═══════════════════════════════════════════════════════════════════
// SUPPORTED CURRENCIES
// ═══════════════════════════════════════════════════════════════════

export type CurrencyCode = "USD" | "EUR" | "GBP" | "NOK";

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$",  name: "US Dollar",        flag: "🇺🇸", locale: "en-US" },
  EUR: { code: "EUR", symbol: "€",  name: "Euro",             flag: "🇪🇺", locale: "de-DE" },
  GBP: { code: "GBP", symbol: "£",  name: "British Pound",    flag: "🇬🇧", locale: "en-GB" },
  NOK: { code: "NOK", symbol: "kr", name: "Norwegian Krone",  flag: "🇳🇴", locale: "nb-NO" },
};

export const CURRENCY_LIST = Object.values(SUPPORTED_CURRENCIES);

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return code in SUPPORTED_CURRENCIES;
}

// ═══════════════════════════════════════════════════════════════════
// EXCHANGE RATES (Client-side cache)
// ═══════════════════════════════════════════════════════════════════

interface ExchangeRateCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let rateCache: ExchangeRateCache | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch exchange rates from our API (which proxies Frankfurter).
 * Cached in memory for 24 hours.
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  // Return cached if fresh
  if (rateCache && Date.now() - rateCache.fetchedAt < CACHE_TTL_MS) {
    return rateCache.rates;
  }

  try {
    const res = await fetch("/api/exchange-rates");
    if (!res.ok) throw new Error("Failed to fetch rates");
    const data = await res.json();
    
    const rates: Record<string, number> = { USD: 1, ...data.rates };
    rateCache = { rates, fetchedAt: Date.now() };
    return rates;
  } catch (err) {
    console.warn("Exchange rate fetch failed, using fallback rates:", err);
    // Fallback rates (approximate) so the app doesn't break
    return { USD: 1, EUR: 0.92, GBP: 0.79, NOK: 10.85 };
  }
}

/**
 * Convert amount from one currency to another.
 * Rates are relative to USD (base).
 */
export function convertAmount(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) return amount;
  
  const fromRate = rates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || 1;
  
  // Convert: amount → USD → target
  const usdAmount = amount / fromRate;
  return usdAmount * toRate;
}

// ═══════════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format a monetary value in the specified currency.
 * Uses Intl.NumberFormat for proper locale-aware formatting.
 */
export function formatCurrency(
  value: number,
  currency: CurrencyCode = "USD",
  decimals = 2
): string {
  const config = SUPPORTED_CURRENCIES[currency];
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.code,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format TCE (Time Charter Equivalent) — value/day
 */
export function formatTceCurrency(
  value: number,
  currency: CurrencyCode = "USD",
  decimals = 2
): string {
  return `${formatCurrency(value, currency, decimals)}/day`;
}

/**
 * Format freight rate — value/MT
 */
export function formatFreightCurrency(
  value: number,
  currency: CurrencyCode = "USD",
  decimals = 2
): string {
  return `${formatCurrency(value, currency, decimals)}/MT`;
}

/**
 * Get just the currency symbol for inline display
 */
export function getCurrencySymbol(currency: CurrencyCode = "USD"): string {
  return SUPPORTED_CURRENCIES[currency].symbol;
}
