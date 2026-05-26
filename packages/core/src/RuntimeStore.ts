import type { AgentInfo } from '@aal/shared';
import { statusToGroup } from '@aal/shared';
import { runtimeBus } from './EventBus.js';

/**
 * In-memory store of all discovered agents and their current state.
 * Listens to EventBus and keeps itself in sync.
 */
class Store {
  private agents = new Map<string, AgentInfo>();

  constructor() {
    runtimeBus.on('agent:discovered', (info) => {
      this.agents.set(info.id, info);
    });

    runtimeBus.on('agent:removed', (id) => {
      this.agents.delete(id);
    });

    runtimeBus.on('state:changed', (id, _from, to, meta) => {
      const agent = this.agents.get(id);
      if (agent) {
        agent.status = to;
        agent.stateGroup = statusToGroup(to);
        agent.lastActive = Date.now();
        if (meta) {
          agent.meta = { ...agent.meta, ...meta };
        }
      }
    });
  }

  getAll(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  get(id: string): AgentInfo | undefined {
    return this.agents.get(id);
  }
}

export const runtimeStore = new Store();
