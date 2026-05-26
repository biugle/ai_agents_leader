import { BaseAdapter } from '../BaseAdapter.js';
import { watch, type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Cursor IDE adapter.
 * Detects Cursor's state via:
 * 1. Process detection
 * 2. Workspace file watching
 */
export class CursorAdapter extends BaseAdapter {
  readonly id = 'cursor';
  readonly name = 'cursor';
  readonly displayName = 'Cursor';
  readonly icon = '✏️';

  private watcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastFileChange = 0;

  async start(): Promise<void> {
    await super.start();

    // Poll for Cursor process
    this.pollTimer = setInterval(async () => {
      const running = await this.isCursorRunning();
      if (running && this.status === 'idle') {
        this.emit('thinking', { source: 'process-detection' });
      } else if (!running && this.status !== 'idle') {
        this.emit('idle', { source: 'process-exit' });
      }
    }, 5000);

    // Watch workspace for changes
    try {
      const workspaceDir = join(homedir());
      this.watcher = watch(workspaceDir, {
        ignoreInitial: true,
        depth: 1,
        ignored: [/node_modules/, /\.git/, /\..*/],
      });

      this.watcher.on('all', () => {
        this.lastFileChange = Date.now();
        if (this.status === 'thinking' || this.status === 'idle') {
          this.emit('running', { source: 'file-change' });
        }

        // Debounce: return to thinking after 5s of no changes
        setTimeout(() => {
          if (Date.now() - this.lastFileChange >= 4500 && this.status === 'running') {
            this.emit('thinking', { source: 'file-idle' });
          }
        }, 5000);
      });
    } catch {
      // non-critical
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    await super.stop();
  }

  private async isCursorRunning(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq Cursor.exe', '/NH']);
        return stdout.includes('Cursor.exe');
      }
      const { stdout } = await execFileAsync('ps', ['aux']);
      return stdout.split('\n').some((line) => /\bCursor\b/.test(line) && !/process-detector/.test(line));
    } catch {
      return false;
    }
  }
}
