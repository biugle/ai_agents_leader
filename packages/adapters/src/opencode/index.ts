import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execFileAsync = promisify(execFile);

/**
 * OpenCode adapter.
 *
 * Detection:
 * 1. Process detection — is `opencode` running?
 * 2. Session/activity file monitoring
 */
export class OpenCodeAdapter extends BaseAdapter {
  readonly id = 'opencode';
  readonly name = 'opencode';
  readonly displayName = 'OpenCode';
  readonly icon = '🔓';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = 0;

  async start(): Promise<void> {
    await super.start();

    this.pollTimer = setInterval(async () => {
      const running = await this.isRunning();
      if (running) {
        this.detectState();
      } else if (this.status !== 'idle') {
        this.emit('idle', { source: 'process-exit' });
      }
    }, 3000);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await super.stop();
  }

  private async isRunning(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq opencode.exe', '/NH']);
        return stdout.includes('opencode.exe');
      }
      const { stdout } = await execFileAsync('ps', ['aux']);
      return stdout.split('\n').some((l) => /\bopencode\b/i.test(l) && !/grep/.test(l));
    } catch {
      return false;
    }
  }

  private detectState(): void {
    try {
      // OpenCode stores data in ~/.opencode/ or XDG config
      const configDir = join(homedir(), '.opencode');
      try {
        const stat = statSync(configDir);
        if (stat.mtimeMs > this.lastActivity) {
          this.lastActivity = stat.mtimeMs;
          this.emit('running', { source: 'config-change' });
          return;
        }
      } catch {}

      // Process running but no recent activity
      if (Date.now() - this.lastActivity > 30_000) {
        this.emit('thinking', { source: 'process-active' });
      }
    } catch {
      // non-critical
    }
  }
}
