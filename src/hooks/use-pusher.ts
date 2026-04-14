"use client";

/**
 * usePusher — Real-time event subscription hook
 *
 * Connects to Pusher on mount, subscribes to org-scoped channel,
 * calls handlers when events arrive, and cleans up on unmount.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import Pusher from "pusher-js";
import type { Channel } from "pusher-js";

// ═══════════════════════════════════════════════════════════════════
// TYPES
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

interface UsePusherOptions {
  onVoyageUpdated?: (data: VoyageUpdatedEvent) => void;
  onCargoUpdated?: (data: CargoUpdatedEvent) => void;
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON CONNECTION
// ═══════════════════════════════════════════════════════════════════

let pusherClient: Pusher | null = null;

function getPusherClient(): Pusher {
  if (!pusherClient) {
    pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_APP_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
  }
  return pusherClient;
}

// ═══════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════

export function usePusher(options: UsePusherOptions) {
  const { orgId } = useAuth();
  // Store latest callbacks in refs to avoid re-subscribing on every render
  const onVoyageUpdatedRef = useRef(options.onVoyageUpdated);
  const onCargoUpdatedRef = useRef(options.onCargoUpdated);
  onVoyageUpdatedRef.current = options.onVoyageUpdated;
  onCargoUpdatedRef.current = options.onCargoUpdated;

  useEffect(() => {
    if (!orgId) return;

    const pusher = getPusherClient();
    const channelName = `org-${orgId}`;
    let channel: Channel;

    // Reuse existing subscription or create new one
    const existing = pusher.channel(channelName);
    if (existing) {
      channel = existing;
    } else {
      channel = pusher.subscribe(channelName);
    }

    const handleVoyageUpdated = (data: VoyageUpdatedEvent) => {
      onVoyageUpdatedRef.current?.(data);
    };

    const handleCargoUpdated = (data: CargoUpdatedEvent) => {
      onCargoUpdatedRef.current?.(data);
    };

    channel.bind("voyage-updated", handleVoyageUpdated);
    channel.bind("cargo-updated", handleCargoUpdated);

    return () => {
      channel.unbind("voyage-updated", handleVoyageUpdated);
      channel.unbind("cargo-updated", handleCargoUpdated);
      // Don't unsubscribe the channel — other components may still be listening
    };
  }, [orgId]);
}
