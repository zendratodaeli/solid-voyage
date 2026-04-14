/**
 * Exchange Rates API
 * 
 * Proxies the free Frankfurter API to get daily exchange rates.
 * Returns rates relative to USD base.
 * Server-side caching: rates are cached in Redis for 24 hours.
 */

import { NextResponse } from "next/server";
import { cached, CACHE_TTL } from "@/lib/redis";

// ─── GET /api/exchange-rates ─────────────────────────────────────

export async function GET() {
  try {
    const rates = await cached<Record<string, number>>(
      "rates:exchange",
      CACHE_TTL.EXCHANGE_RATES,
      async () => {
        // Fetch from Frankfurter (free, no API key needed)
        const res = await fetch(
          "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,NOK",
          { cache: "no-store" }
        );

        if (!res.ok) {
          throw new Error(`Frankfurter API returned ${res.status}`);
        }

        const data = await res.json();
        
        // data.rates = { EUR: 0.92, GBP: 0.79, NOK: 10.85 }
        return { USD: 1, ...data.rates };
      }
    );

    return NextResponse.json({
      success: true,
      rates,
      cached: true,
    });
  } catch (error) {
    console.error("Exchange rate fetch failed:", error);
    
    // Return fallback rates if API is down
    const fallbackRates = {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      NOK: 10.85,
    };

    return NextResponse.json({
      success: true,
      rates: fallbackRates,
      cached: false,
      fallback: true,
    });
  }
}
