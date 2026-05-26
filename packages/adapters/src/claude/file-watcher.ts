import type { SignalStatus } from '@aal/shared';
import { watch, type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Watches Claude's state/log files for activity.
 * Monitors ~/.claude/ directory for changes.
 */
export class ClaudeFileWatcher {
  private watcher: FSWatcher | null = null;
  private listeners: Array<(status: SignalStatus, meta?: Record<string, unknown>) => void> = [];
  private lastActivity = 0;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly claudeDir: string;

  constructor() {
    this.claudeDir = join(homedir(), '.claude');
  }

  async start(): Promise<void> {
    try {
      this.watcher = watch(this.claudeDir, {
        ignoreInitial: true,
        depth: 2,
        // Don't watch everything, just key files
        ignored: [/node_modules/, /\.git/],
      });

      this.watcher.on('all', (_event, _path) => {
        this.onFileActivity();
      });
    } catch {
      // If ~/.claude doesn't exist, that's fine
    }
  }

  async stop(): Promise<void> {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  onStatus(callback: (status: SignalStatus, meta?: Record<string, unknown>) => void): void {
    this.listeners.push(callback);
  }

  private onFileActivity(): void {
    this.lastActivity = Date.now();

    // File change suggests running state
    this.emit('running', { source: 'file-watch' });

    // Debounce: if no more changes for 3s, consider it "thinking" (between actions)
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = setTimeout(() => {
      // Only transition to thinking if we were running
      this.emit('thinking', { source: 'file-watch-idle' });
    }, 3000);
  }

  private emit(status: SignalStatus, meta?: Record<string, unknown>): void {
    for (const listener of this.listeners) {
      listener(status, meta);
    }
  }
}
