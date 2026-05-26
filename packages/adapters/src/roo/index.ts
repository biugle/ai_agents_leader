import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execFileAsync = promisify(execFile);

/**
 * Roo Code (VS Code extension) adapter.
 *
 * Detection:
 * 1. VS Code process detection
 * 2. Roo Code extension state files
 */
export class RooCodeAdapter extends BaseAdapter {
  readonly id = 'roo';
  readonly name = 'roo';
  readonly displayName = 'RooCode';
  readonly icon = '🦘';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = 0;

  async start(): Promise<void> {
    await super.start();

    this.pollTimer = setInterval(async () => {
      const running = await this.isVSCodeRunning();
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

  private async isVSCodeRunning(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq Code.exe', '/NH']);
        return stdout.includes('Code.exe');
      }
      const { stdout } = await execFileAsync('ps', ['aux']);
      return stdout.split('\n').some((l) => /\bCode\b/.test(l) && !/Helper|process-detector/.test(l));
    } catch {
      return false;
    }
  }

  private detectState(): void {
    try {
      const globalStorage = join(
        homedir(),
        process.platform === 'darwin'
          ? 'Library/Application Support/Code/User/globalStorage'
          : process.platform === 'win32'
            ? 'AppData/Roaming/Code/User/globalStorage'
            : '.config/Code/User/globalStorage',
      );

      // Roo Code extension ID
      const rooDir = join(globalStorage, 'rooveterinaryinc.roo-cline');
      try {
        const stat = statSync(rooDir);
        if (stat.mtimeMs > this.lastActivity) {
          this.lastActivity = stat.mtimeMs;
          this.emit('running', { source: 'roo-state' });
          return;
        }
      } catch {}

      // Check tasks directory
      const tasksDir = join(rooDir, 'tasks');
      try {
        const files = readdirSync(tasksDir);
        for (const file of files) {
          const filePath = join(tasksDir, file);
          const stat = statSync(filePath);
          if (stat.mtimeMs > this.lastActivity) {
            this.lastActivity = stat.mtimeMs;
            this.emit('running', { source: 'roo-task' });
            return;
          }
        }
      } catch {}

      if (Date.now() - this.lastActivity > 30_000) {
        this.emit('thinking', { source: 'process-active' });
      }
    } catch {
      // non-critical
    }
  }
}
