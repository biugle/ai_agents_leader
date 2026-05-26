export { runtimeBus, RuntimeBus } from './EventBus.js';
export type { RuntimeEvents } from './EventBus.js';
export { StateMachine } from './StateMachine.js';
export { stateMachine } from './stateMachineInstance.js';
export { runtimeStore } from './RuntimeStore.js';
export { AdapterManager } from './AdapterManager.js';
export { WsServer } from './WsServer.js';
export { HttpApi } from './HttpApi.js';
export { notificationEngine } from './NotificationEngine.js';

import { AdapterManager } from './AdapterManager.js';
import { WsServer } from './WsServer.js';
import { HttpApi } from './HttpApi.js';
import { notificationEngine } from './NotificationEngine.js';
import pino from 'pino';

const log = pino({ name: 'aal-core' });

/**
 * Main entry — starts the runtime daemon.
 */
export async function startRuntime(port = 9988) {
  log.info('Starting AI Agents Leader runtime...');

  // Ensure notification engine is initialized (it's a singleton)
  void notificationEngine;

  const adapterManager = new AdapterManager();
  const wsServer = new WsServer();
  const httpApi = new HttpApi();
  httpApi.setAdapterManager(adapterManager);

  const wsPort = await wsServer.start(port);
  // HTTP API follows the actual WS port, not the preferred base port.
  const httpPort = await httpApi.start(wsPort + 1);
  log.info(`Runtime ready. WS on ws://localhost:${wsPort}, API on http://127.0.0.1:${httpPort}`);

  return {
    adapterManager,
    wsServer,
    httpApi,
    port: wsPort,
    apiPort: httpPort,
    async shutdown() {
      log.info('Shutting down runtime...');
      await adapterManager.stopAll();
      httpApi.stop();
      wsServer.stop();
    },
  };
}
