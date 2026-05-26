import type { SignalStatus } from '@aal/shared';
import { BaseAdapter } from '../BaseAdapter.js';

interface MockAdapterOptions {
  randomize?: boolean;
  intervalRangeMs?: [number, number];
}

/**
 * Mock adapter — cycles through all states for UI development.
 */
export class MockAdapter extends BaseAdapter {
  readonly id: string;
  readonly name = 'mock';
  readonly displayName: string;
  readonly icon = '🤖';

  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private cycleIndex = 0;
  private cycleIntervalMs: number;
  private readonly randomize: boolean;
  private readonly intervalRangeMs: [number, number];

  private readonly cycle: SignalStatus[] = [
    'idle',
    'thinking',
    'running',
    'completed',
    'idle',
    'thinking',
    'running',
    'error',
    'idle',
    'thinking',
    'running',
    'waiting_input',
    'idle',
    'running',
    'stalled',
  ];

  constructor(
    id = 'mock-1',
    displayName = 'Mock · dev',
    cycleIntervalMs = 3000,
    options: MockAdapterOptions = {},
  ) {
    super();
    this.id = id;
    this.displayName = displayName;
    this.cycleIntervalMs = cycleIntervalMs;
    this.randomize = options.randomize ?? false;
    this.intervalRangeMs = options.intervalRangeMs ?? [2000, 6000];
  }

  async start(): Promise<void> {
    await super.start();
    if (this.randomize) {
      this.emit(this.pickInitialStatus());
      this.scheduleNextRandomTransition();
      return;
    }

    this.cycleIndex = 0;
    this.emit(this.cycle[0]);
    this.cycleTimer = setInterval(() => {
      this.cycleIndex = (this.cycleIndex + 1) % this.cycle.length;
      this.emit(this.cycle[this.cycleIndex]);
    }, this.cycleIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    await super.stop();
  }

  private scheduleNextRandomTransition(): void {
    const [minDelay, maxDelay] = this.intervalRangeMs;
    const delay = randomInt(minDelay, maxDelay);
    this.cycleTimer = setTimeout(() => {
      this.emit(this.pickNextStatus());
      this.scheduleNextRandomTransition();
    }, delay);
  }

  private pickInitialStatus(): SignalStatus {
    return sample(['idle', 'thinking', 'running']);
  }

  private pickNextStatus(): SignalStatus {
    const transitions: Record<SignalStatus, SignalStatus[]> = {
      idle: ['thinking', 'running'],
      thinking: ['running', 'waiting_input', 'error'],
      running: ['completed', 'waiting_input', 'error', 'stalled'],
      waiting_input: ['running', 'completed', 'error'],
      completed: ['idle', 'thinking'],
      error: ['idle', 'thinking'],
      stalled: ['running', 'idle'],
    };

    return sample(transitions[this.status] ?? this.cycle);
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
