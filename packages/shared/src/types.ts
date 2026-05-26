import type { SignalStatus, StateGroup } from './states.js';

/** Info about a discovered agent */
export interface AgentInfo {
  id: string;
  name: string;
  displayName: string;
  adapter: string;
  status: SignalStatus;
  stateGroup: StateGroup;
  lastActive: number; // timestamp ms
  meta?: Record<string, unknown>;
}

/** Adapter interface — every adapter must implement this */
export interface AgentAdapter {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly icon: string;

  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): SignalStatus;
  onStateChange(callback: (status: SignalStatus, meta?: Record<string, unknown>) => void): () => void;
  /** Report a state update from a hook (optional, for adapters that support hooks) */
  reportHookState?(status: SignalStatus, meta?: Record<string, unknown>): void;
}

/** Notification types */
export type NotificationType = 'completed' | 'error' | 'waiting_input' | 'stalled';

export interface NotificationPayload {
  agentId: string;
  agentName: string;
  type: NotificationType;
  message: string;
  timestamp: number;
}
