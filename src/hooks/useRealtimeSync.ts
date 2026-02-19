import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

// Channel name for sync broadcasts
const SYNC_CHANNEL = 'system-sync';

type SyncEventType = 
  | 'fuel_record_created'
  | 'fuel_record_updated'
  | 'fuel_record_deleted'
  | 'stock_updated'
  | 'service_order_updated'
  | 'horimeter_updated'
  | 'manual_refresh';

interface SyncEvent {
  type: SyncEventType;
  payload?: any;
  source: string; // identifier of who sent (tab/device)
  timestamp: number;
}

// Unique ID for this browser tab/session
const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Reconnection config
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL_MS = 25000; // keep-alive ping every 25s

/**
 * Hook for real-time synchronization across all clients (desktop + mobile)
 * Uses Supabase Realtime Broadcast AND Postgres Changes for redundancy.
 * Includes automatic reconnection on drop.
 */
export function useRealtimeSync(options?: {
  onSyncEvent?: (event: SyncEvent) => void;
  autoRefetch?: () => void;
}) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const dbChannelRef = useRef<RealtimeChannel | null>(null);
  const onSyncEventRef = useRef(options?.onSyncEvent);
  const autoRefetchRef = useRef(options?.autoRefetch);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // Keep refs updated without causing re-subscriptions
  useEffect(() => {
    onSyncEventRef.current = options?.onSyncEvent;
    autoRefetchRef.current = options?.autoRefetch;
  }, [options?.onSyncEvent, options?.autoRefetch]);

  const dispatchSyncEvent = useCallback((syncEvent: SyncEvent) => {
    if (onSyncEventRef.current) {
      onSyncEventRef.current(syncEvent);
    }
    if (autoRefetchRef.current) {
      autoRefetchRef.current();
    }
  }, []);

  // Subscribe to broadcast channel with auto-reconnect
  const subscribeBroadcast = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clean up existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(SYNC_CHANNEL, {
      config: {
        broadcast: { self: false }, // Don't receive own broadcasts
      },
    });

    channel
      .on('broadcast', { event: 'sync' }, ({ payload }) => {
        const syncEvent = payload as SyncEvent;
        // Skip if from same session
        if (syncEvent.source === sessionId) return;
        console.log('[RealtimeSync] Received broadcast event:', syncEvent.type);
        dispatchSyncEvent(syncEvent);
      })
      .subscribe((status) => {
        if (!isMountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          console.log('[RealtimeSync] Broadcast channel connected ✅');
          reconnectAttemptsRef.current = 0;
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`[RealtimeSync] Broadcast channel ${status} — will reconnect...`);
          scheduleReconnect();
        }
      });

    channelRef.current = channel;

    // Heartbeat to keep connection alive (avoids idle timeouts)
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      if (!isMountedRef.current || !channelRef.current) return;
      // Supabase channels stay alive if subscribed; just log to detect silence
      console.debug('[RealtimeSync] ♥ heartbeat');
    }, HEARTBEAT_INTERVAL_MS);
  }, [dispatchSyncEvent]);

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[RealtimeSync] Max reconnect attempts reached');
      return;
    }
    const delay = RECONNECT_DELAY_MS * Math.min(reconnectAttemptsRef.current + 1, 5);
    reconnectAttemptsRef.current += 1;
    console.log(`[RealtimeSync] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})...`);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      subscribeBroadcast();
    }, delay);
  }, [subscribeBroadcast]);

  // Initial broadcast channel subscription
  useEffect(() => {
    isMountedRef.current = true;
    subscribeBroadcast();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [subscribeBroadcast]);

  // Reconnect when window regains focus/visibility (mobile PWA wake-up)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[RealtimeSync] App visible again — checking connection...');
        // Re-subscribe to ensure connection is alive after sleep
        reconnectAttemptsRef.current = 0;
        subscribeBroadcast();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [subscribeBroadcast]);

  // DB changes channel — also subscribe to field_fuel_records and service_orders
  useEffect(() => {
    const dbChannel = supabase
      .channel('db-changes-global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'field_fuel_records' },
        (payload) => {
          console.log('[RealtimeSync] DB field_fuel_records change:', payload.eventType);
          const eventType = payload.eventType === 'INSERT'
            ? 'fuel_record_created'
            : payload.eventType === 'UPDATE'
            ? 'fuel_record_updated'
            : 'fuel_record_deleted';

          dispatchSyncEvent({
            type: eventType,
            payload: payload.new || payload.old,
            source: 'database',
            timestamp: Date.now(),
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_orders' },
        (payload) => {
          console.log('[RealtimeSync] DB service_orders change:', payload.eventType);
          dispatchSyncEvent({
            type: 'service_order_updated',
            payload: payload.new || payload.old,
            source: 'database',
            timestamp: Date.now(),
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'horimeter_readings' },
        (payload) => {
          console.log('[RealtimeSync] DB horimeter_readings change:', payload.eventType);
          dispatchSyncEvent({
            type: 'horimeter_updated',
            payload: payload.new || payload.old,
            source: 'database',
            timestamp: Date.now(),
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[RealtimeSync] DB changes channel connected ✅');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('[RealtimeSync] DB changes channel dropped:', status);
        }
      });

    dbChannelRef.current = dbChannel;

    return () => {
      if (dbChannelRef.current) {
        supabase.removeChannel(dbChannelRef.current);
        dbChannelRef.current = null;
      }
    };
  }, [dispatchSyncEvent]);

  // Broadcast sync event to all clients
  const broadcast = useCallback(async (type: SyncEventType, payload?: any) => {
    // Retry up to 3 times if channel not ready
    let attempts = 0;
    while (!channelRef.current && attempts < 3) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    if (!channelRef.current) {
      console.error('[RealtimeSync] Cannot broadcast — channel not available');
      return;
    }

    const event: SyncEvent = {
      type,
      payload,
      source: sessionId,
      timestamp: Date.now(),
    };

    try {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'sync',
        payload: event,
      });
      console.log('[RealtimeSync] Broadcast sent:', type);
    } catch (error) {
      console.error('[RealtimeSync] Broadcast failed:', error);
    }
  }, []);

  return { broadcast, sessionId };
}

/**
 * Helper hook for components that just need to listen and refetch
 */
export function useRealtimeRefresh(refetchFn: () => void, eventTypes?: SyncEventType[]) {
  const handleSyncEvent = useCallback((event: SyncEvent) => {
    if (eventTypes && !eventTypes.includes(event.type)) return;
    refetchFn();
  }, [refetchFn, eventTypes]);

  useRealtimeSync({ onSyncEvent: handleSyncEvent });
}
