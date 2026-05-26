/**
 * AI Agent Signal States
 *
 * The core state system for AI Agents Leader.
 * Every agent maps to exactly one of these states at any time.
 */

/** Raw status — what adapters report */
export type SignalStatus =
  | 'idle'
  | 'thinking'
  | 'running'
  | 'completed'
  | 'error'
  | 'waiting_input'
  | 'stalled';

/** Visual group — how the UI renders */
export type StateGroup = 'thinking' | 'running' | 'success' | 'alert' | 'waiting' | 'stalled' | 'idle';

/** Map raw status to visual group */
export function statusToGroup(status: SignalStatus): StateGroup {
  switch (status) {
    case 'thinking':
      return 'thinking';
    case 'running':
      return 'running';
    case 'completed':
      return 'success';
    case 'waiting_input':
      return 'waiting';
    case 'error':
      return 'alert';
    case 'stalled':
      return 'stalled';
    case 'idle':
    default:
      return 'idle';
  }
}

/** Status display labels */
export const STATUS_LABELS: Record<SignalStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  running: 'Running',
  completed: 'Completed',
  error: 'Error',
  waiting_input: 'Waiting for Input',
  stalled: 'Stalled',
};
