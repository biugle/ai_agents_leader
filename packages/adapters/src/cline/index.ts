import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execFileAsync = promisify(execFile);

/**
 * Cline (VS Code extension) adapter.
 *
 * Detection:
 * 1. VS Code process detection
 * 2. Cline extension state files in VS Code's workspace storage
 */
export class ClineAdapter extends BaseAdapter {
  readonly id = 'cline';
  readonly name = 'cline';
  readonly displayName = 'Cline';
  readonly icon = '🧑‍💻';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = 0;

  async start(): Promise<void> {
    await super.start();

    this.pollTimer = setInterval(async () => {
      const running = await this.isVSCodeRunning();
      if (running) {
        this.detectClineState();
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

  private detectClineState(): void {
    try {
      // Cline stores state in VS Code's globalStorage
      const globalStorage = join(
        homedir(),
        process.platform === 'darwin'
          ? 'Library/Application Support/Code/User/globalStorage'
          : process.platform === 'win32'
            ? 'AppData/Roaming/Code/User/globalStorage'
            : '.config/Code/User/globalStorage',
      );

      const clineDir = join(globalStorage, 'saoudrizwan.claude-dev');
      try {
        const stat = statSync(clineDir);
        if (stat.mtimeMs > this.lastActivity) {
          this.lastActivity = stat.mtimeMs;
          this.emit('running', { source: 'cline-state' });
          return;
        }
      } catch {}

      // Check for Cline tasks directory
      const tasksDir = join(clineDir, 'tasks');
      try {
        const files = readdirSync(tasksDir);
        for (const file of files) {
          const filePath = join(tasksDir, file);
          const stat = statSync(filePath);
          if (stat.mtimeMs > this.lastActivity) {
            this.lastActivity = stat.mtimeMs;
            this.emit('running', { source: 'cline-task' });
            return;
          }
        }
      } catch {}

      // VS Code running, Cline installed, but no recent activity
      if (Date.now() - this.lastActivity > 30_000) {
        this.emit('thinking', { source: 'process-active' });
      }
    } catch {
      // non-critical
    }
  }
}
