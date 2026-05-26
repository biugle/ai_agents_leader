import type { Theme } from './types.js';

export const cyberpunkTheme: Theme = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  colors: {
    background: '#0d0221',
    surface: 'rgba(255, 0, 255, 0.05)',
    surfaceHover: 'rgba(255, 0, 255, 0.1)',
    text: '#f0e6ff',
    textMuted: '#9d4edd',
    border: 'rgba(255, 0, 255, 0.2)',
  },
  lights: {
    thinking: { color: '#FFD700', glow: 'rgba(255, 215, 0, 0.7)' },
    running: { color: '#00FFFF', glow: 'rgba(0, 255, 255, 0.7)' },
    success: { color: '#39FF14', glow: 'rgba(57, 255, 20, 0.7)' },
    alert: { color: '#FF073A', glow: 'rgba(255, 7, 58, 0.7)' },
    waiting: { color: '#FFD700', glow: 'rgba(255, 215, 0, 0.7)' },
    stalled: { color: '#FFD700', glow: 'rgba(255, 215, 0, 0.7)' },
    idle: { color: '#9d4edd', glow: 'rgba(157, 78, 221, 0.3)' },
  },
  pod: {
    borderRadius: '8px',
    backdropBlur: '16px',
    shadow: '0 0 20px rgba(255, 0, 255, 0.2)',
  },
  animation: {
    pulseSpeed: 1.5,
    flowSpeed: 0.4,
    strobeSpeed: 0.1,
    breathSpeed: 3,
  },
};
