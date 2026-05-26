import { createServer } from 'node:net';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RUNTIME_PORT_SCAN_COUNT } from '@aal/shared';

const PORT_FILE = join(homedir(), '.ai-agents-leader', 'port');

/** Find an available port starting from preferredPort */
export async function findAvailablePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + RUNTIME_PORT_SCAN_COUNT; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No available port found');
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/** Write port to file so overlay can discover it */
export function writePortFile(port: number): void {
  try {
    mkdirSync(join(homedir(), '.ai-agents-leader'), { recursive: true });
    writeFileSync(PORT_FILE, String(port), 'utf-8');
  } catch {
    // non-critical
  }
}

/** Read port from file */
export function readPortFile(): number | null {
  try {
    const content = readFileSync(PORT_FILE, 'utf-8').trim();
    const port = parseInt(content, 10);
    return isNaN(port) ? null : port;
  } catch {
    return null;
  }
}
