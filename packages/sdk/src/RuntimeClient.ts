import type { SignalStatus, WsMessage, WsServerMessage } from '@aal/shared';

/**
 * Client SDK for 3rd party integrations.
 * Allows custom AI runtimes to report their status.
 */
export class RuntimeClient {
  private ws: WebSocket | null = null;
  private url: string;

  constructor(port = 9988) {
    this.url = `ws://localhost:${port}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** Report a state change for your agent */
  emit(status: SignalStatus, meta?: Record<string, unknown>): void {
    this.send({
      type: 'state:update',
      payload: { id: 'custom', status, meta, timestamp: Date.now() },
    });
  }

  /** Subscribe to state updates from the runtime */
  onMessage(callback: (msg: WsServerMessage) => void): () => void {
    if (!this.ws) return () => {};
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsServerMessage;
        callback(msg);
      } catch {
        // ignore
      }
    };
    this.ws.addEventListener('message', handler as EventListener);
    return () => this.ws?.removeEventListener('message', handler as EventListener);
  }

  private send(msg: WsMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
