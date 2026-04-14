/**
 * Route Planner API - Port Search
 * 
 * GET /api/route-planner/search?q={query}
 * Searches local port database for matching ports.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    
    if (query.length < 2) {
      return NextResponse.json({ 
        success: true, 
        data: [],
        message: "Query must be at least 2 characters" 
      });
    }
    
    // Search ports by name, locode, or country
    const ports = await prisma.port.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { locode: { contains: query, mode: "insensitive" } },
          { country: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        locode: true,
        country: true,
        latitude: true,
        longitude: true,
        region: true,
      },
      orderBy: { name: "asc" },
      take: 20, // Limit results for performance
    });
    
    return NextResponse.json({ 
      success: true, 
      data: ports,
      count: ports.length,
    });
  } catch (error) {
    console.error("Port search error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to search ports" },
      { status: 500 }
    );
  }
}
