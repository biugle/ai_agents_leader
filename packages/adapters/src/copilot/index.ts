import { BaseAdapter } from '../BaseAdapter.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { findLatestFile, hasInstalledExtension, parseWorkbenchHiddenState, querySqliteKeys, querySqliteValue, resolveEditorStorageDir, extractSignalStatusFromText } from '../editor-state.js';

const execFileAsync = promisify(execFile);

export class CopilotChatAdapter extends BaseAdapter {
  readonly id = 'copilot-chat';
  readonly name = 'copilot-chat';
  readonly displayName = 'GitHub Copilot Chat';
  readonly icon = '🧭';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = 0;

  private readonly ACTIVE_WINDOW_MS = 10_000;
  private readonly THINK_WINDOW_MS = 30_000;
  private readonly COMPLETE_GRACE_MS = 60_000;

  static isInstalled(): boolean {
    return hasInstalledExtension('code', ['github.copilot-chat']);
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
    const globalStorageDir = resolveEditorStorageDir('code', 'globalStorage');
    const workspaceStorageDir = resolveEditorStorageDir('code', 'workspaceStorage');
    const globalDb = join(globalStorageDir, 'state.vscdb');

    const latestWorkspaceDb = findLatestFile(workspaceStorageDir, {
      maxDepth: 2,
      includeFile: (filePath) => filePath.endsWith('/state.vscdb') || filePath.endsWith('\\state.vscdb'),
    });

    const lastObserved = Math.max(
      this.lastActivity,
      latestWorkspaceDb?.mtimeMs ?? 0,
      findLatestFile(globalStorageDir, { maxDepth: 1, includeFile: (filePath) => filePath.endsWith('/state.vscdb') || filePath.endsWith('\\state.vscdb') })?.mtimeMs ?? 0,
    );
    this.lastActivity = lastObserved;

    const panelHidden = parseWorkbenchHiddenState(querySqliteValue(globalDb, 'workbench.panel.chat.hidden'));
    const sessionIndex = querySqliteValue(globalDb, 'chat.ChatSessionStore.index');
    const lastChatMode = querySqliteValue(globalDb, 'chat.lastChatMode');
    const directStatus = extractSignalStatusFromText([
      sessionIndex,
      querySqliteValue(globalDb, 'GitHub.copilot-chat'),
      ...querySqliteKeys(globalDb, "key like 'chat.%' or key like 'workbench.agentsession%'", 20).map((entry) => entry.value),
    ].filter(Boolean).join('\n'));

    if (directStatus) {
      this.emit(directStatus, { source: 'copilot-global-state' });
      return;
    }

    const sessionCount = this.getSessionCount(sessionIndex);
    const now = Date.now();
    const quietMs = now - lastObserved;
    const panelVisible = panelHidden === false;
    const chatActive = panelVisible || sessionCount > 0 || lastChatMode === 'agent';

    if (!chatActive && quietMs > this.COMPLETE_GRACE_MS) {
      this.emit('idle', { source: 'copilot-no-active-chat' });
      return;
    }

    if (quietMs <= this.ACTIVE_WINDOW_MS) {
      this.emit('running', { source: 'copilot-chat-activity', sessionCount, panelVisible, mode: lastChatMode ?? undefined });
      return;
    }

    if (quietMs <= this.THINK_WINDOW_MS) {
      this.emit('thinking', { source: 'copilot-chat-thinking', sessionCount, panelVisible, mode: lastChatMode ?? undefined });
      return;
    }

    if (quietMs <= this.COMPLETE_GRACE_MS) {
      this.emit('completed', { source: 'copilot-chat-settled', sessionCount, panelVisible, mode: lastChatMode ?? undefined });
      return;
    }

    this.emit('idle', { source: 'copilot-chat-idle', sessionCount, panelVisible, mode: lastChatMode ?? undefined });
  }

  private getSessionCount(sessionIndex: string | null): number {
    if (!sessionIndex) {
      return 0;
    }

    try {
      const parsed = JSON.parse(sessionIndex);
      return parsed?.entries && typeof parsed.entries === 'object' ? Object.keys(parsed.entries).length : 0;
    } catch {
      return 0;
    }
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