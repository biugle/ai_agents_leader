import { WebSocketServer, WebSocket } from 'ws';
import { RUNTIME_PORT_SCAN_COUNT, type WsClientMessage, type WsServerMessage } from '@aal/shared';
import { runtimeBus } from './EventBus.js';
import { runtimeStore } from './RuntimeStore.js';
import { writePortFile } from './portUtils.js';
import pino from 'pino';

const log = pino({ name: 'ws-server' });

/**
 * WebSocket server — bridges Runtime EventBus to Overlay clients.
 */
export class WsServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private port = 0;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  async start(preferredPort = 9988): Promise<number> {
    // Try ports in sequence, with retry on EADDRINUSE
    for (let port = preferredPort; port < preferredPort + RUNTIME_PORT_SCAN_COUNT; port++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const wss = new WebSocketServer({ port }, () => {
            this.wss = wss;
            this.port = port;
            resolve();
          });
          wss.on('error', reject);
        });
        break;
      } catch (err: any) {
        if (err?.code === 'EADDRINUSE') {
          log.debug(`Port ${port} in use, trying next...`);
          continue;
        }
        throw err;
      }
    }

    if (!this.wss) {
      throw new Error('No available port found');
    }

    log.info(`WS server listening on ws://localhost:${this.port}`);
    writePortFile(this.port);

    this.wss.on('error', (err) => {
      log.error(err, 'WS server error');
    });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      log.info(`Client connected (${this.clients.size} total)`);

      // Send current state on connect
      this.send(ws, {
        type: 'agent:list',
        payload: runtimeStore.getAll(),
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsClientMessage;
          this.handleClientMessage(ws, msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        log.info(`Client disconnected (${this.clients.size} total)`);
      });
    });

    this.setupEventForwarding();

    // Periodic full-state sync every 5s — ensures all clients stay current
    this.syncTimer = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast({
          type: 'agent:list',
          payload: runtimeStore.getAll(),
        });
      }
    }, 5000);

    return this.port;
  }

  stop(): void {
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }

  private handleClientMessage(ws: WebSocket, msg: WsClientMessage): void {
    switch (msg.type) {
      case 'nudge':
        log.info(`Nudge received for ${msg.payload.agentId}`);
        break;
      case 'request:state':
        this.send(ws, {
          type: 'agent:list',
          payload: runtimeStore.getAll(),
        });
        break;
    }
  }

  private setupEventForwarding(): void {
    runtimeBus.on('state:changed', (id, _from, to, meta) => {
      this.broadcast({
        type: 'state:update',
        payload: { id, status: to, meta, timestamp: Date.now() },
      });
    });

    runtimeBus.on('agent:discovered', (info) => {
      this.broadcast({ type: 'agent:added', payload: info });
    });

    runtimeBus.on('agent:removed', (id) => {
      this.broadcast({ type: 'agent:removed', payload: { id } });
    });

    runtimeBus.on('notification', (payload) => {
      this.broadcast({ type: 'notification', payload });
    });
  }

  private broadcast(msg: WsServerMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  private send(ws: WebSocket, msg: WsServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
