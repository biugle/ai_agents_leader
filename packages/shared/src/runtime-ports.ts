export const DEFAULT_WS_PORT = 9988;
export const DEFAULT_HTTP_PORT = DEFAULT_WS_PORT + 1;
export const DEFAULT_OVERLAY_PORT = 1666;
export const RUNTIME_PORT_SCAN_COUNT = 5;

export const DISCOVERABLE_WS_PORTS = Array.from(
  { length: RUNTIME_PORT_SCAN_COUNT },
  (_, index) => DEFAULT_WS_PORT + index,
);

export const DISCOVERABLE_HTTP_PORTS = DISCOVERABLE_WS_PORTS.map((port) => port + 1);