import type { Theme } from './types.js';

export const defaultTheme: Theme = {
  id: 'default',
  name: 'Default',
  colors: {
    background: '#0a0a0a',
    surface: 'rgba(255, 255, 255, 0.05)',
    surfaceHover: 'rgba(255, 255, 255, 0.08)',
    text: '#e5e5e5',
    textMuted: '#737373',
    border: 'rgba(255, 255, 255, 0.1)',
  },
  lights: {
    thinking: { color: '#F5A623', glow: 'rgba(245, 166, 35, 0.6)' },
    running: { color: '#3B82F6', glow: 'rgba(59, 130, 246, 0.6)' },
    success: { color: '#22C55E', glow: 'rgba(34, 197, 94, 0.6)' },
    alert: { color: '#EF4444', glow: 'rgba(239, 68, 68, 0.6)' },
    waiting: { color: '#F5A623', glow: 'rgba(245, 166, 35, 0.6)' },
    stalled: { color: '#F5A623', glow: 'rgba(245, 166, 35, 0.6)' },
    idle: { color: '#6B7280', glow: 'rgba(107, 114, 128, 0.3)' },
  },
  pod: {
    borderRadius: '16px',
    backdropBlur: '12px',
    shadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
  },
  animation: {
    pulseSpeed: 2,
    flowSpeed: 0.6,
    strobeSpeed: 0.15,
    breathSpeed: 4,
  },
};
