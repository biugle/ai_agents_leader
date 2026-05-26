import type { SignalStatus } from '@aal/shared';
import type { AgentAdapter } from './types.js';

/**
 * Base adapter with common functionality.
 * Extend this to build concrete adapters.
 */
export abstract class BaseAdapter implements AgentAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly icon: string;

  protected status: SignalStatus = 'idle';
  protected listeners: Array<(status: SignalStatus, meta?: Record<string, unknown>) => void> = [];
  protected stalledTimer: ReturnType<typeof setTimeout> | null = null;
  protected stalledTimeoutMs = 60_000; // 60s of no activity → stalled

  // Time tracking
  protected sessionStart = 0;   // When session first became active
  protected activityStart = 0;  // When current activity (thinking/running) started
  protected lastActive = 0;     // Last time any activity happened

  async start(): Promise<void> {
    this.sessionStart = Date.now();
    this.lastActive = Date.now();
    this.resetStalledTimer();
  }

  async stop(): Promise<void> {
    this.clearStalledTimer();
    this.status = 'idle';
  }

  getStatus(): SignalStatus {
    return this.status;
  }

  onStateChange(callback: (status: SignalStatus, meta?: Record<string, unknown>) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /** Emit a state change to all listeners */
  protected emit(status: SignalStatus, meta?: Record<string, unknown>): void {
    if (this.status === status) return;

    const now = Date.now();
    this.lastActive = now;

    // Track activity start time for active states
    if (status === 'thinking' || status === 'running' || status === 'waiting_input') {
      if (this.status !== 'thinking' && this.status !== 'running' && this.status !== 'waiting_input') {
        this.activityStart = now;
      }
    }

    this.status = status;

    // Inject time info into meta
    const enrichedMeta = {
      ...meta,
      activityStart: this.activityStart,
      sessionStart: this.sessionStart,
      lastActive: this.lastActive,
    };

    for (const listener of this.listeners) {
      listener(status, enrichedMeta);
    }

    // Reset stalled timer on any activity
    if (status === 'thinking' || status === 'running') {
      this.resetStalledTimer();
    } else {
      this.clearStalledTimer();
    }
  }

  /** Reset the stalled detection timer */
  protected resetStalledTimer(): void {
    this.clearStalledTimer();
    this.stalledTimer = setTimeout(() => {
      if (this.status === 'thinking' || this.status === 'running') {
        this.emit('stalled');
      }
    }, this.stalledTimeoutMs);
  }

  protected clearStalledTimer(): void {
    if (this.stalledTimer) {
      clearTimeout(this.stalledTimer);
      this.stalledTimer = null;
    }
  }
}
