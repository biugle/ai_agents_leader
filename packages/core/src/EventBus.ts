import EventEmitter3 from 'eventemitter3';
import type { AgentInfo, NotificationPayload } from '@aal/shared';
import type { SignalStatus } from '@aal/shared';

/**
 * Runtime-wide event bus.
 * Single source of truth for all state transitions and lifecycle events.
 */
export interface RuntimeEvents {
  'agent:discovered': (info: AgentInfo) => void;
  'agent:removed': (id: string) => void;
  'state:changed': (id: string, from: SignalStatus, to: SignalStatus, meta?: Record<string, unknown>) => void;
  'notification': (payload: NotificationPayload) => void;
}

export class RuntimeBus extends EventEmitter3<RuntimeEvents> {
  private static instance: RuntimeBus;

  static getInstance(): RuntimeBus {
    if (!RuntimeBus.instance) {
      RuntimeBus.instance = new RuntimeBus();
    }
    return RuntimeBus.instance;
  }
}

export const runtimeBus = RuntimeBus.getInstance();
