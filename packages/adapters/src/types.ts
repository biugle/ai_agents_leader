import type { SignalStatus } from '@aal/shared';

/**
 * Adapter interface — every AI agent adapter must implement this.
 */
export interface AgentAdapter {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly icon: string;

  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): SignalStatus;
  onStateChange(callback: (status: SignalStatus, meta?: Record<string, unknown>) => void): () => void;
}
