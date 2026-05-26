import { BaseAdapter } from '../BaseAdapter.js';

/**
 * Generic HTTP adapter — for any third-party agent that pushes state via HTTP.
 *
 * Usage:
 *   POST http://localhost:9989/api/state
 *   {
 *     "agentId": "my-custom-agent",
 *     "agentName": "My Agent",
 *     "status": "running",
 *     "meta": { "source": "custom" }
 *   }
 *
 * This adapter is created automatically by the HttpApi when an unknown
 * agentId sends a state update. No manual registration needed.
 */
export class HttpAdapter extends BaseAdapter {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly icon: string;

  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
    this.displayName = name;
    this.icon = '🌐';
  }

  async start(): Promise<void> {
    await super.start();
    // No polling needed — state is pushed via HTTP API
  }

  async stop(): Promise<void> {
    await super.stop();
  }
}
