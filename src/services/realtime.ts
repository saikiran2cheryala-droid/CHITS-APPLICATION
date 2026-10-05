/**
 * Frontend Server-Sent Events (SSE) Client Service
 * 
 * Establishes a lightweight, authenticated persistent stream to /api/events.
 * Receives real-time invalidation events when mutations occur on other devices
 * (phone, desktop, tablet) and dispatches them to active subscribers.
 * 
 * Security & Design:
 * - Zero database credentials or Supabase keys in client bundle
 * - Authenticated via HTTP-only cookie + Bearer token query parameter
 * - Native EventSource auto-reconnection on network drop
 * - Clean teardown on user logout or window unload
 */

import { RealtimeEntity, RealtimeAction, RealtimeEvent } from './realtimeTypes';

export type { RealtimeEntity, RealtimeAction, RealtimeEvent };

type EventCallback = (event: RealtimeEvent) => void;

class RealtimeClientService {
  private eventSource: EventSource | null = null;
  private listeners: Set<EventCallback> = new Set();
  private isConnecting = false;
  private shouldBeConnected = false;

  /**
   * Initializes or re-establishes the SSE stream to /api/events
   * Authenticates strictly via existing HTTP-only session cookies.
   * Never exposes session tokens or secrets in URLs.
   */
  public connect() {
    this.shouldBeConnected = true;

    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    // Already open or connecting
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const sseUrl = `${baseUrl}/api/events`;

      // Native EventSource automatically sends HTTP-only session cookies with credentials: true
      const es = new EventSource(sseUrl, { withCredentials: true });
      this.eventSource = es;

      es.onopen = () => {
        this.isConnecting = false;
      };

      es.onmessage = (event) => {
        if (!event.data) return;
        try {
          const parsed = JSON.parse(event.data) as RealtimeEvent;
          this.notifyListeners(parsed);
        } catch (err) {
          // Ignore invalid JSON heartbeat comments
        }
      };

      es.onerror = () => {
        this.isConnecting = false;
        // EventSource will automatically attempt reconnection according to SSE protocol
      };
    } catch (err) {
      this.isConnecting = false;
    }
  }

  /**
   * Disconnects the stream and cleans up resources (e.g. on logout)
   */
  public disconnect() {
    this.shouldBeConnected = false;
    this.isConnecting = false;
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }
  }

  /**
   * Subscribes to real-time events. Returns an unsubscribe cleanup callback.
   */
  public subscribe(callback: EventCallback): () => void {
    this.listeners.add(callback);
    if (this.shouldBeConnected && (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED)) {
      this.connect();
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Dispatches incoming event to all registered listeners
   */
  private notifyListeners(event: RealtimeEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[RealtimeClient] Error in listener callback:', err);
      }
    }
  }

  /**
   * Returns whether the SSE stream is currently connected
   */
  public isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

export const realtimeService = new RealtimeClientService();
