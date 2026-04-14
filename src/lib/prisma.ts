/**
 * Prisma client for Next.js with Neon serverless driver adapter
 * Based on: https://neon.tech/docs/guides/prisma
 */

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
// Import PrismaClient from the generated client location
import { PrismaClient } from "@prisma/client/index";

// For Node.js environments, configure WebSocket
// eslint-disable-next-line @typescript-eslint/no-require-imports
neonConfig.webSocketConstructor = require("ws");

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
      "Please ensure your .env file is in the project root."
    );
  }

  // Pass connectionString directly to PrismaNeon (not a Pool)
  const adapter = new PrismaNeon({ connectionString });
  
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Use global variable in development to prevent hot-reload creating multiple instances
const prisma = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export { prisma };
export default prisma;
