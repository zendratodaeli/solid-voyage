import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════
// Fleet Weather Cron — Polls weather for all active live voyages
// Runs every 15 minutes (triggered by Vercel cron or external scheduler)
//
// For each active LiveVoyageSession:
// 1. Fetch vessel position from Datalastic (or latest trackpoint)
// 2. Check weather conditions at vessel position
// 3. Create alert if dangerous conditions detected
// 4. Store track point
// ═══════════════════════════════════════════════════════════════════

const DATALASTIC_API_KEY = process.env.DATALASTIC_API_KEY;
const WEATHER_ENGINE_URL = process.env.WEATHER_ENGINE_URL || "http://localhost:8000";
const CRON_SECRET = process.env.CRON_SECRET; // Optional: protect cron endpoint

// Alert thresholds
const THRESHOLDS = {
  DANGER_WAVE_M: 5.0,
  WARNING_WAVE_M: 3.5,
  DANGER_WIND_KN: 40,
  WARNING_WIND_KN: 28,
};

export async function GET(req: Request) {
  try {
    // Optional: verify cron secret
    if (CRON_SECRET) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Get all active live voyage sessions
    const sessions = await prisma.liveVoyageSession.findMany({
      where: { status: "active" },
      include: {
        trackPoints: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });

    if (sessions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active voyages",
        processed: 0,
      });
    }

    const results = [];

    for (const session of sessions) {
      try {
        // 1. Get vessel position (Datalastic or latest track point)
        let lat: number | null = null;
        let lon: number | null = null;
        let speed: number | null = null;
        let heading: number | null = null;

        if (DATALASTIC_API_KEY && session.vesselMmsi) {
          // Try Datalastic
          try {
            const aisRes = await fetch(
              `https://api.datalastic.com/api/v0/vessel?api-key=${DATALASTIC_API_KEY}&mmsi=${session.vesselMmsi}`,
              { signal: AbortSignal.timeout(10000) }
            );
            if (aisRes.ok) {
              const aisData = await aisRes.json();
              if (aisData.data) {
                lat = aisData.data.latitude;
                lon = aisData.data.longitude;
                speed = aisData.data.speed;
                heading = aisData.data.heading;
              }
            }
          } catch {
            // Fall through to latest trackpoint
          }
        }

        // Fallback: use latest track point
        if (lat === null && session.trackPoints.length > 0) {
          const lastPt = session.trackPoints[0];
          lat = lastPt.lat;
          lon = lastPt.lon;
          speed = lastPt.speed;
          heading = lastPt.heading;
        }

        if (lat === null || lon === null) {
          results.push({ sessionId: session.id, status: "no_position" });
          continue;
        }

        // 2. Check weather at vessel position
        let weatherAlert = null;
        try {
          const wxRes = await fetch(
            `${WEATHER_ENGINE_URL}/conditions?lat=${lat}&lon=${lon}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (wxRes.ok) {
            const wx = await wxRes.json();
            const wave = wx.wave_height_m || 0;
            const wind = wx.wind_speed_knots || 0;

            // Check thresholds
            if (wave >= THRESHOLDS.DANGER_WAVE_M || wind >= THRESHOLDS.DANGER_WIND_KN) {
              weatherAlert = {
                level: "DANGER",
                message: `⚠️ DANGER: ${wave.toFixed(1)}m waves, ${wind.toFixed(0)}kn wind at ${session.vesselName}'s position`,
                wave,
                wind,
              };
            } else if (wave >= THRESHOLDS.WARNING_WAVE_M || wind >= THRESHOLDS.WARNING_WIND_KN) {
              weatherAlert = {
                level: "WARNING",
                message: `⚡ WARNING: ${wave.toFixed(1)}m waves, ${wind.toFixed(0)}kn wind near ${session.vesselName}`,
                wave,
                wind,
              };
            }
          }
        } catch {
          // Weather check failed — not critical
        }

        // 3. Store track point
        await prisma.voyageTrackPoint.create({
          data: {
            sessionId: session.id,
            lat,
            lon,
            speed: speed || 0,
            heading: heading || 0,
            waveHeightM: weatherAlert?.wave || null,
            windSpeedKn: weatherAlert?.wind || null,
            navigability: weatherAlert ? (weatherAlert.level === "DANGER" ? "dangerous" : "restricted") : "open",
            advisoryType: weatherAlert ? (weatherAlert.level === "DANGER" ? "shelter" : "slow_down") : null,
            advisoryMessage: weatherAlert?.message || null,
          },
        });

        // 4. Send alert email if dangerous
        if (weatherAlert && weatherAlert.level === "DANGER") {
          try {
            await sendWeatherAlert(session, weatherAlert, lat, lon);
          } catch {
            // Alert send failed — log but don't block
          }
        }

        results.push({
          sessionId: session.id,
          vesselName: session.vesselName,
          lat,
          lon,
          alert: weatherAlert?.level || "CLEAR",
        });
      } catch (err) {
        results.push({
          sessionId: session.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      activeSessions: sessions.length,
      data: results,
    });
  } catch (error) {
    console.error("[FLEET_WEATHER_CRON] Error:", error);
    return NextResponse.json(
      { error: "Fleet weather cron failed" },
      { status: 500 }
    );
  }
}

async function sendWeatherAlert(
  session: { id: string; vesselName: string; createdBy: string | null; originPort: string; destinationPort: string },
  alert: { level: string; message: string; wave: number; wind: number },
  lat: number,
  lon: number
) {
  // Use Resend API if available
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return;

  const emailBody = `
    <h2>🚨 Weather Alert — ${session.vesselName}</h2>
    <p><strong>${alert.message}</strong></p>
    <table>
      <tr><td>Vessel</td><td>${session.vesselName}</td></tr>
      <tr><td>Position</td><td>${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</td></tr>
      <tr><td>Wave Height</td><td>${alert.wave.toFixed(1)}m</td></tr>
      <tr><td>Wind Speed</td><td>${alert.wind.toFixed(0)} knots</td></tr>
      <tr><td>Route</td><td>${session.originPort} → ${session.destinationPort}</td></tr>
      <tr><td>Alert Level</td><td style="color: red; font-weight: bold;">${alert.level}</td></tr>
    </table>
    <p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/live-tracking/${session.id}">
        View Live Tracking →
      </a>
    </p>
    <p style="color: #666; font-size: 12px;">
      Solid Voyage — Automated weather monitoring
    </p>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Solid Voyage <alerts@solidvoyage.com>",
      to: [], // TODO: Fetch org admin emails from Clerk
      subject: `🚨 ${alert.level}: Weather Alert for ${session.vesselName}`,
      html: emailBody,
    }),
  });
}
