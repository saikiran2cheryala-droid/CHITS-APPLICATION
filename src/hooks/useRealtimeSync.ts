/**
 * Real-Time Multi-Device Synchronization Hook
 * 
 * Subscribes to Server-Sent Events (SSE) invalidation signals and triggers
 * debounced background data refreshes when changes occur on any connected device.
 * 
 * Features:
 * - Scoped to the currently active Chit (ignores events from unrelated chits)
 * - Auto-debounces multiple rapid events (e.g. payment + due updates) into 1 refresh
 * - Automatically connects when user logs in and disconnects on logout
 * - Triggers background re-fetch without full-page loading screens
 */

import { useEffect, useRef } from 'react';
import { realtimeService, RealtimeEvent } from '../services/realtime';

interface UseRealtimeSyncOptions {
  triggerRefresh: () => void;
  activeChitId: string | null;
  isLoggedIn: boolean;
  debounceMs?: number;
}

export function useRealtimeSync({
  triggerRefresh,
  activeChitId,
  isLoggedIn,
  debounceMs = 250,
}: UseRealtimeSyncOptions) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRefreshRef = useRef(triggerRefresh);
  triggerRefreshRef.current = triggerRefresh;

  const activeChitIdRef = useRef(activeChitId);
  activeChitIdRef.current = activeChitId;

  // Manage connection lifecycle based on authentication status
  useEffect(() => {
    if (isLoggedIn) {
      realtimeService.connect();
    } else {
      realtimeService.disconnect();
    }

    return () => {
      // Keep connection during component re-renders unless logging out
    };
  }, [isLoggedIn]);

  // Subscribe to real-time invalidation events
  useEffect(() => {
    if (!isLoggedIn) return;

    const handleEvent = (event: RealtimeEvent) => {
      // Only process data_changed invalidation signals
      if (event.type !== 'data_changed') return;

      const currentActiveChitId = activeChitIdRef.current;

      // Chit-Level Filtering:
      // 1. If currently inside a specific Chit (activeChitId is set),
      //    only refresh if the event matches this Chit or is global.
      // 2. If on Dashboard (activeChitId === null), refresh when any chit/payment changes.
      if (currentActiveChitId !== null) {
        if (event.chitId && event.chitId !== currentActiveChitId) {
          // Event belongs to a different Chit -> ignore cleanly
          return;
        }
      }

      // Debounce rapid events (e.g. payment creation triggers both payment and monthly_due updates)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        triggerRefreshRef.current();
        debounceTimerRef.current = null;
      }, debounceMs);
    };

    const unsubscribe = realtimeService.subscribe(handleEvent);

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isLoggedIn, debounceMs]);
}
