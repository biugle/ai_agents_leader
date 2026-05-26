import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Theme } from '@aal/themes';
import { getTheme, defaultTheme } from '@aal/themes';

interface ThemeContextValue {
  theme: Theme;
  themeId: string;
  setTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
  themeId: 'default',
  setTheme: () => {},
});

export function ThemeProvider({ children, initialTheme = 'default' }: { children: ReactNode; initialTheme?: string }) {
  const [themeId, setThemeId] = useState(initialTheme);
  const [theme, setThemeState] = useState(() => getTheme(initialTheme));

  const setTheme = (id: string) => {
    setThemeId(id);
    setThemeState(getTheme(id));
  };

  // Inject CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--aal-bg', theme.colors.background);
    root.style.setProperty('--aal-surface', theme.colors.surface);
    root.style.setProperty('--aal-surface-hover', theme.colors.surfaceHover);
    root.style.setProperty('--aal-text', theme.colors.text);
    root.style.setProperty('--aal-text-muted', theme.colors.textMuted);
    root.style.setProperty('--aal-border', theme.colors.border);

    // Light colors
    for (const [key, val] of Object.entries(theme.lights)) {
      root.style.setProperty(`--aal-light-${key}`, val.color);
      root.style.setProperty(`--aal-glow-${key}`, val.glow);
    }

    // Pod styles
    root.style.setProperty('--aal-pod-radius', theme.pod.borderRadius);
    root.style.setProperty('--aal-pod-blur', theme.pod.backdropBlur);
    root.style.setProperty('--aal-pod-shadow', theme.pod.shadow);

    // Animation speeds
    root.style.setProperty('--aal-pulse-speed', `${theme.animation.pulseSpeed}s`);
    root.style.setProperty('--aal-flow-speed', `${theme.animation.flowSpeed}s`);
    root.style.setProperty('--aal-strobe-speed', `${theme.animation.strobeSpeed}s`);
    root.style.setProperty('--aal-breath-speed', `${theme.animation.breathSpeed}s`);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, themeId, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
