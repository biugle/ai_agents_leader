import type { SignalStatus } from '@aal/shared';
import { createInterface } from 'node:readline';

/**
 * Parses Claude CLI stdout to infer state.
 *
 * Key patterns:
 * - "Thinking" / "Analyzing" → thinking
 * - Tool call indicators → running
 * - "Done" / completion markers → completed
 * - Error patterns → error
 * - "Waiting for approval" / "[y/n]" → waiting_input
 */
export class ClaudeStdoutParser {
  private rl: ReturnType<typeof createInterface> | null = null;
  private listeners: Array<(status: SignalStatus, meta?: Record<string, unknown>) => void> = [];

  // Patterns to match against Claude CLI output
  private readonly patterns: Array<{ regex: RegExp; status: SignalStatus }> = [
    // Thinking patterns
    { regex: /\b(thinking|analyzing|considering|reasoning)\b/i, status: 'thinking' },
    { regex: /^\s*⏳/, status: 'thinking' },

    // Running / tool call patterns
    { regex: /\b(executing|calling tool|running|editing|writing|reading file)\b/i, status: 'running' },
    { regex: /\b(bash|read|write|edit|grep|glob)\b.*\.{3}/i, status: 'running' },
    { regex: /^\s*🔧/, status: 'running' },

    // Completion patterns
    { regex: /\b(done|completed|finished|success)\b/i, status: 'completed' },
    { regex: /^\s*✅/, status: 'completed' },

    // Error patterns
    { regex: /\b(error|failed|exception|crashed)\b/i, status: 'error' },
    { regex: /^\s*❌/, status: 'error' },

    // Waiting for input
    { regex: /\b(waiting for|approval|confirm|approve)\b/i, status: 'waiting_input' },
    { regex: /\[y\/n\]/i, status: 'waiting_input' },
    { regex: /\bDo you want/i, status: 'waiting_input' },
  ];

  attach(stream: NodeJS.ReadableStream): void {
    this.detach();
    this.rl = createInterface({ input: stream, crlfDelay: Infinity });

    this.rl.on('line', (line: string) => {
      this.parseLine(line);
    });
  }

  detach(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  destroy(): void {
    this.detach();
    this.listeners = [];
  }

  onStatus(callback: (status: SignalStatus, meta?: Record<string, unknown>) => void): void {
    this.listeners.push(callback);
  }

  private parseLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    for (const { regex, status } of this.patterns) {
      if (regex.test(trimmed)) {
        this.emit(status, { raw: trimmed, source: 'stdout' });
        return; // first match wins
      }
    }
  }

  private emit(status: SignalStatus, meta?: Record<string, unknown>): void {
    for (const listener of this.listeners) {
      listener(status, meta);
    }
  }
}
