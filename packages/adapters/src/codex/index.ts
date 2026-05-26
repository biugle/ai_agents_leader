import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SignalStatus } from '@aal/shared';

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
  private currentSessionPath: string | null = null;

  private readonly ACTIVE_WINDOW_MS = 12_000;
  private readonly IDLE_WINDOW_MS = 5 * 60_000;
  private readonly RUNNING_SETTLE_MS = 2_500;

  async start(): Promise<void> {
    await super.start();
    this.stalledTimeoutMs = 120_000;

    this.pollTimer = setInterval(async () => {
      const running = await this.isRunning();
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

      const sessionFile = this.findLatestSessionFile(join(codexDir, 'sessions'));
      const candidateFile = sessionFile ?? (existsSync(historyFile) ? historyFile : null);
      if (!candidateFile) {
        this.emit('idle', { source: 'missing-session' });
        return;
      }

      const stat = statSync(candidateFile);
      const latestEntry = this.readLatestEntry(candidateFile);
      const eventTime = this.getEntryTime(latestEntry);
      const lastObservedAt = Math.max(stat.mtimeMs, eventTime, this.lastActivity);
      const now = Date.now();

      this.currentSessionPath = candidateFile;
      this.lastActivity = lastObservedAt;

      if (now - lastObservedAt > this.IDLE_WINDOW_MS) {
        this.emit('idle', { source: 'session-idle', sessionPath: candidateFile });
        return;
      }

      const inferred = this.inferState(latestEntry, now, lastObservedAt);
      this.emit(inferred, {
        source: sessionFile ? 'session-jsonl' : 'history-jsonl',
        sessionPath: candidateFile,
      });
    } catch {
      // non-critical
    }
  }

  private findLatestSessionFile(rootDir: string): string | null {
    try {
      const stack = [rootDir];
      let latestPath: string | null = null;
      let latestMtime = 0;

      while (stack.length > 0) {
        const dir = stack.pop();
        if (!dir) continue;

        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const entryPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(entryPath);
            continue;
          }

          if (!entry.name.endsWith('.jsonl')) {
            continue;
          }

          const stat = statSync(entryPath);
          if (stat.mtimeMs >= latestMtime) {
            latestMtime = stat.mtimeMs;
            latestPath = entryPath;
          }
        }
      }

      return latestPath;
    } catch {
      return null;
    }
  }

  private readLatestEntry(filePath: string): Record<string, any> | null {
    try {
      const stat = statSync(filePath);
      if (stat.size <= 0) {
        return null;
      }

      const readSize = Math.min(stat.size, 131072);
      const buffer = Buffer.alloc(readSize);
      const fd = openSync(filePath, 'r');
      readSync(fd, buffer, 0, readSize, Math.max(0, stat.size - readSize));
      closeSync(fd);

      const lines = buffer.toString('utf-8').split('\n').filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
          return JSON.parse(lines[index]);
        } catch {
          // keep scanning older lines
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private inferState(entry: Record<string, any> | null, now: number, lastObservedAt: number): SignalStatus {
    if (!entry) {
      return now - lastObservedAt <= this.RUNNING_SETTLE_MS ? 'running' : 'idle';
    }

    const explicit = this.extractExplicitState(entry);
    if (explicit) {
      return explicit;
    }

    const eventType = typeof entry.payload?.type === 'string' ? entry.payload.type : null;
    if (entry.type === 'event_msg') {
      if (eventType === 'task_complete') {
        return 'completed';
      }

      if (eventType === 'task_started' || eventType === 'user_message') {
        return now - lastObservedAt <= this.RUNNING_SETTLE_MS ? 'running' : 'thinking';
      }
    }

    const role = this.extractRole(entry);
    if (role === 'user') {
      return now - lastObservedAt <= this.RUNNING_SETTLE_MS ? 'running' : 'thinking';
    }

    if (role === 'assistant') {
      return now - lastObservedAt <= this.RUNNING_SETTLE_MS ? 'running' : 'completed';
    }

    return now - lastObservedAt <= this.ACTIVE_WINDOW_MS ? 'running' : 'idle';
  }

  private extractExplicitState(entry: Record<string, any>): SignalStatus | null {
    const queue: any[] = [entry];
    const visited = new Set<any>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object' || visited.has(current)) {
        continue;
      }
      visited.add(current);

      for (const [key, value] of Object.entries(current)) {
        if (typeof value === 'string') {
          const normalized = value.toLowerCase();
          if ((key === 'status' || key === 'state' || key === 'type' || key === 'event' || key === 'phase') && this.isSignalStatus(normalized)) {
            return normalized;
          }

          if ((key.includes('approval') || key.includes('permission')) && /pending|requested|required|waiting/.test(normalized)) {
            return 'waiting_input';
          }
        } else if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return null;
  }

  private isSignalStatus(value: string): value is SignalStatus {
    return value === 'idle'
      || value === 'thinking'
      || value === 'running'
      || value === 'completed'
      || value === 'error'
      || value === 'waiting_input'
      || value === 'stalled';
  }

  private extractRole(entry: Record<string, any>): string | null {
    if (typeof entry.role === 'string') {
      return entry.role;
    }

    if (typeof entry.payload?.role === 'string') {
      return entry.payload.role;
    }

    if (typeof entry.payload?.message?.role === 'string') {
      return entry.payload.message.role;
    }

    return null;
  }

  private getEntryTime(entry: Record<string, any> | null): number {
    if (!entry) {
      return 0;
    }

    if (typeof entry.timestamp === 'string') {
      const parsed = Date.parse(entry.timestamp);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    if (typeof entry.payload?.timestamp === 'string') {
      const parsed = Date.parse(entry.payload.timestamp);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    if (typeof entry.payload?.started_at === 'number') {
      return entry.payload.started_at * 1000;
    }

    if (typeof entry.payload?.completed_at === 'number') {
      return entry.payload.completed_at * 1000;
    }

    return 0;
  }
}
