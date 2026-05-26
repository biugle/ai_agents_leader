import { create } from 'zustand';
import type { AgentInfo } from '@aal/shared';
import { statusToGroup } from '@aal/shared';

interface AgentStore {
  agents: Map<string, AgentInfo>;
  connected: boolean;

  setAgents: (agents: AgentInfo[]) => void;
  addAgent: (agent: AgentInfo) => void;
  removeAgent: (id: string) => void;
  updateState: (id: string, status: AgentInfo['status'], meta?: Record<string, unknown>) => void;
  setConnected: (connected: boolean) => void;
  getAgentList: () => AgentInfo[];
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: new Map(),
  connected: false,

  setAgents: (agents) =>
    set((state) => {
      const map = new Map<string, AgentInfo>();
      for (const agent of agents) {
        map.set(agent.id, agent);
      }
      return { agents: map };
    }),

  addAgent: (agent) =>
    set((state) => {
      const map = new Map(state.agents);
      map.set(agent.id, agent);
      return { agents: map };
    }),

  removeAgent: (id) =>
    set((state) => {
      const map = new Map(state.agents);
      map.delete(id);
      return { agents: map };
    }),

  updateState: (id, status, meta) =>
    set((state) => {
      const map = new Map(state.agents);
      const agent = map.get(id);
      if (agent) {
        map.set(id, {
          ...agent,
          status,
          stateGroup: statusToGroup(status),
          lastActive: Date.now(),
          meta: meta ? { ...agent.meta, ...meta } : agent.meta,
        });
      } else {
        // Agent not yet known (e.g. hook-discovered) — create on the fly
        map.set(id, {
          id,
          name: id,
          displayName: id,
          adapter: 'hook',
          status,
          stateGroup: statusToGroup(status),
          lastActive: Date.now(),
          meta,
        });
      }
      return { agents: map };
    }),

  setConnected: (connected) => set({ connected }),

  getAgentList: () => Array.from(get().agents.values()),
}));
