import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findLatestFile, resolveEditorStorageDir } from '../editor-state.js';

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

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastStateChange = 0;

  private readonly ACTIVE_WINDOW_MS = 12_000;
  private readonly COMPLETE_GRACE_MS = 24_000;

  async start(): Promise<void> {
    await super.start();
    this.stalledTimeoutMs = 120_000;

    this.pollTimer = setInterval(async () => {
      const running = await this.isCursorRunning();
      if (!running && this.status !== 'idle') {
        this.emit('idle', { source: 'process-exit' });
        return;
      }

      this.detectState();
    }, 1500);

    this.detectState();
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await super.stop();
  }

  private detectState(): void {
    const workspaceStorageDir = resolveEditorStorageDir('cursor', 'workspaceStorage');
    const latestStateFile = findLatestFile(workspaceStorageDir, {
      maxDepth: 2,
      includeFile: (filePath) => filePath.endsWith('/state.vscdb') || filePath.endsWith('\\state.vscdb'),
    });

    if (!latestStateFile) {
      this.emit('idle', { source: 'workspace-storage-missing' });
      return;
    }

    const now = Date.now();
    this.lastStateChange = Math.max(this.lastStateChange, latestStateFile.mtimeMs);
    const quietMs = now - this.lastStateChange;

    if (quietMs <= this.ACTIVE_WINDOW_MS) {
      this.emit('running', { source: 'cursor-workspace-state', stateFile: latestStateFile.filePath });
      return;
    }

    if (quietMs <= this.COMPLETE_GRACE_MS) {
      this.emit('completed', { source: 'cursor-workspace-settled', stateFile: latestStateFile.filePath });
      return;
    }

    this.emit('idle', { source: 'cursor-workspace-idle', stateFile: latestStateFile.filePath });
  }

  private async isCursorRunning(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq Cursor.exe', '/NH']);
        return stdout.includes('Cursor.exe');
      }
      const { stdout } = await execFileAsync('ps', ['aux']);
      return stdout.split('\n').some((line) => /\/Cursor\.app\/Contents\/MacOS\/Cursor\b/.test(line) || /\bCursor\.exe\b/.test(line));
    } catch {
      return false;
    }
  }
}
