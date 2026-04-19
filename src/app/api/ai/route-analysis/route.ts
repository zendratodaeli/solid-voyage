/**
 * AI Route Analysis API — Multi-Route Comparison Engine
 *
 * POST /api/ai/route-analysis
 *
 * Accepts 2-3 route comparison payloads enriched with Maritime Intelligence
 * and calls GPT-4o to produce a structured, professional recommendation.
 *
 * Returns: recommended route, confidence, reasoning (safety/profitability/compliance)
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface RouteVariant {
  id: string;
  label: string;
  distanceNm: number;
  estimatedDays: number;
  ecaDistanceNm: number;
  hraDistanceNm: number;
  /** Canal toll estimate in USD */
  canalTollUsd: number;
  /** War risk premium in USD */
  warRiskPremiumUsd: number;
  /** Total cargo value at risk in USD */
  cargoRiskUsd: number;
  /** Port congestion wait days */
  portWaitDays: number;
  /** Port congestion cost in USD */
  portCongestionCostUsd: number;
  /** Hull value used for war risk */
  hullValueUsd: number;
  /** Total additional costs (canal + war risk + congestion) */
  totalAdditionalCostsUsd: number;
  /** HRA zones crossed */
  hraZones: string[];
  /** Weather severity */
  weatherSeverity: string;
  /** Detected canals */
  canals: string[];
  /** SECA zones */
  ecaZones: string[];
}

interface AnalysisRequest {
  routes: RouteVariant[];
  vesselType?: string;
  vesselDwt?: number;
  cargoType?: string;
  cargoQuantityMt?: number;
  /** Live weather forecast data from NOAA engine */
  weatherForecast?: {
    worstConditions: {
      maxWaveHeight: number;
      maxSwellHeight: number;
      severity: string;
      location: { lat: number; lon: number };
    };
    averageConditions: {
      avgWaveHeight: number;
      avgSwellHeight: number;
      avgSeaTemp: number;
      overallSeverity: string;
    };
    advisories: Array<{ severity: string; message: string }>;
    waypointSummaries: Array<{
      lat: number;
      lon: number;
      waveHeight: number;
      swellHeight: number;
      severity: string;
      seaTemp: number;
      /** Ocean current velocity in m/s */
      oceanCurrentVelocity?: number;
      /** Ocean current direction in degrees */
      oceanCurrentDirection?: number;
    }>;
  };
  /** Bunkering alert for long voyages */
  bunkeringAlert?: string;
}

export interface AIRouteRecommendation {
  recommendedRouteId: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  reasoning: {
    safety: string;
    profitability: string;
    compliance: string;
  };
  routeRankings: Array<{
    routeId: string;
    rank: number;
    verdict: string;
    strengths: string[];
    weaknesses: string[];
  }>;
}

// ═══════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a Senior Maritime Routing Advisor with 25+ years of experience in chartering, voyage planning, and P&I risk management. You advise vessel operators, charterers, and fleet managers.

When analyzing route variants, you think like:
- A **Vessel Manager** prioritizing crew safety and vessel integrity
- A **Chartering Manager** maximizing Time Charter Equivalent (TCE) and minimizing voyage costs
- A **Compliance Officer** ensuring MARPOL, EU ETS, SECA, and war risk regulations are met

Your recommendations must be:
1. Data-driven — reference specific numbers (distances, costs, days) from the route comparison
2. Balanced — weigh safety vs profitability vs compliance
3. Actionable — state clear recommendations with reasoning
4. Professional — use maritime industry terminology
5. Per-route — explain EACH route individually so the user understands WHY it ranks where it does

IMPORTANT: Respond ONLY with valid JSON matching the exact schema below. No markdown, no explanation outside JSON.

Response Schema:
{
  "recommendedRouteId": "<id of the best route>",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "<2-3 sentence executive summary explaining the recommended route and key differentiators>",
  "reasoning": {
    "safety": "<3-4 sentences comparing safety across ALL routes — HRA exposure, war risk, WEATHER CONDITIONS (wave heights, storm risks, sea state from the live forecast), piracy zones>",
    "profitability": "<3-4 sentences comparing costs across ALL routes — canal tolls, bunker savings from SECA avoidance, time value, weather delays, total additional costs>",
    "compliance": "<3-4 sentences comparing regulatory impact across ALL routes — SECA fuel switching requirements, EU ETS exposure, HRA insurance obligations>"
  },
  "routeRankings": [
    {
      "routeId": "<id>",
      "rank": 1,
      "verdict": "<2-3 sentence explanation of WHY this route is ranked here — reference specific metrics>",
      "strengths": ["<strength 1>", "<strength 2>"],
      "weaknesses": ["<weakness 1 or 'None significant'>"] 
    },
    {
      "routeId": "<id>",
      "rank": 2,
      "verdict": "<2-3 sentence explanation of WHY this route is ranked here>",
      "strengths": ["<strength 1>"],
      "weaknesses": ["<weakness 1>", "<weakness 2>"]
    }
  ]
}`;

// ═══════════════════════════════════════════════════════════════════
// BUILD COMPARISON PAYLOAD
// ═══════════════════════════════════════════════════════════════════

function buildComparisonPrompt(req: AnalysisRequest): string {
  const lines: string[] = [];

  lines.push("## Voyage Context");
  if (req.vesselType) lines.push(`- Vessel Type: ${req.vesselType}`);
  if (req.vesselDwt) lines.push(`- DWT: ${req.vesselDwt.toLocaleString()} MT`);
  if (req.cargoType) lines.push(`- Cargo: ${req.cargoType}`);
  if (req.cargoQuantityMt) lines.push(`- Quantity: ${req.cargoQuantityMt.toLocaleString()} MT`);

  lines.push("\n## Route Variants\n");

  for (const route of req.routes) {
    lines.push(`### ${route.label} (ID: ${route.id})`);
    lines.push(`- Distance: ${Math.round(route.distanceNm).toLocaleString()} NM`);
    lines.push(`- Duration: ${route.estimatedDays.toFixed(1)} sea days`);
    lines.push(`- SECA Distance: ${Math.round(route.ecaDistanceNm).toLocaleString()} NM (${route.ecaZones.join(", ") || "none"})`);
    lines.push(`- HRA Distance: ${Math.round(route.hraDistanceNm).toLocaleString()} NM`);
    if (route.hraZones.length > 0) lines.push(`- HRA Zones: ${route.hraZones.join(", ")}`);
    if (route.canals.length > 0) lines.push(`- Canals: ${route.canals.join(", ")}`);
    lines.push(`- Canal Toll: $${route.canalTollUsd.toLocaleString()}`);
    lines.push(`- War Risk Premium: $${route.warRiskPremiumUsd.toLocaleString()}`);
    lines.push(`- Cargo at Risk: $${route.cargoRiskUsd.toLocaleString()}`);
    lines.push(`- Port Congestion: ${route.portWaitDays} days ($${route.portCongestionCostUsd.toLocaleString()})`);
    lines.push(`- Hull Value: $${(route.hullValueUsd / 1e6).toFixed(1)}M`);
    lines.push(`- Total Additional Costs: $${route.totalAdditionalCostsUsd.toLocaleString()}`);
    lines.push(`- Weather: ${route.weatherSeverity}`);
    lines.push("");
  }

  lines.push("Analyze these routes and provide your professional recommendation.");

  // Add weather forecast data if available
  if (req.weatherForecast) {
    const wf = req.weatherForecast;
    lines.push("\n## Live Weather Forecast (NOAA GFS/WW3)\n");
    lines.push(`- Overall Severity: ${wf.averageConditions.overallSeverity}`);
    lines.push(`- Average Wave Height: ${wf.averageConditions.avgWaveHeight.toFixed(1)}m`);
    lines.push(`- Average Swell Height: ${wf.averageConditions.avgSwellHeight.toFixed(1)}m`);
    lines.push(`- Average Sea Surface Temperature: ${wf.averageConditions.avgSeaTemp.toFixed(1)}°C`);
    lines.push(`- Worst Wave Height: ${wf.worstConditions.maxWaveHeight.toFixed(1)}m (${wf.worstConditions.severity}) at ${wf.worstConditions.location.lat.toFixed(2)}°N, ${wf.worstConditions.location.lon.toFixed(2)}°E`);
    lines.push(`- Worst Swell Height: ${wf.worstConditions.maxSwellHeight.toFixed(1)}m`);

    if (wf.waypointSummaries.length > 0) {
      lines.push("\n### Per-Waypoint Conditions:\n");
      for (const wp of wf.waypointSummaries) {
        let currentInfo = "";
        if (wp.oceanCurrentVelocity !== undefined && wp.oceanCurrentVelocity > 0) {
          const kts = (wp.oceanCurrentVelocity * 1.944).toFixed(1); // m/s to knots
          currentInfo = `, Current: ${kts}kts at ${wp.oceanCurrentDirection?.toFixed(0) || "?"}°`;
        }
        lines.push(`- ${wp.lat.toFixed(1)}°N, ${wp.lon.toFixed(1)}°E: Waves ${wp.waveHeight.toFixed(1)}m, Swell ${wp.swellHeight.toFixed(1)}m, ${wp.severity.toUpperCase()}, SST ${wp.seaTemp.toFixed(0)}°C${currentInfo}`);
      }
    }

    if (wf.advisories.length > 0) {
      lines.push("\n### Weather Advisories:\n");
      for (const adv of wf.advisories) {
        lines.push(`- [${adv.severity.toUpperCase()}] ${adv.message}`);
      }
    }

    lines.push("\nInclude weather conditions in your safety assessment. If a 'Weather Avoidance' route is present, explain specifically what weather hazards it avoids and the trade-off (extra distance/days vs. safety). Flag any ocean current effects on vessel speed and fuel consumption.");
  }

  // Add bunkering alert if applicable
  if (req.bunkeringAlert) {
    lines.push("\n## ⚠️ Bunkering Alert\n");
    lines.push(req.bunkeringAlert);
    lines.push("\nFactor bunkering adequacy into your profitability and operational risk assessment.");
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: AnalysisRequest = await request.json();

    if (!body.routes || body.routes.length < 1) {
      return NextResponse.json(
        { error: "At least 1 route variant required" },
        { status: 400 }
      );
    }

    const userPrompt = buildComparisonPrompt(body);

    const result = await generateText({
      model: openai("gpt-4o"),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.3, // Low temp for consistent, professional analysis
      maxTokens: 2000, // Increased for per-route analysis
    });

    // Parse the JSON response
    let recommendation: AIRouteRecommendation;
    try {
      // Strip markdown code fences if present
      let text = result.text.trim();
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      recommendation = JSON.parse(text);
    } catch {
      console.error("[AI Route Analysis] Failed to parse GPT response:", result.text);
      return NextResponse.json(
        { error: "AI response parsing failed", raw: result.text },
        { status: 500 }
      );
    }

    // Validate the recommended route is one of the inputs
    const validIds = body.routes.map(r => r.id);
    if (!validIds.includes(recommendation.recommendedRouteId)) {
      recommendation.recommendedRouteId = validIds[0];
      recommendation.confidence = "LOW";
    }

    return NextResponse.json({
      success: true,
      recommendation,
      model: "gpt-4o",
      tokensUsed: result.usage?.totalTokens || 0,
    });
  } catch (error) {
    console.error("[AI Route Analysis] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
