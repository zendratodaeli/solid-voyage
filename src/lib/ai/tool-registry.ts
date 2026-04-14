/**
 * AI Copilot Tool Registry
 *
 * Central registry that combines all tool modules into a single
 * tools object for the Vercel AI SDK.
 */

import { voyageTools } from "./tools/voyage-tools";
import { routingTools } from "./tools/routing-tools";
import { aisTools } from "./tools/ais-tools";
import { laytimeTools } from "./tools/laytime-tools";
import { analyticsTools } from "./tools/analytics-tools";
import { cargoExtractorTools } from "./tools/cargo-extractor";
import { weatherTools } from "./tools/weather-tools";

/**
 * All tools available to the AI copilot.
 * 
 * The AI model decides which tools to call based on the user's question.
 * Tools are grouped by domain but merged into a flat object for the SDK.
 */
export const copilotTools = {
  // Voyage calculations & optimization
  ...voyageTools,

  // Sea routing & compliance
  ...routingTools,

  // AIS vessel tracking (any vessel worldwide + fleet)
  ...aisTools,

  // Laytime & demurrage
  ...laytimeTools,

  // Fleet analytics & history
  ...analyticsTools,

  // Cargo email extraction
  ...cargoExtractorTools,

  // Weather & marine forecasts
  ...weatherTools,
};

/** Type for all copilot tool names */
export type CopilotToolName = keyof typeof copilotTools;

/** List of all available tool names (useful for logging/tracking) */
export const COPILOT_TOOL_NAMES = Object.keys(copilotTools) as CopilotToolName[];
