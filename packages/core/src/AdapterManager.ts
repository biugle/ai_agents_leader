import type { AgentAdapter, AgentInfo } from '@aal/shared';
import { statusToGroup } from '@aal/shared';
import { runtimeBus } from './EventBus.js';
import { stateMachine } from './stateMachineInstance.js';

/**
 * Manages adapter lifecycle.
 * Loads, starts, stops, and routes events from adapters.
 */
export class AdapterManager {
  private adapters = new Map<string, AgentAdapter>();
  private unsubs = new Map<string, () => void>();

  /** Register and start an adapter */
  async register(adapter: AgentAdapter): Promise<void> {
    this.adapters.set(adapter.id, adapter);

    // Register in state machine
    stateMachine.register(adapter.id);

    // Subscribe to adapter state changes
    const unsub = adapter.onStateChange((status, meta) => {
      stateMachine.transition(adapter.id, status, meta);
    });
    this.unsubs.set(adapter.id, unsub);

    // Emit discovered event
    const info: AgentInfo = {
      id: adapter.id,
      name: adapter.name,
      displayName: adapter.displayName,
      adapter: adapter.name,
      status: adapter.getStatus(),
      stateGroup: statusToGroup(adapter.getStatus()),
      lastActive: Date.now(),
    };
    runtimeBus.emit('agent:discovered', info);

    // Start the adapter
    await adapter.start();
  }

  /** Stop and unregister an adapter */
  async unregister(id: string): Promise<void> {
    const adapter = this.adapters.get(id);
    if (!adapter) return;

    await adapter.stop();
    this.unsubs.get(id)?.();
    this.unsubs.delete(id);
    this.adapters.delete(id);
    stateMachine.unregister(id);
    runtimeBus.emit('agent:removed', id);
  }

  /** Stop all adapters */
  async stopAll(): Promise<void> {
    const ids = Array.from(this.adapters.keys());
    await Promise.all(ids.map((id) => this.unregister(id)));
  }

  getAdapter(id: string): AgentAdapter | undefined {
    return this.adapters.get(id);
  }

  getAll(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Notify an adapter that a hook just sent a state update for it. */
  notifyHookUpdate(id: string): void {
    const adapter = this.adapters.get(id);
    if (adapter && adapter.reportHookState) {
      // Legacy path — prefer HttpApi calling reportHookState directly
    }
  }
}
