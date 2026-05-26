import { useEffect, useRef, useCallback } from 'react';
import { DISCOVERABLE_HTTP_PORTS, DISCOVERABLE_WS_PORTS, type WsServerMessage } from '@aal/shared';
import { useAgentStore } from '../stores/agentStore';

/**
 * WebSocket hook — connects to the runtime daemon.
 * Auto-discovers port and auto-reconnects on disconnect.
 */
export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveredPortRef = useRef<number | null>(null);
  const { setAgents, addAgent, removeAgent, updateState, setConnected } = useAgentStore();

  const tryConnect = useCallback((port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let settled = false;

      const finish = (connected: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(connected);
      };

      const timeout = setTimeout(() => {
        ws.close();
        finish(false);
      }, 1000);

      ws.onopen = () => {
        discoveredPortRef.current = port;
        wsRef.current = ws;
        setConnected(true);
        ws.send(JSON.stringify({ type: 'request:state' }));
        setupHandlers(ws);
        finish(true);
      };

      ws.onerror = () => {
        finish(false);
      };

      ws.onclose = () => {
        finish(false);
      };
    });
  }, []);

  const discoverAndConnect = useCallback(async () => {
    // If we have a known port, try that first
    if (discoveredPortRef.current) {
      const ok = await tryConnect(discoveredPortRef.current);
      if (ok) return;
    }

    // Scan ports to find the runtime
    for (const port of DISCOVERABLE_WS_PORTS) {
      const ok = await tryConnect(port);
      if (ok) return;
    }

    // Not found — retry after 3s
    setConnected(false);
    reconnectTimer.current = setTimeout(discoverAndConnect, 3000);
  }, [tryConnect]);

  const setupHandlers = useCallback((ws: WebSocket) => {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsServerMessage;
        handleMessage(msg);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      discoveredPortRef.current = null;
      // Auto-reconnect after 2s
      reconnectTimer.current = setTimeout(discoverAndConnect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    discoverAndConnect();

    // Client-side polling as backup — fetch from HTTP API every 10s
    const pollTimer = setInterval(async () => {
      for (const port of DISCOVERABLE_HTTP_PORTS) {
        try {
          const res = await fetch(`http://localhost:${port}/api/agents`);
          if (res.ok) {
            const data = await res.json();
            if (data.agents) setAgents(data.agents);
            break;
          }
        } catch {}
      }
    }, 10_000);

    return () => {
      clearInterval(pollTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [discoverAndConnect]);

  const sendNudge = useCallback((agentId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'nudge', payload: { agentId } }));
  }, []);

  return { sendNudge };

  function handleMessage(msg: WsServerMessage) {
    switch (msg.type) {
      case 'agent:list':
        setAgents(msg.payload);
        break;
      case 'agent:added':
        addAgent(msg.payload);
        break;
      case 'agent:removed':
        removeAgent(msg.payload.id);
        break;
      case 'state:update':
        updateState(msg.payload.id, msg.payload.status, msg.payload.meta);
        break;
      case 'notification':
        console.log('[Notification]', msg.payload.message);
        break;
    }
  }
}
