/**
 * Cargo Email Extraction Tool for AI Copilot
 *
 * Specialized tool that extracts structured cargo details from unstructured
 * broker emails. Compatible with AI SDK v6.
 */

import { tool } from "ai";
import { z } from "zod";

const extractSchema = z.object({
  emailText: z.string().describe("The raw broker email text or cargo description to parse"),
});

export const cargoExtractorTools = {
  extractCargoDetails: tool({
    description:
      "Extract structured cargo offer details from raw broker email text. " +
      "Parses cargo quantity, ports, freight rate, laycan dates. " +
      "Use as the FIRST step when a user pastes an email. " +
      "After extraction, use searchPort and findVessels for full analysis.",
    inputSchema: extractSchema,
    execute: async (input: z.infer<typeof extractSchema>) => {
      const emailText = input.emailText;

      // Basic keyword extraction for common patterns
      const quantityMatch = emailText.match(
        /(\d[\d,]*(?:\.\d+)?)\s*(?:mt|metric\s*ton|tonnes?|dwt)/i
      );
      const lumpSumMatch = emailText.match(
        /(?:lump\s*sum|ls)\s*(?:usd|us\$|\$)\s*(\d[\d,]*(?:\.\d+)?)/i
      );
      const rateMatch = emailText.match(
        /(?:usd|us\$|\$)\s*(\d[\d,]*(?:\.\d+)?)\s*(?:\/?\s*(?:mt|pmt|per\s*mt))/i
      );
      const wsMatch = emailText.match(/(?:ws|worldscale)\s*(\d[\d,]*(?:\.\d+)?)/i);

      return {
        rawText: emailText.substring(0, 500),
        cargoQuantityMt: quantityMatch
          ? parseFloat(quantityMatch[1].replace(/,/g, ""))
          : null,
        freightRate: rateMatch
          ? parseFloat(rateMatch[1].replace(/,/g, ""))
          : lumpSumMatch
            ? parseFloat(lumpSumMatch[1].replace(/,/g, ""))
            : null,
        freightRateUnit: rateMatch
          ? "PER_MT"
          : lumpSumMatch
            ? "LUMP_SUM"
            : wsMatch
              ? "WORLDSCALE"
              : null,
        worldscaleRate: wsMatch
          ? parseFloat(wsMatch[1].replace(/,/g, ""))
          : null,
        note: "Review the extracted data. Use searchPort to resolve port names, " +
              "then findVessels and calculateVoyageProfitability for full analysis.",
      };
    },
  }),
};
