/**
 * Port Congestion Intelligence Engine
 *
 * Matches voyage origin/destination ports to congestion data from
 * MaritimeIntelligence and estimates waiting time delays.
 *
 * Sources: Everstream Analytics, Kuehne+Nagel, port authority reports.
 */

import type { MaritimeIntelligence } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface PortCongestionEstimate {
  /** Port name as matched */
  portName: string;
  /** Port LOCODE if available */
  locode?: string;
  /** Average waiting time in days */
  avgWaitDays: number;
  /** Congestion level classification */
  level: "LOW" | "MODERATE" | "HIGH";
  /** Whether port was matched to a known congestion profile */
  matched: boolean;
}

export interface VoyageCongestionImpact {
  /** Total estimated waiting days across all ports */
  totalWaitDays: number;
  /** Per-port breakdown */
  ports: PortCongestionEstimate[];
  /** Impact on voyage cost (waiting days × daily opex) */
  estimatedCostUsd: number;
  /** Advisory text */
  advisory: string;
}

// ═══════════════════════════════════════════════════════════════════
// PORT MATCHING — Maps port names/LOCODEs to MI congestion fields
// ═══════════════════════════════════════════════════════════════════

type CongestionKey =
  | "congestionChinaQingdao"
  | "congestionChinaTianjin"
  | "congestionChinaQinhuangdao"
  | "congestionAustNewcastle"
  | "congestionAustPortHedland"
  | "congestionBrazilSantos"
  | "congestionBrazilTubarao"
  | "congestionIndiaMundra"
  | "congestionIndiaKandla"
  | "congestionUSGulfHouston"
  | "congestionRotterdam"
  | "congestionSingapore";

interface PortProfile {
  field: CongestionKey;
  displayName: string;
  keywords: string[];
  locodes: string[];
}

const PORT_PROFILES: PortProfile[] = [
  // China
  {
    field: "congestionChinaQingdao",
    displayName: "Qingdao",
    keywords: ["qingdao", "tsingtao"],
    locodes: ["CNQDG", "CNTAO"],
  },
  {
    field: "congestionChinaTianjin",
    displayName: "Tianjin",
    keywords: ["tianjin", "xingang", "tientsin"],
    locodes: ["CNTSN", "CNXGG"],
  },
  {
    field: "congestionChinaQinhuangdao",
    displayName: "Qinhuangdao",
    keywords: ["qinhuangdao", "chinwangtao"],
    locodes: ["CNQHD"],
  },
  // Australia
  {
    field: "congestionAustNewcastle",
    displayName: "Newcastle",
    keywords: ["newcastle"],
    locodes: ["AUNTL"],
  },
  {
    field: "congestionAustPortHedland",
    displayName: "Port Hedland",
    keywords: ["port hedland", "hedland"],
    locodes: ["AUPHD", "AUPHE"],
  },
  // Brazil
  {
    field: "congestionBrazilSantos",
    displayName: "Santos",
    keywords: ["santos"],
    locodes: ["BRSSZ"],
  },
  {
    field: "congestionBrazilTubarao",
    displayName: "Tubarão",
    keywords: ["tubarao", "tubarão", "vitoria", "praia mole"],
    locodes: ["BRTUB", "BRVIX"],
  },
  // India
  {
    field: "congestionIndiaMundra",
    displayName: "Mundra",
    keywords: ["mundra"],
    locodes: ["INMUN"],
  },
  {
    field: "congestionIndiaKandla",
    displayName: "Kandla",
    keywords: ["kandla", "deendayal"],
    locodes: ["INIXY"],
  },
  // USA
  {
    field: "congestionUSGulfHouston",
    displayName: "Houston",
    keywords: ["houston", "galveston", "texas city"],
    locodes: ["USHOU"],
  },
  // Europe
  {
    field: "congestionRotterdam",
    displayName: "Rotterdam",
    keywords: ["rotterdam", "europoort"],
    locodes: ["NLRTM"],
  },
  // Southeast Asia
  {
    field: "congestionSingapore",
    displayName: "Singapore",
    keywords: ["singapore", "jurong", "pasir panjang"],
    locodes: ["SGSIN"],
  },
];

// ═══════════════════════════════════════════════════════════════════
// PORT MATCHING
// ═══════════════════════════════════════════════════════════════════

/**
 * Match a port name or LOCODE to a known congestion profile.
 */
function matchPort(
  portName: string,
  locode: string | undefined,
  intel: MaritimeIntelligence,
): PortCongestionEstimate {
  const nameLower = portName.toLowerCase();

  for (const profile of PORT_PROFILES) {
    // Match by LOCODE (most reliable)
    if (locode && profile.locodes.includes(locode.toUpperCase())) {
      const waitDays = intel[profile.field] as number;
      return {
        portName: profile.displayName,
        locode,
        avgWaitDays: waitDays,
        level: waitDays <= 1.5 ? "LOW" : waitDays <= 3.0 ? "MODERATE" : "HIGH",
        matched: true,
      };
    }

    // Match by keyword in port name
    for (const keyword of profile.keywords) {
      if (nameLower.includes(keyword)) {
        const waitDays = intel[profile.field] as number;
        return {
          portName: profile.displayName,
          locode,
          avgWaitDays: waitDays,
          level: waitDays <= 1.5 ? "LOW" : waitDays <= 3.0 ? "MODERATE" : "HIGH",
          matched: true,
        };
      }
    }
  }

  // No match — return default low congestion
  return {
    portName,
    locode,
    avgWaitDays: 0.5,
    level: "LOW",
    matched: false,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Assess congestion impact for a list of voyage ports.
 *
 * @param ports        Array of port names and optional LOCODEs
 * @param dailyOpexUsd Daily operating expenses (for cost impact calculation)
 * @param intel        MaritimeIntelligence singleton from database
 */
export function assessPortCongestion(
  ports: { name: string; locode?: string }[],
  dailyOpexUsd: number,
  intel: MaritimeIntelligence,
): VoyageCongestionImpact {
  const portEstimates: PortCongestionEstimate[] = [];
  let totalWaitDays = 0;

  for (const port of ports) {
    const estimate = matchPort(port.name, port.locode, intel);
    portEstimates.push(estimate);
    totalWaitDays += estimate.avgWaitDays;
  }

  const estimatedCost = Math.round(totalWaitDays * dailyOpexUsd);

  // Build advisory
  const highCongestion = portEstimates.filter(p => p.level === "HIGH");
  let advisory: string;
  if (highCongestion.length > 0) {
    const names = highCongestion.map(p => `${p.portName} (~${p.avgWaitDays}d)`).join(", ");
    advisory = `⚠️ High congestion expected at ${names}. Consider factoring ${Math.round(totalWaitDays)} total wait days into voyage duration.`;
  } else if (totalWaitDays > 3) {
    advisory = `Moderate port delays expected — total ~${totalWaitDays.toFixed(1)} wait days across ${ports.length} ports.`;
  } else {
    advisory = `Low congestion expected — minimal port delays (~${totalWaitDays.toFixed(1)} days total).`;
  }

  return {
    totalWaitDays: Math.round(totalWaitDays * 10) / 10,
    ports: portEstimates,
    estimatedCostUsd: estimatedCost,
    advisory,
  };
}
