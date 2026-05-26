import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { extractSignalStatusFromText, hasInstalledExtension, querySqliteKeys, querySqliteValue, resolveEditorStorageDir } from '../editor-state.js';

const execFileAsync = promisify(execFile);

export class ChatGPTAdapter extends BaseAdapter {
  readonly id = 'chatgpt-vscode';
  readonly name = 'chatgpt-vscode';
  readonly displayName = 'OpenAI ChatGPT (VS Code)';
  readonly icon = '💬';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastFingerprint = '';
  private lastActivity = 0;

  private readonly ACTIVE_WINDOW_MS = 10_000;
  private readonly THINK_WINDOW_MS = 30_000;
  private readonly COMPLETE_GRACE_MS = 60_000;

  static isInstalled(): boolean {
    return hasInstalledExtension('code', ['openai.chatgpt']);
  }

  async start(): Promise<void> {
    await super.start();
    this.stalledTimeoutMs = 120_000;

    this.pollTimer = setInterval(async () => {
      const running = await this.isVSCodeRunning();
      if (!running) {
        if (this.status !== 'idle') {
          this.emit('idle', { source: 'process-exit' });
        }
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
    const globalDb = join(resolveEditorStorageDir('code', 'globalStorage'), 'state.vscdb');
    const openAiState = querySqliteValue(globalDb, 'openai.chatgpt');
    const relatedValues = querySqliteKeys(globalDb, "key like 'workbench.view.extension.chatgpt%' or key like 'openai.chatgpt%'", 20).map((entry) => entry.value);
    const combined = [openAiState, ...relatedValues].filter(Boolean).join('\n');
    const directStatus = extractSignalStatusFromText(combined);

    if (directStatus) {
      this.lastActivity = Date.now();
      this.emit(directStatus, { source: 'chatgpt-global-state' });
      return;
    }

    const fingerprint = openAiState ?? '';
    if (fingerprint && fingerprint !== this.lastFingerprint) {
      this.lastFingerprint = fingerprint;
      this.lastActivity = Date.now();
    }

    const quietMs = Date.now() - this.lastActivity;
    if (!fingerprint && quietMs > this.COMPLETE_GRACE_MS) {
      this.emit('idle', { source: 'chatgpt-no-state' });
      return;
    }

    if (quietMs <= this.ACTIVE_WINDOW_MS) {
      this.emit('running', { source: 'chatgpt-state-change' });
      return;
    }

    if (quietMs <= this.THINK_WINDOW_MS) {
      this.emit('thinking', { source: 'chatgpt-active' });
      return;
    }

    if (quietMs <= this.COMPLETE_GRACE_MS) {
      this.emit('completed', { source: 'chatgpt-settled' });
      return;
    }

    this.emit('idle', { source: 'chatgpt-idle' });
  }

  private async isVSCodeRunning(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq Code.exe', '/NH']);
        return stdout.includes('Code.exe');
      }

      const { stdout } = await execFileAsync('ps', ['aux']);
      return stdout.split('\n').some((line) => /\/Visual Studio Code\.app\/Contents\/MacOS\/Code\b/.test(line) || /\bCode\.exe\b/.test(line));
    } catch {
      return false;
    }
  }
}