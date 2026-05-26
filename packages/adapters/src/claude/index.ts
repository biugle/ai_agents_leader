import type { SignalStatus } from '@aal/shared';
import { BaseAdapter } from '../BaseAdapter.js';
import { watch, type FSWatcher } from 'chokidar';
import { readdirSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Claude Code adapter — dual-source state detection.
 *
 * Detection priority:
 *   1. Hooks (PreToolUse/PostToolUse/Stop/UserPromptSubmit) — most real-time
 *   2. JSONL session file parsing — fallback when hooks unavailable
 *   3. Process activity (file size changes) — baseline liveness
 *
 * State decision logic (based on Claude Code's actual behavior patterns):
 *
 *   idle        — no recent session activity (>10min since last entry)
 *   thinking    — user submitted prompt, Claude is generating (streaming text/thinking blocks)
 *   running     — Claude is executing tools (tool_result present, or queue-operation)
 *   waiting_input — Claude requested a tool that needs permission (tool_use + no tool_result after 2s)
 *   completed   — Claude finished response (stop_reason: end_turn / stop / max_tokens)
 *   error       — session errored out
 *   stalled     — stuck in thinking/running for >2min with no new entries
 *
 * Compatibility notes:
 *   - Older Claude Code versions may not have hooks → falls back to JSONL
 *   - JSONL format may vary across versions → we check multiple field patterns
 *   - stop_reason values: "end_turn" (v1+), "tool_use" (v1+), "stop" (legacy), "max_tokens"
 *   - Hook events: PreToolUse→waiting_input, PostToolUse→running, Stop→completed, UserPromptSubmit→thinking
 */
export class ClaudeAdapter extends BaseAdapter {
  readonly name = 'claude';
  readonly icon = '⚡';
  readonly id: string;
  readonly displayName: string;

  private watcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFileSize = 0;

  // Hook suppression: when hooks are active, JSONL parser defers
  private lastHookUpdate = 0;
  private lastHookStatus: SignalStatus | null = null;

  // Debounce waiting_input to avoid false positives from timing issues
  private waitingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // State smoothing: prevent rapid oscillation
  private lastStateChangeTime = 0;
  private readonly MIN_STATE_INTERVAL = 500; // 500ms minimum between state changes

  private projectDir: string;

  constructor(
    private sessionPath: string,
    projectName: string,
    projectDir: string = '',
  ) {
    super();
    const sessionId = sessionPath.split('/').pop()?.replace('.jsonl', '') ?? 'unknown';
    this.id = `claude-${sessionId.slice(0, 8)}`;
    this.displayName = `ClaudeCode · ${projectName} (${sessionId.slice(0, 4)})`;
    this.projectDir = projectDir;
    this.stalledTimeoutMs = 120_000;
  }

  async start(): Promise<void> {
    await super.start();

    try {
      this.lastFileSize = statSync(this.sessionPath).size;
    } catch {
      this.lastFileSize = 0;
    }

    // Watch the session file for changes
    try {
      this.watcher = watch(this.sessionPath, {
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      });
      this.watcher.on('change', () => this.onSessionActivity());
    } catch {}

    // Poll every 2s as backup
    this.pollTimer = setInterval(() => this.checkForChanges(), 2000);

    // Initial state
    this.onSessionActivity();
  }

  async stop(): Promise<void> {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.settleTimer) { clearTimeout(this.settleTimer); this.settleTimer = null; }
    if (this.waitingDebounceTimer) { clearTimeout(this.waitingDebounceTimer); this.waitingDebounceTimer = null; }
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
    await super.stop();
  }

  private checkForChanges(): void {
    try {
      const stat = statSync(this.sessionPath);
      if (stat.size !== this.lastFileSize) {
        this.lastFileSize = stat.size;
        this.onSessionActivity();
      }
    } catch {}
  }

  /** Called by the runtime when a hook sends a state update for this agent. */
  reportHookState(status: SignalStatus, meta?: Record<string, unknown>): void {
    this.lastHookUpdate = Date.now();
    this.lastHookStatus = status;
    this.emit(status, { ...meta, source: 'claude-hook' });
  }

  /**
   * Override emit — smart source arbitration.
   *
   * Rules:
   * - Hook updates always go through (they're the most authoritative)
   * - JSONL-derived updates are suppressed for 8s after a hook update
   * - Same-state dedup: if current status == new status, skip
   * - But: if hook sent a "final" state (completed/error), don't override with JSONL
   */
  protected emit(status: SignalStatus, meta?: Record<string, unknown>): void {
    const isFromHook = meta?.source === 'claude-hook';
    const now = Date.now();

    if (isFromHook) {
      this.lastHookStatus = status;
      this.lastHookUpdate = now;
      // Hook always wins
      super.emit(status, meta);
      return;
    }

    // JSONL/parser: suppress if hook was active recently
    if (now - this.lastHookUpdate < 8000) {
      return;
    }

    // Don't let JSONL override a "final" hook state too quickly
    if (this.lastHookStatus === 'completed' && now - this.lastHookUpdate < 15000) {
      if (status !== 'completed' && status !== 'error' && status !== 'idle') {
        return;
      }
    }

    // State smoothing: prevent rapid oscillation between states
    if (status !== this.status && now - this.lastStateChangeTime < this.MIN_STATE_INTERVAL) {
      // Allow definitive signals (completed/error) to always go through
      if (status === 'completed' || status === 'error') {
        // OK — these are important, let them through
      } else {
        return; // Skip rapid non-definitive transitions
      }
    }
    this.lastStateChangeTime = now;

    super.emit(status, meta);
  }

  private onSessionActivity(): void {
    // If hooks are active (updated within last 8s), defer to them
    if (Date.now() - this.lastHookUpdate < 8000) return;

    const state = this.parseLastEntry();

    // Debounce waiting_input: if parser says waiting_input but we're currently running,
    // wait 3s before emitting — tool_result may still be writing to the file
    if (state === 'waiting_input' && this.status === 'running') {
      if (!this.waitingDebounceTimer) {
        this.waitingDebounceTimer = setTimeout(() => {
          this.waitingDebounceTimer = null;
          // Re-check after debounce window
          const recheck = this.parseLastEntry();
          if (recheck === 'waiting_input') {
            this.emit('waiting_input', { source: 'session-watch', directory: this.projectDir });
          }
        }, 2000);
      }
      return; // Don't emit yet
    }

    // Cancel pending debounce if state is no longer waiting_input
    if (this.waitingDebounceTimer) {
      clearTimeout(this.waitingDebounceTimer);
      this.waitingDebounceTimer = null;
    }

    this.emit(state, { source: 'session-watch', directory: this.projectDir });

    // Stalled detection: if stuck in active states with no new writes
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (state === 'running' || state === 'thinking') {
      this.settleTimer = setTimeout(() => {
        const recheck = this.parseLastEntry();
        if (recheck === 'running' || recheck === 'thinking') {
          this.emit('stalled', { source: 'session-settle', directory: this.projectDir });
        }
      }, this.stalledTimeoutMs);
    }
  }

  /**
   * Parse the last JSONL entry to determine current state.
   *
   * This handles multiple Claude Code versions by checking various
   * field patterns and stop_reason values.
   */
  private parseLastEntry(): SignalStatus {
    try {
      const stat = statSync(this.sessionPath);
      if (stat.size === 0) return 'idle';

      const readSize = Math.min(131072, stat.size); // Read up to 128KB for better context
      const buf = Buffer.alloc(readSize);
      const fd = openSync(this.sessionPath, 'r');
      readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
      closeSync(fd);

      const content = buf.toString('utf-8');
      const lines = content.split('\n').filter(Boolean);

      // Parse recent entries from newest to oldest
      const entries: any[] = [];
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
        try {
          entries.push(JSON.parse(lines[i]));
        } catch {}
      }

      if (entries.length === 0) return 'idle';

      const latest = entries[0];
      const latestTime = this.getEntryTime(latest);

      // If last entry is very old (>10min), session is idle
      if (latestTime > 0 && Date.now() - latestTime > 600_000) {
        return 'idle';
      }

      // ── State determination by entry type ──

      // 1. Latest is user message (tool_result or user prompt)
      if (latest.type === 'user') {
        // Check if it contains tool_result → tool just finished, Claude will continue
        const content = latest.message?.content;
        if (Array.isArray(content)) {
          const hasToolResult = content.some((c: any) => c.type === 'tool_result');
          if (hasToolResult) return 'running'; // Tool completed, Claude processing result
        }

        // Key fix: check the PREVIOUS assistant entry's stop_reason.
        // After Claude finishes (end_turn), the JSONL file has:
        //   line N:   user (system message) — NOT a new prompt
        //   line N-1: assistant (stop_reason: end_turn)
        // Without this check, we'd wrongly return 'thinking'.
        const prevAssistant = entries.find((e, i) => i > 0 && e.type === 'assistant');
        if (prevAssistant) {
          const prevStop = prevAssistant.message?.stop_reason;
          if (prevStop === 'end_turn' || prevStop === 'stop' || prevStop === 'max_tokens') {
            return 'completed';
          }
        }

        // User message without tool_result, and no completed assistant → new prompt
        return 'thinking';
      }

      // 2. Queue operation → Claude is actively processing
      if (latest.type === 'queue-operation') {
        return 'running';
      }

      // 3. Assistant message — the main state source
      if (latest.type === 'assistant') {
        return this.parseAssistantMessage(latest, entries);
      }

      // 4. Unknown entry type — assume running if recent
      return 'running';
    } catch {
      return 'idle';
    }
  }

  /**
   * Parse an assistant message to determine state.
   *
   * Claude Code's assistant messages contain:
   *   - message.content: array of blocks (text, tool_use, thinking)
   *   - message.stop_reason: "end_turn" | "tool_use" | "stop" | "max_tokens" | null
   *
   * State mapping:
   *   stop_reason=end_turn         → completed (Claude finished naturally)
   *   stop_reason=stop             → completed (legacy, or interrupted)
   *   stop_reason=max_tokens       → completed (hit limit)
   *   stop_reason=tool_use         → check if tool_result exists after
   *     no tool_result after 2s    → waiting_input (needs permission)
   *     tool_result exists          → running (tool executed)
   *   stop_reason=null             → thinking (still streaming)
   *   has thinking blocks only     → thinking
   *   has text blocks              → thinking (streaming)
   *   has tool_use blocks          → running (tool call in progress)
   */
  private parseAssistantMessage(entry: any, allEntries: any[]): SignalStatus {
    const msg = entry.message;
    const contentArr = msg?.content;
    if (!Array.isArray(contentArr)) return 'running';

    const hasToolUse = contentArr.some((c: any) => c.type === 'tool_use');
    const hasThinking = contentArr.some((c: any) => c.type === 'thinking');
    const hasText = contentArr.some((c: any) => c.type === 'text');
    const stopReason = msg?.stop_reason;

    // ── Definitive completion signals ──
    // end_turn: Claude finished its response naturally
    // stop: legacy completion or user interrupt
    // max_tokens: hit token limit
    if (stopReason === 'end_turn' || stopReason === 'stop' || stopReason === 'max_tokens') {
      return 'completed';
    }

    // ── Tool use with stop_reason ──
    if (stopReason === 'tool_use' || hasToolUse) {
      // Check if there's a tool_result AFTER this entry
      const toolUseTime = this.getEntryTime(entry);
      const hasResultAfter = this.hasToolResultAfter(entry, allEntries);

      if (hasResultAfter) {
        return 'running'; // Tool executed, Claude processing result
      }

      // No tool_result yet — check elapsed time
      if (toolUseTime > 0) {
        const elapsed = Date.now() - toolUseTime;
        if (elapsed > 3000) {
          return 'waiting_input'; // Waiting for permission (>3s without result)
        }
        // Recent tool_use, tool_result may still be writing
        return 'running';
      }

      // No timestamp — assume waiting (conservative)
      return 'waiting_input';
    }

    // ── Thinking / streaming ──
    if (hasThinking && !hasText && !hasToolUse) {
      return 'thinking'; // Pure thinking blocks
    }

    if (hasText && !stopReason) {
      return 'thinking'; // Still streaming text
    }

    if (hasText && stopReason) {
      // Has text but unknown stop_reason — treat as completed (safe default)
      return 'completed';
    }

    // ── Fallback ──
    return 'running';
  }

  /** Get timestamp from an entry (handles different field names across versions) */
  private getEntryTime(entry: any): number {
    if (!entry) return 0;
    // Try various timestamp fields
    if (entry.timestamp) return new Date(entry.timestamp).getTime();
    if (entry.created_at) return new Date(entry.created_at).getTime();
    if (entry.meta?.timestamp) return entry.meta.timestamp;
    return 0;
  }

  /** Check if any entry after the given one contains a tool_result */
  private hasToolResultAfter(target: any, entries: any[]): boolean {
    const targetTime = this.getEntryTime(target);
    for (let i = entries.indexOf(target) - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.type !== 'user') continue;
      const content = e.message?.content;
      if (!Array.isArray(content)) continue;
      const hasResult = content.some((c: any) => c.type === 'tool_result');
      if (hasResult) {
        // Verify it's actually after the target (by timestamp if available)
        const resultTime = this.getEntryTime(e);
        if (resultTime > 0 && targetTime > 0) {
          return resultTime > targetTime;
        }
        // No timestamps — assume order matches array order
        return true;
      }
    }
    return false;
  }

  // ── Static helpers for discovery ──────────────────────────

  static findActiveSessions(): Array<{ path: string; projectName: string; projectDir: string }> {
    const projectsDir = join(homedir(), '.claude', 'projects');
    const sessions: Array<{ path: string; projectName: string; projectDir: string }> = [];

    try {
      const projects = readdirSync(projectsDir);
      for (const project of projects) {
        const projectDir = join(projectsDir, project);
        try {
          const files = readdirSync(projectDir);
          for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            const filePath = join(projectDir, file);
            const stat = statSync(filePath);
            if (Date.now() - stat.mtimeMs < 600_000) {
              const projectName = ClaudeAdapter.extractProjectName(project);
              const fullDir = ClaudeAdapter.slugToPath(project);
              sessions.push({ path: filePath, projectName, projectDir: fullDir });
            }
          }
        } catch {}
      }
    } catch {}

    return sessions;
  }

  static extractProjectName(slug: string): string {
    const parts = slug.split('-').filter(Boolean);
    const nameParts = parts.length > 3 ? parts.slice(3) : parts;
    return nameParts.join('_');
  }

  static slugToPath(slug: string): string {
    const parts = slug.split('-').filter(Boolean);
    for (let i = parts.length; i >= 3; i--) {
      const prefix = '/' + parts.slice(0, i).join('/');
      if (existsSync(prefix)) return prefix;
      const segments = parts.slice(3, i);
      if (segments.length >= 1) {
        for (const combo of generateUnderscoreCombinations(segments)) {
          const candidate = '/' + parts.slice(0, 3).join('/') + '/' + combo.join('/');
          if (existsSync(candidate)) return candidate;
        }
      }
    }
    return '/' + parts.join('/');
  }
}

function generateUnderscoreCombinations(segments: string[]): string[][] {
  if (segments.length <= 1) return [segments];
  const results: string[][] = [];
  const n = segments.length;
  for (let mask = 0; mask < (1 << (n - 1)); mask++) {
    const combo: string[] = [];
    let current = segments[0];
    for (let i = 0; i < n - 1; i++) {
      if (mask & (1 << i)) {
        current += '_' + segments[i + 1];
      } else {
        combo.push(current);
        current = segments[i + 1];
      }
    }
    combo.push(current);
    results.push(combo);
  }
  return results;
}
