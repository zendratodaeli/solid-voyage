/**
 * NavAPI Status API Route
 * 
 * GET /api/navapi/status
 * 
 * Returns API key status (tokens remaining, expiration)
 */

import { NextResponse } from "next/server";
import { checkApiStatus } from "@/lib/navapi-client";

export async function GET() {
  try {
    const status = await checkApiStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("API status check error:", error);
    return NextResponse.json(
      { error: "Failed to check API status" },
      { status: 500 }
    );
  }
}
