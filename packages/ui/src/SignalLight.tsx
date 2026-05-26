import { motion } from 'framer-motion';
import type { StateGroup } from '@aal/shared';

interface SignalLightProps {
  group: StateGroup;
  index: number; // 0, 1, 2 — used for flow animation delay
}

// Running state: blue → purple → cyan flowing
const RUNNING_COLORS = [
  { color: '#3B82F6', glow: 'rgba(59,130,246,0.6)' },   // blue
  { color: '#A855F7', glow: 'rgba(168,85,247,0.6)' },    // purple
  { color: '#06B6D4', glow: 'rgba(6,182,212,0.6)' },     // cyan
];

// Thinking state: yellow → purple alternating
const THINKING_COLORS = [
  { color: '#F5A623', glow: 'rgba(245,166,35,0.6)' },    // yellow
  { color: '#A855F7', glow: 'rgba(168,85,247,0.6)' },    // purple
  { color: '#F5A623', glow: 'rgba(245,166,35,0.6)' },    // yellow
];

/**
 * Individual LED light with glass effect and animation.
 */
export function SignalLight({ group, index }: SignalLightProps) {
  const variants = getVariants(group, index);
  const multiColor = group === 'running' ? RUNNING_COLORS[index]
    : group === 'thinking' ? THINKING_COLORS[index]
    : null;

  const bg = multiColor
    ? `radial-gradient(circle at 35% 35%, ${multiColor.color}, color-mix(in srgb, ${multiColor.color} 60%, black))`
    : `radial-gradient(circle at 35% 35%, var(--aal-light-${group}), color-mix(in srgb, var(--aal-light-${group}) 60%, black))`;

  const shadow = multiColor
    ? `0 0 8px ${multiColor.glow}, inset 0 0 4px rgba(255,255,255,0.3)`
    : `0 0 8px var(--aal-glow-${group}), inset 0 0 4px rgba(255,255,255,0.3)`;

  return (
    <motion.div
      className="aal-light"
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: bg,
        boxShadow: shadow,
      }}
      animate={variants.animate}
      transition={variants.transition}
    />
  );
}

function getVariants(group: StateGroup, index: number) {
  switch (group) {
    case 'thinking':
      // 黄紫交替流动
      return {
        animate: { opacity: [0.15, 1, 0.15] },
        transition: {
          duration: 1.2,
          repeat: Infinity,
          delay: index * 0.4,
          ease: 'easeInOut',
        },
      };

    case 'running':
      // 蓝紫青三灯交替流动
      return {
        animate: { opacity: [0.15, 1, 0.15] },
        transition: {
          duration: 0.9,
          repeat: Infinity,
          delay: index * 0.3,
          ease: 'easeInOut',
        },
      };

    case 'success':
      // 绿灯闪3下常亮
      return {
        animate: { opacity: [0, 1, 0, 1, 0, 1] },
        transition: {
          duration: 0.6,
          times: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
        },
      };

    case 'waiting':
      // 黄色低频闪烁 — 等待用户确认
      return {
        animate: { opacity: [0.2, 1, 0.2] },
        transition: {
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        },
      };

    case 'stalled':
      // 黄色高频闪烁 — 卡住了
      return {
        animate: { opacity: [1, 0.2, 1, 0.2] },
        transition: {
          duration: 0.3,
          repeat: Infinity,
          times: [0, 0.01, 0.5, 0.51],
          ease: 'linear',
        },
      };

    case 'alert':
      // 红灯高频闪烁 — 错误/中断
      return {
        animate: { opacity: [1, 0.2, 1, 0.2] },
        transition: {
          duration: 0.25,
          repeat: Infinity,
          times: [0, 0.01, 0.5, 0.51],
          ease: 'linear',
        },
      };

    case 'idle':
    default:
      // 灰色微弱呼吸
      return {
        animate: { opacity: [0.15, 0.35, 0.15] },
        transition: {
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        },
      };
  }
}
