/**
 * Pusher Server — Singleton for triggering real-time events
 *
 * Events are scoped per organization channel: `org-{orgId}`
 * This ensures multi-tenant isolation.
 */

import Pusher from "pusher";

let pusherInstance: Pusher | null = null;

function getPusherServer(): Pusher {
  if (!pusherInstance) {
    pusherInstance = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return pusherInstance;
}

// ═══════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════

export interface VoyageUpdatedEvent {
  voyageId: string;
  status: string;
  previousStatus: string;
}

export interface CargoUpdatedEvent {
  inquiryId: string;
  status: string;
  previousStatus: string;
  voyageId: string | null;
}

// ═══════════════════════════════════════════════════════════════════
// TRIGGER HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Notify all connected clients that a voyage status changed.
 * Non-blocking — errors are logged but won't break the main flow.
 */
export async function triggerVoyageUpdated(
  orgId: string,
  data: VoyageUpdatedEvent
): Promise<void> {
  try {
    await getPusherServer().trigger(`org-${orgId}`, "voyage-updated", data);
  } catch (error) {
    console.error("[Pusher] Failed to trigger voyage-updated:", error);
  }
}

/**
 * Notify all connected clients that a cargo inquiry status changed.
 * Non-blocking — errors are logged but won't break the main flow.
 */
export async function triggerCargoUpdated(
  orgId: string,
  data: CargoUpdatedEvent
): Promise<void> {
  try {
    await getPusherServer().trigger(`org-${orgId}`, "cargo-updated", data);
  } catch (error) {
    console.error("[Pusher] Failed to trigger cargo-updated:", error);
  }
}
