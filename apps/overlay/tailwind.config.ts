import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        aal: {
          bg: 'var(--aal-bg)',
          surface: 'var(--aal-surface)',
          text: 'var(--aal-text)',
          muted: 'var(--aal-text-muted)',
          border: 'var(--aal-border)',
        },
      },
      borderRadius: {
        pod: 'var(--aal-pod-radius)',
      },
      backdropBlur: {
        pod: 'var(--aal-pod-blur)',
      },
    },
  },
  plugins: [],
} satisfies Config;
