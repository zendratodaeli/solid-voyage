import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════
// ERA5 Verification Cron — Fully automatic forecast accuracy pipeline
// Runs daily: downloads ERA5 ground-truth data + computes accuracy
//
// Schedule: Once per day (ERA5 has 5-day lag, daily is sufficient)
// Trigger: Vercel cron or external scheduler
// ═══════════════════════════════════════════════════════════════════

const WEATHER_ENGINE_URL = process.env.WEATHER_ENGINE_URL || "http://localhost:8000";
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  try {
    // Optional: verify cron secret
    if (CRON_SECRET) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const results: Record<string, unknown> = {};

    // Step 1: Trigger ERA5 download (ground-truth weather data)
    try {
      const downloadRes = await fetch(`${WEATHER_ENGINE_URL}/verification/era5-download`, {
        method: "POST",
        signal: AbortSignal.timeout(120000), // 2 min — downloads can be slow
      });
      results.era5Download = await downloadRes.json();
    } catch (err) {
      results.era5Download = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }

    // Step 2: Compute verification metrics (RMSE, bias, skill score)
    try {
      const accuracyRes = await fetch(`${WEATHER_ENGINE_URL}/verification/accuracy`, {
        signal: AbortSignal.timeout(30000),
      });
      results.accuracy = await accuracyRes.json();
    } catch (err) {
      results.accuracy = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }

    // Step 3: Get forecast log stats
    try {
      const statsRes = await fetch(`${WEATHER_ENGINE_URL}/verification/stats`, {
        signal: AbortSignal.timeout(10000),
      });
      results.stats = await statsRes.json();
    } catch (err) {
      results.stats = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }

    // Step 4: Auto-train ML bias model if enough data (100+ matched pairs)
    const matchedPairs = (results.accuracy as Record<string, unknown>)?.matched_pairs;
    if (typeof matchedPairs === "number" && matchedPairs >= 100) {
      try {
        const trainRes = await fetch(`${WEATHER_ENGINE_URL}/verification/train-bias`, {
          method: "POST",
          signal: AbortSignal.timeout(60000),
        });
        results.mlTraining = await trainRes.json();
      } catch (err) {
        results.mlTraining = { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
    } else {
      results.mlTraining = {
        status: "waiting",
        matchedPairs: matchedPairs || 0,
        required: 100,
        message: "Not enough matched prediction-observation pairs yet",
      };
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    });
  } catch (error) {
    console.error("[ERA5_VERIFICATION_CRON] Error:", error);
    return NextResponse.json(
      { error: "ERA5 verification cron failed" },
      { status: 500 }
    );
  }
}
