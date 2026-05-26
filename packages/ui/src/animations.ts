import type { StateGroup } from '@aal/shared';

/**
 * Animation keyframe definitions for signal lights.
 * These are used by framer-motion in SignalLight.tsx.
 */

export const animationDefs: Record<StateGroup, {
  keyframes: number[];
  duration: number;
  ease: string;
}> = {
  thinking: {
    keyframes: [0.4, 1, 0.4],
    duration: 2,
    ease: 'easeInOut',
  },
  running: {
    keyframes: [0.2, 1, 0.2],
    duration: 0.6,
    ease: 'easeInOut',
  },
  success: {
    keyframes: [0, 1, 0, 1, 0, 1],
    duration: 0.6,
    ease: 'linear',
  },
  alert: {
    keyframes: [1, 0.3, 1, 0.3],
    duration: 0.3,
    ease: 'linear',
  },
  waiting: {
    keyframes: [0.2, 1, 0.2],
    duration: 1.5,
    ease: 'easeInOut',
  },
  stalled: {
    keyframes: [1, 0.2, 1, 0.2],
    duration: 0.3,
    ease: 'linear',
  },
  idle: {
    keyframes: [0.15, 0.35, 0.15],
    duration: 4,
    ease: 'easeInOut',
  },
};
