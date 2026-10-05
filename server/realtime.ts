/**
 * Server-Sent Events (SSE) Real-Time Synchronization Manager
 * 
 * Manages authenticated client connections, heartbeat keep-alives,
 * and broadcasts lightweight invalidation signals across connected devices.
 * 
 * Guarantees:
 * - Express session / Bearer token authentication required to connect
 * - Chit-level invalidation signals (no sensitive data in SSE payload)
 * - Multi-device support per user (phone + desktop concurrent sessions)
 * - Automatic cleanup of disconnected clients on socket close
 * - Periodic heartbeat keep-alives (every 25s) to prevent proxy timeouts
 * - In-memory client registry with zero external infrastructure dependencies
 */

import express from 'express';
import crypto from 'crypto';

export type RealtimeEntity = 
  | 'payment' 
  | 'monthly_due' 
  | 'member' 
  | 'lift' 
  | 'lift_payout' 
  | 'chit' 
  | 'rule';

export type RealtimeAction = 'created' | 'updated' | 'deleted';

export interface RealtimeEvent {
  type: 'data_changed' | 'connected' | 'ping';
  chitId?: string;
  entity?: RealtimeEntity;
  action?: RealtimeAction;
  timestamp?: string;
}

export interface ConnectedClient {
  id: string;
  userId: string;
  res: express.Response;
  ip?: string;
  userAgent?: string;
  connectedAt: Date;
}

export class RealtimeServer {
  private clients: Map<string, ConnectedClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Starts periodic keep-alive comments to keep persistent SSE streams alive
   * across HTTP/1.1 and HTTP/2 proxies (e.g., Cloud Run, Render, Nginx).
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 25000);

    if (this.heartbeatInterval && typeof this.heartbeatInterval.unref === 'function') {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Sends an SSE comment heartbeat to all connected clients
   */
  public sendHeartbeat() {
    if (this.isDestroyed || this.clients.size === 0) return;
    const deadClientIds: string[] = [];

    for (const [clientId, client] of this.clients.entries()) {
      try {
        // SSE comment syntax: lines starting with colon are ignored by clients but keep connection alive
        client.res.write(': keep-alive\n\n');
        if (typeof (client.res as any).flush === 'function') {
          (client.res as any).flush();
        }
      } catch (err) {
        deadClientIds.push(clientId);
      }
    }

    for (const id of deadClientIds) {
      this.removeClient(id);
    }
  }

  /**
   * Registers a new authenticated SSE client connection
   */
  public addClient(
    userId: string, 
    res: express.Response, 
    meta?: { ip?: string; userAgent?: string }
  ): string {
    const clientId = crypto.randomUUID();

    const client: ConnectedClient = {
      id: clientId,
      userId,
      res,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);

    // Send initial connection acknowledgement event
    const ackPayload: RealtimeEvent = {
      type: 'connected',
      timestamp: new Date().toISOString(),
    };

    try {
      res.write(`data: ${JSON.stringify(ackPayload)}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch (err) {
      this.clients.delete(clientId);
      throw err;
    }

    return clientId;
  }

  /**
   * Removes a client connection on socket close
   */
  public removeClient(clientId: string): boolean {
    return this.clients.delete(clientId);
  }

  /**
   * Broadcasts an invalidation event to connected clients.
   * If targetUserId is provided, restricts delivery to that user's devices.
   * Otherwise broadcasts to all authenticated clients.
   */
  public broadcast(event: RealtimeEvent, targetUserId?: string): number {
    if (this.isDestroyed || this.clients.size === 0) return 0;

    const payload: RealtimeEvent = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    const sseMessage = `data: ${JSON.stringify(payload)}\n\n`;
    const deadClientIds: string[] = [];
    let deliveredCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      if (targetUserId && client.userId !== targetUserId) {
        continue;
      }

      try {
        client.res.write(sseMessage);
        if (typeof (client.res as any).flush === 'function') {
          (client.res as any).flush();
        }
        deliveredCount++;
      } catch (err) {
        deadClientIds.push(clientId);
      }
    }

    for (const id of deadClientIds) {
      this.removeClient(id);
    }

    return deliveredCount;
  }

  /**
   * Returns current active client count
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Returns client count for a specific user ID
   */
  public getUserClientCount(userId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.userId === userId) count++;
    }
    return count;
  }

  /**
   * Graceful cleanup for testing or server shutdown
   */
  public destroy() {
    this.isDestroyed = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {}
    }
    this.clients.clear();
  }
}

export const realtimeManager = new RealtimeServer();
