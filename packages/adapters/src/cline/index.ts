import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractSignalStatusFromText, findExistingDirectory, findLatestFile, readFileTail, resolveEditorStorageDir } from '../editor-state.js';

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

  private readonly ACTIVE_WINDOW_MS = 12_000;
  private readonly COMPLETE_GRACE_MS = 24_000;

  static findStorageDir(): string | null {
    const globalStorage = resolveEditorStorageDir('code', 'globalStorage');
    return findExistingDirectory([
      join(globalStorage, 'saoudrizwan.claude-dev'),
      join(globalStorage, 'saoudrizwan.cline'),
    ]);
  }

  async start(): Promise<void> {
    await super.start();
    this.stalledTimeoutMs = 120_000;

    this.pollTimer = setInterval(async () => {
      const running = await this.isVSCodeRunning();
      if (running) {
        this.detectClineState();
      } else if (this.status !== 'idle') {
        this.emit('idle', { source: 'process-exit' });
      }
    }, 1500);

    this.detectClineState();
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
      const clineDir = ClineAdapter.findStorageDir();
      if (!clineDir || !existsSync(clineDir)) {
        this.emit('idle', { source: 'cline-storage-missing' });
        return;
      }

      const latest = findLatestFile(clineDir, {
        maxDepth: 3,
        includeFile: (filePath) => !filePath.endsWith('.log') && !filePath.endsWith('.sqlite') && !filePath.endsWith('.sqlite-wal') && !filePath.endsWith('.sqlite-shm'),
      });

      if (!latest) {
        this.emit('idle', { source: 'cline-no-state-files', storageDir: clineDir });
        return;
      }

      this.lastActivity = Math.max(this.lastActivity, latest.mtimeMs);
      const explicit = extractSignalStatusFromText(readFileTail(latest.filePath));
      if (explicit) {
        this.emit(explicit, { source: 'cline-state-file', stateFile: latest.filePath });
        return;
      }

      const quietMs = Date.now() - this.lastActivity;
      if (quietMs <= this.ACTIVE_WINDOW_MS) {
        this.emit('running', { source: 'cline-file-change', stateFile: latest.filePath });
        return;
      }

      if (quietMs <= this.COMPLETE_GRACE_MS) {
        this.emit('completed', { source: 'cline-file-settled', stateFile: latest.filePath });
        return;
      }

      this.emit('idle', { source: 'cline-file-idle', stateFile: latest.filePath });
    } catch {
      // non-critical
    }
  }
}
