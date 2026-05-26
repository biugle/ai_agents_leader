import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractSignalStatusFromText, findExistingDirectory, findLatestFile, readFileTail, resolveEditorStorageDir } from '../editor-state.js';

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

  private readonly ACTIVE_WINDOW_MS = 12_000;
  private readonly COMPLETE_GRACE_MS = 24_000;

  static findStorageDir(): string | null {
    const globalStorage = resolveEditorStorageDir('code', 'globalStorage');
    return findExistingDirectory([
      join(globalStorage, 'rooveterinaryinc.roo-cline'),
      join(globalStorage, 'rooveterinaryinc.roo-code'),
    ]);
  }

  async start(): Promise<void> {
    await super.start();
    this.stalledTimeoutMs = 120_000;

    this.pollTimer = setInterval(async () => {
      const running = await this.isVSCodeRunning();
      if (running) {
        this.detectState();
      } else if (this.status !== 'idle') {
        this.emit('idle', { source: 'process-exit' });
      }
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
      const rooDir = RooCodeAdapter.findStorageDir();
      if (!rooDir || !existsSync(rooDir)) {
        this.emit('idle', { source: 'roo-storage-missing' });
        return;
      }

      const latest = findLatestFile(rooDir, {
        maxDepth: 3,
        includeFile: (filePath) => !filePath.endsWith('.log') && !filePath.endsWith('.sqlite') && !filePath.endsWith('.sqlite-wal') && !filePath.endsWith('.sqlite-shm'),
      });

      if (!latest) {
        this.emit('idle', { source: 'roo-no-state-files', storageDir: rooDir });
        return;
      }

      this.lastActivity = Math.max(this.lastActivity, latest.mtimeMs);
      const explicit = extractSignalStatusFromText(readFileTail(latest.filePath));
      if (explicit) {
        this.emit(explicit, { source: 'roo-state-file', stateFile: latest.filePath });
        return;
      }

      const quietMs = Date.now() - this.lastActivity;
      if (quietMs <= this.ACTIVE_WINDOW_MS) {
        this.emit('running', { source: 'roo-file-change', stateFile: latest.filePath });
        return;
      }

      if (quietMs <= this.COMPLETE_GRACE_MS) {
        this.emit('completed', { source: 'roo-file-settled', stateFile: latest.filePath });
        return;
      }

      this.emit('idle', { source: 'roo-file-idle', stateFile: latest.filePath });
    } catch {
      // non-critical
    }
  }
}
