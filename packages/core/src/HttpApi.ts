/**
 * HTTP API for receiving state updates from agent hooks/plugins.
 *
 * Protocol:
 *   POST /api/state  — update agent state
 *   GET  /api/agents — list all agents
 *   GET  /api/health — health check
 *
 * Cross-platform, agent-agnostic. Any agent that can send HTTP
 * requests can report its state.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { stateMachine } from './stateMachineInstance.js';
import { runtimeBus } from './EventBus.js';
import { runtimeStore } from './RuntimeStore.js';
import type { AdapterManager } from './AdapterManager.js';
import type { SignalStatus, AgentInfo } from '@aal/shared';
import { statusToGroup } from '@aal/shared';
import pino from 'pino';

const log = pino({ name: 'http-api' });

interface StateUpdate {
  agentId: string;
  agentName?: string;
  status: SignalStatus;
  meta?: Record<string, unknown>;
}

export class HttpApi {
  private server: ReturnType<typeof createServer> | null = null;
  private adapterManager: AdapterManager | null = null;

  setAdapterManager(manager: AdapterManager): void {
    this.adapterManager = manager;
  }

  async start(port: number): Promise<number> {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      this.server!.listen(port, '127.0.0.1', () => {
        log.info(`HTTP API listening on http://127.0.0.1:${port}`);
        resolve(port);
      });
      this.server!.on('error', reject);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://localhost`);

    try {
      if (req.method === 'POST' && url.pathname === '/api/state') {
        await this.handleStateUpdate(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/agents') {
        this.handleAgentList(res);
      } else if (req.method === 'GET' && url.pathname === '/api/health') {
        this.handleHealth(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      log.error(err, 'Request error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private async handleStateUpdate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const update = JSON.parse(body) as StateUpdate;

    if (!update.agentId || !update.status) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing agentId or status' }));
      return;
    }

    // Validate status
    const validStatuses: SignalStatus[] = [
      'idle', 'thinking', 'running', 'completed', 'error', 'waiting_input', 'stalled',
    ];
    if (!validStatuses.includes(update.status)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Invalid status: ${update.status}` }));
      return;
    }

    // Auto-register agent if not known
    if (!runtimeStore.get(update.agentId)) {
      const agentInfo: AgentInfo = {
        id: update.agentId,
        name: update.agentName ?? update.agentId,
        displayName: update.agentName ?? update.agentId,
        adapter: 'hook',
        status: update.status,
        stateGroup: statusToGroup(update.status),
        lastActive: Date.now(),
        meta: update.meta,
      };
      stateMachine.register(update.agentId);
      runtimeBus.emit('agent:discovered', agentInfo);
      log.info(`Auto-registered agent: ${update.agentId}`);
    }

    // Route through adapter if it supports hook reporting (single source of truth)
    const adapter = this.adapterManager?.getAdapter(update.agentId);
    if (adapter && adapter.reportHookState) {
      adapter.reportHookState(update.status, update.meta);
    } else {
      // No adapter (e.g. third-party HTTP push) — go directly to state machine
      stateMachine.transition(update.agentId, update.status, update.meta);
    }

    log.info(`State update: ${update.agentId} → ${update.status}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  private handleAgentList(res: ServerResponse): void {
    const agents = runtimeStore.getAll();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents }));
  }

  private handleHealth(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }
}
