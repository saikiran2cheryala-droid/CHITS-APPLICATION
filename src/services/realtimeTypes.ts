/**
 * Realtime Event Types for Chit Manager
 */

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
