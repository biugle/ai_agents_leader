import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execFileAsync = promisify(execFile);

/**
 * Codex (OpenAI CLI) adapter.
 *
 * Detection:
 * 1. Process detection — is `codex` running?
 * 2. Session file watching — ~/.codex/sessions/ or ~/.codex/history.jsonl
 */
export class CodexAdapter extends BaseAdapter {
  readonly id = 'codex';
  readonly name = 'codex';
  readonly displayName = 'CodeX';
  readonly icon = '🤖';

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
        const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq codex.exe', '/NH']);
        return stdout.includes('codex.exe');
      }
      const { stdout } = await execFileAsync('ps', ['aux']);
      return stdout.split('\n').some((l) => /\bcodex\b/i.test(l) && !/grep/.test(l));
    } catch {
      return false;
    }
  }

  private detectState(): void {
    try {
      const codexDir = join(homedir(), '.codex');
      const historyFile = join(codexDir, 'history.jsonl');

      try {
        const stat = statSync(historyFile);
        if (stat.mtimeMs > this.lastActivity) {
          this.lastActivity = stat.mtimeMs;
          // Read last line to check state
          const readSize = Math.min(4096, stat.size);
          const buf = Buffer.alloc(readSize);
          const fd = require('node:fs').openSync(historyFile, 'r');
          require('node:fs').readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
          require('node:fs').closeSync(fd);

          const lines = buf.toString('utf-8').split('\n').filter(Boolean);
          const lastLine = lines[lines.length - 1];
          try {
            const entry = JSON.parse(lastLine);
            if (entry.role === 'assistant') {
              this.emit('running', { source: 'history' });
            } else if (entry.role === 'user') {
              this.emit('thinking', { source: 'history' });
            }
          } catch {
            this.emit('running', { source: 'history-change' });
          }
          return;
        }
      } catch {}

      // Process running but no recent file activity
      if (Date.now() - this.lastActivity > 30_000) {
        this.emit('thinking', { source: 'process-active' });
      }
    } catch {
      // non-critical
    }
  }
}
