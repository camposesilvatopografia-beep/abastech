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

/**
 * Hook for real-time synchronization across all clients (desktop + mobile)
 * Uses Supabase Realtime Broadcast AND Postgres Changes for redundancy
 */
export function useRealtimeSync(options?: {
  onSyncEvent?: (event: SyncEvent) => void;
  autoRefetch?: () => void;
}) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const dbChannelRef = useRef<RealtimeChannel | null>(null);
  const onSyncEventRef = useRef(options?.onSyncEvent);
  const autoRefetchRef = useRef(options?.autoRefetch);
  
  // Keep refs updated
  useEffect(() => {
    onSyncEventRef.current = options?.onSyncEvent;
    autoRefetchRef.current = options?.autoRefetch;
  }, [options?.onSyncEvent, options?.autoRefetch]);

  // Subscribe to broadcast channel
  useEffect(() => {
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
        
        // Call custom handler if provided
        if (onSyncEventRef.current) {
          onSyncEventRef.current(syncEvent);
        }
        
        // Auto-refetch if configured
        if (autoRefetchRef.current) {
          autoRefetchRef.current();
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[RealtimeSync] Connected to broadcast channel');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // Also subscribe to database changes as backup (more reliable)
  useEffect(() => {
    const dbChannel = supabase
      .channel('db-fuel-records')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'field_fuel_records',
        },
        (payload) => {
          console.log('[RealtimeSync] DB change detected:', payload.eventType);
          
          const eventType = payload.eventType === 'INSERT' 
            ? 'fuel_record_created' 
            : payload.eventType === 'UPDATE'
            ? 'fuel_record_updated'
            : 'fuel_record_deleted';
          
          const syncEvent: SyncEvent = {
            type: eventType,
            payload: payload.new || payload.old,
            source: 'database',
            timestamp: Date.now(),
          };
          
          if (onSyncEventRef.current) {
            onSyncEventRef.current(syncEvent);
          }
          
          if (autoRefetchRef.current) {
            autoRefetchRef.current();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[RealtimeSync] Connected to DB changes channel');
        }
      });

    dbChannelRef.current = dbChannel;

    return () => {
      if (dbChannelRef.current) {
        supabase.removeChannel(dbChannelRef.current);
        dbChannelRef.current = null;
      }
    };
  }, []);

  // Broadcast sync event to all clients
  const broadcast = useCallback(async (type: SyncEventType, payload?: any) => {
    if (!channelRef.current) {
      console.warn('[RealtimeSync] Channel not ready, will retry...');
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!channelRef.current) {
        console.error('[RealtimeSync] Channel still not ready after retry');
        return;
      }
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

  return {
    broadcast,
    sessionId,
  };
}

/**
 * Helper hook for components that just need to listen and refetch
 */
export function useRealtimeRefresh(refetchFn: () => void, eventTypes?: SyncEventType[]) {
  const handleSyncEvent = useCallback((event: SyncEvent) => {
    // If specific event types are specified, filter
    if (eventTypes && !eventTypes.includes(event.type)) {
      return;
    }
    
    // Debounce rapid updates
    refetchFn();
  }, [refetchFn, eventTypes]);

  useRealtimeSync({
    onSyncEvent: handleSyncEvent,
  });
}
