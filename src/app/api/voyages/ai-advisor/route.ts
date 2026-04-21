/**
 * AI Voyage Advisor API Route
 * 
 * POST /api/voyages/ai-advisor
 * 
 * Generates a professional GO/NO-GO voyage assessment using OpenAI GPT-4o.
 * Called after voyage creation with full voyage + route data.
 * 
 * Returns a markdown-formatted advisor summary covering:
 * - Route selection rationale
 * - Profitability assessment (TCE, revenue vs. costs)
 * - Safety analysis (HRA, piracy, weather)
 * - Compliance check (SECA, EU ETS, IMO)
 * - Risk warnings
 * - Clear GO/NO-GO recommendation
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a Senior Chartering Manager & Marine Operations Expert at a commercial shipping company.
You are analyzing a proposed voyage estimate to provide a concise, actionable GO/NO-GO recommendation to the CEO and executive team.

Your assessment must be:
- **Professional**: Written as an executive brief, not a technical report
- **Quantitative**: Include specific numbers, percentages, and comparisons
- **Actionable**: Clear recommendation with supporting evidence
- **Risk-Aware**: Flag any operational, financial, or regulatory concerns

Structure your response using the following markdown format:

## 🧭 Route Analysis
Explain why this is the optimal route. If alternatives were calculated, explain the trade-offs.

## 💰 Profitability Assessment
Evaluate TCE, revenue vs. costs, break-even freight. Is this voyage commercially viable?

## ⚠️ Safety & Risk
Flag any HRA transits, piracy concerns, weather patterns. Note seasonal risks.

## 🏛️ Regulatory Compliance
SECA/ECA zones and fuel switching requirements. EU ETS liability. IMO CII implications.

## ⚡ Key Risks & Warnings
List any deal-breaker concerns or important caveats.

## ✅ Recommendation
**GO** or **NO-GO** with a one-paragraph executive summary explaining the decision.

Keep the total response under 500 words. Be decisive, not wishy-washy.`;

export async function POST(request: Request) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      voyageId,
      vesselName,
      vesselType,
      dwt,
      route,
      cargo,
      portDetails,
      financials,
      routeIntelligence,
      euEts,
    } = body;

    if (!voyageId) {
      return NextResponse.json({ error: "voyageId is required" }, { status: 400 });
    }

    // Build the context prompt with all voyage data
    const userPrompt = buildVoyagePrompt({
      vesselName,
      vesselType,
      dwt,
      route,
      cargo,
      portDetails,
      financials,
      routeIntelligence,
      euEts,
    });

    // Call OpenAI GPT-4o
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Low temperature for consistent, factual output
      max_tokens: 1000,
    });

    const summary = completion.choices[0]?.message?.content || "Unable to generate assessment.";

    // Store the summary in the voyage record
    const { default: prisma } = await import("@/lib/prisma");

    await prisma.voyage.update({
      where: { id: voyageId },
      data: { aiAdvisorSummary: summary },
    });

    return NextResponse.json({
      success: true,
      summary,
      voyageId,
    });

  } catch (error) {
    console.error("[AI Advisor] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate AI assessment" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════

interface VoyageData {
  vesselName?: string;
  vesselType?: string;
  dwt?: number;
  route?: {
    openPort?: string;
    loadPorts?: string[];
    dischargePorts?: string[];
    legDistances?: number[];
  };
  cargo?: {
    type?: string;
    quantity?: number;
    freightRate?: number;
    freightRateUnit?: string;
  };
  portDetails?: {
    loadPortDays?: number;
    dischargePortDays?: number;
    waitingDays?: number;
    idleDays?: number;
  };
  financials?: {
    bunkerPrice?: number;
    brokeragePercent?: number;
    commissionPercent?: number;
    canalTolls?: number;
    pdaCosts?: number;
    additionalCosts?: number;
  };
  routeIntelligence?: {
    totalDistanceNm?: number;
    totalEcaDistanceNm?: number;
    totalHraDistanceNm?: number;
    estimatedSeaDays?: number;
    detectedCanals?: string[];
    ecaZones?: string[];
    hraZones?: string[];
    routeLabel?: string;
    alternatives?: {
      label: string;
      rank: number;
      totalDistanceNm: number;
      totalEcaDistanceNm: number;
      estimatedSeaDays: number;
      detectedCanals: string[];
      rankReason?: string;
    }[];
  };
  euEts?: {
    applicable?: boolean;
    percentage?: number;
    loadCountry?: string;
    dischargeCountry?: string;
  };
}

function buildVoyagePrompt(data: VoyageData): string {
  const lines: string[] = ["Analyze this proposed voyage:"];

  // Vessel
  if (data.vesselName) {
    lines.push(`\n**Vessel**: ${data.vesselName} (${data.vesselType || "N/A"}, ${data.dwt?.toLocaleString() || "N/A"} DWT)`);
  }

  // Route
  if (data.route) {
    const r = data.route;
    lines.push(`\n**Route**: ${r.openPort || "?"} → ${r.loadPorts?.join(" → ") || "?"} → ${r.dischargePorts?.join(" → ") || "?"}`);
    if (r.legDistances?.length) {
      lines.push(`**Leg Distances**: ${r.legDistances.map(d => `${Math.round(d).toLocaleString()} NM`).join(", ")}`);
    }
  }

  // Route Intelligence
  if (data.routeIntelligence) {
    const ri = data.routeIntelligence;
    lines.push(`\n**Route Intelligence**:`);
    lines.push(`- Total Distance: ${Math.round(ri.totalDistanceNm || 0).toLocaleString()} NM`);
    lines.push(`- Sea Days: ${(ri.estimatedSeaDays || 0).toFixed(1)}`);
    if (ri.totalEcaDistanceNm && ri.totalEcaDistanceNm > 0) {
      const ecaPct = ri.totalDistanceNm ? Math.round((ri.totalEcaDistanceNm / ri.totalDistanceNm) * 100) : 0;
      lines.push(`- ECA/SECA Distance: ${Math.round(ri.totalEcaDistanceNm).toLocaleString()} NM (${ecaPct}%)`);
      if (ri.ecaZones?.length) lines.push(`- ECA Zones: ${ri.ecaZones.join(", ")}`);
    }
    if (ri.totalHraDistanceNm && ri.totalHraDistanceNm > 0) {
      lines.push(`- HRA Distance: ${Math.round(ri.totalHraDistanceNm).toLocaleString()} NM ⚠️`);
      if (ri.hraZones?.length) lines.push(`- HRA Zones: ${ri.hraZones.join(", ")}`);
    }
    if (ri.detectedCanals?.length) lines.push(`- Canals: ${ri.detectedCanals.join(", ")}`);
    if (ri.routeLabel) lines.push(`- Selected Route: ${ri.routeLabel}`);

    // Alternatives
    if (ri.alternatives && ri.alternatives.length > 1) {
      lines.push(`\n**Route Alternatives Considered**:`);
      ri.alternatives.forEach(alt => {
        lines.push(`- Rank #${alt.rank}: ${alt.label} — ${Math.round(alt.totalDistanceNm).toLocaleString()} NM, ${alt.estimatedSeaDays.toFixed(1)} days${alt.detectedCanals?.length ? `, via ${alt.detectedCanals.join("/")}` : ""}${alt.rankReason ? ` (${alt.rankReason})` : ""}`);
      });
    }
  }

  // Cargo
  if (data.cargo) {
    lines.push(`\n**Cargo**: ${data.cargo.type || "N/A"}, ${data.cargo.quantity?.toLocaleString() || "N/A"} MT`);
    if (data.cargo.freightRate) {
      lines.push(`**Freight Rate**: $${data.cargo.freightRate}/${data.cargo.freightRateUnit || "MT"}`);
    }
  }

  // Port Details
  if (data.portDetails) {
    lines.push(`\n**Port Time**: Load ${data.portDetails.loadPortDays || 0}d, Discharge ${data.portDetails.dischargePortDays || 0}d, Waiting ${data.portDetails.waitingDays || 0}d, Idle ${data.portDetails.idleDays || 0}d`);
  }

  // Financials
  if (data.financials) {
    const f = data.financials;
    lines.push(`\n**Financials**:`);
    if (f.bunkerPrice) lines.push(`- Bunker Price: $${f.bunkerPrice}/MT`);
    if (f.brokeragePercent) lines.push(`- Brokerage: ${f.brokeragePercent}%`);
    if (f.commissionPercent) lines.push(`- Commission: ${f.commissionPercent}%`);
    if (f.canalTolls) lines.push(`- Canal Tolls: $${f.canalTolls.toLocaleString()}`);
    if (f.pdaCosts) lines.push(`- PDA: $${f.pdaCosts.toLocaleString()}`);
    if (f.additionalCosts) lines.push(`- Additional: $${f.additionalCosts.toLocaleString()}`);
  }

  // EU ETS
  if (data.euEts?.applicable) {
    lines.push(`\n**EU ETS**: ${data.euEts.percentage}% taxable (${data.euEts.loadCountry || "?"} → ${data.euEts.dischargeCountry || "?"})`);
  }

  return lines.join("\n");
}
