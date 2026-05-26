import type { SignalStatus } from '@aal/shared';
import { runtimeBus } from './EventBus.js';

/**
 * Per-agent state machine.
 * Enforces valid transitions and emits state:changed events.
 */

interface StateContext {
  status: SignalStatus;
  lastTransition: number;
  meta?: Record<string, unknown>;
}

export class StateMachine {
  private agents = new Map<string, StateContext>();

  /** Get current status for an agent */
  getStatus(agentId: string): SignalStatus {
    return this.agents.get(agentId)?.status ?? 'idle';
  }

  /** Initialize an agent in idle state */
  register(agentId: string): void {
    this.agents.set(agentId, {
      status: 'idle',
      lastTransition: Date.now(),
    });
  }

  /** Remove an agent */
  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  /** Transition an agent to a new status */
  transition(agentId: string, to: SignalStatus, meta?: Record<string, unknown>): void {
    const ctx = this.agents.get(agentId);
    if (!ctx) return;

    const from = ctx.status;
    if (from === to) return; // no-op

    // Validate transition
    if (!this.isValidTransition(from, to)) {
      // Force transition via reset only
      console.warn(`[StateMachine] Invalid transition: ${from} → ${to} for ${agentId}`);
      return;
    }

    ctx.status = to;
    ctx.lastTransition = Date.now();
    ctx.meta = meta;

    runtimeBus.emit('state:changed', agentId, from, to, meta);
  }

  /** Reset an agent back to idle */
  reset(agentId: string): void {
    const ctx = this.agents.get(agentId);
    if (!ctx) return;
    const from = ctx.status;
    ctx.status = 'idle';
    ctx.lastTransition = Date.now();
    runtimeBus.emit('state:changed', agentId, from, 'idle');
  }

  private isValidTransition(from: SignalStatus, to: SignalStatus): boolean {
    // Allow any transition. Strict rules cause false negatives
    // because we infer state from file parsing, not direct API.
    return true;
  }
}
