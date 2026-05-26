import type { AgentInfo, NotificationPayload } from './types.js';
import type { SignalStatus } from './states.js';

/**
 * WebSocket protocol between Runtime (Node.js) and Overlay (Tauri/React).
 *
 * All messages are JSON with a `type` discriminator.
 */

// ── Client → Server ──────────────────────────────────────────

export interface WsSubscribe {
  type: 'subscribe';
}

export interface WsUnsubscribe {
  type: 'unsubscribe';
}

export interface WsNudge {
  type: 'nudge';
  payload: { agentId: string };
}

export interface WsRequestState {
  type: 'request:state';
}

export type WsClientMessage =
  | WsSubscribe
  | WsUnsubscribe
  | WsNudge
  | WsRequestState;

// ── Server → Client ──────────────────────────────────────────

export interface WsStateUpdate {
  type: 'state:update';
  payload: {
    id: string;
    status: SignalStatus;
    meta?: Record<string, unknown>;
    timestamp: number;
  };
}

export interface WsAgentList {
  type: 'agent:list';
  payload: AgentInfo[];
}

export interface WsAgentAdded {
  type: 'agent:added';
  payload: AgentInfo;
}

export interface WsAgentRemoved {
  type: 'agent:removed';
  payload: { id: string };
}

export interface WsNotification {
  type: 'notification';
  payload: NotificationPayload;
}

export interface WsThemeChange {
  type: 'theme:change';
  payload: { themeId: string };
}

export type WsServerMessage =
  | WsStateUpdate
  | WsAgentList
  | WsAgentAdded
  | WsAgentRemoved
  | WsNotification
  | WsThemeChange;

export type WsMessage = WsClientMessage | WsServerMessage;
